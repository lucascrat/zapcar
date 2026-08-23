-- =================================================================================
-- RELATÓRIO DE DESEMPENHO DE MOTORISTAS (painel admin)
-- Corridas recebidas, saldo e tempo online, num só lugar, pra saber quem está
-- realmente trabalhando e poder recompensar os melhores.
-- Aplicar no Supabase Dashboard → SQL Editor → Execute
-- =================================================================================

-- Log de toda mudança de status do motorista (available/busy/offline), gravado
-- automaticamente via trigger - nenhum código do app precisa chamar nada, então
-- não tem como um motorista burlar isso mudando o app.
CREATE TABLE IF NOT EXISTS chegoja.driver_status_events (
  id bigserial PRIMARY KEY,
  driver_id uuid NOT NULL REFERENCES chegoja.profiles(id) ON DELETE CASCADE,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_driver_status_events_driver_time
  ON chegoja.driver_status_events(driver_id, created_at);

ALTER TABLE chegoja.driver_status_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "driver_status_events_admin_select" ON chegoja.driver_status_events;
CREATE POLICY "driver_status_events_admin_select"
  ON chegoja.driver_status_events FOR SELECT USING (chegoja.is_admin());

-- Trigger: registra automaticamente sempre que profiles.status mudar para um motorista
CREATE OR REPLACE FUNCTION chegoja.log_driver_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = chegoja, public
AS $$
BEGIN
  IF NEW.role = 'driver' AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    INSERT INTO chegoja.driver_status_events (driver_id, status, created_at)
    VALUES (NEW.id, NEW.status, now());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_driver_status_change ON chegoja.profiles;
CREATE TRIGGER trg_log_driver_status_change
  AFTER UPDATE OF status ON chegoja.profiles
  FOR EACH ROW EXECUTE FUNCTION chegoja.log_driver_status_change();

-- =================================================================================
-- RPC: relatório completo por motorista (corridas + saldo + tempo online) desde
-- period_start. Corridas contadas com o mesmo critério anti-fraude do sistema de
-- premiação (client_id IS NOT NULL: só corrida de cliente ou admin, nunca
-- lançamento manual do motorista).
-- =================================================================================
CREATE OR REPLACE FUNCTION chegoja.get_driver_performance_report(period_start timestamptz DEFAULT date_trunc('week', now()))
RETURNS TABLE (
  driver_id uuid,
  username text,
  avatar_url text,
  vehicle_type text,
  is_approved boolean,
  status text,
  financial_balance numeric,
  wallet_coins int,
  rides_count bigint,
  online_seconds numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = chegoja, public
AS $$
  WITH ride_counts AS (
    SELECT r.driver_id, COUNT(*) AS rides_count
    FROM chegoja.rides r
    WHERE r.status = 'finished'
      AND r.client_id IS NOT NULL
      AND r.driver_id IS NOT NULL
      AND r.created_at >= period_start
    GROUP BY r.driver_id
  ),
  -- Último status conhecido de cada motorista ANTES do período, "puxado" pra
  -- o início do período - garante que sessões já abertas antes do corte
  -- continuem sendo contadas a partir de period_start.
  last_before AS (
    SELECT DISTINCT ON (e.driver_id) e.driver_id, e.status, period_start AS created_at
    FROM chegoja.driver_status_events e
    WHERE e.created_at < period_start
    ORDER BY e.driver_id, e.created_at DESC
  ),
  in_period AS (
    SELECT driver_id, status, created_at
    FROM chegoja.driver_status_events
    WHERE created_at >= period_start
  ),
  combined AS (
    SELECT * FROM last_before
    UNION ALL
    SELECT * FROM in_period
  ),
  ordered AS (
    SELECT driver_id, status, created_at,
      LEAD(created_at) OVER (PARTITION BY driver_id ORDER BY created_at) AS next_at
    FROM combined
  ),
  online_time AS (
    SELECT driver_id, SUM(EXTRACT(EPOCH FROM (COALESCE(next_at, now()) - created_at))) AS online_seconds
    FROM ordered
    WHERE status IN ('available', 'busy')
    GROUP BY driver_id
  )
  SELECT
    p.id AS driver_id,
    p.username,
    p.avatar_url,
    p.vehicle_type,
    p.is_approved,
    p.status,
    COALESCE(p.financial_balance, 0) AS financial_balance,
    COALESCE(p.wallet_coins, 0) AS wallet_coins,
    COALESCE(rc.rides_count, 0) AS rides_count,
    COALESCE(ot.online_seconds, 0) AS online_seconds
  FROM chegoja.profiles p
  LEFT JOIN ride_counts rc ON rc.driver_id = p.id
  LEFT JOIN online_time ot ON ot.driver_id = p.id
  WHERE p.role = 'driver'
  ORDER BY COALESCE(rc.rides_count, 0) DESC, COALESCE(ot.online_seconds, 0) DESC;
$$;

GRANT EXECUTE ON FUNCTION chegoja.get_driver_performance_report TO authenticated;
