-- =================================================================================
-- SISTEMA DE CATEGORIAS DE VEÍCULO DINÂMICO (Carro, Moto, Biz, Entregas, ...)
--
-- Hoje o tipo de veículo é fixo no código ('car'/'motorcycle') em dezenas de
-- arquivos - o admin não tem como cadastrar uma categoria nova sem alterar
-- código. Esta migration cria a tabela que passa a ser a fonte única da
-- verdade pra nome/ícone/descrição/preço de cada categoria.
--
-- IMPORTANTE - compatibilidade com dado existente:
-- chegoja.profiles.vehicle_type e chegoja.rides.vehicle_type CONTINUAM sendo
-- text guardando o slug da categoria ('car', 'motorcycle', 'biz', ...) - sem
-- FK física pra não quebrar as ~1600 corridas e 24 motoristas já cadastrados
-- (confirmado direto no banco: 11 motoristas 'car', 13 'motorcycle', 910
-- corridas 'car', 718 'motorcycle'). Despacho/matching (get_nearest_driver,
-- get_drivers_within_radius, sequentialNotifications.ts) já comparam
-- vehicle_type como string simples - funcionam com categoria nova sem
-- nenhuma mudança neles.
--
-- Também corrige de vez um bug de preço que já existia antes desta sessão:
-- o campo "preço mínimo" noturno/madrugada (night_car_price_min etc, em
-- chegoja.app_settings) era usado como TARIFA MÍNIMA em alguns lugares
-- (RideCalculator, ClientDashboard - o que realmente vira o preço cobrado)
-- e como PREÇO POR MINUTO em outros (Taxímetro, bot do WhatsApp), porque
-- nunca existiu um campo de preço/minuto noturno/madrugada separado. A
-- tabela nova tem os dois campos, sem ambiguidade, pra cada faixa de horário.
--
-- Aplicar no Supabase Dashboard → SQL Editor → Execute
-- =================================================================================

-- =================================================================================
-- 1. TABELA
-- =================================================================================
CREATE TABLE IF NOT EXISTS chegoja.vehicle_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,           -- valor gravado em profiles.vehicle_type / rides.vehicle_type
  name text NOT NULL,
  description text,
  icon_url text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,

  -- Preço padrão
  base_price numeric NOT NULL DEFAULT 0,
  price_km numeric NOT NULL DEFAULT 0,
  price_min_fare numeric NOT NULL DEFAULT 0,     -- tarifa mínima (nunca preço/minuto)
  price_per_minute numeric NOT NULL DEFAULT 0,   -- preço por minuto (nunca tarifa mínima)
  start_distance_limit numeric NOT NULL DEFAULT 0,

  -- Preço noturno (usa o padrão como fallback quando null - ver services/pricing.ts)
  night_base_price numeric,
  night_price_km numeric,
  night_price_min_fare numeric,
  night_price_per_minute numeric,

  -- Preço madrugada (usa o padrão como fallback quando null)
  dawn_base_price numeric,
  dawn_price_km numeric,
  dawn_price_min_fare numeric,
  dawn_price_per_minute numeric,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vehicle_categories_active_sort
  ON chegoja.vehicle_categories(is_active, sort_order);

-- updated_at automático, mesmo padrão de outras tabelas administráveis do projeto
CREATE OR REPLACE FUNCTION chegoja.touch_vehicle_category_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_touch_vehicle_category_updated_at ON chegoja.vehicle_categories;
CREATE TRIGGER trg_touch_vehicle_category_updated_at
  BEFORE UPDATE ON chegoja.vehicle_categories
  FOR EACH ROW EXECUTE FUNCTION chegoja.touch_vehicle_category_updated_at();

-- =================================================================================
-- 2. SEED - carro e moto, puxando os valores atuais de app_settings pra que o
-- preço calculado antes/depois desta migration fique idêntico pros motoristas
-- já cadastrados. night/dawn_price_per_minute ficam NULL (nunca existiu campo
-- equivalente antes - services/pricing.ts cai pro preço/minuto padrão nesse
-- caso, mesmo comportamento que já era usado na prática).
-- =================================================================================
INSERT INTO chegoja.vehicle_categories (
  slug, name, description, icon_url, sort_order,
  base_price, price_km, price_min_fare, price_per_minute, start_distance_limit,
  night_base_price, night_price_km, night_price_min_fare,
  dawn_base_price, dawn_price_km, dawn_price_min_fare
)
SELECT
  'car', COALESCE(NULLIF(car_name, ''), 'Carro'), car_description, car_icon_url, 0,
  COALESCE(car_base_price, 0), COALESCE(car_price_km, 0), COALESCE(car_price_min, 0),
  COALESCE(car_price_per_minute, 0), COALESCE(car_start_distance_limit, 0),
  night_car_base_price, night_car_price_km, night_car_price_min,
  dawn_car_base_price, dawn_car_price_km, dawn_car_price_min
FROM chegoja.app_settings
LIMIT 1
ON CONFLICT (slug) DO NOTHING;

INSERT INTO chegoja.vehicle_categories (
  slug, name, description, icon_url, sort_order,
  base_price, price_km, price_min_fare, price_per_minute, start_distance_limit,
  night_base_price, night_price_km, night_price_min_fare,
  dawn_base_price, dawn_price_km, dawn_price_min_fare
)
SELECT
  'motorcycle', COALESCE(NULLIF(moto_name, ''), 'Moto'), moto_description, moto_icon_url, 1,
  COALESCE(moto_base_price, 0), COALESCE(moto_price_km, 0), COALESCE(moto_price_min, 0),
  COALESCE(moto_price_per_minute, 0), COALESCE(moto_start_distance_limit, 0),
  night_moto_base_price, night_moto_price_km, night_moto_price_min,
  dawn_moto_base_price, dawn_moto_price_km, dawn_moto_price_min
FROM chegoja.app_settings
LIMIT 1
ON CONFLICT (slug) DO NOTHING;

-- Se a tabela app_settings ainda não tinha nenhuma linha (instalação nova),
-- garante que car/motorcycle existem mesmo assim com valores zerados -
-- register_driver e o despacho dependem de pelo menos essas duas existirem.
INSERT INTO chegoja.vehicle_categories (slug, name, sort_order)
VALUES ('car', 'Carro', 0), ('motorcycle', 'Moto', 1)
ON CONFLICT (slug) DO NOTHING;

-- =================================================================================
-- 3. VALIDAÇÃO - substitui a trava fixa antiga (só aceitava 'car'/'motorcycle')
-- por uma trigger que aceita qualquer categoria cadastrada. Só dispara quando
-- vehicle_type é de fato alterado (UPDATE OF), não em todo update de profiles -
-- mesmo padrão de trg_touch_location_updated_at/trg_log_driver_status_change.
-- =================================================================================
ALTER TABLE chegoja.profiles DROP CONSTRAINT IF EXISTS profiles_vehicle_type_check;

CREATE OR REPLACE FUNCTION chegoja.validate_driver_vehicle_type()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = chegoja, public
AS $function$
BEGIN
  IF NEW.vehicle_type IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM chegoja.vehicle_categories WHERE slug = NEW.vehicle_type
  ) THEN
    RAISE EXCEPTION 'Categoria de veículo "%" não está cadastrada.', NEW.vehicle_type;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_validate_driver_vehicle_type ON chegoja.profiles;
CREATE TRIGGER trg_validate_driver_vehicle_type
  BEFORE INSERT OR UPDATE OF vehicle_type ON chegoja.profiles
  FOR EACH ROW EXECUTE FUNCTION chegoja.validate_driver_vehicle_type();

-- =================================================================================
-- 4. RPC get_nearest_driver - existia só em produção, nunca foi commitada.
-- Versionando aqui com a definição exata já em uso (CREATE OR REPLACE não
-- muda comportamento nenhum, só passa a existir no controle de versão).
-- Já compara vehicle_type como string simples - funciona com categoria nova
-- automaticamente, sem precisar de nenhum ajuste aqui.
-- =================================================================================
CREATE OR REPLACE FUNCTION chegoja.get_nearest_driver(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision,
  p_vehicle_type text DEFAULT NULL::text,
  p_ignored_ids uuid[] DEFAULT '{}'::uuid[]
)
RETURNS SETOF chegoja.profiles
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT p.* FROM chegoja.profiles p
  WHERE p.role = 'driver'
    AND p.status = 'available'
    AND p.is_approved = true
    AND p.lat IS NOT NULL
    AND p.lng IS NOT NULL
    AND (p_vehicle_type IS NULL OR p.vehicle_type = p_vehicle_type)
    AND (p_ignored_ids IS NULL OR NOT (p.id = ANY(p_ignored_ids)))
    AND (6371 * acos(least(1.0, greatest(-1.0,
          cos(radians(p_lat)) * cos(radians(p.lat)) * cos(radians(p.lng) - radians(p_lng)) +
          sin(radians(p_lat)) * sin(radians(p.lat))
        )))) <= p_radius_km
  ORDER BY (6371 * acos(least(1.0, greatest(-1.0,
          cos(radians(p_lat)) * cos(radians(p.lat)) * cos(radians(p.lng) - radians(p_lng)) +
          sin(radians(p_lat)) * sin(radians(p.lat))
        )))) ASC
  LIMIT 1;
END;
$function$;

GRANT EXECUTE ON FUNCTION chegoja.get_nearest_driver(double precision, double precision, double precision, text, uuid[]) TO anon, authenticated;

-- =================================================================================
-- 5. GRANTS E RLS - mesmo padrão já usado no projeto pra tabela administrável
-- com leitura pública (ver chegoja.driver_plans / chegoja.reward_tiers):
-- policy de RLS + GRANT são as duas camadas obrigatórias, sem o GRANT o
-- PostgREST bloqueia em silêncio (0 linhas, sem erro) mesmo com a policy OK.
-- =================================================================================
ALTER TABLE chegoja.vehicle_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vehicle_categories_read" ON chegoja.vehicle_categories;
CREATE POLICY "vehicle_categories_read"
  ON chegoja.vehicle_categories FOR SELECT USING (true);

DROP POLICY IF EXISTS "vehicle_categories_admin_write" ON chegoja.vehicle_categories;
CREATE POLICY "vehicle_categories_admin_write"
  ON chegoja.vehicle_categories FOR ALL USING (chegoja.is_admin()) WITH CHECK (chegoja.is_admin());

GRANT SELECT ON chegoja.vehicle_categories TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON chegoja.vehicle_categories TO authenticated;
