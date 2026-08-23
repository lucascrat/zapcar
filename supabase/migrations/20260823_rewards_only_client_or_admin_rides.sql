-- =================================================================================
-- Blinda o sistema de premiação/ranking: só conta corridas pedidas por um cliente
-- pelo app OU disparadas pelo admin no painel (Central de Despacho) - nunca
-- corridas lançadas manualmente pelo próprio motorista (ex: taxímetro avulso).
--
-- Toda corrida legítima sempre tem client_id preenchido:
--   - Pedida pelo cliente no app: client_id = id do cliente (ClientDashboard -> createRideRequest)
--   - Disparada pelo admin: client_id = '11111111-1111-1111-1111-111111111111' (usuário
--     "sistema/admin" fixo usado pela Central de Despacho -> createDispatchRide)
-- Qualquer outro fluxo (ex: taxímetro do motorista) não passa por essas duas
-- funções e nunca preenche client_id - exigir client_id IS NOT NULL garante que
-- esse tipo de registro nunca conte pra premiação, mesmo que passe a ser salvo
-- na tabela rides no futuro.
-- Aplicar no Supabase Dashboard → SQL Editor → Execute
-- =================================================================================

CREATE OR REPLACE FUNCTION chegoja.get_weekly_driver_ranking(limit_count int DEFAULT 10)
RETURNS TABLE (
  driver_id uuid,
  username text,
  avatar_url text,
  vehicle_type text,
  weekly_rides bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = chegoja, public
AS $$
  SELECT
    r.driver_id,
    p.username,
    p.avatar_url,
    p.vehicle_type,
    COUNT(r.id) AS weekly_rides
  FROM chegoja.rides r
  JOIN chegoja.profiles p ON p.id = r.driver_id
  WHERE r.status = 'finished'
    AND r.created_at >= date_trunc('week', now())
    AND r.driver_id IS NOT NULL
    AND r.client_id IS NOT NULL -- só corrida de cliente ou admin, nunca lançamento manual do motorista
  GROUP BY r.driver_id, p.username, p.avatar_url, p.vehicle_type
  ORDER BY weekly_rides DESC
  LIMIT limit_count;
$$;

CREATE OR REPLACE FUNCTION chegoja.get_driver_weekly_rides(driver_id_param uuid)
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = chegoja, public
AS $$
  SELECT COUNT(*)
  FROM chegoja.rides
  WHERE status = 'finished'
    AND driver_id = driver_id_param
    AND created_at >= date_trunc('week', now())
    AND client_id IS NOT NULL; -- só corrida de cliente ou admin, nunca lançamento manual do motorista
$$;
