-- =================================================================================
-- VALIDAÇÃO DE TITULARIDADE NO SAQUE (chave PIX x CPF do motorista)
-- APLICAR NO: Supabase Dashboard → SQL Editor → Execute
--
-- A Efí recomenda enviar o Pix informando a chave E o documento do favorecido:
-- ela confere no DICT se a chave pertence mesmo àquele titular e, quando não
-- bate, devolve um erro explicando - em vez do "NAO_REALIZADO" seco que não diz
-- nada (foi exatamente o que aconteceu no primeiro saque automático).
-- De quebra, impede que um saque caia na chave PIX de outra pessoa.
--
-- A Edge Function efi-payment roda como `service_role`, que pula RLS mas NÃO
-- pula GRANT de tabela - e `chegoja.profiles` nunca teve GRANT pra ele. Sem
-- esta linha o SELECT do CPF volta vazio e o envio segue sem validação
-- (degrada sem quebrar, mas perde a checagem).
--
-- GRANT por COLUNA de propósito: dá acesso só a id e cpf, nunca à coluna
-- password (bloqueada desde 20260819_login_rpc_and_password_lockdown).
-- =================================================================================

grant select (id, cpf) on chegoja.profiles to service_role;

-- ── Verificação ─────────────────────────────────────────────────────────────
-- Deve listar service_role com SELECT nas colunas id e cpf (e em nenhuma outra):
select grantee, column_name, privilege_type
  from information_schema.column_privileges
 where table_schema = 'chegoja'
   and table_name = 'profiles'
   and grantee = 'service_role'
 order by column_name;
