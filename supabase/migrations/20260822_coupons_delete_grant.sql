-- =================================================================================
-- coupons: concede INSERT/UPDATE/DELETE ao role authenticated
-- APLICAR NO: Supabase Dashboard → SQL Editor → Execute
--
-- Problema: a tabela chegoja.coupons tinha as policies RLS corretas
-- (coupons_insert, coupons_update, coupons_delete — todas exigindo is_admin()),
-- mas o role `authenticated` nunca recebeu GRANT para estas operações a nível
-- de tabela. Resultado: o PostgREST bloqueava silenciosamente (0 linhas afetadas)
-- ou retornava 403, mesmo o admin estando autenticado.
-- Mesmo padrão do problema anterior com chegoja.banners (fix em 20260819).
-- =================================================================================

-- Garante privilégios de escrita para admins autenticados
GRANT SELECT, INSERT, UPDATE, DELETE ON chegoja.coupons TO authenticated;

-- Confirma que RLS está ativo (deve retornar rowsecurity = true)
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'chegoja' AND tablename = 'coupons';

-- Lista as policies atuais (deve mostrar coupons_insert, coupons_update, coupons_delete)
SELECT policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'chegoja' AND tablename = 'coupons'
ORDER BY cmd;
