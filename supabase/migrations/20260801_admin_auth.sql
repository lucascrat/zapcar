-- =================================================================================
-- Autenticação real de administrador (Supabase Auth) + fechamento de brechas
-- APLICADO EM PRODUÇÃO em 2026-08-01 (projeto qyagfghcnzenvbhbtsvd)
-- =================================================================================
-- Contexto: até aqui o "admin" era validado só no navegador (VITE_ADMIN_USERNAME /
-- VITE_ADMIN_PASSWORD embutidos no bundle). Para o banco, toda requisição chegava
-- como a role `anon`, cuja chave é pública. Resultado: não havia como distinguir
-- admin de qualquer visitante no nível do banco.
--
-- Cliente e motorista CONTINUAM sem autenticação (entram só com nome + telefone).
-- Essa facilidade é intencional; a autenticação forte vale apenas para o admin.
--
-- NOTA IMPORTANTE sobre a role `authenticated`:
--   Existem 604 contas legadas em auth.users (criadas entre 2026-01 e 2026-05),
--   todas com senha, e-mail confirmado e histórico de login. Por isso "estar
--   autenticado" NÃO é sinônimo de "ser admin", e nenhuma permissão sensível é
--   concedida à role `authenticated`. A autorização passa sempre por
--   chegoja.is_admin(), que checa participação em chegoja.admin_users.
-- =================================================================================


-- ---------------------------------------------------------------------------------
-- 1. Quem é administrador
-- ---------------------------------------------------------------------------------
-- Tabela separada de `profiles` de propósito: os perfis existentes têm ids próprios
-- referenciados por chaves estrangeiras (rides, messages...). Trocar o id de um
-- perfil para casar com auth.uid() seria arriscado; a ligação é feita aqui.
create table if not exists chegoja.admin_users (
    user_id    uuid primary key references auth.users(id) on delete cascade,
    note       text,
    created_at timestamptz not null default now()
);

alter table chegoja.admin_users enable row level security;
-- Sem policies: a tabela fica invisível via PostgREST (anon e authenticated).
-- Só as funções SECURITY DEFINER abaixo conseguem lê-la.


-- ---------------------------------------------------------------------------------
-- 2. Helper de autorização
-- ---------------------------------------------------------------------------------
create or replace function chegoja.is_admin()
returns boolean language sql stable security definer
set search_path = chegoja, public
as $fn$
    select exists (select 1 from chegoja.admin_users where user_id = auth.uid());
$fn$;

revoke execute on function chegoja.is_admin() from public;
grant  execute on function chegoja.is_admin() to anon, authenticated;


-- ---------------------------------------------------------------------------------
-- 3. driver_plans: leitura pública, escrita só de admin
-- ---------------------------------------------------------------------------------
-- A policy de leitura já existia com o nome `driver_plans_read` (SELECT / public /
-- using true) e foi mantida: a tela de assinatura lista os planos antes de login.
drop policy if exists "driver_plans_admin_write" on chegoja.driver_plans;
create policy "driver_plans_admin_write"
    on chegoja.driver_plans for all
    using (chegoja.is_admin()) with check (chegoja.is_admin());


-- ---------------------------------------------------------------------------------
-- 4. Proteger a RPC admin_delete_user
-- ---------------------------------------------------------------------------------
-- Antes: SECURITY DEFINER com ACL padrão (pública) e nenhuma validação — qualquer
-- pessoa que lesse o JS do app conseguia apagar qualquer usuário do sistema.
-- Agora: guarda explícita no topo. O corpo original foi preservado integralmente.
create or replace function chegoja.admin_delete_user(user_id_param uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'chegoja'
as $function$
BEGIN
  IF NOT chegoja.is_admin() THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem remover usuarios.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE chegoja.rides SET driver_id = NULL WHERE driver_id = user_id_param;
  UPDATE chegoja.rides SET client_id = NULL WHERE client_id = user_id_param;

  DELETE FROM chegoja.messages WHERE sender_id = user_id_param OR receiver_id = user_id_param;
  DELETE FROM chegoja.wallet_transactions WHERE user_id = user_id_param;
  DELETE FROM chegoja.payment_requests WHERE user_id = user_id_param;
  DELETE FROM chegoja.store_orders WHERE user_id = user_id_param;
  DELETE FROM chegoja.bingo_cards WHERE user_id = user_id_param;
  DELETE FROM chegoja.push_tokens WHERE user_id = user_id_param;

  UPDATE chegoja.notifications SET target_user_id = NULL WHERE target_user_id = user_id_param;
  UPDATE chegoja.notifications SET sent_by = NULL WHERE sent_by = user_id_param;

  DELETE FROM chegoja.subscriptions WHERE user_id = user_id_param;
  DELETE FROM chegoja.profiles WHERE id = user_id_param;
  DELETE FROM auth.users WHERE id = user_id_param;
END;
$function$;


-- ---------------------------------------------------------------------------------
-- 5. Registrar o administrador  <<< PENDENTE
-- ---------------------------------------------------------------------------------
-- Primeiro crie a conta em Authentication > Users > Add user (Auto Confirm User).
-- Depois rode, trocando o e-mail:
--
-- insert into chegoja.admin_users (user_id, note)
-- select id, 'admin principal' from auth.users where email = 'SEU-EMAIL-AQUI'
-- on conflict (user_id) do nothing;


-- ---------------------------------------------------------------------------------
-- Verificação (com a chave anon pública, via PostgREST)
-- ---------------------------------------------------------------------------------
--   rpc/admin_delete_user  -> 42501 "Acesso negado..."          (bloqueado)
--   GET  driver_plans      -> 200                                (liberado)
--   POST driver_plans      -> 42501 violates RLS policy          (bloqueado)
