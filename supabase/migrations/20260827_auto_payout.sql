-- =================================================================================
-- SAQUE AUTOMÁTICO DO MOTORISTA (híbrido por valor) - infra de banco
-- APLICAR NO: Supabase Dashboard → SQL Editor → Execute
--
-- Depende também do deploy da Edge Function efi-payment (action "payout"), que
-- chama o Pix Envio da Efí. Ver supabase/functions/efi-payment/index.ts.
--
-- Resumo do fluxo:
--   1. Motorista pede saque -> RPC chegoja.request_payout (ATÔMICA): checa saldo,
--      debita e cria payment_requests numa transação só. Marca `auto=true` se o
--      valor está dentro do teto por saque E do teto diário configurados.
--   2. Se auto=true, o app chama a Edge Function que dispara o Pix Envio na hora.
--   3. Acima do teto / Efí falhou / estourou o diário -> pedido fica 'pending'
--      na fila do admin, exatamente como era antes.
--
-- SEGURANÇA: hoje qualquer origem consegue INSERT direto em payment_requests
-- (policy "with check (true)"), sem checagem de saldo real - a validação estava
-- só no JS. Aceitável enquanto um humano revisa antes de pagar; INACEITÁVEL com
-- pagamento automático (insere saque sem ter saldo -> PIX sai). Esta migration
-- fecha o INSERT direto e obriga todo saque a passar pela RPC atômica.
-- =================================================================================


-- ── 1. Colunas novas em payment_requests ─────────────────────────────────────
alter table chegoja.payment_requests
  add column if not exists auto         boolean     not null default false,
  add column if not exists efi_idenvio  text,
  add column if not exists efi_e2e_id   text,
  add column if not exists payout_error text,
  add column if not exists paid_at      timestamptz;

-- idEnvio é único por envio na Efí; garante idempotência também do nosso lado
create unique index if not exists payment_requests_efi_idenvio_key
  on chegoja.payment_requests (efi_idenvio)
  where efi_idenvio is not null;


-- ── 2. Config do saque automático em app_settings ────────────────────────────
alter table chegoja.app_settings
  add column if not exists auto_payout_enabled      boolean not null default false,
  add column if not exists auto_payout_max_amount   numeric not null default 0,   -- teto por saque (R$); 0 = nenhum sai automático
  add column if not exists auto_payout_daily_limit  numeric not null default 0;   -- teto diário por motorista (R$); 0 = sem limite diário


-- ── 3. RPC atômica de solicitação de saque ──────────────────────────────────
-- Substitui a sequência "checa saldo em JS -> debita -> insere" do
-- services/supabaseClient.ts:createPaymentRequest por uma transação única no
-- banco. Roda como SECURITY DEFINER: o débito e o insert acontecem com o
-- privilégio do dono da função, então o INSERT direto pode ser revogado dos
-- roles anon/authenticated (passo 4) sem quebrar o fluxo.
create or replace function chegoja.request_payout(
  p_user_id       uuid,
  p_type          text,
  p_amount_money  numeric,
  p_amount_coins  integer,
  p_pix_key       text
)
returns jsonb
language plpgsql
security definer
set search_path = chegoja, public
as $fn$
declare
  v_request_id      uuid;
  v_new_balance     numeric;
  v_new_coins       integer;
  v_auto            boolean := false;
  v_enabled         boolean;
  v_max_amount      numeric;
  v_daily_limit     numeric;
  v_today_auto      numeric;
begin
  if p_type not in ('driver_payout', 'client_withdrawal') then
    return jsonb_build_object('ok', false, 'message', 'Tipo de saque inválido.');
  end if;

  -- ---------- Motorista (saldo em R$) ----------
  if p_type = 'driver_payout' then
    if coalesce(p_amount_money, 0) < 5 then
      return jsonb_build_object('ok', false, 'message', 'O valor mínimo para saque é R$ 5,00.');
    end if;

    -- débito atômico: só desconta se REALMENTE houver saldo
    update chegoja.profiles
       set financial_balance = coalesce(financial_balance, 0) - p_amount_money
     where id = p_user_id
       and coalesce(financial_balance, 0) >= p_amount_money
     returning financial_balance into v_new_balance;

    if v_new_balance is null then
      return jsonb_build_object('ok', false, 'message', 'Saldo financeiro insuficiente.');
    end if;

    -- elegibilidade pro pagamento automático
    select auto_payout_enabled, auto_payout_max_amount, auto_payout_daily_limit
      into v_enabled, v_max_amount, v_daily_limit
      from chegoja.app_settings
     limit 1;

    if coalesce(v_enabled, false) and p_amount_money <= coalesce(v_max_amount, 0) then
      select coalesce(sum(amount_money), 0)
        into v_today_auto
        from chegoja.payment_requests
       where user_id = p_user_id
         and type = 'driver_payout'
         and auto = true
         and status in ('paid', 'pending')
         and created_at >= date_trunc('day', now());

      if coalesce(v_daily_limit, 0) = 0
         or v_today_auto + p_amount_money <= v_daily_limit then
        v_auto := true;
      end if;
    end if;

    insert into chegoja.payment_requests (user_id, type, amount_money, amount_coins, pix_key, status, auto)
    values (p_user_id, p_type, p_amount_money, 0, p_pix_key, 'pending', v_auto)
    returning id into v_request_id;

    insert into chegoja.wallet_transactions (user_id, type, amount_coins, amount_money, description)
    values (p_user_id, 'payout', 0, -p_amount_money, 'Solicitação de Saque (Motorista)');

    return jsonb_build_object('ok', true, 'request_id', v_request_id, 'auto_eligible', v_auto);
  end if;

  -- ---------- Cliente (moedas) ----------
  if coalesce(p_amount_coins, 0) <= 0 then
    return jsonb_build_object('ok', false, 'message', 'Quantidade de moedas inválida.');
  end if;

  update chegoja.profiles
     set wallet_coins = coalesce(wallet_coins, 0) - p_amount_coins
   where id = p_user_id
     and coalesce(wallet_coins, 0) >= p_amount_coins
   returning wallet_coins into v_new_coins;

  if v_new_coins is null then
    return jsonb_build_object('ok', false, 'message', 'Saldo de moedas insuficiente.');
  end if;

  insert into chegoja.payment_requests (user_id, type, amount_money, amount_coins, pix_key, status, auto)
  values (p_user_id, p_type, coalesce(p_amount_money, 0), p_amount_coins, p_pix_key, 'pending', false)
  returning id into v_request_id;

  insert into chegoja.wallet_transactions (user_id, type, amount_coins, amount_money, description)
  values (p_user_id, 'payout', -p_amount_coins, 0, 'Solicitação de Saque (Cliente)');

  return jsonb_build_object('ok', true, 'request_id', v_request_id, 'auto_eligible', false);
end;
$fn$;

revoke execute on function chegoja.request_payout(uuid, text, numeric, integer, text) from public;
grant  execute on function chegoja.request_payout(uuid, text, numeric, integer, text) to anon, authenticated;


-- ── 4. Fechar o INSERT direto em payment_requests ───────────────────────────
-- A partir daqui, todo saque passa obrigatoriamente pela RPC acima.
-- SELECT continua liberado (motorista/cliente veem o próprio histórico) e
-- UPDATE/DELETE continuam só-admin (aprovar/rejeitar/corrigir chave).
revoke insert on chegoja.payment_requests from anon, authenticated;
drop policy if exists payment_requests_insert on chegoja.payment_requests;


-- ── 5. GRANTs pro service_role (Edge Function efi-payment / action "payout") ──
-- Mesmo padrão do 20260827_grant_efi_payments_service_role.sql: service_role
-- pula RLS mas NÃO pula GRANT de tabela/função. A Edge Function roda com
-- SUPABASE_SERVICE_ROLE_KEY e precisa mexer nestas tabelas pra registrar o
-- envio do PIX. Sem isto, o insert/update falha em silêncio (permission denied)
-- e o saque some no limbo.
grant select, update on chegoja.payment_requests   to service_role;
grant select, insert on chegoja.wallet_transactions to service_role;
grant select           on chegoja.app_settings      to service_role;
grant execute on function chegoja.increment_financial_balance(uuid, numeric) to service_role;


-- ── Verificação ─────────────────────────────────────────────────────────────
-- Deve listar request_payout:
select routine_name from information_schema.routines
 where routine_schema = 'chegoja' and routine_name = 'request_payout';
-- authenticated/anon NÃO devem aparecer com INSERT aqui:
select grantee, privilege_type from information_schema.role_table_grants
 where table_schema = 'chegoja' and table_name = 'payment_requests'
 order by grantee, privilege_type;
