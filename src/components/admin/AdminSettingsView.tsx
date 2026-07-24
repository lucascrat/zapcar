/**
 * AdminSettingsView - View de configurações do sistema
 */

import React, { useState, useEffect } from 'react';
import { AppSettings } from '../../../types';
import { fetchAppSettings, updateAppSettings } from '../../../services/supabaseClient';
import { Button, Input, Card } from '../../components/shared';

export const AdminSettingsView: React.FC = () => {
    const [settings, setSettings] = useState<AppSettings>({
        car_base_price: 0,
        car_price_km: 0,
        car_price_min: 0,
        car_start_distance_limit: 0,
        moto_base_price: 0,
        moto_price_km: 0,
        moto_price_min: 0,
        moto_start_distance_limit: 0,
        night_car_base_price: 0,
        night_car_price_km: 0,
        night_car_price_min: 0,
        night_moto_base_price: 0,
        night_moto_price_km: 0,
        night_moto_price_min: 0,
        dawn_car_base_price: 0,
        dawn_car_price_km: 0,
        dawn_car_price_min: 0,
        dawn_moto_base_price: 0,
        dawn_moto_price_km: 0,
        dawn_moto_price_min: 0,
        night_start_time: '19:00',
        night_end_time: '23:59',
        dawn_start_time: '00:00',
        dawn_end_time: '05:00',
        marquee_text: '',
        car_name: 'Mob Comum',
        car_description: 'Viagem econômica',
        car_icon_url: '',
        moto_name: 'Mob Moto',
        moto_description: 'Rapidez e agilidade',
        moto_icon_url: ''
    });
    const [isSaving, setIsSaving] = useState(false);
    const [activeSection, setActiveSection] = useState<'car' | 'moto' | 'periods'>('car');

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        const data = await fetchAppSettings();
        setSettings(data);
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const error = await updateAppSettings(settings);
            if (error) {
                alert(`Erro ao salvar: ${error}`);
            } else {
                alert('✅ Configurações salvas com sucesso!');
                await loadSettings();
            }
        } catch (e) {
            alert(`Erro inesperado: ${e}`);
        }
        setIsSaving(false);
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-white">Configurações do Sistema</h2>
                    <p className="text-sm text-gray-400 mt-1">Gerencie preços e configurações de corridas</p>
                </div>
                <Button variant="primary" onClick={handleSave} loading={isSaving}>
                    <span className="material-icons" style={{ fontSize: '18px' }}>save</span>
                    Salvar Alterações
                </Button>
            </div>

            {/* Tabs */}
            <div className="admin-tabs">
                <button
                    className={`admin-tab ${activeSection === 'car' ? 'active' : ''}`}
                    onClick={() => setActiveSection('car')}
                >
                    🚗 Preços Carro
                </button>
                <button
                    className={`admin-tab ${activeSection === 'moto' ? 'active' : ''}`}
                    onClick={() => setActiveSection('moto')}
                >
                    🏍️ Preços Moto
                </button>
                <button
                    className={`admin-tab ${activeSection === 'periods' ? 'active' : ''}`}
                    onClick={() => setActiveSection('periods')}
                >
                    🌙 Períodos
                </button>
            </div>

            {/* Car Settings */}
            {activeSection === 'car' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card>
                        <div className="admin-card-header">
                            <h3 className="admin-card-title">Preços Normais - Carro</h3>
                        </div>
                        <div className="admin-card-body space-y-4">
                            <div className="admin-form-group">
                                <label className="admin-form-label">Tarifa Base (R$)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    className="admin-form-input"
                                    value={settings.car_base_price}
                                    onChange={(e) => setSettings({ ...settings, car_base_price: parseFloat(e.target.value) || 0 })}
                                />
                            </div>
                            <div className="admin-form-group">
                                <label className="admin-form-label">Preço por KM (R$)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    className="admin-form-input"
                                    value={settings.car_price_km}
                                    onChange={(e) => setSettings({ ...settings, car_price_km: parseFloat(e.target.value) || 0 })}
                                />
                            </div>
                            <div className="admin-form-group">
                                <label className="admin-form-label">Tarifa Mínima (R$)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    className="admin-form-input"
                                    value={settings.car_price_min}
                                    onChange={(e) => setSettings({ ...settings, car_price_min: parseFloat(e.target.value) || 0 })}
                                />
                            </div>
                            <div className="admin-form-group">
                                <label className="admin-form-label">Distância Inicial (KM) - Base cobrada até este valor</label>
                                <input
                                    type="number"
                                    step="0.1"
                                    className="admin-form-input"
                                    value={settings.car_start_distance_limit}
                                    onChange={(e) => setSettings({ ...settings, car_start_distance_limit: parseFloat(e.target.value) || 0 })}
                                />
                            </div>
                            <div className="admin-form-group">
                                <label className="admin-form-label">Tarifa por Minuto (R$)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    className="admin-form-input"
                                    value={settings.car_price_per_minute || 0}
                                    onChange={(e) => setSettings({ ...settings, car_price_per_minute: parseFloat(e.target.value) || 0 })}
                                />
                            </div>
                        </div>
                    </Card>

                    <Card>
                        <div className="admin-card-header">
                            <h3 className="admin-card-title">Preços Noturnos - Carro</h3>
                        </div>
                        <div className="admin-card-body space-y-4">
                            <div className="admin-form-group">
                                <label className="admin-form-label">Tarifa Base Noturna (R$)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    className="admin-form-input"
                                    value={settings.night_car_base_price}
                                    onChange={(e) => setSettings({ ...settings, night_car_base_price: parseFloat(e.target.value) || 0 })}
                                />
                            </div>
                            <div className="admin-form-group">
                                <label className="admin-form-label">Preço/KM Noturno (R$)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    className="admin-form-input"
                                    value={settings.night_car_price_km}
                                    onChange={(e) => setSettings({ ...settings, night_car_price_km: parseFloat(e.target.value) || 0 })}
                                />
                            </div>
                            <div className="admin-form-group">
                                <label className="admin-form-label">Tarifa Mín. Noturna (R$)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    className="admin-form-input"
                                    value={settings.night_car_price_min}
                                    onChange={(e) => setSettings({ ...settings, night_car_price_min: parseFloat(e.target.value) || 0 })}
                                />
                            </div>
                        </div>
                    </Card>
                </div>
            )}

            {/* Moto Settings */}
            {activeSection === 'moto' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card>
                        <div className="admin-card-header">
                            <h3 className="admin-card-title">Preços Normais - Moto</h3>
                        </div>
                        <div className="admin-card-body space-y-4">
                            <div className="admin-form-group">
                                <label className="admin-form-label">Tarifa Base (R$)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    className="admin-form-input"
                                    value={settings.moto_base_price}
                                    onChange={(e) => setSettings({ ...settings, moto_base_price: parseFloat(e.target.value) || 0 })}
                                />
                            </div>
                            <div className="admin-form-group">
                                <label className="admin-form-label">Preço por KM (R$)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    className="admin-form-input"
                                    value={settings.moto_price_km}
                                    onChange={(e) => setSettings({ ...settings, moto_price_km: parseFloat(e.target.value) || 0 })}
                                />
                            </div>
                            <div className="admin-form-group">
                                <label className="admin-form-label">Tarifa Mínima (R$)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    className="admin-form-input"
                                    value={settings.moto_price_min}
                                    onChange={(e) => setSettings({ ...settings, moto_price_min: parseFloat(e.target.value) || 0 })}
                                />
                            </div>
                            <div className="admin-form-group">
                                <label className="admin-form-label">Distância Inicial (KM) - Base cobrada até este valor</label>
                                <input
                                    type="number"
                                    step="0.1"
                                    className="admin-form-input"
                                    value={settings.moto_start_distance_limit}
                                    onChange={(e) => setSettings({ ...settings, moto_start_distance_limit: parseFloat(e.target.value) || 0 })}
                                />
                            </div>
                            <div className="admin-form-group">
                                <label className="admin-form-label">Tarifa por Minuto (R$)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    className="admin-form-input"
                                    value={settings.moto_price_per_minute || 0}
                                    onChange={(e) => setSettings({ ...settings, moto_price_per_minute: parseFloat(e.target.value) || 0 })}
                                />
                            </div>
                        </div>
                    </Card>

                    <Card>
                        <div className="admin-card-header">
                            <h3 className="admin-card-title">Preços Noturnos - Moto</h3>
                        </div>
                        <div className="admin-card-body space-y-4">
                            <div className="admin-form-group">
                                <label className="admin-form-label">Tarifa Base Noturna (R$)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    className="admin-form-input"
                                    value={settings.night_moto_base_price}
                                    onChange={(e) => setSettings({ ...settings, night_moto_base_price: parseFloat(e.target.value) || 0 })}
                                />
                            </div>
                            <div className="admin-form-group">
                                <label className="admin-form-label">Preço/KM Noturno (R$)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    className="admin-form-input"
                                    value={settings.night_moto_price_km}
                                    onChange={(e) => setSettings({ ...settings, night_moto_price_km: parseFloat(e.target.value) || 0 })}
                                />
                            </div>
                            <div className="admin-form-group">
                                <label className="admin-form-label">Tarifa Mín. Noturna (R$)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    className="admin-form-input"
                                    value={settings.night_moto_price_min}
                                    onChange={(e) => setSettings({ ...settings, night_moto_price_min: parseFloat(e.target.value) || 0 })}
                                />
                            </div>
                        </div>
                    </Card>
                </div>
            )}

            {/* Periods Settings */}
            {activeSection === 'periods' && (
                <Card>
                    <div className="admin-card-header">
                        <h3 className="admin-card-title">Configuração de Períodos</h3>
                    </div>
                    <div className="admin-card-body">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-4">
                                <h4 className="font-semibold text-white">Período Noturno</h4>
                                <div className="admin-form-group">
                                    <label className="admin-form-label">Hora Início</label>
                                    <input
                                        type="time"
                                        className="admin-form-input"
                                        value={settings.night_start_time}
                                        onChange={(e) => setSettings({ ...settings, night_start_time: e.target.value })}
                                    />
                                </div>
                                <div className="admin-form-group">
                                    <label className="admin-form-label">Hora Fim</label>
                                    <input
                                        type="time"
                                        className="admin-form-input"
                                        value={settings.night_end_time}
                                        onChange={(e) => setSettings({ ...settings, night_end_time: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div className="space-y-4">
                                <h4 className="font-semibold text-white">Período Madrugada</h4>
                                <div className="admin-form-group">
                                    <label className="admin-form-label">Hora Início</label>
                                    <input
                                        type="time"
                                        className="admin-form-input"
                                        value={settings.dawn_start_time}
                                        onChange={(e) => setSettings({ ...settings, dawn_start_time: e.target.value })}
                                    />
                                </div>
                                <div className="admin-form-group">
                                    <label className="admin-form-label">Hora Fim</label>
                                    <input
                                        type="time"
                                        className="admin-form-input"
                                        value={settings.dawn_end_time}
                                        onChange={(e) => setSettings({ ...settings, dawn_end_time: e.target.value })}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="mt-6 pt-6 border-t border-gray-700">
                            <div className="admin-form-group">
                                <label className="admin-form-label">Texto do Banner (Marquee)</label>
                                <input
                                    type="text"
                                    className="admin-form-input"
                                    placeholder="Ex: Bem-vindo ao ChegoJá!"
                                    value={settings.marquee_text || ''}
                                    onChange={(e) => setSettings({ ...settings, marquee_text: e.target.value })}
                                />
                            </div>
                        </div>
                    </div>
                </Card>
            )}
        </div>
    );
};

export default AdminSettingsView;
