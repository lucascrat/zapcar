/**
 * AdminRewardsView - Gerenciamento do sistema de premiação semanal
 */

import React, { useState, useEffect, useRef } from 'react';
import { Card, Button } from '../../components/shared';
import {
    fetchRewardsConfig,
    updateRewardsConfig,
    fetchAllRewardTiers,
    upsertRewardTier,
    deleteRewardTier,
    fetchWeeklyDriverRanking,
    uploadFile,
} from '../../../services/supabaseClient';
import { RewardTier, RewardsConfig, DriverRankingEntry } from '../../../types';

const MEDAL = ['🥇', '🥈', '🥉'];

const EMPTY_TIER: Partial<RewardTier> = {
    title: '',
    description: '',
    min_rides: 20,
    prize_value: 50,
    badge_emoji: '🏆',
    card_color: '#f59e0b',
    is_active: true,
    display_order: 99,
};

export const AdminRewardsView: React.FC = () => {
    const [config, setConfig]       = useState<RewardsConfig | null>(null);
    const [tiers, setTiers]         = useState<RewardTier[]>([]);
    const [ranking, setRanking]     = useState<DriverRankingEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Modal de edição
    const [editTier, setEditTier]   = useState<Partial<RewardTier> | null>(null);
    const [saving, setSaving]       = useState(false);
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string>('');
    const imageInputRef             = useRef<HTMLInputElement>(null);

    useEffect(() => { loadAll(); }, []);

    const loadAll = async () => {
        setIsLoading(true);
        const [cfg, tierList, rankList] = await Promise.all([
            fetchRewardsConfig(),
            fetchAllRewardTiers(),
            fetchWeeklyDriverRanking(10),
        ]);
        setConfig(cfg);
        setTiers(tierList);
        setRanking(rankList);
        setIsLoading(false);
    };

    /* ── Toggle liga/desliga ─────────────────────────── */
    const handleToggleEnabled = async () => {
        if (!config) return;
        const newVal = !config.is_enabled;
        setConfig({ ...config, is_enabled: newVal });
        await updateRewardsConfig({ is_enabled: newVal });
    };

    /* ── Salvar configuração de título/subtitle ──────── */
    const handleSaveConfig = async () => {
        if (!config) return;
        setSaving(true);
        await updateRewardsConfig({ week_title: config.week_title, subtitle: config.subtitle });
        setSaving(false);
        alert('Configurações salvas!');
    };

    /* ── Modal helpers ───────────────────────────────── */
    const openAdd = () => {
        setEditTier({ ...EMPTY_TIER, display_order: tiers.length });
        setImageFile(null);
        setImagePreview('');
    };

    const openEdit = (tier: RewardTier) => {
        setEditTier({ ...tier });
        setImageFile(null);
        setImagePreview(tier.image_url || '');
    };

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setImageFile(file);
            setImagePreview(URL.createObjectURL(file));
        }
    };

    const handleSaveTier = async () => {
        if (!editTier) return;
        if (!editTier.title?.trim()) { alert('Informe o título do prêmio'); return; }
        if (!editTier.min_rides || editTier.min_rides < 1) { alert('Informe o mínimo de corridas'); return; }
        if (!editTier.prize_value || editTier.prize_value <= 0) { alert('Informe o valor do prêmio'); return; }

        setSaving(true);
        let imageUrl = editTier.image_url || '';
        if (imageFile) {
            const uploaded = await uploadFile(imageFile, 'images');
            if (uploaded) imageUrl = uploaded;
        }

        const result = await upsertRewardTier({ ...editTier, image_url: imageUrl });
        if (result.ok) {
            setEditTier(null);
            await loadAll();
        } else {
            alert('Erro ao salvar: ' + result.errorMsg);
        }
        setSaving(false);
    };

    const handleDelete = async (tier: RewardTier) => {
        if (!confirm(`Deseja excluir o prêmio "${tier.title}"?`)) return;
        const result = await deleteRewardTier(tier.id);
        if (result.ok) {
            await loadAll();
        } else {
            alert('Erro ao excluir: ' + result.errorMsg);
        }
    };

    if (isLoading) {
        return (
            <div className="admin-empty-state">
                <span className="material-icons">hourglass_empty</span>
                <p className="admin-empty-state-title">Carregando...</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">

            {/* ── Header ────────────────────────────────────── */}
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                        <span className="material-icons text-yellow-400">emoji_events</span>
                        Premiações Semanais
                    </h2>
                    <p className="text-sm text-gray-400 mt-1">Configure os prêmios e veja o ranking de motoristas</p>
                </div>

                {/* Toggle liga/desliga */}
                <button
                    onClick={handleToggleEnabled}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm transition-all border ${
                        config?.is_enabled
                            ? 'bg-green-500/15 border-green-500/40 text-green-400 hover:bg-green-500/25'
                            : 'bg-red-500/15 border-red-500/40 text-red-400 hover:bg-red-500/25'
                    }`}
                >
                    <span className="material-icons text-base">{config?.is_enabled ? 'toggle_on' : 'toggle_off'}</span>
                    Sistema {config?.is_enabled ? 'ATIVO' : 'DESATIVADO'}
                </button>
            </div>

            {/* ── Configurações do título ───────────────────── */}
            <Card>
                <div className="admin-card-header">
                    <h3 className="admin-card-title">Textos do Painel</h3>
                </div>
                <div className="admin-card-body">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="admin-form-group">
                            <label className="admin-form-label">Título da Premiação</label>
                            <input
                                type="text"
                                className="admin-form-input"
                                value={config?.week_title || ''}
                                onChange={e => config && setConfig({ ...config, week_title: e.target.value })}
                                placeholder="Ex: Premiação Semanal"
                            />
                        </div>
                        <div className="admin-form-group">
                            <label className="admin-form-label">Subtítulo</label>
                            <input
                                type="text"
                                className="admin-form-input"
                                value={config?.subtitle || ''}
                                onChange={e => config && setConfig({ ...config, subtitle: e.target.value })}
                                placeholder="Ex: Bata as metas e ganhe seus prêmios!"
                            />
                        </div>
                    </div>
                    <div className="pt-2">
                        <Button variant="primary" onClick={handleSaveConfig} disabled={saving}>
                            {saving ? 'Salvando...' : 'Salvar Textos'}
                        </Button>
                    </div>
                </div>
            </Card>

            {/* ── Faixas de prêmio ──────────────────────────── */}
            <Card>
                <div className="admin-card-header">
                    <h3 className="admin-card-title">🎖️ Faixas de Prêmio</h3>
                    <Button variant="primary" onClick={openAdd}>
                        <span className="material-icons" style={{ fontSize: 18 }}>add</span>
                        Nova Faixa
                    </Button>
                </div>
                <div className="admin-card-body no-padding">
                    {tiers.length === 0 ? (
                        <div className="admin-empty-state">
                            <span className="material-icons">emoji_events</span>
                            <p className="admin-empty-state-title">Nenhuma faixa cadastrada</p>
                            <p className="admin-empty-state-text">Clique em "Nova Faixa" para começar</p>
                        </div>
                    ) : (
                        <div className="p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                            {tiers.map((tier, idx) => (
                                <div
                                    key={tier.id}
                                    className="rounded-2xl overflow-hidden border"
                                    style={{
                                        borderColor: tier.is_active ? `${tier.card_color}50` : 'rgba(255,255,255,0.08)',
                                        opacity: tier.is_active ? 1 : 0.5,
                                    }}
                                >
                                    {/* Imagem ou placeholder colorido */}
                                    {tier.image_url ? (
                                        <div className="h-32 relative">
                                            <img src={tier.image_url} alt={tier.title} className="w-full h-full object-cover" />
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                                            <span className="absolute bottom-2 left-3 text-2xl">{tier.badge_emoji}</span>
                                        </div>
                                    ) : (
                                        <div
                                            className="h-24 flex items-center justify-center text-4xl"
                                            style={{ background: `linear-gradient(135deg, ${tier.card_color}25, ${tier.card_color}08)` }}
                                        >
                                            {tier.badge_emoji}
                                        </div>
                                    )}

                                    <div className="p-3 bg-[#131d26]">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <p className="font-bold text-sm text-white truncate">{tier.title}</p>
                                                <p className="text-gray-400 text-xs mt-0.5 line-clamp-2">{tier.description}</p>
                                            </div>
                                            <span
                                                className="text-[9px] px-2 py-0.5 rounded-full font-bold shrink-0"
                                                style={{
                                                    background: tier.is_active ? `${tier.card_color}20` : 'rgba(255,255,255,0.08)',
                                                    color: tier.is_active ? tier.card_color : '#6b7280',
                                                }}
                                            >
                                                {tier.is_active ? 'Ativo' : 'Inativo'}
                                            </span>
                                        </div>

                                        <div className="flex items-center justify-between mt-3 pt-2 border-t border-white/5">
                                            <div>
                                                <p className="text-white font-black text-lg leading-none">
                                                    R$ {tier.prize_value.toFixed(2).replace('.', ',')}
                                                </p>
                                                <p className="text-gray-500 text-[10px]">{tier.min_rides} corridas/sem.</p>
                                            </div>
                                            <div className="flex gap-1">
                                                <button
                                                    className="admin-quick-action-btn"
                                                    onClick={() => openEdit(tier)}
                                                    title="Editar"
                                                >
                                                    <span className="material-icons">edit</span>
                                                </button>
                                                <button
                                                    className="admin-quick-action-btn danger"
                                                    onClick={() => handleDelete(tier)}
                                                    title="Excluir"
                                                >
                                                    <span className="material-icons">delete</span>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </Card>

            {/* ── Ranking atual ─────────────────────────────── */}
            <Card>
                <div className="admin-card-header">
                    <h3 className="admin-card-title">📊 Ranking desta Semana</h3>
                    <Button variant="secondary" onClick={loadAll}>
                        <span className="material-icons">refresh</span>
                    </Button>
                </div>
                <div className="admin-card-body no-padding">
                    {ranking.length === 0 ? (
                        <div className="admin-empty-state">
                            <span className="material-icons">leaderboard</span>
                            <p className="admin-empty-state-title">Nenhuma corrida finalizada esta semana</p>
                        </div>
                    ) : (
                        <table className="admin-table">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Motorista</th>
                                    <th>Veículo</th>
                                    <th>Corridas</th>
                                    <th>Prêmio Atual</th>
                                </tr>
                            </thead>
                            <tbody>
                                {ranking.map((entry, i) => {
                                    const pos = i + 1;
                                    const earnedTier = [...tiers]
                                        .filter(t => t.is_active && entry.weekly_rides >= t.min_rides)
                                        .sort((a, b) => b.min_rides - a.min_rides)[0];
                                    return (
                                        <tr key={entry.driver_id}>
                                            <td>
                                                <span className="text-lg">
                                                    {pos <= 3 ? MEDAL[pos - 1] : `#${pos}`}
                                                </span>
                                            </td>
                                            <td>
                                                <div className="flex items-center gap-2">
                                                    <div
                                                        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                                                        style={{ background: pos === 1 ? '#f59e0b' : pos === 2 ? '#9ca3af' : pos === 3 ? '#cd7c3a' : '#1e2d3d' }}
                                                    >
                                                        {entry.avatar_url
                                                            ? <img src={entry.avatar_url} className="w-full h-full rounded-full object-cover" alt="" />
                                                            : entry.username?.[0]?.toUpperCase()}
                                                    </div>
                                                    <span className="text-sm text-white font-medium">{entry.username}</span>
                                                </div>
                                            </td>
                                            <td>
                                                <span className="text-xs text-gray-400">
                                                    {entry.vehicle_type === 'motorcycle' ? '🛵 Moto' : '🚗 Carro'}
                                                </span>
                                            </td>
                                            <td>
                                                <span className="text-white font-black">{entry.weekly_rides}</span>
                                            </td>
                                            <td>
                                                {earnedTier ? (
                                                    <span
                                                        className="text-xs font-bold px-2 py-1 rounded-lg"
                                                        style={{ background: `${earnedTier.card_color}20`, color: earnedTier.card_color }}
                                                    >
                                                        {earnedTier.badge_emoji} R$ {earnedTier.prize_value.toFixed(2).replace('.', ',')}
                                                    </span>
                                                ) : (
                                                    <span className="text-gray-600 text-xs">—</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            </Card>

            {/* ── Modal de edição ───────────────────────────── */}
            {editTier && (
                <div
                    className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
                    onClick={() => setEditTier(null)}
                >
                    <Card
                        style={{ maxWidth: 520, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}
                        onClick={(e: React.MouseEvent) => e.stopPropagation()}
                    >
                        <div className="admin-card-header">
                            <h3 className="admin-card-title">{editTier.id ? 'Editar Faixa' : 'Nova Faixa de Prêmio'}</h3>
                            <button onClick={() => setEditTier(null)} className="text-gray-400 hover:text-white">
                                <span className="material-icons">close</span>
                            </button>
                        </div>

                        <div className="admin-card-body space-y-4">
                            {/* Preview do card */}
                            <div
                                className="rounded-xl overflow-hidden border"
                                style={{ borderColor: `${editTier.card_color || '#f59e0b'}40` }}
                            >
                                <div
                                    className="h-20 flex items-center justify-center text-4xl"
                                    style={{ background: `linear-gradient(135deg, ${editTier.card_color || '#f59e0b'}25, ${editTier.card_color || '#f59e0b'}08)` }}
                                >
                                    {imagePreview
                                        ? <img src={imagePreview} className="w-full h-full object-cover" alt="" />
                                        : editTier.badge_emoji || '🏆'}
                                </div>
                                <div className="p-3 bg-[#131d26]">
                                    <p className="font-bold text-sm" style={{ color: editTier.card_color || '#f59e0b' }}>
                                        {editTier.badge_emoji || '🏆'} {editTier.title || 'Título do Prêmio'}
                                    </p>
                                    <p className="text-white font-black text-lg mt-1">
                                        R$ {(editTier.prize_value || 0).toFixed(2).replace('.', ',')}
                                    </p>
                                    <p className="text-gray-500 text-[10px]">{editTier.min_rides || 0} corridas/semana</p>
                                </div>
                            </div>

                            {/* Campos */}
                            <div className="admin-form-row">
                                <div className="admin-form-group">
                                    <label className="admin-form-label">Emoji / Badge *</label>
                                    <input
                                        type="text"
                                        className="admin-form-input text-2xl"
                                        value={editTier.badge_emoji || ''}
                                        onChange={e => setEditTier({ ...editTier, badge_emoji: e.target.value })}
                                        placeholder="🏆"
                                        maxLength={4}
                                    />
                                </div>
                                <div className="admin-form-group">
                                    <label className="admin-form-label">Cor do Card</label>
                                    <div className="flex gap-2 items-center">
                                        <input
                                            type="color"
                                            className="w-10 h-10 rounded-lg border border-white/10 cursor-pointer"
                                            value={editTier.card_color || '#f59e0b'}
                                            onChange={e => setEditTier({ ...editTier, card_color: e.target.value })}
                                        />
                                        <input
                                            type="text"
                                            className="admin-form-input flex-1"
                                            value={editTier.card_color || ''}
                                            onChange={e => setEditTier({ ...editTier, card_color: e.target.value })}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="admin-form-group">
                                <label className="admin-form-label">Título *</label>
                                <input
                                    type="text"
                                    className="admin-form-input"
                                    value={editTier.title || ''}
                                    onChange={e => setEditTier({ ...editTier, title: e.target.value })}
                                    placeholder="Ex: Campeão da Semana"
                                />
                            </div>

                            <div className="admin-form-group">
                                <label className="admin-form-label">Descrição</label>
                                <input
                                    type="text"
                                    className="admin-form-input"
                                    value={editTier.description || ''}
                                    onChange={e => setEditTier({ ...editTier, description: e.target.value })}
                                    placeholder="Ex: Complete 50 corridas esta semana"
                                />
                            </div>

                            <div className="admin-form-row">
                                <div className="admin-form-group">
                                    <label className="admin-form-label">Mín. Corridas / Semana *</label>
                                    <input
                                        type="number"
                                        min="1"
                                        className="admin-form-input"
                                        value={editTier.min_rides || ''}
                                        onChange={e => setEditTier({ ...editTier, min_rides: parseInt(e.target.value) || 0 })}
                                    />
                                </div>
                                <div className="admin-form-group">
                                    <label className="admin-form-label">Valor do Prêmio (R$) *</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0.01"
                                        className="admin-form-input"
                                        value={editTier.prize_value || ''}
                                        onChange={e => setEditTier({ ...editTier, prize_value: parseFloat(e.target.value) || 0 })}
                                    />
                                </div>
                            </div>

                            <div className="admin-form-row">
                                <div className="admin-form-group">
                                    <label className="admin-form-label">Ordem de exibição</label>
                                    <input
                                        type="number"
                                        min="0"
                                        className="admin-form-input"
                                        value={editTier.display_order ?? 0}
                                        onChange={e => setEditTier({ ...editTier, display_order: parseInt(e.target.value) || 0 })}
                                    />
                                </div>
                                <div className="admin-form-group">
                                    <label className="admin-form-label">Status</label>
                                    <select
                                        className="admin-form-input"
                                        value={editTier.is_active ? 'true' : 'false'}
                                        onChange={e => setEditTier({ ...editTier, is_active: e.target.value === 'true' })}
                                    >
                                        <option value="true">Ativo</option>
                                        <option value="false">Inativo</option>
                                    </select>
                                </div>
                            </div>

                            <div className="admin-form-group">
                                <label className="admin-form-label">Imagem do Card (opcional)</label>
                                <input
                                    ref={imageInputRef}
                                    type="file"
                                    accept="image/*"
                                    className="admin-form-input"
                                    onChange={handleImageChange}
                                />
                                <p className="text-gray-500 text-xs mt-1">Deixe vazio para usar apenas emoji + cor de fundo</p>
                            </div>

                            <div className="flex gap-3 pt-2 border-t border-gray-700">
                                <Button variant="secondary" onClick={() => setEditTier(null)} className="flex-1">
                                    Cancelar
                                </Button>
                                <Button variant="primary" onClick={handleSaveTier} disabled={saving} className="flex-1">
                                    {saving ? 'Salvando...' : 'Salvar Faixa'}
                                </Button>
                            </div>
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );
};

export default AdminRewardsView;
