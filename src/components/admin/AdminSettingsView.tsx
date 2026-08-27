/**
 * AdminSettingsView - View de configurações do sistema
 *
 * Preço/ícone/nome por veículo (antes aqui, fixo pra Carro/Moto) agora fica
 * em "Categorias de Veículo" (AdminCategoriesView) - cada categoria tem sua
 * própria tabela de preço, incluindo Carro/Moto e qualquer categoria nova
 * (Biz, Entregas, ...). Evita editar o mesmo preço em dois lugares. Os
 * campos car_ e moto_ (prefixo) continuam existindo em chegoja.app_settings como
 * legado (fonte do seed da tabela nova) mas não são mais editados por aqui.
 */

import React, { useState, useEffect } from 'react';
import { AppSettings } from '../../../types';
import { fetchAppSettings, updateAppSettings } from '../../../services/supabaseClient';
import { Button, Card } from '../../components/shared';

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
    });
    const [isSaving, setIsSaving] = useState(false);

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
                    <p className="text-sm text-gray-400 mt-1">Horários de tarifa noturna/madrugada e banner do app</p>
                </div>
                <Button variant="primary" onClick={handleSave} loading={isSaving}>
                    <span className="material-icons" style={{ fontSize: '18px' }}>save</span>
                    Salvar Alterações
                </Button>
            </div>

            <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-4 flex gap-3">
                <span className="material-icons text-blue-400" style={{ fontSize: '20px' }}>category</span>
                <div className="text-sm text-gray-300">
                    <p className="font-semibold text-blue-300">Preços e ícones por veículo se mudaram de lugar</p>
                    <p>Agora ficam em <strong>Categorias de Veículo</strong>, junto com qualquer categoria nova que você cadastrar (Biz, Entregas, ...). Aqui embaixo continuam só os horários que valem pra todas as categorias.</p>
                </div>
            </div>

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
        </div>
    );
};

export default AdminSettingsView;
