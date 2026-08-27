
import React, { useEffect, useState } from 'react';
import { Ride } from '../types';
import { AdMobService } from '../services/adMobService';
import { useVehicleCategories } from '../src/contexts/VehicleCategoriesContext';

interface DriverRideCallProps {
    ride: Ride;
    onAccept: () => void;
    onReject: () => void;
}

// Quanto tempo o motorista tem pra responder antes da chamada ser recusada
// automaticamente. Precisa bater com o timeout do servidor (services/
// sequentialNotifications.ts, notification_timeout_seconds - default 30s):
// se esse valor aqui for menor, o app do motorista rejeita sozinho antes do
// servidor sequer considerar a chamada expirada.
const CALL_TIMEOUT_SECONDS = 30;

export const DriverRideCall: React.FC<DriverRideCallProps> = ({ ride, onAccept, onReject }) => {
    const [timeLeft, setTimeLeft] = useState(CALL_TIMEOUT_SECONDS);
    const { getCategoryMeta } = useVehicleCategories();
    const categoryMeta = getCategoryMeta(ride.vehicle_type);

    // Hide banner during incoming call
    useEffect(() => {
        AdMobService.hideBanner();
    }, []);

    useEffect(() => {
        console.log("Timer iniciado para corrida:", ride.id);
        const timer = setInterval(() => {
            setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
        }, 1000);
        return () => {
            console.log("Limpando timer da corrida:", ride.id);
            clearInterval(timer);
        };
    }, [ride.id]);

    // Dispara a rejeição automática num efeito próprio, fora do updater de
    // estado do timer - chamar onReject() (que atualiza o componente pai)
    // durante o setState do timer causava o aviso do React "Cannot update a
    // component while rendering a different component".
    useEffect(() => {
        if (timeLeft === 0) {
            console.log("Timeout da corrida atingido. Rejeitando automaticamente:", ride.id);
            onReject();
        }
    }, [timeLeft, onReject, ride.id]);

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-[#0a0f12]/90 backdrop-blur-xl animate-fade-in touch-none">
            {/* Ambient Background Glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-[#00a884]/20 rounded-full blur-[100px] pointer-events-none"></div>

            <div className="w-full max-w-[360px] bg-[#1a2329]/80 backdrop-blur-2xl border border-white/5 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.8)] rounded-[32px] overflow-hidden animate-slide-up relative">

                {/* Header Pattern / Accent */}
                <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-[#00a884]/20 to-transparent pointer-events-none"></div>

                <div className="p-6 text-center relative z-10">

                    {/* Animated Timer & Icon */}
                    <div className="relative w-28 h-28 mx-auto mb-6 mt-2">
                        <div className="absolute inset-0 bg-[#00a884] rounded-full animate-ping opacity-20"></div>
                        <div className="absolute inset-3 bg-gradient-to-br from-[#202c33] to-[#111b21] rounded-full flex items-center justify-center shadow-inner border border-white/5">
                            {categoryMeta.icon_url ? (
                                <img src={categoryMeta.icon_url} alt={categoryMeta.name} className="w-12 h-12 object-contain drop-shadow-[0_0_10px_rgba(0,168,132,0.5)]" />
                            ) : (
                                <span className="material-icons text-5xl text-[#00a884] drop-shadow-[0_0_10px_rgba(0,168,132,0.5)]">
                                    {ride.vehicle_type === 'motorcycle' ? 'two_wheeler' : 'directions_car'}
                                </span>
                            )}
                        </div>
                        <svg className="absolute inset-0 w-full h-full -rotate-90 drop-shadow-lg">
                            <defs>
                                <linearGradient id="timerGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                    <stop offset="0%" stopColor="#00a884" />
                                    <stop offset="100%" stopColor="#128c7e" />
                                </linearGradient>
                            </defs>
                            <circle
                                cx="56" cy="56" r="50"
                                fill="none"
                                stroke="rgba(255,255,255,0.05)"
                                strokeWidth="6"
                            />
                            <circle
                                cx="56" cy="56" r="50"
                                fill="none"
                                stroke="url(#timerGradient)"
                                strokeWidth="6"
                                strokeLinecap="round"
                                strokeDasharray="314"
                                strokeDashoffset={314 - (314 * timeLeft / CALL_TIMEOUT_SECONDS)}
                                className="transition-all duration-1000 ease-linear"
                            />
                        </svg>

                        {/* Countdown Number in center top */}
                        <div className="absolute -top-1 -right-1 w-8 h-8 bg-[#00a884] text-white text-xs font-black rounded-full flex items-center justify-center shadow-lg border-2 border-[#1a2329]">
                            {timeLeft}s
                        </div>
                    </div>

                    {/* Meta Data */}
                    <div className="mb-6">
                        {ride.is_delivery && (
                            <div className="inline-flex items-center gap-1.5 bg-brand-500/20 border border-brand-500/40 text-brand-400 px-3 py-1 rounded-full mb-2">
                                <span className="material-icons text-sm">inventory_2</span>
                                <span className="text-[11px] font-black uppercase tracking-widest">Entrega de Pacote</span>
                            </div>
                        )}
                        <h2 className="text-[10px] font-black text-[#00a884] mb-1 uppercase tracking-[0.2em]">
                            {ride.is_delivery ? 'Solicitação de Entrega' : 'Solicitação de Viagem'}
                        </h2>
                        <div className="flex justify-center items-center gap-2">
                            <span className="text-4xl font-extrabold text-white tracking-tighter drop-shadow-sm">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 }).format(ride.estimated_price || 0)}
                            </span>
                        </div>
                    </div>

                    {/* Route Details Container */}
                    <div className="relative bg-[#0b141a]/50 rounded-2xl p-4 mb-8 text-left border border-white/5 shadow-inner">
                        <div className="flex gap-4">
                            {/* Route Line Graphic */}
                            <div className="flex flex-col items-center gap-1 mt-1.5 w-3">
                                <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 border border-[#1a2329] shadow-[0_0_8px_rgba(52,211,153,0.5)] z-10"></div>
                                <div className="w-[1.5px] flex-1 bg-gradient-to-b from-emerald-400 to-red-400"></div>
                                <div className="w-2.5 h-2.5 rounded-full bg-red-400 border border-[#1a2329] shadow-[0_0_8px_rgba(248,113,113,0.5)] z-10"></div>
                            </div>

                            {/* Addresses */}
                            <div className="flex-1 space-y-4 py-0.5">
                                <div className="relative">
                                    <p className="text-[11px] text-gray-400 uppercase font-black tracking-wider mb-0.5">Embarque</p>
                                    <p className="text-[15px] text-white font-medium leading-snug line-clamp-2 pr-2">{ride.origin_address || 'Localização do Cliente'}</p>
                                </div>
                                <div className="relative">
                                    <p className="text-[11px] text-gray-400 uppercase font-black tracking-wider mb-0.5">Destino</p>
                                    <p className="text-[15px] text-white font-medium leading-snug line-clamp-2 pr-2 opacity-90">{ride.destination_address || 'Definir no embarque'}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3">
                        <button
                            onClick={onReject}
                            className="flex-1 min-h-[56px] bg-[#2a3942] hover:bg-[#344651] text-gray-300 font-bold rounded-[20px] transition-all active:scale-95 text-sm uppercase tracking-wide flex items-center justify-center font-sans"
                        >
                            Recusar
                        </button>
                        <button
                            onClick={onAccept}
                            className="flex-[2] min-h-[56px] relative overflow-hidden bg-gradient-to-r from-[#00a884] to-[#008f6f] hover:from-[#00bfa5] hover:to-[#00a884] text-white font-black rounded-[20px] transition-all active:scale-95 shadow-[0_8px_25px_-5px_rgba(0,168,132,0.5)] text-sm uppercase tracking-wider flex items-center justify-center"
                        >
                            <span className="relative z-10 flex items-center gap-2">
                                <span className="material-icons text-xl">check_circle</span>
                                Aceitar Corrida
                            </span>
                            {/* Button Shine Effect */}
                            <div className="absolute inset-0 -translate-x-full animate-[shine_3s_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

