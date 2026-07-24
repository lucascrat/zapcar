import React, { useState, useEffect, useCallback } from 'react';
import { Ride, UserProfile } from '../../../types';
import {
    fetchAllRides,
    cancelRide,
    supabase,
    fetchUserProfile
} from '../../../services/supabaseClient';
import { Card, Button, Badge } from '../../components/shared';

const statusColors: Record<string, string> = {
    searching: 'rgba(245, 158, 11, 0.15)',
    accepted: 'rgba(59, 130, 246, 0.15)',
    en_route: 'rgba(59, 130, 246, 0.15)',
    arrived: 'rgba(139, 92, 246, 0.15)',
    started: 'rgba(0, 168, 132, 0.15)',
    finished: 'rgba(16, 185, 129, 0.15)',
    cancelled: 'rgba(239, 68, 68, 0.15)',
};

const statusLabels: Record<string, string> = {
    searching: 'Procurando',
    accepted: 'Aceito',
    en_route: 'À Caminho',
    arrived: 'No Local',
    started: 'Em Viagem',
    finished: 'Finalizada',
    cancelled: 'Cancelada',
};

export const AdminRidesView: React.FC = () => {
    const [rides, setRides] = useState<Ride[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<string>('all');
    const [showTodayOnly, setShowTodayOnly] = useState(true);
    const [expandedRide, setExpandedRide] = useState<string | null>(null);
    const [driverNamesCache, setDriverNamesCache] = useState<Record<string, UserProfile>>({});
    const tableEndRef = React.useRef<HTMLDivElement>(null);

    useEffect(() => {
        loadData();
        const sub = supabase.channel('admin_rides_monitor')
            .on('postgres_changes', { event: '*', schema: 'chegoja', table: 'rides' }, () => {
                loadData();
            }).subscribe();

        return () => { sub.unsubscribe(); };
    }, []);

    const loadData = async () => {
        try {
            const data = await fetchAllRides();
            setRides(data);

            // Carregar nomes de motoristas que estão em ignored_drivers
            const allDriverIds = new Set<string>();
            data.forEach(ride => {
                if (Array.isArray(ride.ignored_drivers)) {
                    ride.ignored_drivers.forEach(id => allDriverIds.add(id));
                }
                if (ride.driver_id) allDriverIds.add(ride.driver_id);
            });

            // Buscar perfis que ainda não estão no cache
            const idsToFetch = Array.from(allDriverIds).filter(id => !driverNamesCache[id]);
            if (idsToFetch.length > 0) {
                const { data: profiles } = await supabase
                    .from('profiles')
                    .select('id, username, avatar_url, vehicle_type, vehicle_plate')
                    .in('id', idsToFetch);

                if (profiles) {
                    setDriverNamesCache(prev => {
                        const updated = { ...prev };
                        profiles.forEach((p: any) => { updated[p.id] = p; });
                        return updated;
                    });
                }
            }
        } catch (error) {
            console.error("Erro ao monitorar corridas:", error);
        }
        setLoading(false);
    };

    /** Retorna a lista de motoristas que receberam a chamada */
    const getOfferedDrivers = useCallback((ride: Ride) => {
        const ids: string[] = [];
        // Motoristas que recusaram/ignoraram (ignored_drivers)
        if (Array.isArray(ride.ignored_drivers)) {
            ride.ignored_drivers.forEach(id => {
                if (!ids.includes(id)) ids.push(id);
            });
        }
        // O motorista que aceitou (driver_id) também recebeu a chamada
        if (ride.driver_id && !ids.includes(ride.driver_id)) {
            ids.push(ride.driver_id);
        }
        return ids;
    }, []);

    /** Conta total de motoristas que receberam a chamada */
    const getDriverCallCount = useCallback((ride: Ride) => {
        return getOfferedDrivers(ride).length;
    }, [getOfferedDrivers]);

    const handleCancel = async (rideId: string) => {
        if (!window.confirm("Deseja realmente CANCELAR esta corrida administrativamente?")) return;
        const success = await cancelRide(rideId);
        if (success) {
            alert("Corrida cancelada com sucesso.");
            await loadData();
        } else {
            alert("Erro ao cancelar corrida.");
        }
    };

    const scrollToBottom = () => {
        tableEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const filteredRides = rides.filter(r => {
        const rideDate = new Date(r.created_at).toDateString();
        const todayDate = new Date().toDateString();

        if (showTodayOnly && rideDate !== todayDate) return false;

        if (filter === 'all') return true;
        if (filter === 'active') return !['finished', 'cancelled'].includes(r.status);
        return r.status === filter;
    });

    const stats = {
        total: rides.length,
        active: rides.filter(r => !['finished', 'cancelled'].includes(r.status)).length,
        completedToday: rides.filter(r => r.status === 'finished' && new Date(r.created_at).toDateString() === new Date().toDateString()).length,
        revenueToday: rides
            .filter(r => r.status === 'finished' && new Date(r.created_at).toDateString() === new Date().toDateString())
            .reduce((acc, r) => acc + (r.final_price || r.estimated_price || 0), 0)
    };

    if (loading) {
        return <div className="admin-loading">Carregando monitor de corridas...</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-white">Monitoramento de Corridas</h2>
                    <p className="text-sm text-gray-400 mt-1">Acompanhe todas as viagens em tempo real</p>
                </div>
                <div className="flex gap-2">
                    <Button
                        variant={showTodayOnly ? "primary" : "secondary"}
                        onClick={() => setShowTodayOnly(!showTodayOnly)}
                    >
                        <span className="material-icons">today</span>
                        {showTodayOnly ? "Mostrando Hoje" : "Mostrar Todas as Datas"}
                    </Button>
                    <Button variant="secondary" onClick={loadData}>
                        <span className="material-icons">refresh</span>
                        Sincronizar
                    </Button>
                </div>
            </div>

            {/* Stats Summary */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="p-4 flex items-center gap-4 bg-primary/10 border-primary/20">
                    <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                        <span className="material-icons text-primary">analytics</span>
                    </div>
                    <div>
                        <div className="text-[10px] text-gray-500 uppercase font-black">Total Acumulado</div>
                        <div className="text-xl font-black text-white">{stats.total}</div>
                    </div>
                </Card>
                <Card className="p-4 flex items-center gap-4 bg-blue-500/10 border-blue-500/20">
                    <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center">
                        <span className="material-icons text-blue-500">sensors</span>
                    </div>
                    <div>
                        <div className="text-[10px] text-gray-500 uppercase font-black">Ativas Agora</div>
                        <div className="text-xl font-black text-white">{stats.active}</div>
                    </div>
                </Card>
                <Card className="p-4 flex items-center gap-4 bg-green-500/10 border-green-500/20">
                    <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
                        <span className="material-icons text-green-500">done_all</span>
                    </div>
                    <div>
                        <div className="text-[10px] text-gray-500 uppercase font-black">Concluídas Hoje</div>
                        <div className="text-xl font-black text-white">{stats.completedToday}</div>
                    </div>
                </Card>
                <Card className="p-4 flex items-center gap-4 bg-yellow-500/10 border-yellow-500/20">
                    <div className="w-12 h-12 rounded-full bg-yellow-500/20 flex items-center justify-center">
                        <span className="material-icons text-yellow-500">payments</span>
                    </div>
                    <div>
                        <div className="text-[10px] text-gray-500 uppercase font-black">Receita Hoje</div>
                        <div className="text-xl font-black text-white">R$ {stats.revenueToday.toFixed(2)}</div>
                    </div>
                </Card>
            </div>

            <Card>
                <div className="admin-card-header flex items-center justify-between">
                    <h3 className="admin-card-title">Histórico de Corridas</h3>
                    <div className="admin-tabs admin-tabs-sm">
                        <button className={`admin-tab ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>Todas</button>
                        <button className={`admin-tab ${filter === 'active' ? 'active' : ''}`} onClick={() => setFilter('active')}>Em curso</button>
                        <button className={`admin-tab ${filter === 'finished' ? 'active' : ''}`} onClick={() => setFilter('finished')}>Concluídas</button>
                        <button className={`admin-tab ${filter === 'cancelled' ? 'active' : ''}`} onClick={() => setFilter('cancelled')}>Canceladas</button>
                    </div>
                </div>
                <div className="admin-table-wrapper">
                    {filteredRides.length === 0 ? (
                        <div className="text-center py-10 text-gray-500">Nenhuma corrida encontrada.</div>
                    ) : window.innerWidth < 768 ? (
                        /* Mobile Card List for Rides */
                        <div className="admin-mobile-cards p-4 space-y-4">
                            {filteredRides.map(ride => (
                                <div key={ride.id} className="admin-mobile-card bg-[#202c33]/50 border border-white/5 rounded-xl p-4 space-y-3">
                                    <div className="flex justify-between items-start">
                                        <div className="flex items-center gap-2">
                                            <div className="admin-avatar-xs">
                                                {ride.client?.username?.charAt(0) || 'U'}
                                            </div>
                                            <div>
                                                <div className="text-xs font-bold text-white">{ride.client?.username || 'Usuário'}</div>
                                                <div className="text-[10px] text-gray-500">
                                                    {new Date(ride.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </div>
                                            </div>
                                        </div>
                                        <Badge style={{ background: statusColors[ride.status] }}>
                                            {statusLabels[ride.status] || ride.status}
                                        </Badge>
                                    </div>

                                    <div className="space-y-2 py-2 border-y border-white/5">
                                        <div className="text-[10px] text-white flex items-center gap-2">
                                            <span className="w-2 h-2 rounded-full bg-primary shrink-0"></span>
                                            <span className="truncate">{ride.origin_address || 'Origem não informada'}</span>
                                        </div>
                                        <div className="text-[10px] text-gray-400 flex items-center gap-2">
                                            <span className="w-2 h-2 rounded-full bg-red-500 shrink-0"></span>
                                            <span className="truncate">{ride.destination_address || 'Destino não informado'}</span>
                                        </div>
                                    </div>

                                    <div className="flex justify-between items-center">
                                        <div className="flex items-center gap-2">
                                            {ride.driver ? (
                                                <>
                                                    <div className="admin-avatar-xs" style={{ background: '#00a884' }}>
                                                        {ride.driver.username?.charAt(0) || 'M'}
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="text-[10px] text-gray-300 font-semibold">
                                                            {ride.driver.username}
                                                        </span>
                                                        <span className="text-[9px] text-green-400">Atendeu</span>
                                                    </div>
                                                </>
                                            ) : (
                                                <span className="text-[10px] text-gray-600 italic">Nenhum atendeu</span>
                                            )}
                                        </div>
                                        <div className="text-right">
                                            <div className="text-sm font-black text-white">R$ {(ride.final_price || ride.estimated_price || 0).toFixed(2)}</div>
                                            <div className="text-[9px] text-gray-500 font-bold uppercase">{ride.vehicle_type}</div>
                                        </div>
                                    </div>

                                    {/* Estatísticas de chamadas - Mobile */}
                                    {(() => {
                                        const callCount = getDriverCallCount(ride);
                                        const offeredIds = getOfferedDrivers(ride);
                                        if (callCount === 0) return null;
                                        return (
                                            <div className="bg-white/5 rounded-lg p-2.5 space-y-2">
                                                <button
                                                    className="w-full flex items-center justify-between"
                                                    onClick={() => setExpandedRide(expandedRide === ride.id ? null : ride.id)}
                                                >
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="material-icons text-amber-400" style={{ fontSize: '14px' }}>phone_forwarded</span>
                                                        <span className="text-[10px] text-gray-300">
                                                            Chamou <span className="font-bold text-white">{callCount}</span> motorista{callCount > 1 ? 's' : ''}
                                                        </span>
                                                    </div>
                                                    <span className="material-icons text-gray-500" style={{ fontSize: '14px' }}>
                                                        {expandedRide === ride.id ? 'expand_less' : 'expand_more'}
                                                    </span>
                                                </button>
                                                {expandedRide === ride.id && (
                                                    <div className="space-y-1.5 pt-1 border-t border-white/5">
                                                        {offeredIds.map((driverId, idx) => {
                                                            const profile = driverNamesCache[driverId];
                                                            const isAccepted = ride.driver_id === driverId;
                                                            return (
                                                                <div key={driverId} className={`flex items-center gap-2 p-1.5 rounded-lg ${isAccepted ? 'bg-green-500/10' : ''}`}>
                                                                    <span className="text-[9px] text-gray-500 w-3">{idx + 1}.</span>
                                                                    <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                                                                        style={{ background: isAccepted ? '#00a884' : '#374151' }}>
                                                                        {profile?.username?.charAt(0)?.toUpperCase() || '?'}
                                                                    </div>
                                                                    <span className="text-[10px] text-white truncate flex-1">
                                                                        {profile?.username || driverId.slice(0, 8)}
                                                                    </span>
                                                                    <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-bold ${isAccepted ? 'bg-green-500/20 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                                                                        {isAccepted ? 'Atendeu' : 'Recusou'}
                                                                    </span>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })()}

                                    {!['finished', 'cancelled'].includes(ride.status) && (
                                        <Button
                                            variant="danger"
                                            className="w-full mt-2"
                                            size="sm"
                                            onClick={() => handleCancel(ride.id)}
                                        >
                                            <span className="material-icons text-sm">block</span> Cancelar Corrida
                                        </Button>
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <table className="admin-table">
                            <thead>
                                <tr>
                                    <th>Horário</th>
                                    <th>Cliente</th>
                                    <th>Motorista</th>
                                    <th>Chamadas</th>
                                    <th>Trajeto</th>
                                    <th>Preço</th>
                                    <th>Status</th>
                                    <th className="text-right">Ação</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredRides.map(ride => (
                                    <tr key={ride.id} className="hover:bg-white/5 transition-colors">
                                        <td className="text-xs text-gray-400">
                                            {new Date(ride.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </td>
                                        <td>
                                            <div className="flex items-center gap-2">
                                                <div className="admin-avatar-xs">
                                                    {ride.client?.username?.charAt(0) || 'U'}
                                                </div>
                                                <span className="text-xs text-white truncate max-w-[80px]">
                                                    {ride.client?.username || 'Usuário'}
                                                </span>
                                            </div>
                                        </td>
                                        <td>
                                            {ride.driver ? (
                                                <div className="flex items-center gap-2">
                                                    <div className="admin-avatar-xs" style={{ background: '#00a884' }}>
                                                        {ride.driver.username?.charAt(0) || 'M'}
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="text-xs text-white truncate max-w-[80px] font-semibold">
                                                            {ride.driver.username || 'Motorista'}
                                                        </span>
                                                        <span className="text-[9px] text-green-400">Atendeu</span>
                                                    </div>
                                                </div>
                                            ) : (
                                                <span className="text-[10px] text-gray-600 italic">Nenhum atendeu</span>
                                            )}
                                        </td>
                                        {/* Coluna: Chamadas - Quantos motoristas receberam */}
                                        <td>
                                            {(() => {
                                                const callCount = getDriverCallCount(ride);
                                                const offeredIds = getOfferedDrivers(ride);
                                                if (callCount === 0) {
                                                    return <span className="text-[10px] text-gray-600 italic">-</span>;
                                                }
                                                return (
                                                    <div className="relative">
                                                        <button
                                                            className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 transition-colors cursor-pointer"
                                                            onClick={() => setExpandedRide(expandedRide === ride.id ? null : ride.id)}
                                                            title="Clique para ver detalhes"
                                                        >
                                                            <span className="material-icons text-amber-400" style={{ fontSize: '14px' }}>phone_forwarded</span>
                                                            <span className="text-xs font-bold text-white">{callCount}</span>
                                                            <span className="text-[9px] text-gray-400">motorista{callCount > 1 ? 's' : ''}</span>
                                                            <span className="material-icons text-gray-500" style={{ fontSize: '12px' }}>
                                                                {expandedRide === ride.id ? 'expand_less' : 'expand_more'}
                                                            </span>
                                                        </button>
                                                        {expandedRide === ride.id && (
                                                            <div className="absolute z-50 top-full left-0 mt-1 bg-[#1a252d] border border-white/10 rounded-xl shadow-2xl p-3 min-w-[220px] space-y-2 animate-fade-in">
                                                                <div className="text-[10px] text-gray-400 font-bold uppercase mb-2 flex items-center gap-1">
                                                                    <span className="material-icons" style={{ fontSize: '12px' }}>group</span>
                                                                    Motoristas Chamados ({callCount})
                                                                </div>
                                                                {offeredIds.map((driverId, idx) => {
                                                                    const profile = driverNamesCache[driverId];
                                                                    const isAccepted = ride.driver_id === driverId;
                                                                    return (
                                                                        <div key={driverId} className={`flex items-center gap-2 p-1.5 rounded-lg ${isAccepted ? 'bg-green-500/10 border border-green-500/20' : 'bg-white/5'}`}>
                                                                            <div className="text-[10px] text-gray-500 w-4 text-center font-bold">{idx + 1}</div>
                                                                            <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                                                                                style={{ background: isAccepted ? '#00a884' : '#374151' }}>
                                                                                {profile?.username?.charAt(0)?.toUpperCase() || '?'}
                                                                            </div>
                                                                            <div className="flex flex-col min-w-0">
                                                                                <span className="text-[11px] text-white font-medium truncate">
                                                                                    {profile?.username || driverId.slice(0, 8) + '...'}
                                                                                </span>
                                                                                {profile?.vehicle_plate && (
                                                                                    <span className="text-[9px] text-gray-500">{profile.vehicle_plate}</span>
                                                                                )}
                                                                            </div>
                                                                            {isAccepted ? (
                                                                                <span className="ml-auto text-[9px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full font-bold whitespace-nowrap">
                                                                                    Atendeu
                                                                                </span>
                                                                            ) : (
                                                                                <span className="ml-auto text-[9px] bg-red-500/10 text-red-400 px-1.5 py-0.5 rounded-full font-bold whitespace-nowrap">
                                                                                    Recusou
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })()}
                                        </td>
                                        <td>
                                            <div className="flex flex-col gap-0.5">
                                                <div className="text-[10px] text-white flex items-center gap-1 truncate max-w-[200px]">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                                                    {ride.origin_address || 'Endereço não informado'}
                                                </div>
                                                <div className="text-[10px] text-gray-500 flex items-center gap-1 truncate max-w-[200px]">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                                                    {ride.destination_address || 'Destino não informado'}
                                                </div>
                                            </div>
                                        </td>
                                        <td>
                                            <div className="text-xs font-bold text-white">R$ {(ride.final_price || ride.estimated_price || 0).toFixed(2)}</div>
                                            <div className="text-[9px] text-gray-500 font-bold uppercase">{ride.vehicle_type}</div>
                                        </td>
                                        <td>
                                            <Badge style={{ background: statusColors[ride.status] }}>
                                                {statusLabels[ride.status] || ride.status}
                                            </Badge>
                                        </td>
                                        <td className="text-right">
                                            {!['finished', 'cancelled'].includes(ride.status) && (
                                                <button
                                                    className="admin-action-btn danger"
                                                    title="Cancelar Corrida"
                                                    onClick={() => handleCancel(ride.id)}
                                                >
                                                    <span className="material-icons" style={{ fontSize: '16px' }}>block</span>
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                    <div ref={tableEndRef} />
                </div>
                {filteredRides.length > 5 && (
                    <div className="p-4 border-t border-gray-800 flex justify-center">
                        <Button variant="secondary" size="sm" onClick={scrollToBottom}>
                            <span className="material-icons">arrow_downward</span>
                            Rolar para o Fim
                        </Button>
                    </div>
                )}
            </Card>
        </div>
    );
};

export default AdminRidesView;
