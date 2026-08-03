import React, { useState, useEffect } from 'react';
import { UserProfile, Ride } from '../types';
import { fetchDriverHistory } from '../services/supabaseClient';

interface DriverHistoryProps {
    currentUser: UserProfile;
    onClose: () => void;
}

export const DriverHistory: React.FC<DriverHistoryProps> = ({ currentUser, onClose }) => {
    const [period, setPeriod] = useState<'today' | 'week' | 'month'>('today');
    const [rides, setRides] = useState<Ride[]>([]);
    const [loading, setLoading] = useState(false);
    const [stats, setStats] = useState({
        totalEarnings: 0,
        cashEarnings: 0,
        digitalEarnings: 0,
        count: 0
    });

    useEffect(() => {
        loadHistory();
    }, [period]);

    const loadHistory = async () => {
        setLoading(true);
        const now = new Date();
        let startDate = new Date();

        // Reset time to start of day
        startDate.setHours(0, 0, 0, 0);

        if (period === 'week') {
            const day = startDate.getDay();
            const diff = startDate.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Monday start
            startDate.setDate(diff);
        } else if (period === 'month') {
            startDate.setDate(1);
        }

        const endDate = new Date();
        endDate.setHours(23, 59, 59, 999);

        const history = await fetchDriverHistory(currentUser.id, startDate, endDate);
        setRides(history);

        // Calculate Stats
        let total = 0;
        let cash = 0;
        let bonus = 0;

        history.forEach(ride => {
            const price = ride.final_price || ride.estimated_price || 0;
            const discount = ride.discount_amount || 0;

            if (ride.status === 'finished') {
                total += price + discount;

                // If payment method is cash, driver already has 'price' in hands
                if (ride.payment_method === 'cash') {
                    cash += price;
                } else {
                    // If payment is digital, 'price' is also "to receive" from app
                    // But user specifically asked for "only bonus from coupons"
                    // However, if the payment is digital, the driver hasn't received the 'price' yet either?
                    // User said: "apenas o bonus do app que sara somado so os bonus de cupons usados"
                    // This likely implies cash rides where coupons were used.
                    // If it's a digital ride, usually the whole amount is "to receive".
                    // But I will strictly follow "sum only bonuses of used coupons" for the "A Receber" field as requested.
                    // Wait, if I ignore the digital payment principal, the driver won't see it?
                    // Let's assume the user means the "Bonus/App" card should show the Coupon Discounts.
                    // And maybe they receive digital payments instantly or differently.
                    // I will sum discount_amount to 'bonus'.
                }

                // Accumulate ALL coupon discounts into 'bonus' (whether cash or digital ride)
                // because the platform owes this discount to the driver.
                bonus += discount;
            }
        });

        setStats({
            totalEarnings: total,
            cashEarnings: cash,
            digitalEarnings: bonus,
            count: history.filter(r => r.status === 'finished').length
        });

        setLoading(false);
    };

    return (
        <div className="fixed inset-0 z-50 bg-[#111b21] flex flex-col animate-fade-in">
            {/* Header */}
            <div className="bg-[#202c33] p-4 flex items-center gap-4 shadow-md shrink-0">
                <button onClick={onClose} className="text-gray-400 hover:text-white">
                    <span className="material-icons">arrow_back</span>
                </button>
                <h2 className="text-white font-bold text-lg">Histórico de Corridas</h2>
            </div>

            {/* Filter Tabs */}
            <div className="p-4 flex gap-2 shrink-0">
                {(['today', 'week', 'month'] as const).map(p => (
                    <button
                        key={p}
                        onClick={() => setPeriod(p)}
                        className={`flex-1 py-2 rounded-lg text-sm font-bold transition ${period === p
                            ? 'bg-green-600 text-white'
                            : 'bg-[#202c33] text-gray-400 hover:bg-[#2a3942]'
                            }`}
                    >
                        {p === 'today' ? 'Hoje' : p === 'week' ? 'Semana' : 'Mês'}
                    </button>
                ))}
            </div>

            {/* Stats Cards */}
            <div className="px-4 pb-2 grid grid-cols-2 gap-3 shrink-0">
                <div className="bg-[#202c33] p-3 rounded-xl border-l-4 border-green-500">
                    <p className="text-[10px] text-gray-400 uppercase">Ganhos Totais</p>
                    <p className="text-lg font-bold text-white">R$ {stats.totalEarnings.toFixed(2)}</p>
                    <p className="text-[10px] text-gray-500">{stats.count} corridas</p>
                </div>
                <div className="bg-[#202c33] p-3 rounded-xl border-l-4 border-accent-500">
                    <p className="text-[10px] text-gray-400 uppercase">A Receber (Bônus Cupons)</p>
                    <p className="text-lg font-bold text-white">R$ {stats.digitalEarnings.toFixed(2)}</p>
                    <p className="text-[10px] text-gray-500">Subsídio App</p>
                </div>
                <div className="col-span-2 bg-[#202c33] p-3 rounded-xl border-l-4 border-yellow-500 flex justify-between items-center">
                    <div>
                        <p className="text-[10px] text-gray-400 uppercase">Dinheiro em Mãos</p>
                        <p className="text-lg font-bold text-white">R$ {stats.cashEarnings.toFixed(2)}</p>
                    </div>
                    <span className="material-icons text-yellow-500 opacity-50 text-3xl">payments</span>
                </div>
            </div>

            {/* Ride List */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3 pb-24">
                {loading ? (
                    <div className="text-center py-10 text-gray-500">
                        <span className="material-icons animate-spin text-3xl mb-2">refresh</span>
                        <p>Carregando histórico...</p>
                    </div>
                ) : rides.length === 0 ? (
                    <div className="text-center py-10 text-gray-500 opacity-50">
                        <span className="material-icons text-4xl mb-2">history</span>
                        <p>Nenhuma corrida neste período.</p>
                    </div>
                ) : (
                    rides.map(ride => (
                        <div key={ride.id} className="bg-[#202c33] p-3 rounded-xl border border-white/5 flex flex-col gap-2">
                            <div className="flex justify-between items-start">
                                <div>
                                    <p className="text-xs text-gray-400">
                                        {new Date(ride.created_at || '').toLocaleDateString()} • {new Date(ride.created_at || '').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </p>
                                    <p className={`text-xs font-bold uppercase mt-1 ${ride.status === 'finished' ? 'text-green-400' : 'text-red-400'
                                        }`}>
                                        {ride.status === 'finished' ? 'Finalizada' : 'Cancelada'}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="text-green-400 font-bold">R$ {(ride.final_price || ride.estimated_price || 0).toFixed(2)}</p>
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-gray-300 uppercase">
                                        {ride.payment_method === 'cash' ? 'Dinheiro' : 'App/Pix'}
                                    </span>
                                </div>
                            </div>

                            <div className="relative pl-4 border-l border-gray-600 space-y-2 mt-1">
                                <div>
                                    <div className="absolute -left-1.5 top-1 w-3 h-3 rounded-full bg-green-500"></div>
                                    <p className="text-xs text-gray-300 line-clamp-1">{ride.origin_address}</p>
                                </div>
                                <div>
                                    <div className="absolute -left-1.5 top-7 w-3 h-3 rounded-full bg-red-500"></div>
                                    <p className="text-xs text-gray-300 line-clamp-1">{ride.destination_address}</p>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};
