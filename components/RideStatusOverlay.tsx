import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Ride, UserProfile, AppSettings } from '../types';
import { AppMap } from './AppMap';
import { updateRidePayment, supabase } from '../services/supabaseClient';
import { RidePaymentModal } from './RidePaymentModal';
import { SUPABASE_SCHEMA } from '../constants';
import { getDirections } from '../services/mapboxService';

interface RideStatusOverlayProps {
    ride: Ride;
    onCancel: () => void;
    onChat: () => void;
    settings: AppSettings | null;
    currentUser: UserProfile;
}

export const RideStatusOverlay: React.FC<RideStatusOverlayProps> = ({ ride, onCancel, onChat, settings, currentUser }) => {
    const [eta, setEta] = useState(Math.floor(ride.estimated_time || 5));
    const [liveDriverPos, setLiveDriverPos] = useState<{ lat: number; lng: number } | null>(
        ride.driver?.lat && ride.driver?.lng ? { lat: ride.driver.lat, lng: ride.driver.lng } : null
    );
    const lastEtaFetch = useRef<number>(0);

    // ETA real via Mapbox Directions
    const fetchRealEta = useCallback(async (driverPos: { lat: number; lng: number }) => {
        try {
            const dest = (ride.status === 'started')
                ? { lat: ride.destination_lat || ride.origin_lat, lng: ride.destination_lng || ride.origin_lng }
                : { lat: ride.origin_lat, lng: ride.origin_lng };

            const route = await getDirections([driverPos.lng, driverPos.lat], [dest.lng, dest.lat]);
            if (route) {
                setEta(Math.max(1, Math.ceil(route.durationSeconds / 60)));
            }
        } catch (err) {
            console.warn('[RideStatusOverlay] ETA fetch error', err);
        }
    }, [ride.status, ride.origin_lat, ride.origin_lng, ride.destination_lat, ride.destination_lng]);

    // Tracking em tempo real da posição do motorista
    useEffect(() => {
        if (!ride.driver?.id) return;
        const channel = supabase
            .channel(`ride-driver-track-${ride.id}`)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: SUPABASE_SCHEMA,
                table: 'profiles',
                filter: `id=eq.${ride.driver.id}`
            }, (payload: any) => {
                const d = payload.new;
                if (d.lat && d.lng) {
                    setLiveDriverPos({ lat: d.lat, lng: d.lng });
                }
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [ride.driver?.id, ride.id]);

    // Atualizar ETA quando posição do motorista muda (com throttle de 45s)
    useEffect(() => {
        if (!liveDriverPos) return;
        if (ride.status !== 'accepted' && ride.status !== 'en_route' && ride.status !== 'started') return;

        const now = Date.now();
        if (now - lastEtaFetch.current > 45000) {
            fetchRealEta(liveDriverPos);
            lastEtaFetch.current = now;
        }
    }, [liveDriverPos, ride.status, fetchRealEta]);

    // Determinar pontos de rota baseado no status
    const driverPos = liveDriverPos || (ride.driver ? { lat: ride.driver.lat || ride.origin_lat, lng: ride.driver.lng || ride.origin_lng } : undefined);
    const routeDest = (ride.status === 'started')
        ? { lat: ride.destination_lat || ride.origin_lat, lng: ride.destination_lng || ride.origin_lng }
        : { lat: ride.origin_lat, lng: ride.origin_lng };

    const getStatusText = () => {
        switch (ride.status) {
            case 'searching': return 'Procurando motoristas...';
            case 'accepted':
            case 'en_route': return 'Motorista a caminho';
            case 'arrived': return 'Motorista no local';
            case 'started': return 'Em viagem';
            case 'waiting_payment': return 'Pagamento Pendente';
            default: return 'Status da corrida';
        }
    };

    return (
        <div className="fixed inset-0 z-[100] bg-whatsapp-dark flex flex-col animate-fade-in">
            {/* Header Status */}
            <div className="absolute top-0 left-0 right-0 z-20 p-4 bg-gradient-to-b from-black/80 to-transparent">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-whatsapp-green animate-pulse"></div>
                        <span className="text-white font-bold text-lg drop-shadow-md">{getStatusText()}</span>
                    </div>
                </div>
            </div>

            {/* Main Map Area */}
            <div className="flex-1 relative">
                <AppMap
                    drivers={ride.driver ? [{ ...ride.driver, lat: liveDriverPos?.lat || ride.driver.lat, lng: liveDriverPos?.lng || ride.driver.lng }] : []}
                    userLocation={{ lat: ride.origin_lat, lng: ride.origin_lng }}
                    settings={settings}
                    showRoute={!!ride.driver}
                    routeOrigin={driverPos}
                    routeDestination={routeDest}
                />
            </div>

            {/* Bottom Info Card */}
            <div className="relative z-10 bg-[#0b141a] rounded-t-[40px] shadow-[0_-15px_30px_rgba(0,0,0,0.5)] border-t border-white/5 pb-safe pb-16">
                <div className="p-6 pt-8">
                    {ride.status === 'searching' ? (
                        <div className="flex flex-col items-center text-center py-8">
                            <div className="relative w-24 h-24 mb-6">
                                <div className="absolute inset-0 border-4 border-whatsapp-green/20 rounded-full"></div>
                                <div className="absolute inset-0 border-4 border-t-whatsapp-green rounded-full animate-spin"></div>
                                <div className="absolute inset-2 bg-whatsapp-green/10 rounded-full flex items-center justify-center">
                                    <span className="material-icons text-3xl text-whatsapp-green">local_taxi</span>
                                </div>
                            </div>
                            <h3 className="text-xl font-bold text-white mb-2">Conectando você...</h3>
                            <p className="text-gray-400 text-sm max-w-xs mb-8">Buscando o motorista parceiro mais próximo da sua localização.</p>

                            <button
                                onClick={onCancel}
                                className="w-full py-4 bg-white/5 border border-white/10 text-red-500 font-black rounded-2xl uppercase tracking-widest text-xs active:scale-95 transition-all"
                            >
                                Cancelar Solicitação
                            </button>
                        </div>
                    ) : ride.status === 'waiting_payment' ? (
                        <div className="flex flex-col items-center text-center py-8">
                            <div className="w-24 h-24 bg-whatsapp-green/10 rounded-full flex items-center justify-center mb-6 animate-pulse">
                                <span className="material-icons text-5xl text-whatsapp-green">payments</span>
                            </div>
                            <h3 className="text-xl font-bold text-white mb-2">Pagamento Solicitado</h3>
                            <p className="text-gray-400 text-sm max-w-xs">O motorista solicitou a confirmação do pagamento. Selecione a forma de pagamento na tela.</p>
                        </div>
                    ) : ride.status === 'finished' ? (
                        <div className="flex flex-col items-center text-center py-8 animate-slide-up">
                            <div className="w-24 h-24 bg-green-500/20 rounded-full flex items-center justify-center mb-6">
                                <span className="material-icons text-5xl text-green-500">check_circle</span>
                            </div>
                            <h3 className="text-xl font-bold text-white mb-2">Corrida Finalizada</h3>
                            <p className="text-gray-400 text-sm max-w-xs mb-8">Obrigado por viajar com o ChegoJá! Avalie seu motorista.</p>

                            <button
                                onClick={onCancel} // Reusing cancel to close overlay
                                className="w-full py-4 bg-whatsapp-green text-white font-black rounded-2xl uppercase tracking-widest text-sm active:scale-95 transition-all shadow-lg shadow-whatsapp-green/20"
                            >
                                Fechar
                            </button>
                        </div>
                    ) : ride.driver && (
                        <div className="space-y-6">
                            {/* Driver & ETA Row */}
                            <div className="flex items-center justify-between bg-white/5 p-4 rounded-3xl border border-white/5 shadow-inner">
                                <div className="flex items-center gap-4">
                                    <div className="relative">
                                        <div className="w-16 h-16 rounded-2xl overflow-hidden border-2 border-whatsapp-green shadow-lg">
                                            <img
                                                src={ride.driver.avatar_url || `https://ui-avatars.com/api/?name=${ride.driver.username}`}
                                                className="w-full h-full object-cover"
                                                alt="Motorista"
                                            />
                                        </div>
                                        <div className="absolute -bottom-2 -right-2 bg-whatsapp-green text-black text-[10px] font-black px-1.5 py-0.5 rounded-md flex items-center gap-0.5 shadow-md">
                                            <span className="material-icons text-[10px]">star</span>
                                            4.9
                                        </div>
                                    </div>
                                    <div>
                                        <h4 className="text-xl font-black text-white leading-tight uppercase tracking-tight">{ride.driver.username}</h4>
                                        <p className="text-whatsapp-green text-sm font-bold flex items-center gap-1">
                                            <span className="material-icons text-sm">{ride.driver.vehicle_type === 'motorcycle' ? 'two_wheeler' : 'directions_car'}</span>
                                            {ride.driver.vehicle_type === 'motorcycle' ? 'Moto Ativa' : 'Carro Ativo'}
                                        </p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] text-gray-500 uppercase font-black tracking-widest mb-1">Chegada</p>
                                    <div className="flex items-baseline justify-end gap-1">
                                        <span className="text-3xl font-black text-white tabular-nums">
                                            {ride.status === 'arrived' ? '0' : Math.floor(eta)}
                                        </span>
                                        <span className="text-sm font-bold text-whatsapp-green">min</span>
                                    </div>
                                </div>
                            </div>

                            {/* Vehicle Details Row */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-[#1f2c34] p-4 rounded-2xl border border-white/5 flex items-center gap-3">
                                    <div className="bg-white/5 p-2 rounded-xl">
                                        <span className="material-icons text-blue-400">directions_car</span>
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-gray-500 uppercase font-bold">Veículo</p>
                                        <p className="text-[13px] text-white font-black truncate">{ride.driver.vehicle_model}</p>
                                        <p className="text-[11px] text-gray-400">{ride.driver.vehicle_color}</p>
                                    </div>
                                </div>
                                <div className="bg-[#1f2c34] p-4 rounded-2xl border border-white/5 flex items-center gap-3">
                                    <div className="bg-white/5 p-2 rounded-xl">
                                        <span className="material-icons text-yellow-500">vignette</span>
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-gray-500 uppercase font-bold">Placa</p>
                                        <p className="text-[15px] text-white font-extrabold tracking-widest">{ride.driver.vehicle_plate}</p>
                                    </div>
                                </div>
                            </div>


                            {/* Actions */}
                            <div className="flex flex-col gap-4">
                                <div className="flex gap-4">
                                    <button
                                        className="flex-1 h-16 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl flex items-center justify-center gap-3 shadow-xl active:scale-95 transition-all font-black uppercase tracking-wider text-sm"
                                        onClick={onChat}
                                    >
                                        <span className="material-icons">chat</span>
                                        Chat no App
                                    </button>
                                    <button
                                        className="w-16 h-16 bg-[#25D366] hover:bg-[#20bd5c] text-white rounded-2xl flex items-center justify-center shadow-xl active:scale-95 transition-all"
                                        onClick={() => {
                                            const phone = ride.driver?.phone?.replace(/\D/g, '');
                                            if (phone) {
                                                window.open(`https://wa.me/55${phone}`, '_blank');
                                            } else {
                                                window.open(`tel:${ride.driver?.phone}`);
                                            }
                                        }}
                                    >
                                        <svg viewBox="0 0 24 24" className="w-8 h-8 fill-current">
                                            <path d="M12.031 6.062c-3.414 0-6.141 2.766-6.141 6.131 0 1.25.378 2.391 1.011 3.352l-.667 2.453 2.503-.656c.94.57 2.05.904 3.224.904 3.414 0 6.141-2.766 6.141-6.131 0-3.365-2.756-6.131-6.141-6.131zm3.837 8.657c-.15.422-1.008.822-1.393.873-.385.051-.818.102-2.181-.469-1.362-.571-2.228-1.928-2.296-2.028-.069-.101-.568-.753-.568-1.42 0-.667.351-.994.475-1.12.124-.126.273-.151.365-.151.091 0 .183.001.263.005.087.005.203-.032.316.241.113.273.385.942.421 1.01.036.069.06.151.013.241-.047.091-.07.151-.139.228-.069.076-.145.176-.208.236-.063.061-.133.126-.057.256.076.131.336.551.721.892.496.442.912.58 1.042.641.13.061.206.05.283-.036.076-.087.336-.395.426-.531.091-.136.183-.113.31-.061.127.051.808.384.947.454.139.07.232.106.267.166.035.061.035.353-.115.772z" />
                                        </svg>
                                    </button>
                                </div>
                                <button
                                    onClick={onCancel}
                                    className="w-full py-4 text-red-500/70 hover:text-red-500 text-[11px] font-black tracking-widest uppercase transition-all active:scale-95"
                                >
                                    Cancelar Corrida
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Payment Modal Integration */}
            {ride.status === 'waiting_payment' && (
                <RidePaymentModal
                    ride={ride}
                    currentUser={currentUser}
                    onPaymentComplete={() => {
                        // O modal já atualiza o status para 'finished' e payment_status para 'completed'.
                        // O realtime fará o restante (fechar o overlay).
                        console.log("Pagamento concluído via Modal");
                    }}
                />
            )}
        </div>
    );
};

