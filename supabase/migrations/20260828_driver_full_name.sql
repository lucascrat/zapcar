-- =================================================================================
-- NOME COMPLETO DO TITULAR DA CHAVE PIX
-- APLICAR NO: Supabase Dashboard → SQL Editor → Execute
--
-- `username` é o apelido de login do motorista ("HERTON"), não o nome do titular
-- da conta bancária ("LUCAS RAFAEL DE SOUSA HOLANDA"). Pro saque é o nome do
-- titular que interessa: junto com o CPF, é o que permite conferir que a chave
-- PIX é mesmo da pessoa antes de mandar dinheiro. Coluna separada de propósito -
-- mexer em `username` quebraria o login (chegoja.verify_login casa por nome).
-- =================================================================================

alter table chegoja.profiles
  add column if not exists full_name text;

-- A Edge Function efi-payment (role service_role) lê o documento do favorecido
-- pra validar titularidade no Pix Envio. GRANT por COLUNA, pra nunca dar acesso
-- à coluna `password` (bloqueada em 20260819_login_rpc_and_password_lockdown).
grant select (id, cpf, full_name) on chegoja.profiles to service_role;

-- ── Verificação ─────────────────────────────────────────────────────────────
-- service_role deve aparecer só com id, cpf e full_name:
select grantee, column_name, privilege_type
  from information_schema.column_privileges
 where table_schema = 'chegoja' and table_name = 'profiles' and grantee = 'service_role'
 order by column_name;
