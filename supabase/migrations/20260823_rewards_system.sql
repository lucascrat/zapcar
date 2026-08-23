-- =================================================================================
-- SISTEMA DE PREMIAÇÃO E RANKING SEMANAL DE MOTORISTAS
-- Aplicar no Supabase Dashboard → SQL Editor → Execute
-- =================================================================================

-- Tabela de faixas de premiação (configurável pelo admin)
CREATE TABLE IF NOT EXISTS chegoja.reward_tiers (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  min_rides int NOT NULL DEFAULT 1,
  prize_value numeric(10,2) NOT NULL DEFAULT 0,
  image_url text,
  badge_emoji text DEFAULT '🏆',
  card_color text DEFAULT '#f59e0b',
  is_active boolean DEFAULT true,
  display_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Tabela de configuração do sistema (linha única)
CREATE TABLE IF NOT EXISTS chegoja.rewards_config (
  id int PRIMARY KEY DEFAULT 1,
  is_enabled boolean DEFAULT true,
  week_title text DEFAULT 'Premiação Semanal',
  subtitle text DEFAULT 'Bata as metas e ganhe seus prêmios!',
  updated_at timestamptz DEFAULT now()
);

-- Inserir configuração padrão se não existir
INSERT INTO chegoja.rewards_config (id, is_enabled, week_title, subtitle)
VALUES (1, true, 'Premiação Semanal', 'Bata as metas e ganhe seus prêmios!')
ON CONFLICT (id) DO NOTHING;

-- Faixas padrão iniciais
INSERT INTO chegoja.reward_tiers (title, description, min_rides, prize_value, badge_emoji, card_color, display_order)
VALUES
  ('Campeão da Semana', 'Complete 50 corridas nesta semana', 50, 250.00, '🥇', '#f59e0b', 0),
  ('Destaque da Semana', 'Complete 30 corridas nesta semana', 30, 150.00, '🥈', '#9ca3af', 1),
  ('Meta da Semana',    'Complete 20 corridas nesta semana', 20,  50.00, '🥉', '#cd7c3a', 2)
ON CONFLICT DO NOTHING;

-- RLS
ALTER TABLE chegoja.reward_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE chegoja.rewards_config ENABLE ROW LEVEL SECURITY;

-- Leitura pública (motoristas precisam ver os prêmios)
CREATE POLICY "reward_tiers_select_all"
  ON chegoja.reward_tiers FOR SELECT USING (true);

CREATE POLICY "rewards_config_select_all"
  ON chegoja.rewards_config FOR SELECT USING (true);

-- Escrita somente admin
CREATE POLICY "reward_tiers_admin_write"
  ON chegoja.reward_tiers FOR ALL USING (chegoja.is_admin());

CREATE POLICY "rewards_config_admin_write"
  ON chegoja.rewards_config FOR ALL USING (chegoja.is_admin());

-- Grants
GRANT SELECT ON chegoja.reward_tiers TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON chegoja.reward_tiers TO authenticated;

GRANT SELECT ON chegoja.rewards_config TO anon;
GRANT SELECT, UPDATE ON chegoja.rewards_config TO authenticated;

-- =================================================================================
-- RPC: ranking semanal (segunda a domingo, horário local)
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
  GROUP BY r.driver_id, p.username, p.avatar_url, p.vehicle_type
  ORDER BY weekly_rides DESC
  LIMIT limit_count;
$$;

GRANT EXECUTE ON FUNCTION chegoja.get_weekly_driver_ranking TO authenticated;
GRANT EXECUTE ON FUNCTION chegoja.get_weekly_driver_ranking TO anon;

-- =================================================================================
-- RPC: corridas semanais de um motorista específico
-- =================================================================================
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
    AND created_at >= date_trunc('week', now());
$$;

GRANT EXECUTE ON FUNCTION chegoja.get_driver_weekly_rides TO authenticated;
GRANT EXECUTE ON FUNCTION chegoja.get_driver_weekly_rides TO anon;
