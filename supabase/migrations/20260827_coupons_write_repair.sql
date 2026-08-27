-- =================================================================================
-- coupons: reparo idempotente de RLS + GRANT de escrita (admin)
-- APLICAR NO: Supabase Dashboard -> SQL Editor -> Execute
--
-- Sintoma: "new row violates row-level security policy for table \"coupons\"" ao
-- criar cupom no painel admin, mesmo o admin estando logado.
--
-- Causa: a policy coupons_insert (WITH CHECK is_admin()) e/ou o GRANT de INSERT
-- para o role `authenticated` nao foram aplicados neste banco. Consolida o que
-- estava espalhado em 20260819_rls_hardening_v2.sql e 20260822_coupons_delete_grant.sql.
--
-- NOTA: rodar este script no SQL Editor executa como `postgres`, entao is_admin()
-- aqui e sempre false - o teste real da sessao e no navegador (ver rodape).
-- =================================================================================

-- --- Diagnostico (rode e confira ANTES) ------------------------------------------
select tablename, rowsecurity
from pg_tables
where schemaname = 'chegoja' and tablename = 'coupons';

select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'chegoja' and tablename = 'coupons'
order by cmd;

select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'chegoja' and table_name = 'coupons'
order by grantee, privilege_type;


-- --- Reparo --------------------------------------------------------------------
alter table chegoja.coupons enable row level security;

-- Escrita so para admins autenticados; leitura publica (o app lista cupons
-- antes de qualquer login).
grant select on chegoja.coupons to anon;
grant select, insert, update, delete on chegoja.coupons to authenticated;

drop policy if exists coupons_insert on chegoja.coupons;
create policy coupons_insert on chegoja.coupons
    for insert with check (chegoja.is_admin());

drop policy if exists coupons_update on chegoja.coupons;
create policy coupons_update on chegoja.coupons
    for update using (chegoja.is_admin()) with check (chegoja.is_admin());

drop policy if exists coupons_delete on chegoja.coupons;
create policy coupons_delete on chegoja.coupons
    for delete using (chegoja.is_admin());

-- SELECT publico: so cria se ainda nao houver nenhuma policy de SELECT.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'chegoja' and tablename = 'coupons' and cmd = 'SELECT'
  ) then
    create policy coupons_select on chegoja.coupons for select using (true);
  end if;
end $$;


-- --- Verificacao ---------------------------------------------------------------
-- Depois de aplicar: tente criar um cupom no painel.
-- Se AINDA der erro de RLS, a sessao de admin caiu pra anon. Confirme em
-- DevTools -> Application -> Local Storage -> https://chegoja.app: deve existir
-- uma chave `sb-<ref>-auth-token` com um access_token nao expirado. Se estiver
-- faltando/expirada -> logout e login de novo no painel de admin.
