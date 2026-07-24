import React, { useState, useEffect } from 'react';
import { UserProfile, Ride } from '../../../types';
import {
    fetchAllDriversForAdmin,
    createDispatchRide,
    fetchAllRides,
    cancelRide,
    completeRide,
    supabase
} from '../../../services/supabaseClient';
import { Card, Button, Input, Badge, AddressAutocomplete } from '../../components/shared';

// Definição de Cores para Status
const statusColors: Record<string, string> = {
    searching: 'rgba(245, 158, 11, 0.15)',
    accepted: 'rgba(59, 130, 246, 0.15)',
    en_route: 'rgba(59, 130, 246, 0.15)',
    arrived: 'rgba(139, 92, 246, 0.15)',
    started: 'rgba(0, 168, 132, 0.15)',
    waiting_payment: 'rgba(236, 72, 153, 0.15)', // Pink para aguardando pagamento
    finished: 'rgba(16, 185, 129, 0.15)',
    cancelled: 'rgba(239, 68, 68, 0.15)',
};

const MAX_SEARCH_RADIUS_KM = 15;

function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLng = (lng2 - lng1) * (Math.PI / 180);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) *
        Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

export const AdminDispatchView: React.FC = () => {
    const [drivers, setDrivers] = useState<UserProfile[]>([]);
    const [activeRides, setActiveRides] = useState<Ride[]>([]);
    const [loading, setLoading] = useState(true);
    const [searching, setSearching] = useState(false);
    const loadTimeoutRef = React.useRef<any>(null);

    // Form State
    const [formData, setFormData] = useState({
        originAddress: '',
        originLat: -23.5505,
        originLng: -46.6333,
        destinationAddress: '',
        destinationLat: -23.5605,
        destinationLng: -46.6433,
        vehicleType: 'car' as 'car' | 'motorcycle',
        estimatedPrice: 10.00,
        selectedDriverId: '',
        isBroadcast: false
    });

    useEffect(() => {
        loadData();

        // Subscription com Debounce para evitar "piscar" ou duplicar em updates rápidos
        const channel = supabase.channel('rides_dispatch')
            .on('postgres_changes', { event: '*', schema: 'chegoja', table: 'rides' }, () => {
                if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);
                loadTimeoutRef.current = setTimeout(loadData, 1000);
            })
            .on('postgres_changes', { event: '*', schema: 'chegoja', table: 'profiles' }, () => {
                if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);
                loadTimeoutRef.current = setTimeout(loadData, 1000);
            })
            .subscribe();

        return () => {
            if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);
            channel.unsubscribe();
        };
    }, []);

    const loadData = async () => {
        try {
            const [d, r] = await Promise.all([
                fetchAllDriversForAdmin(),
                fetchAllRides()
            ]);
            setDrivers(d.filter(drv => drv.is_approved));

            // Filtra e DEDUPLICA as corridas (garante ID único)
            const validRides = r.filter(ride => !['finished', 'cancelled'].includes(ride.status));
            const uniqueRides = Array.from(new Map(validRides.map(item => [item.id, item])).values());

            setActiveRides(uniqueRides);
        } catch (error) {
            console.error("Erro no despacho:", error);
        }
        setLoading(false);
    };

    const handleCreateRide = async () => {
        if (searching) return;

        if (!formData.originAddress || !formData.destinationAddress) {
            alert("Endereços de origem e destino são obrigatórios.");
            return;
        }

        setSearching(true);
        const result = await createDispatchRide({
            ...formData,
        });

        if (result.success) {
            alert(result.message);
            setFormData({
                originAddress: '',
                originLat: -23.5505,
                originLng: -46.6333,
                destinationAddress: '',
                destinationLat: -23.5605,
                destinationLng: -46.6433,
                vehicleType: 'car',
                estimatedPrice: 10.00,
                selectedDriverId: '',
                isBroadcast: false
            });
            await loadData();
        } else {
            alert(`Erro: ${result.message}`);
        }
        setSearching(false);
    };

    const handleCancelRide = async (rideId: string) => {
        if (!confirm("Deseja realmente cancelar esta corrida?")) return;

        setLoading(true);
        const success = await cancelRide(rideId);
        if (success) {
            // alert("Corrida cancelada com sucesso!"); // Opcional: Feedback visual menos intrusivo seria melhor
            await loadData();
        } else {
            alert("Erro ao cancelar corrida.");
        }
        setLoading(false);
    };

    const handleFinishRide = async (ride: Ride) => {
        const confirmMsg = ride.status === 'waiting_payment'
            ? `Confirmar pagamento e finalizar a corrida de R$ ${ride.estimated_price?.toFixed(2)}?`
            : `Deseja finalizar forçadamente a corrida de R$ ${ride.estimated_price?.toFixed(2)}?`;

        if (!confirm(confirmMsg)) return;

        setLoading(true);
        // Usamos o preço estimado e pagamento em dinheiro (cash) como padrão para o admin
        const success = await completeRide(ride.id, ride.estimated_price || 0, 'cash');
        if (success) {
            // alert("Corrida finalizada com sucesso!");
            await loadData();
        } else {
            alert("Erro ao finalizar corrida.");
        }
        setLoading(false);
    };

    if (loading) {
        return <div className="admin-loading">Carregando central de despacho...</div>;
    }

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold text-white">Central de Despacho Manual</h2>
                <p className="text-sm text-gray-400 mt-1">Crie corridas e atribua motoristas manualmente</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Dispatch Form */}
                <Card className="lg:col-span-1 border-primary/20">
                    <div className="admin-card-header">
                        <h3 className="admin-card-title flex items-center gap-2">
                            <span className="material-icons text-primary">add_location</span>
                            Nova Corrida Manual
                        </h3>
                    </div>
                    <div className="admin-card-body space-y-4">
                        <div className="admin-form-group">
                            <label className="admin-form-label">Endereço de Origem</label>
                            <AddressAutocomplete
                                placeholder="Rua, Número, Bairro"
                                value={formData.originAddress}
                                onChange={val => setFormData({ ...formData, originAddress: val })}
                                onPlaceSelected={place => setFormData(prev => ({
                                    ...prev,
                                    originAddress: place.address,
                                    originLat: place.lat,
                                    originLng: place.lng
                                }))}
                            />
                        </div>
                        <div className="admin-form-group">
                            <label className="admin-form-label">Endereço de Destino</label>
                            <AddressAutocomplete
                                placeholder="Destino final"
                                value={formData.destinationAddress}
                                onChange={val => setFormData({ ...formData, destinationAddress: val })}
                                onPlaceSelected={place => setFormData(prev => ({
                                    ...prev,
                                    destinationAddress: place.address,
                                    destinationLat: place.lat,
                                    destinationLng: place.lng
                                }))}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="admin-form-group">
                                <label className="admin-form-label">Tipo</label>
                                <select
                                    className="admin-form-input"
                                    value={formData.vehicleType}
                                    onChange={e => setFormData(prev => ({ ...prev, vehicleType: e.target.value as any }))}
                                >
                                    <option value="car">🚗 Carro</option>
                                    <option value="motorcycle">🏍️ Moto</option>
                                </select>
                            </div>
                            <div className="admin-form-group">
                                <label className="admin-form-label">Valor Sugerido</label>
                                <Input
                                    type="number"
                                    value={formData.estimatedPrice.toString()}
                                    onChange={e => {
                                        const rawValue = e.target.value.replace(',', '.');
                                        setFormData(prev => ({ ...prev, estimatedPrice: parseFloat(rawValue) || 0 }));
                                    }}
                                />
                            </div>
                        </div>

                        <div className="admin-form-group">
                            <label className="admin-form-label">Motorista Específico (Opcional)</label>
                            <select
                                className="admin-form-input"
                                value={formData.selectedDriverId}
                                onChange={e => setFormData(prev => ({ ...prev, selectedDriverId: e.target.value, isBroadcast: false }))}
                            >
                                <option value="">Nenhum (Procura Automática)</option>
                                {drivers
                                    .filter(d => {
                                        if (d.vehicle_type !== formData.vehicleType) return false;
                                        if (d.status !== 'available') return false;

                                        if (d.lat && d.lng && formData.originLat && formData.originLng) {
                                            const distance = calculateDistance(
                                                formData.originLat,
                                                formData.originLng,
                                                d.lat,
                                                d.lng
                                            );
                                            if (distance > MAX_SEARCH_RADIUS_KM) return false;
                                        }
                                        return true;
                                    })
                                    .map(d => {
                                        const distText = d.lat && d.lng
                                            ? `${calculateDistance(formData.originLat, formData.originLng, d.lat, d.lng).toFixed(1)}km`
                                            : 'Sem GPS';

                                        return (
                                            <option key={d.id} value={d.id}>
                                                {d.username} ({d.vehicle_type === 'car' ? 'Carro' : 'Moto'}) - {distText}
                                            </option>
                                        );
                                    })}
                            </select>
                        </div>

                        <div className="flex items-center gap-2 mt-4">
                            <input
                                type="checkbox"
                                id="broadcast"
                                checked={formData.isBroadcast}
                                onChange={e => setFormData(prev => ({ ...prev, isBroadcast: e.target.checked, selectedDriverId: '' }))}
                            />
                            <label htmlFor="broadcast" className="text-sm text-white cursor-pointer">Disparar para TODOS os motoristas (Broadcast)</label>
                        </div>

                        <Button
                            variant="primary"
                            className="w-full mt-6"
                            onClick={handleCreateRide}
                            loading={searching}
                        >
                            <span className="material-icons">send</span>
                            CRIAR CHAMADA
                        </Button>
                    </div>
                </Card>

                {/* Active Rides Monitoring */}
                <div className="lg:col-span-2 space-y-4">
                    <Card>
                        <div className="admin-card-header flex justify-between items-center">
                            <h3 className="admin-card-title">Monitorando Chamadas Ativas</h3>
                            <div className="flex gap-2">
                                <Button
                                    variant="outline"
                                    className="px-2 py-1 text-xs border-red-500/50 text-red-400 hover:bg-red-500/10"
                                    onClick={async () => {
                                        setLoading(true);
                                        const { data, error } = await supabase.rpc('cleanup_duplicate_rides');
                                        if (!error) {
                                            alert(data.message || 'Limpeza realizada.');
                                            await loadData();
                                        } else {
                                            console.error(error);
                                            alert('Erro ao limpar fila');
                                        }
                                        setLoading(false);
                                    }}
                                >
                                    <span className="material-icons text-sm mr-1">cleaning_services</span>
                                    LIMPAR FILA
                                </Button>
                                <Badge variant="info">{activeRides.length} Corridas</Badge>
                            </div>
                        </div>
                        <div className="admin-table-wrapper max-h-[600px] overflow-y-auto">
                            <table className="admin-table">
                                <thead>
                                    <tr>
                                        <th>Origem</th>
                                        <th>Destino</th>
                                        <th>Motorista</th>
                                        <th>Preço</th>
                                        <th>Status</th>
                                        <th>Início</th>
                                        <th className="text-right">Ações</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {activeRides.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} className="text-center py-10 text-gray-500">
                                                Nenhuma corrida ativa no momento.
                                            </td>
                                        </tr>
                                    ) : (
                                        activeRides.map(ride => (
                                            <tr key={ride.id} className="hover:bg-white/5 transition-colors">
                                                <td>
                                                    <div className="text-[11px] text-white font-medium max-w-[150px] truncate" title={ride.origin_address}>
                                                        {ride.origin_address}
                                                    </div>
                                                </td>
                                                <td>
                                                    <div className="text-[11px] text-gray-400 max-w-[150px] truncate" title={ride.destination_address}>
                                                        {ride.destination_address}
                                                    </div>
                                                </td>
                                                <td>
                                                    <div className="flex items-center gap-2">
                                                        <div className="admin-avatar-xs">
                                                            {ride.driver?.username?.charAt(0) || 'P'}
                                                        </div>
                                                        <span className="text-xs text-white">
                                                            {ride.driver?.username || (ride.is_broadcast ? 'Aguardando (BROADCAST)' : 'Procurando...')}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td>
                                                    <span className="text-xs font-bold text-green-500">R$ {ride.estimated_price?.toFixed(2)}</span>
                                                </td>
                                                <td>
                                                    <Badge style={{ background: statusColors[ride.status] || '#333' }}>
                                                        {ride.status === 'waiting_payment' ? 'PAGAMENTO' : ride.status.toUpperCase()}
                                                    </Badge>
                                                </td>
                                                <td>
                                                    <span className="text-[10px] text-gray-500">
                                                        {new Date(ride.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                </td>
                                                <td className="text-right">
                                                    <div className="flex justify-end gap-1">
                                                        <button
                                                            onClick={() => handleFinishRide(ride)}
                                                            className={`p-1.5 rounded-lg transition-colors ${ride.status === 'waiting_payment'
                                                                ? 'bg-green-600 text-white hover:bg-green-500 shadow-lg animate-pulse'
                                                                : 'hover:bg-green-500/20 text-green-500'
                                                                }`}
                                                            title={ride.status === 'waiting_payment' ? "Confirmar Pagamento e Finalizar" : "Forçar Finalização"}
                                                        >
                                                            <span className="material-icons text-sm">
                                                                {ride.status === 'waiting_payment' ? 'attach_money' : 'check_circle'}
                                                            </span>
                                                        </button>
                                                        <button
                                                            onClick={() => handleCancelRide(ride.id)}
                                                            className="p-1.5 hover:bg-red-500/20 text-red-500 rounded-lg transition-colors"
                                                            title="Cancelar Corrida"
                                                        >
                                                            <span className="material-icons text-sm">cancel</span>
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
};

export default AdminDispatchView;
