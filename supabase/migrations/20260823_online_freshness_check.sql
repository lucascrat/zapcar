-- =================================================================================
-- SÓ ENVIA CHAMADA PRA MOTORISTA REALMENTE ONLINE NO MOMENTO
-- Hoje o campo profiles.status='available' fica "preso" (motorista fecha o app
-- sem ficar offline, perde conexão, etc.) e continua recebendo corrida mesmo
-- sem estar de fato ativo. A solução: um campo dedicado que só é atualizado
-- pelo rastreamento de GPS de verdade (location_updated_at), usado como filtro
-- de "está online agora" tanto no despacho de corridas quanto pra corrigir o
-- status automaticamente via job agendado (pg_cron).
-- Aplicar no Supabase Dashboard → SQL Editor → Execute
-- =================================================================================

ALTER TABLE chegoja.profiles ADD COLUMN IF NOT EXISTS location_updated_at timestamptz;

-- Backfill: evita que todo mundo fique com NULL (=stale) até o próximo ping de
-- GPS - usa o que já existia antes só pra não zerar geral no instante do deploy.
UPDATE chegoja.profiles SET location_updated_at = updated_at
WHERE role = 'driver' AND location_updated_at IS NULL AND lat IS NOT NULL;

-- Trigger: marca automaticamente o timestamp sempre que lat/lng mudarem, não
-- importa qual código chamou o UPDATE - garante que location_updated_at
-- reflita SÓ movimento de GPS de verdade, nunca outro campo do perfil sendo
-- editado (ex: admin mudando saldo não deve "fingir" que o motorista está online).
-- Não condicionar a "valor realmente mudou" (IS DISTINCT FROM): motorista
-- parado pode reportar exatamente a mesma coordenada a cada ping de GPS, e
-- ainda assim está online de verdade. O trigger já só dispara quando lat/lng
-- estão no SET da instrução (UPDATE OF lat, lng abaixo), então basta marcar
-- sempre - é exatamente "recebemos um ping de GPS agora".
CREATE OR REPLACE FUNCTION chegoja.touch_location_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.location_updated_at = now();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_touch_location_updated_at ON chegoja.profiles;
CREATE TRIGGER trg_touch_location_updated_at
  BEFORE UPDATE OF lat, lng ON chegoja.profiles
  FOR EACH ROW EXECUTE FUNCTION chegoja.touch_location_updated_at();

-- =================================================================================
-- Despacho: só considera motorista com GPS atualizado nos últimos N minutos
-- (default 5) - motorista com localização "presa"/desatualizada nunca entra na
-- lista, mesmo que status ainda diga 'available'.
-- =================================================================================
CREATE OR REPLACE FUNCTION chegoja.get_drivers_within_radius(
  origin_lat double precision,
  origin_lng double precision,
  radius_km double precision,
  max_location_age_minutes int DEFAULT 5
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
    AND p.location_updated_at IS NOT NULL
    AND p.location_updated_at > now() - (max_location_age_minutes || ' minutes')::interval
    AND (6371 * acos(least(1.0, greatest(-1.0,
          cos(radians(origin_lat)) * cos(radians(p.lat)) * cos(radians(p.lng) - radians(origin_lng)) +
          sin(radians(origin_lat)) * sin(radians(p.lat))
        )))) <= radius_km
  ORDER BY (6371 * acos(least(1.0, greatest(-1.0,
          cos(radians(origin_lat)) * cos(radians(p.lat)) * cos(radians(p.lng) - radians(origin_lng)) +
          sin(radians(origin_lat)) * sin(radians(p.lat))
        )))) ASC;
END;
$function$;

-- Assinatura mudou (novo parâmetro) - remove a versão antiga de 3 parâmetros
-- pra não ficarem dois overloads.
DROP FUNCTION IF EXISTS chegoja.get_drivers_within_radius(double precision, double precision, double precision);
GRANT EXECUTE ON FUNCTION chegoja.get_drivers_within_radius(double precision, double precision, double precision, int) TO anon, authenticated;

-- =================================================================================
-- Job agendado: a cada 2 minutos, corrige o status de quem está "available" mas
-- com localização desatualizada há mais de 5 minutos - mantém o contador de
-- "motoristas online" do painel admin, os pontinhos no mapa do cliente e o
-- relatório de desempenho todos refletindo a realidade, sem precisar mexer em
-- cada tela que lê profiles.status separadamente.
-- =================================================================================
CREATE OR REPLACE FUNCTION chegoja.auto_offline_stale_drivers()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = chegoja, public
AS $function$
  UPDATE chegoja.profiles
  SET status = 'offline'
  WHERE role = 'driver'
    AND status = 'available'
    AND (location_updated_at IS NULL OR location_updated_at < now() - interval '5 minutes');
$function$;

GRANT EXECUTE ON FUNCTION chegoja.auto_offline_stale_drivers TO authenticated;

-- Remove agendamento anterior (se existir) antes de recriar, pra não duplicar.
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'auto_offline_stale_drivers';

SELECT cron.schedule(
  'auto_offline_stale_drivers',
  '*/2 * * * *', -- a cada 2 minutos
  $$SELECT chegoja.auto_offline_stale_drivers();$$
);
