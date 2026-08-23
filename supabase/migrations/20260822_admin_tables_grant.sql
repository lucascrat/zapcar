-- =================================================================================
-- GRANT de escrita para todas as tabelas admin que podem estar bloqueadas
-- APLICAR NO: Supabase Dashboard → SQL Editor → Execute
--
-- Problema: O padrão do projeto exige duas camadas para escrever numa tabela:
--   1. RLS policy  (ex: FOR DELETE USING (chegoja.is_admin()))
--   2. GRANT        (ex: GRANT DELETE ON chegoja.X TO authenticated)
-- Sem o GRANT o PostgREST bloqueia silenciosamente (0 rows, sem erro 403).
-- As migrations anteriores adicionaram as policies mas esqueceram o GRANT em
-- várias tabelas. Este script corrige tudo de uma vez.
-- =================================================================================

-- driver_plans (admin cria/edita/exclui planos de assinatura)
GRANT SELECT, INSERT, UPDATE, DELETE ON chegoja.driver_plans TO authenticated;

-- store_products (admin gerencia produtos da loja)
GRANT SELECT, INSERT, UPDATE, DELETE ON chegoja.store_products TO authenticated;

-- store_orders (admin aprova/rejeita pedidos)
GRANT SELECT, INSERT, UPDATE, DELETE ON chegoja.store_orders TO authenticated;

-- payment_requests (admin aprova/rejeita saques)
GRANT SELECT, INSERT, UPDATE, DELETE ON chegoja.payment_requests TO authenticated;

-- wallet_transactions (admin pode gerar créditos manuais)
GRANT SELECT, INSERT, UPDATE, DELETE ON chegoja.wallet_transactions TO authenticated;

-- rides (admin visualiza e pode cancelar corridas)
GRANT SELECT, INSERT, UPDATE, DELETE ON chegoja.rides TO authenticated;

-- =================================================================================
-- Verificação: lista tabelas do schema chegoja com seus grants
-- (execute separadamente para ver o resultado)
-- =================================================================================
SELECT
    table_name,
    string_agg(privilege_type, ', ' ORDER BY privilege_type) AS grants
FROM information_schema.role_table_grants
WHERE table_schema = 'chegoja'
  AND grantee = 'authenticated'
GROUP BY table_name
ORDER BY table_name;
