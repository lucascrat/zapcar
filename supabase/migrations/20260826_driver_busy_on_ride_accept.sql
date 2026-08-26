-- =================================================================================
-- MOTORISTA NAO FICA "OCUPADO" AO ACEITAR CORRIDA (nem pela Central, nem pelo
-- fluxo normal de cliente)
--
-- Causa raiz confirmada direto no banco: atomic_accept_ride (RPC chamada pelo
-- app do motorista ao aceitar uma corrida - services/sequentialNotifications.ts
-- acceptRideSequential) só atualiza chegoja.rides (driver_id, status='en_route',
-- etc) - NUNCA toca em chegoja.profiles.status. Nenhum outro trigger ou RPC
-- cobre isso. Resultado: profiles.status='busy' só acontecia via botao manual
-- LIVRE/OCUPADO do proprio motorista (App.tsx handleStatusToggle) - uma corrida
-- sendo aceita, seja disparada pela Central do admin ou pedida por um cliente,
-- nunca mudava o status de verdade. Confirma o achado anterior desta sessao: os
-- motoristas com status='busy' nunca tinham corrida ativa nenhuma associada.
--
-- Fix: trigger em chegoja.rides que mantem profiles.status sincronizado com o
-- ciclo de vida da corrida, cobrindo TODOS os caminhos (Central, cliente,
-- fallback) automaticamente, sem depender de cada client lembrar de chamar
-- updateDriverStatus:
--   - Corrida entra em status ativo (accepted/en_route/arrived/started/
--     waiting_payment) com motorista atribuido -> profiles.status='busy'.
--   - Corrida finaliza ou e cancelada -> profiles.status='available' (só se
--     ainda estava 'busy' - não reativa quem foi pra 'offline' de proposito
--     no meio da corrida, ex: fechou o app).
--
-- Aplicar no Supabase Dashboard → SQL Editor → Execute
-- =================================================================================

CREATE OR REPLACE FUNCTION chegoja.sync_driver_status_on_ride_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = chegoja, public
AS $function$
BEGIN
  IF NEW.driver_id IS NOT NULL
     AND NEW.status IN ('accepted', 'en_route', 'arrived', 'started', 'waiting_payment') THEN
    UPDATE chegoja.profiles
    SET status = 'busy'
    WHERE id = NEW.driver_id AND status <> 'busy';
  ELSIF NEW.status IN ('finished', 'cancelled') AND NEW.driver_id IS NOT NULL THEN
    UPDATE chegoja.profiles
    SET status = 'available'
    WHERE id = NEW.driver_id AND status = 'busy';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_driver_status_on_ride_change ON chegoja.rides;
CREATE TRIGGER trg_sync_driver_status_on_ride_change
  AFTER INSERT OR UPDATE OF status, driver_id ON chegoja.rides
  FOR EACH ROW EXECUTE FUNCTION chegoja.sync_driver_status_on_ride_change();
