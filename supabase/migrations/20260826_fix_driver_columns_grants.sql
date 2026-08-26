-- =================================================================================
-- FIX: motoristas sumiram do painel admin + cadastro de motorista dando erro
--
-- Causa raiz confirmada direto contra o banco de produção (via REST, chave anon):
-- SELECT id,role FROM profiles          -> 200 OK
-- SELECT id,location_updated_at FROM profiles -> 401 "permission denied for table profiles" (42501)
-- SELECT id,doc_cnh_url FROM profiles          -> mesmo erro
-- SELECT id,doc_address_proof_url FROM profiles -> mesmo erro
-- SELECT id,work_city FROM profiles             -> mesmo erro
-- Todas as outras colunas de profiles (inclusive antigas) respondem 200 normalmente.
--
-- As migrations anteriores (20260823_online_freshness_check.sql e
-- 20260823_driver_documents.sql) fizeram ALTER TABLE ADD COLUMN para
-- location_updated_at, doc_cnh_url, doc_address_proof_url e work_city, mas esse
-- banco usa GRANT por coluna em chegoja.profiles (não um GRANT SELECT geral na
-- tabela) - então colunas novas não herdam acesso automaticamente e precisam de
-- um GRANT explícito, que nenhuma das duas migrations incluiu.
--
-- Isso quebra QUALQUER leitura de profiles que passe por PROFILE_SAFE_COLUMNS
-- (services/supabaseClient.ts), que agora lista essas 4 colunas e é usada em
-- praticamente toda query de profiles do app:
-- - fetchAllDriversForAdmin (lista de motoristas do painel admin) -> erro ->
--   catch retorna [] -> painel mostra ZERO motoristas.
-- - registerDriver: se a RPC register_driver falhar/não retornar por qualquer
--   motivo, o fallback (checar telefone existente + insert manual) faz
--   .select(PROFILE_SAFE_COLUMNS) e cai no mesmo erro -> registerDriver()
--   retorna null -> LoginFlow.tsx mostra "O servidor não respondeu ao
--   cadastro. Tente novamente em instantes."
--
-- Aplicar no Supabase Dashboard → SQL Editor → Execute
-- =================================================================================

-- Leitura: necessária pra tudo que usa PROFILE_SAFE_COLUMNS (listagem de
-- motoristas no admin, fetchOnlineDrivers, fetchUserProfile, etc.)
GRANT SELECT (location_updated_at, doc_cnh_url, doc_address_proof_url, work_city)
  ON chegoja.profiles TO anon, authenticated;

-- Escrita: necessária pro fallback de registerDriver, que faz insert direto na
-- tabela quando a RPC register_driver falha (services/supabaseClient.ts:1169).
-- location_updated_at fica de fora de propósito - só é escrita pelo trigger
-- trg_touch_location_updated_at (SECURITY DEFINER), nunca diretamente pelo
-- cliente.
GRANT INSERT (doc_cnh_url, doc_address_proof_url, work_city)
  ON chegoja.profiles TO anon, authenticated;

-- Reenvio de documentos / atualização de cidade de trabalho pelo próprio
-- motorista no futuro (nenhum fluxo atual faz isso ainda, mas evita o mesmo
-- bug se for adicionado).
GRANT UPDATE (doc_cnh_url, doc_address_proof_url, work_city)
  ON chegoja.profiles TO anon, authenticated;
