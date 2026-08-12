/**
 * Sistema de Notificação Sequencial
 * Implementação client-side (React Native)
 */

import { supabase } from './supabaseClient';

// Raio máximo de busca em km
const MAX_SEARCH_RADIUS_KM = 15;

// Limite máximo de tentativas de skip (motoristas sem token ou com status errado)
// Previne recursão infinita caso muitos motoristas estejam com problemas
const MAX_SKIP_RETRIES = 10;

/**
 * Calcula distância entre duas coordenadas usando fórmula Haversine
 * Retorna distância em quilômetros
 */
function calculateDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number
): number {
    const R = 6371; // Raio da Terra em km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLng = (lng2 - lng1) * (Math.PI / 180);

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) *
        Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    return distance;
}

interface NotificationAttempt {
    driver_id: string;
    notified_at: string;
    response: 'accepted' | 'rejected' | 'timeout' | 'no_token' | 'too_far';
    responded_at: string;
    distance_km?: number;
}

/**
 * Notifica próximo motorista disponível
 * Integra diretamente com Firebase via função send-notification
 */
export const notifyNextDriver = async (rideId: string, _skipRetryCount: number = 0): Promise<{
    success: boolean;
    driver_id?: string;
    message?: string;
}> => {
    try {
        // Proteção contra recursão infinita (motoristas sem token/offline em sequência)
        if (_skipRetryCount >= MAX_SKIP_RETRIES) {
            console.warn(`[Sequential] ⚠️ Max skip retries (${MAX_SKIP_RETRIES}) reached for ride ${rideId}. Cancelling.`);
            await supabase
                .from('rides')
                .update({
                    status: 'cancelled',
                    current_notified_driver_id: null,
                    notification_sent_at: null
                })
                .eq('id', rideId);
            return { success: false, message: `Max retries reached (${MAX_SKIP_RETRIES}) - ride cancelled` };
        }
        console.log(`[Sequential] Buscando próximo motorista para corrida ${rideId}`);

        // 1. Buscar dados da corrida
        const { data: ride, error: rideError } = await supabase
            .from('rides')
            .select('*, client:client_id(username)')
            .eq('id', rideId)
            .single();

        if (rideError || !ride) {
            console.error('[Sequential] Ride not found:', rideError);
            return { success: false, message: 'Ride not found' };
        }

        // Verificar se ainda está em busca
        if (ride.status !== 'searching') {
            console.log(`[Sequential] Ride ${rideId} not in searching state`);
            return { success: false, message: 'Ride not in searching state' };
        }

        // 2. Verificar timeout do motorista atual
        if (ride.current_notified_driver_id && ride.notification_sent_at) {
            const sentAt = new Date(ride.notification_sent_at);
            const now = new Date();
            const elapsedSeconds = (now.getTime() - sentAt.getTime()) / 1000;
            const timeoutSeconds = ride.notification_timeout_seconds || 30;

            if (elapsedSeconds < timeoutSeconds) {
                console.log(`[Sequential] Current driver still has ${Math.round(timeoutSeconds - elapsedSeconds)}s to respond`);
                return {
                    success: false,
                    message: 'Current driver still has time',
                    driver_id: ride.current_notified_driver_id
                };
            }

            // Timeout - registrar tentativa falhada
            console.log(`[Sequential] Timeout! Driver ${ride.current_notified_driver_id} did not respond`);
            const attempts: NotificationAttempt[] = ride.notification_attempts || [];
            attempts.push({
                driver_id: ride.current_notified_driver_id,
                notified_at: ride.notification_sent_at,
                response: 'timeout',
                responded_at: new Date().toISOString()
            });

            // Atualizar tentativas e adicionar ao ignored_drivers
            const updatedIgnored = [...(ride.ignored_drivers || [])];
            if (!updatedIgnored.includes(ride.current_notified_driver_id)) {
                updatedIgnored.push(ride.current_notified_driver_id);
            }

            await supabase
                .from('rides')
                .update({
                    notification_attempts: attempts,
                    ignored_drivers: updatedIgnored,
                    current_notified_driver_id: null,
                    notification_sent_at: null
                })
                .eq('id', rideId);
        }

        // 3. Buscar próximo motorista disponível
        const attempts: NotificationAttempt[] = ride.notification_attempts || [];
        const rejectedDriverIds = attempts.map(a => a.driver_id);

        console.log(`[Sequential] Searching for driver (excluding ${rejectedDriverIds.length} previous attempts)`);

        let allDrivers: any[] = [];
        let rpcUsed = false;

        try {
            // Tenta usar a RPC otimizada do PostGIS / Geodesia no Servidor
            let rpcQuery = supabase.rpc('get_drivers_within_radius', {
                origin_lat: ride.origin_lat,
                origin_lng: ride.origin_lng,
                radius_km: MAX_SEARCH_RADIUS_KM
            }).select('id, username, lat, lng, status, push_tokens(token), vehicle_type');

            if (ride.vehicle_type) {
                rpcQuery = rpcQuery.eq('vehicle_type', ride.vehicle_type);
            }

            if (rejectedDriverIds.length > 0) {
                rpcQuery = rpcQuery.not('id', 'in', `(${rejectedDriverIds.join(',')})`);
            }

            const { data: rpcData, error: rpcError } = await rpcQuery;

            if (!rpcError && rpcData) {
                allDrivers = rpcData as any[];
                rpcUsed = true;
                console.log(`[Sequential] RPC get_drivers_within_radius succeeded! Found ${allDrivers.length} drivers.`);
            } else {
                console.warn("[Sequential] RPC failed, falling back to full table scan", rpcError);
            }
        } catch (e) {
            console.warn("[Sequential] RPC exception, falling back to full table scan", e);
        }

        if (!rpcUsed) {
            // Fallback para a query completa (método antigo)
            let driversQuery = supabase
                .from('profiles')
                .select('id, username, lat, lng, status, push_tokens(token), vehicle_type')
                .eq('role', 'driver')
                .eq('status', 'available')
                .eq('is_approved', true)
                .not('lat', 'is', null)
                .not('lng', 'is', null);

            if (ride.vehicle_type) {
                driversQuery = driversQuery.eq('vehicle_type', ride.vehicle_type);
            }

            if (rejectedDriverIds.length > 0) {
                driversQuery = driversQuery.not('id', 'in', `(${rejectedDriverIds.join(',')})`);
            }

            const { data, error } = await driversQuery;
            if (error) {
                console.error('[Sequential] Fallback drivers query error', error);
            } else if (data) {
                allDrivers = data as any[];
            }
        }

        if (!allDrivers || allDrivers.length === 0) {
            console.log('[Sequential] No available drivers');

            // Cancelar corrida
            await supabase
                .from('rides')
                .update({
                    status: 'cancelled',
                    current_notified_driver_id: null,
                    notification_sent_at: null
                })
                .eq('id', rideId);

            return { success: false, message: 'No available drivers - ride cancelled' };
        }

        console.log(`[Sequential] Found ${allDrivers.length} drivers from query. Filtering by proximity (${MAX_SEARCH_RADIUS_KM}km)...`);

        // 🔴 VERIFICAÇÃO EXTRA: Filtrar apenas status 'available' (double-check)
        const onlyAvailable = allDrivers.filter((d: any) => d.status === 'available');
        console.log(`[Sequential] ✅ After status check: ${onlyAvailable.length} drivers with status=available`);

        // 🔍 FILTRAR POR PROXIMIDADE (15 km)
        const driversWithDistance = onlyAvailable
            .map((driver: any) => {
                const distance = calculateDistance(
                    ride.origin_lat,
                    ride.origin_lng,
                    driver.lat,
                    driver.lng
                );
                return { ...driver, distance };
            })
            .filter(driver => driver.distance <= MAX_SEARCH_RADIUS_KM)
            .sort((a, b) => a.distance - b.distance); // Ordenar por mais próximo

        if (driversWithDistance.length === 0) {
            console.log(`[Sequential] ❌ No drivers within ${MAX_SEARCH_RADIUS_KM}km radius`);

            // Cancelar corrida - sem motoristas próximos
            await supabase
                .from('rides')
                .update({
                    status: 'cancelled',
                    current_notified_driver_id: null,
                    notification_sent_at: null
                })
                .eq('id', rideId);

            return {
                success: false,
                message: `No drivers within ${MAX_SEARCH_RADIUS_KM}km - ride cancelled`
            };
        }

        // Pegar o motorista MAIS PRÓXIMO
        const nextDriver: any = driversWithDistance[0];
        console.log(`[Sequential] 📍 Nearest driver: ${nextDriver.username} at ${nextDriver.distance.toFixed(2)}km, status: ${nextDriver.status}`);

        // 🔴 VERIFICAÇÃO FINAL: Garantir que o motorista ainda está available
        if (nextDriver.status !== 'available') {
            console.log(`[Sequential] ⚠️ Driver ${nextDriver.id} is ${nextDriver.status}, skipping...`);

            // Marcar tentativa e tentar próximo
            attempts.push({
                driver_id: nextDriver.id,
                notified_at: new Date().toISOString(),
                response: 'too_far', // Reutilizar para status incorreto
                responded_at: new Date().toISOString(),
                distance_km: nextDriver.distance
            });

            await supabase
                .from('rides')
                .update({
                    notification_attempts: attempts,
                    ignored_drivers: [...(ride.ignored_drivers || []), nextDriver.id]
                })
                .eq('id', rideId);

            // Chamar próximo (com contador de skip para evitar loop infinito)
            return notifyNextDriver(rideId, _skipRetryCount + 1);
        }

        const driverToken = nextDriver.push_tokens?.[0]?.token;

        // 4. Reivindicar a vez do motorista de forma atomica ANTES de mandar
        // qualquer notificacao. O WHERE status='searching' torna isto seguro
        // contra corrida com um cancelamento concorrente: se o cliente (ou um
        // admin) cancelou a corrida um instante antes, essa condicao nao bate
        // e nenhuma linha e afetada - a funcao aborta sem notificar ninguem.
        // Sem isso, era possivel mandar push pro proximo motorista mesmo com
        // a corrida ja cancelada (visto num teste real: cancelamento e o
        // timeout do motorista anterior correndo quase juntos).
        const { data: claimedRows, error: updateError } = await supabase
            .from('rides')
            .update({
                current_notified_driver_id: nextDriver.id,
                notification_sent_at: new Date().toISOString(),
                last_driver_offered_at: new Date().toISOString()
            })
            .eq('id', rideId)
            .eq('status', 'searching')
            .select('id');

        if (updateError) {
            console.error('[Sequential] Failed to update ride:', updateError);
            return { success: false, message: 'Failed to update ride' };
        }

        if (!claimedRows || claimedRows.length === 0) {
            console.log(`[Sequential] Corrida ${rideId} nao esta mais em 'searching' (cancelada/aceita em paralelo). Abortando sem notificar.`);
            return { success: false, message: 'Ride no longer searching - aborted before notifying' };
        }

        // A falta de push token só impede o envio da notificação push (útil
        // com o app fechado) - o motorista continua recebendo a chamada via
        // realtime no app (DriverRideCall), então NÃO deve ser excluído da
        // corrida nem fazer a corrida ser cancelada por causa disso. Se ele
        // não responder, o fluxo de timeout já existente assume o rodízio.
        if (driverToken) {
            console.log(`[Sequential] Notifying driver: ${nextDriver.username} (${nextDriver.id})`);

            // 5. Enviar notificação via Edge Function existente (só depois de
            // ter reivindicado a vez com sucesso acima)
            const { error: notifError } = await supabase.functions.invoke('send-notification', {
                body: {
                    title: '🚗 Nova Corrida Disponível!',
                    body: `Origem: ${ride.origin_address?.substring(0, 50)}...`,
                    data: {
                        type: 'new_ride',
                        ride_id: rideId
                    },
                    targetType: 'user',
                    targetUserId: nextDriver.id,
                    sound: 'ubb',
                    location: {
                        lat: ride.origin_lat,
                        lng: ride.origin_lng
                    }
                }
            });

            if (notifError) {
                console.warn('[Sequential] Failed to send push notification (continuando via realtime):', notifError);
            }
        } else {
            console.log(`[Sequential] Driver ${nextDriver.id} has no push token - relying on in-app realtime only`);
        }

        console.log(`[Sequential] Notification sent! Waiting ${ride.notification_timeout_seconds || 30}s for response`);

        return {
            success: true,
            driver_id: nextDriver.id,
            message: `Driver ${nextDriver.username} notified`
        };

    } catch (error: any) {
        console.error('[Sequential] Exception:', error);
        return { success: false, message: error.message };
    }
};

/**
 * Aceitar corrida (motorista) - Versão sequencial
 */
export const acceptRideSequential = async (rideId: string, driverId: string): Promise<boolean> => {
    try {
        // Usar RPC atômica com SELECT FOR UPDATE para evitar race conditions
        const { data, error } = await supabase.rpc('atomic_accept_ride', {
            p_ride_id: rideId,
            p_driver_id: driverId
        });

        if (error) {
            console.error('[acceptRide] RPC error:', error);
            return false;
        }

        const result = data as { success: boolean; message: string };

        if (!result?.success) {
            console.warn(`[acceptRide] Falha atômica: ${result?.message || 'Corrida já aceita por outro motorista'}`);
            return false;
        }

        console.log(`[acceptRide] ✅ Ride ${rideId} accepted atomically by driver ${driverId}`);
        return true;
    } catch (error: any) {
        console.error('[acceptRide] Exception:', error);
        return false;
    }
};

/**
 * Rejeitar corrida (motorista) - Versão sequencial
 */
export const rejectRideSequential = async (rideId: string, driverId: string): Promise<boolean> => {
    try {
        console.log(`[rejectRide] Driver ${driverId} rejecting ride ${rideId}`);

        // Buscar a corrida para pegar as tentativas atuais
        const { data: ride, error: fetchError } = await supabase
            .from('rides')
            .select('notification_attempts, notification_sent_at')
            .eq('id', rideId)
            .single();

        if (fetchError || !ride) {
            console.error('[rejectRide] Fetch error:', fetchError);
            return false;
        }

        // Registrar rejeição nas tentativas
        const attempts: NotificationAttempt[] = ride.notification_attempts || [];
        attempts.push({
            driver_id: driverId,
            notified_at: ride.notification_sent_at || new Date().toISOString(),
            response: 'rejected',
            responded_at: new Date().toISOString()
        });

        // Buscar ignored_drivers atual para sincronizar
        const { data: currentRide } = await supabase
            .from('rides')
            .select('ignored_drivers')
            .eq('id', rideId)
            .single();

        const updatedIgnored = [...(currentRide?.ignored_drivers || [])];
        if (!updatedIgnored.includes(driverId)) {
            updatedIgnored.push(driverId);
        }

        // Atualizar ride e limpar motorista notificado
        const { error: updateError } = await supabase
            .from('rides')
            .update({
                notification_attempts: attempts,
                current_notified_driver_id: null,
                notification_sent_at: null,
                ignored_drivers: updatedIgnored
            })
            .eq('id', rideId);

        if (updateError) {
            console.error('[rejectRide] Update error:', updateError);
            return false;
        }

        // Chamar próximo motorista imediatamente
        console.log('[rejectRide] Notifying next driver...');
        await notifyNextDriver(rideId);

        return true;
    } catch (error: any) {
        console.error('[rejectRide] Exception:', error);
        return false;
    }
};

/**
 * Verificar timeouts pendentes (chamar periodicamente)
 * Usar com setInterval a cada 10 segundos
 */
export const checkNotificationTimeouts = async (): Promise<number> => {
    try {
        // Buscar corridas em searching com notificação ativa
        const { data: rides, error } = await supabase
            .from('rides')
            .select('id, current_notified_driver_id, notification_sent_at, notification_timeout_seconds')
            .eq('status', 'searching')
            .not('current_notified_driver_id', 'is', null)
            .not('notification_sent_at', 'is', null);

        if (error || !rides) {
            return 0;
        }

        let processedCount = 0;
        const now = new Date();

        for (const ride of rides) {
            const sentAt = new Date(ride.notification_sent_at!);
            const elapsedSeconds = (now.getTime() - sentAt.getTime()) / 1000;
            const timeoutSeconds = ride.notification_timeout_seconds || 30;

            if (elapsedSeconds >= timeoutSeconds) {
                console.log(`[checkTimeouts] Ride ${ride.id} timeout detected`);
                await notifyNextDriver(ride.id);
                processedCount++;
            }
        }

        if (processedCount > 0) {
            console.log(`[checkTimeouts] Processed ${processedCount} timeouts`);
        }

        return processedCount;
    } catch (error: any) {
        console.error('[checkTimeouts] Exception:', error);
        return 0;
    }
};
