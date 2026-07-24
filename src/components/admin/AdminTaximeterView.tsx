import React, { useState, useEffect } from 'react';
import { AppSettings } from '../../../types';
import { fetchAppSettings } from '../../../services/supabaseClient';
import { Card, Button, Input, Badge } from '../../components/shared';

export const AdminTaximeterView: React.FC = () => {
    const [settings, setSettings] = useState<AppSettings | null>(null);
    const [distance, setDistance] = useState(5.0); // km
    const [time, setTime] = useState(10); // min
    const [vehicle, setVehicle] = useState<'car' | 'motorcycle'>('car');
    const [period, setPeriod] = useState<'standard' | 'night' | 'dawn'>('standard');
    const [result, setResult] = useState<number | null>(null);

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        const data = await fetchAppSettings();
        setSettings(data);
    };

    const calculate = () => {
        if (!settings) return;

        let base = 0;
        let pKm = 0;
        let pMin = 0; // Price Per Minute
        let minFare = 0; // Minimum Fare
        let startLimit = 0;

        if (vehicle === 'car') {
            if (period === 'standard') {
                base = settings.car_base_price;
                pKm = settings.car_price_km;
                pMin = settings.car_price_per_minute || 0;
                minFare = settings.car_price_min;
                startLimit = settings.car_start_distance_limit || 0;
            } else if (period === 'night') {
                base = settings.night_car_base_price || settings.car_base_price;
                pKm = settings.night_car_price_km || settings.car_price_km;
                minFare = settings.night_car_price_min || settings.car_price_min;
                // Dynamic per-minute not supported yet, fallback to standard
                pMin = settings.car_price_per_minute || 0;
                startLimit = settings.car_start_distance_limit || 0;
            } else {
                base = settings.dawn_car_base_price || settings.car_base_price;
                pKm = settings.dawn_car_price_km || settings.car_price_km;
                minFare = settings.dawn_car_price_min || settings.car_price_min;
                pMin = settings.car_price_per_minute || 0;
                startLimit = settings.car_start_distance_limit || 0;
            }
        } else {
            if (period === 'standard') {
                base = settings.moto_base_price;
                pKm = settings.moto_price_km;
                pMin = settings.moto_price_per_minute || 0;
                minFare = settings.moto_price_min;
                startLimit = settings.moto_start_distance_limit || 0;
            } else if (period === 'night') {
                base = settings.night_moto_base_price || settings.moto_base_price;
                pKm = settings.night_moto_price_km || settings.moto_price_km;
                minFare = settings.night_moto_price_min || settings.moto_price_min;
                pMin = settings.moto_price_per_minute || 0;
                startLimit = settings.moto_start_distance_limit || 0;
            } else {
                base = settings.dawn_moto_base_price || settings.moto_base_price;
                pKm = settings.dawn_moto_price_km || settings.moto_price_km;
                minFare = settings.dawn_moto_price_min || settings.moto_price_min;
                pMin = settings.moto_price_per_minute || 0;
                startLimit = settings.moto_start_distance_limit || 0;
            }
        }

        const chargeableDist = Math.max(0, distance - startLimit);
        const totalCalculated = base + (chargeableDist * pKm) + (time * pMin);
        const finalPrice = Math.max(totalCalculated, minFare);

        setResult(finalPrice);
    };

    if (!settings) return <div className="admin-loading">Carregando parâmetros...</div>;

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold text-white">Simulador de Taxímetro</h2>
                <p className="text-sm text-gray-400 mt-1">Teste o cálculo de preços do aplicativo com diferentes parâmetros</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                    <div className="admin-card-header">
                        <h3 className="admin-card-title">Parâmetros da Simulação</h3>
                    </div>
                    <div className="admin-card-body space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="admin-form-group">
                                <label className="admin-form-label">Tipo de Veículo</label>
                                <select
                                    className="admin-form-input"
                                    value={vehicle}
                                    onChange={e => setVehicle(e.target.value as any)}
                                >
                                    <option value="car">🚗 Carro</option>
                                    <option value="motorcycle">🏍️ Moto</option>
                                </select>
                            </div>
                            <div className="admin-form-group">
                                <label className="admin-form-label">Período / Bandeira</label>
                                <select
                                    className="admin-form-input"
                                    value={period}
                                    onChange={e => setPeriod(e.target.value as any)}
                                >
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
                            <h4 className="text-gray-400 uppercase tracking-widest text-sm mb-2 font-bold">Valor Estimado da Corrida</h4>
                            <div className="text-7xl font-black text-white mb-6">
                                R$ {result.toFixed(2)}
                            </div>
                            <div className="flex flex-wrap justify-center gap-4 text-left">
                                <div className="p-4 bg-white/5 rounded-xl border border-white/10 w-40">
                                    <div className="text-[10px] text-gray-500 uppercase font-bold">Tarifa Base</div>
                                    <div className="text-lg font-bold text-white">R$ {(vehicle === 'car' ? (period === 'standard' ? settings.car_base_price : (period === 'night' ? settings.night_car_base_price : settings.dawn_car_base_price)) : (period === 'standard' ? settings.moto_base_price : (period === 'night' ? settings.night_moto_base_price : settings.dawn_moto_base_price)))?.toFixed(2)}</div>
                                </div>
                                <div className="p-4 bg-white/5 rounded-xl border border-white/10 w-40">
                                    <div className="text-[10px] text-gray-500 uppercase font-bold">Por KM</div>
                                    <div className="text-lg font-bold text-white">R$ {(vehicle === 'car' ? (period === 'standard' ? settings.car_price_km : (period === 'night' ? settings.night_car_price_km : settings.dawn_car_price_km)) : (period === 'standard' ? settings.moto_price_km : (period === 'night' ? settings.night_moto_price_km : settings.dawn_moto_price_km)))?.toFixed(2)}</div>
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
                                <th>Período</th>
                                <th>Base</th>
                                <th>KM</th>
                                <th>Minuto</th>
                                <th>Mínimo</th>
                                <th>Franquia</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td className="font-bold text-white">🚗 Carro</td>
                                <td><Badge variant="info">Padrão</Badge></td>
                                <td>R$ {settings.car_base_price.toFixed(2)}</td>
                                <td>R$ {settings.car_price_km.toFixed(2)}</td>
                                <td>R$ {(settings.car_price_per_minute || 0).toFixed(2)}</td>
                                <td>R$ {settings.car_price_min.toFixed(2)}</td>
                                <td>{settings.car_start_distance_limit || 0} km</td>
                            </tr>
                            <tr>
                                <td className="font-bold text-white">🚗 Carro</td>
                                <td><Badge variant="warning">Noite</Badge></td>
                                <td>R$ {(settings.night_car_base_price || 0).toFixed(2)}</td>
                                <td>R$ {(settings.night_car_price_km || 0).toFixed(2)}</td>
                                <td>-</td>
                                <td>R$ {(settings.night_car_price_min || 0).toFixed(2)}</td>
                                <td>{settings.car_start_distance_limit || 0} km</td>
                            </tr>
                            <tr>
                                <td className="font-bold text-white">🏍️ Moto</td>
                                <td><Badge variant="info">Padrão</Badge></td>
                                <td>R$ {settings.moto_base_price.toFixed(2)}</td>
                                <td>R$ {settings.moto_price_km.toFixed(2)}</td>
                                <td>R$ {(settings.moto_price_per_minute || 0).toFixed(2)}</td>
                                <td>R$ {settings.moto_price_min.toFixed(2)}</td>
                                <td>{settings.moto_start_distance_limit || 0} km</td>
                            </tr>
                            <tr>
                                <td className="font-bold text-white">🏍️ Moto</td>
                                <td><Badge variant="warning">Noite</Badge></td>
                                <td>R$ {(settings.night_moto_base_price || 0).toFixed(2)}</td>
                                <td>R$ {(settings.night_moto_price_km || 0).toFixed(2)}</td>
                                <td>-</td>
                                <td>R$ {(settings.night_moto_price_min || 0).toFixed(2)}</td>
                                <td>{settings.moto_start_distance_limit || 0} km</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
};

export default AdminTaximeterView;
