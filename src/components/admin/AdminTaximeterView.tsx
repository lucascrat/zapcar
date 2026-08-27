import React, { useState, useEffect } from 'react';
import { AppSettings } from '../../../types';
import { fetchAppSettings } from '../../../services/supabaseClient';
import { calculateCategoryPrice, PriceBreakdown } from '../../../services/pricing';
import { useVehicleCategories } from '../../contexts/VehicleCategoriesContext';
import { Card, Button, Badge } from '../../components/shared';

export const AdminTaximeterView: React.FC = () => {
    const [settings, setSettings] = useState<AppSettings | null>(null);
    const { categories } = useVehicleCategories();
    const [distance, setDistance] = useState(5.0); // km
    const [time, setTime] = useState(10); // min
    const [vehicleSlug, setVehicleSlug] = useState('car');
    const [simulatedNow, setSimulatedNow] = useState<'now' | 'standard' | 'night' | 'dawn'>('now');
    const [result, setResult] = useState<PriceBreakdown | null>(null);

    useEffect(() => {
        fetchAppSettings().then(setSettings);
    }, []);

    useEffect(() => {
        if (categories.length > 0 && !categories.some(c => c.slug === vehicleSlug)) {
            setVehicleSlug(categories[0].slug);
        }
    }, [categories, vehicleSlug]);

    // Pra simular um horário específico sem depender do relógio de verdade,
    // usa uma data fixa dentro (ou fora) das janelas configuradas.
    const resolveSimulationDate = (): Date => {
        if (simulatedNow === 'now' || !settings) return new Date();
        const windowStart = simulatedNow === 'night' ? settings.night_start_time : simulatedNow === 'dawn' ? settings.dawn_start_time : '12:00';
        const [h, m] = (windowStart || '12:00').split(':').map(Number);
        const d = new Date();
        d.setHours(h || 12, (m || 0) + 1, 0, 0); // +1min pra garantir que caia dentro da janela
        return d;
    };

    const calculate = () => {
        if (!settings) return;
        const category = categories.find(c => c.slug === vehicleSlug);
        if (!category) return;

        const breakdown = calculateCategoryPrice(category, distance, time, resolveSimulationDate(), {
            nightStartTime: settings.night_start_time,
            nightEndTime: settings.night_end_time,
            dawnStartTime: settings.dawn_start_time,
            dawnEndTime: settings.dawn_end_time,
        });
        setResult(breakdown);
    };

    const tierLabel: Record<PriceBreakdown['tier'], string> = { standard: 'Padrão', night: 'Noite', dawn: 'Madrugada' };
    const tierBadge: Record<PriceBreakdown['tier'], 'info' | 'warning'> = { standard: 'info', night: 'warning', dawn: 'warning' };

    if (!settings) return <div className="admin-loading">Carregando parâmetros...</div>;

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold text-white">Simulador de Taxímetro</h2>
                <p className="text-sm text-gray-400 mt-1">Teste o cálculo de preços do aplicativo com diferentes parâmetros - usa a mesma fórmula real (services/pricing.ts)</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                    <div className="admin-card-header">
                        <h3 className="admin-card-title">Parâmetros da Simulação</h3>
                    </div>
                    <div className="admin-card-body space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="admin-form-group">
                                <label className="admin-form-label">Categoria</label>
                                <select
                                    className="admin-form-input"
                                    value={vehicleSlug}
                                    onChange={e => setVehicleSlug(e.target.value)}
                                >
                                    {categories.map(c => (
                                        <option key={c.id} value={c.slug}>{c.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="admin-form-group">
                                <label className="admin-form-label">Horário</label>
                                <select
                                    className="admin-form-input"
                                    value={simulatedNow}
                                    onChange={e => setSimulatedNow(e.target.value as any)}
                                >
                                    <option value="now">🕐 Agora</option>
                                    <option value="standard">☀️ Padrão</option>
                                    <option value="night">🌙 Noite</option>
                                    <option value="dawn">🦇 Madrugada</option>
                                </select>
                            </div>
                        </div>

                        <div className="admin-form-group">
                            <label className="admin-form-label">Distância Prevista (KM)</label>
                            <input
                                type="range"
                                min="0.1"
                                max="50"
                                step="0.1"
                                className="w-full accent-primary"
                                value={distance}
                                onChange={e => setDistance(parseFloat(e.target.value))}
                            />
                            <div className="flex justify-between mt-2">
                                <span className="text-xs text-gray-500">0.1 km</span>
                                <span className="text-lg font-bold text-primary">{distance.toFixed(1)} km</span>
                                <span className="text-xs text-gray-500">50 km</span>
                            </div>
                        </div>

                        <div className="admin-form-group">
                            <label className="admin-form-label">Tempo Previsto (Minutos)</label>
                            <input
                                type="range"
                                min="1"
                                max="120"
                                step="1"
                                className="w-full accent-primary"
                                value={time}
                                onChange={e => setTime(parseInt(e.target.value))}
                            />
                            <div className="flex justify-between mt-2">
                                <span className="text-xs text-gray-500">1 min</span>
                                <span className="text-lg font-bold text-primary">{time} min</span>
                                <span className="text-xs text-gray-500">120 min</span>
                            </div>
                        </div>

                        <Button variant="primary" className="w-full py-4 text-lg font-bold" onClick={calculate}>
                            SIMULAR VALOR
                        </Button>
                    </div>
                </Card>

                <Card className="flex flex-col justify-center items-center py-10">
                    {result !== null ? (
                        <div className="text-center animate-in fade-in duration-500">
                            <Badge variant={tierBadge[result.tier]}>{tierLabel[result.tier]}</Badge>
                            <h4 className="text-gray-400 uppercase tracking-widest text-sm mt-3 mb-2 font-bold">Valor Estimado da Corrida</h4>
                            <div className="text-7xl font-black text-white mb-6">
                                R$ {result.price.toFixed(2)}
                            </div>
                            <div className="flex flex-wrap justify-center gap-4 text-left">
                                <div className="p-4 bg-white/5 rounded-xl border border-white/10 w-36">
                                    <div className="text-[10px] text-gray-500 uppercase font-bold">Tarifa Base</div>
                                    <div className="text-lg font-bold text-white">R$ {result.base.toFixed(2)}</div>
                                </div>
                                <div className="p-4 bg-white/5 rounded-xl border border-white/10 w-36">
                                    <div className="text-[10px] text-gray-500 uppercase font-bold">Por KM</div>
                                    <div className="text-lg font-bold text-white">R$ {result.perKm.toFixed(2)}</div>
                                </div>
                                <div className="p-4 bg-white/5 rounded-xl border border-white/10 w-36">
                                    <div className="text-[10px] text-gray-500 uppercase font-bold">Por Minuto</div>
                                    <div className="text-lg font-bold text-white">R$ {result.perMinute.toFixed(2)}</div>
                                </div>
                                <div className="p-4 bg-white/5 rounded-xl border border-white/10 w-36">
                                    <div className="text-[10px] text-gray-500 uppercase font-bold">Tarifa Mínima</div>
                                    <div className="text-lg font-bold text-white">R$ {result.minFare.toFixed(2)}</div>
                                </div>
                            </div>
                            <p className="mt-10 text-xs text-gray-500 max-w-[300px] mx-auto">
                                * Este valor é uma estimativa baseada nos parâmetros atuais do sistema.
                                O valor final pode variar de acordo com o trajeto real.
                            </p>
                        </div>
                    ) : (
                        <div className="text-center text-gray-600">
                            <span className="material-icons" style={{ fontSize: '80px' }}>calculate</span>
                            <p className="mt-4 font-medium uppercase tracking-widest text-xs">Aguardando simulação</p>
                        </div>
                    )}
                </Card>
            </div>

            {/* Current Rates Table */}
            <Card>
                <div className="admin-card-header">
                    <h3 className="admin-card-title">Tabela de Tarifas Atuais</h3>
                </div>
                <div className="admin-table-wrapper">
                    <table className="admin-table">
                        <thead>
                            <tr>
                                <th>Categoria</th>
                                <th>Base</th>
                                <th>KM</th>
                                <th>Minuto</th>
                                <th>Mínimo</th>
                                <th>Franquia</th>
                            </tr>
                        </thead>
                        <tbody>
                            {categories.map(c => (
                                <tr key={c.id}>
                                    <td className="font-bold text-white flex items-center gap-2">
                                        {c.icon_url ? (
                                            <img src={c.icon_url} alt={c.name} style={{ width: 20, height: 20, objectFit: 'contain' }} />
                                        ) : (
                                            <span className="material-icons" style={{ fontSize: 18 }}>directions_car</span>
                                        )}
                                        {c.name}
                                        {!c.is_active && <Badge variant="secondary">Inativa</Badge>}
                                    </td>
                                    <td>R$ {c.base_price.toFixed(2)}</td>
                                    <td>R$ {c.price_km.toFixed(2)}</td>
                                    <td>R$ {c.price_per_minute.toFixed(2)}</td>
                                    <td>R$ {c.price_min_fare.toFixed(2)}</td>
                                    <td>{c.start_distance_limit || 0} km</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
};

export default AdminTaximeterView;
