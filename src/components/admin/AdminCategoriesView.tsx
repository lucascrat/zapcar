/**
 * AdminCategoriesView - Cadastro de categorias de veículo (Carro, Moto, Biz,
 * Entregas, ...). Cada categoria tem nome, ícone, descrição e uma tabela de
 * preço completa (padrão/noite/madrugada, com tarifa mínima e preço/minuto
 * separados - ver services/pricing.ts pro motivo). Substitui o antigo par
 * fixo car/motorcycle hardcoded no app.
 */

import React, { useState, useRef } from 'react';
import { Card, Button } from '../../components/shared';
import { useToast } from '../../components/shared/Toast';
import { useVehicleCategories } from '../../contexts/VehicleCategoriesContext';
import {
    createVehicleCategory,
    updateVehicleCategory,
    deleteVehicleCategory,
    uploadFile,
} from '../../../services/supabaseClient';
import type { VehicleCategory } from '../../../types';

type PricingTier = 'standard' | 'night' | 'dawn';

const TIER_FIELD_PREFIX: Record<PricingTier, string> = {
    standard: '',
    night: 'night_',
    dawn: 'dawn_',
};

const TIER_LABEL: Record<PricingTier, string> = {
    standard: 'Padrão',
    night: 'Noite',
    dawn: 'Madrugada',
};

const emptyForm = (): Partial<VehicleCategory> => ({
    slug: '',
    name: '',
    description: '',
    icon_url: '',
    is_active: true,
    sort_order: 0,
    base_price: 0,
    price_km: 0,
    price_min_fare: 0,
    price_per_minute: 0,
    start_distance_limit: 0,
    night_base_price: null,
    night_price_km: null,
    night_price_min_fare: null,
    night_price_per_minute: null,
    dawn_base_price: null,
    dawn_price_km: null,
    dawn_price_min_fare: null,
    dawn_price_per_minute: null,
});

const slugify = (name: string): string =>
    name
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{M}+/gu, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 32) || 'categoria';

export const AdminCategoriesView: React.FC = () => {
    const { categories, loading, refetch } = useVehicleCategories();
    const { success, error: toastError } = useToast();

    const [showModal, setShowModal] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState<Partial<VehicleCategory>>(emptyForm());
    const [saving, setSaving] = useState(false);
    const [uploadingIcon, setUploadingIcon] = useState(false);
    const [activeTier, setActiveTier] = useState<PricingTier>('standard');
    const iconInputRef = useRef<HTMLInputElement>(null);

    const openCreate = () => {
        setEditingId(null);
        setForm(emptyForm());
        setActiveTier('standard');
        setShowModal(true);
    };

    const openEdit = (category: VehicleCategory) => {
        setEditingId(category.id);
        setForm({ ...category });
        setActiveTier('standard');
        setShowModal(true);
    };

    const closeModal = () => {
        setShowModal(false);
        setEditingId(null);
        setForm(emptyForm());
        if (iconInputRef.current) iconInputRef.current.value = '';
    };

    const handleIconChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploadingIcon(true);
        try {
            const url = await uploadFile(file, 'images');
            if (!url) {
                toastError('Erro ao enviar ícone — verifique o console (F12) e tente novamente.');
                return;
            }
            setForm(prev => ({ ...prev, icon_url: url }));
        } finally {
            setUploadingIcon(false);
        }
    };

    const handleSave = async () => {
        if (!form.name?.trim()) {
            toastError('Informe o nome da categoria.');
            return;
        }

        setSaving(true);
        try {
            if (editingId) {
                const err = await updateVehicleCategory(editingId, form);
                if (err) {
                    toastError(err);
                    return;
                }
                success('Categoria atualizada!');
            } else {
                const slug = form.slug?.trim() || slugify(form.name);
                const err = await createVehicleCategory({ ...form, slug });
                if (err) {
                    toastError(err);
                    return;
                }
                success('Categoria criada!');
            }
            closeModal();
            await refetch();
        } finally {
            setSaving(false);
        }
    };

    const handleToggleActive = async (category: VehicleCategory) => {
        const err = await updateVehicleCategory(category.id, { is_active: !category.is_active });
        if (err) {
            toastError(err);
            return;
        }
        await refetch();
    };

    const handleMove = async (category: VehicleCategory, direction: -1 | 1) => {
        const sorted = [...categories].sort((a, b) => a.sort_order - b.sort_order);
        const idx = sorted.findIndex(c => c.id === category.id);
        const swapWith = sorted[idx + direction];
        if (!swapWith) return;
        await Promise.all([
            updateVehicleCategory(category.id, { sort_order: swapWith.sort_order }),
            updateVehicleCategory(swapWith.id, { sort_order: category.sort_order }),
        ]);
        await refetch();
    };

    const handleDelete = async (category: VehicleCategory) => {
        if (!confirm(`Excluir a categoria "${category.name}"? Isso não pode ser desfeito.`)) return;
        const err = await deleteVehicleCategory(category.id, category.slug);
        if (err) {
            toastError(err);
            return;
        }
        success('Categoria excluída.');
        await refetch();
    };

    const setTierField = (tier: PricingTier, field: 'base_price' | 'price_km' | 'price_min_fare' | 'price_per_minute', value: number) => {
        const key = `${TIER_FIELD_PREFIX[tier]}${field}` as keyof VehicleCategory;
        setForm(prev => ({ ...prev, [key]: value }));
    };

    const getTierField = (tier: PricingTier, field: 'base_price' | 'price_km' | 'price_min_fare' | 'price_per_minute'): number | '' => {
        const key = `${TIER_FIELD_PREFIX[tier]}${field}` as keyof VehicleCategory;
        const value = form[key];
        return (value === null || value === undefined) ? '' : (value as number);
    };

    const sortedCategories = [...categories].sort((a, b) => a.sort_order - b.sort_order);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                        <span className="material-icons">category</span>
                        Categorias de Veículo
                    </h2>
                    <p className="text-sm text-gray-400 mt-1">
                        Carro, Moto, Biz, Entregas... cada uma com seu próprio ícone e tabela de preço.
                    </p>
                </div>
                <Button variant="primary" onClick={openCreate}>
                    <span className="material-icons" style={{ fontSize: '18px' }}>add</span>
                    Nova Categoria
                </Button>
            </div>

            {loading ? (
                <div className="admin-empty-state">
                    <span className="material-icons">hourglass_empty</span>
                    <p className="admin-empty-state-title">Carregando...</p>
                </div>
            ) : (
                <Card>
                    <div className="admin-card-body no-padding">
                        {sortedCategories.length === 0 ? (
                            <div className="admin-empty-state">
                                <span className="material-icons">category</span>
                                <p className="admin-empty-state-title">Nenhuma categoria cadastrada</p>
                            </div>
                        ) : (
                            <table className="admin-table">
                                <thead>
                                    <tr>
                                        <th></th>
                                        <th>Ícone</th>
                                        <th>Nome</th>
                                        <th>Slug</th>
                                        <th>Tarifa Base</th>
                                        <th>Status</th>
                                        <th>Ações</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sortedCategories.map((category, idx) => (
                                        <tr key={category.id}>
                                            <td>
                                                <div className="flex flex-col">
                                                    <button
                                                        className="admin-quick-action-btn"
                                                        disabled={idx === 0}
                                                        onClick={() => handleMove(category, -1)}
                                                        title="Mover pra cima"
                                                    >
                                                        <span className="material-icons" style={{ fontSize: 16 }}>arrow_upward</span>
                                                    </button>
                                                    <button
                                                        className="admin-quick-action-btn"
                                                        disabled={idx === sortedCategories.length - 1}
                                                        onClick={() => handleMove(category, 1)}
                                                        title="Mover pra baixo"
                                                    >
                                                        <span className="material-icons" style={{ fontSize: 16 }}>arrow_downward</span>
                                                    </button>
                                                </div>
                                            </td>
                                            <td>
                                                {category.icon_url ? (
                                                    <img
                                                        src={category.icon_url}
                                                        alt={category.name}
                                                        style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'contain', background: 'rgba(255,255,255,0.05)' }}
                                                    />
                                                ) : (
                                                    <span className="material-icons" style={{ color: '#00a884', fontSize: 28 }}>directions_car</span>
                                                )}
                                            </td>
                                            <td>
                                                <div className="font-semibold text-white">{category.name}</div>
                                                {category.description && (
                                                    <div className="text-xs text-gray-500">{category.description}</div>
                                                )}
                                            </td>
                                            <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                                                {category.slug}
                                            </td>
                                            <td>
                                                R$ {category.base_price.toFixed(2)} + R$ {category.price_km.toFixed(2)}/km
                                            </td>
                                            <td>
                                                <span className={`admin-status-badge ${category.is_active ? 'online' : 'offline'}`}>
                                                    {category.is_active ? 'Ativa' : 'Inativa'}
                                                </span>
                                            </td>
                                            <td>
                                                <div className="admin-quick-actions">
                                                    <button
                                                        className="admin-quick-action-btn"
                                                        onClick={() => handleToggleActive(category)}
                                                        title={category.is_active ? 'Desativar' : 'Ativar'}
                                                    >
                                                        <span className="material-icons">{category.is_active ? 'visibility_off' : 'visibility'}</span>
                                                    </button>
                                                    <button
                                                        className="admin-quick-action-btn"
                                                        onClick={() => openEdit(category)}
                                                        title="Editar"
                                                    >
                                                        <span className="material-icons">edit</span>
                                                    </button>
                                                    <button
                                                        className="admin-quick-action-btn danger"
                                                        onClick={() => handleDelete(category)}
                                                        title="Excluir"
                                                    >
                                                        <span className="material-icons">delete</span>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </Card>
            )}

            {showModal && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={closeModal}>
                    <Card style={{ maxWidth: '640px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }} onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                        <div className="admin-card-header">
                            <h3 className="admin-card-title">{editingId ? 'Editar Categoria' : 'Nova Categoria'}</h3>
                            <button onClick={closeModal} className="text-gray-400 hover:text-white">
                                <span className="material-icons">close</span>
                            </button>
                        </div>
                        <div className="admin-card-body space-y-4">
                            <div className="flex gap-4 items-start">
                                <div className="flex flex-col items-center gap-2 shrink-0">
                                    <div className="w-16 h-16 rounded-xl bg-black/20 border border-white/10 flex items-center justify-center overflow-hidden">
                                        {form.icon_url ? (
                                            <img src={form.icon_url} alt="Ícone" className="w-full h-full object-contain p-1" />
                                        ) : (
                                            <span className="material-icons text-2xl text-gray-500">directions_car</span>
                                        )}
                                    </div>
                                    <label className="admin-btn-secondary text-xs cursor-pointer px-2 py-1 rounded-lg">
                                        {uploadingIcon ? 'Enviando...' : 'Ícone'}
                                        <input
                                            ref={iconInputRef}
                                            type="file"
                                            accept="image/*"
                                            className="hidden"
                                            disabled={uploadingIcon}
                                            onChange={handleIconChange}
                                        />
                                    </label>
                                </div>
                                <div className="flex-1 space-y-3">
                                    <div className="admin-form-group">
                                        <label className="admin-form-label">Nome *</label>
                                        <input
                                            type="text"
                                            className="admin-form-input"
                                            placeholder="Ex: Biz"
                                            value={form.name || ''}
                                            onChange={(e) => setForm({ ...form, name: e.target.value })}
                                        />
                                    </div>
                                    <div className="admin-form-group">
                                        <label className="admin-form-label">Descrição</label>
                                        <input
                                            type="text"
                                            className="admin-form-input"
                                            placeholder="Ex: Moto pequena, ideal pra trajetos curtos"
                                            value={form.description || ''}
                                            onChange={(e) => setForm({ ...form, description: e.target.value })}
                                        />
                                    </div>
                                </div>
                            </div>

                            {!editingId && (
                                <div className="admin-form-group">
                                    <label className="admin-form-label">Identificador (slug)</label>
                                    <input
                                        type="text"
                                        className="admin-form-input"
                                        placeholder={form.name ? slugify(form.name) : 'gerado a partir do nome'}
                                        value={form.slug || ''}
                                        onChange={(e) => setForm({ ...form, slug: e.target.value })}
                                    />
                                    <p className="text-xs text-gray-500 mt-1">
                                        Valor salvo no cadastro do motorista/corrida. Deixe em branco pra gerar a partir do nome. Não muda depois de criado.
                                    </p>
                                </div>
                            )}

                            <div className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    id="cat-active"
                                    checked={form.is_active ?? true}
                                    onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                                />
                                <label htmlFor="cat-active" className="text-sm text-gray-300">
                                    Categoria ativa (aparece pro motorista se cadastrar e pro cliente pedir corrida)
                                </label>
                            </div>

                            <div className="border-t border-gray-700 pt-4">
                                <h4 className="text-sm font-semibold text-white mb-3">Preços</h4>
                                <div className="admin-tabs mb-4">
                                    {(['standard', 'night', 'dawn'] as PricingTier[]).map(tier => (
                                        <button
                                            key={tier}
                                            type="button"
                                            className={`admin-tab ${activeTier === tier ? 'active' : ''}`}
                                            onClick={() => setActiveTier(tier)}
                                        >
                                            {TIER_LABEL[tier]}
                                        </button>
                                    ))}
                                </div>

                                {activeTier !== 'standard' && (
                                    <p className="text-xs text-gray-500 mb-3">
                                        Deixe em branco pra usar o valor padrão nesse horário.
                                    </p>
                                )}

                                <div className="grid grid-cols-2 gap-3">
                                    <div className="admin-form-group">
                                        <label className="admin-form-label">Tarifa Base (R$)</label>
                                        <input
                                            type="number" step="0.01" className="admin-form-input"
                                            value={getTierField(activeTier, 'base_price')}
                                            onChange={(e) => setTierField(activeTier, 'base_price', parseFloat(e.target.value) || 0)}
                                        />
                                    </div>
                                    <div className="admin-form-group">
                                        <label className="admin-form-label">Preço por KM (R$)</label>
                                        <input
                                            type="number" step="0.01" className="admin-form-input"
                                            value={getTierField(activeTier, 'price_km')}
                                            onChange={(e) => setTierField(activeTier, 'price_km', parseFloat(e.target.value) || 0)}
                                        />
                                    </div>
                                    <div className="admin-form-group">
                                        <label className="admin-form-label">Tarifa Mínima (R$)</label>
                                        <input
                                            type="number" step="0.01" className="admin-form-input"
                                            value={getTierField(activeTier, 'price_min_fare')}
                                            onChange={(e) => setTierField(activeTier, 'price_min_fare', parseFloat(e.target.value) || 0)}
                                        />
                                    </div>
                                    <div className="admin-form-group">
                                        <label className="admin-form-label">Preço por Minuto (R$)</label>
                                        <input
                                            type="number" step="0.01" className="admin-form-input"
                                            value={getTierField(activeTier, 'price_per_minute')}
                                            onChange={(e) => setTierField(activeTier, 'price_per_minute', parseFloat(e.target.value) || 0)}
                                        />
                                    </div>
                                </div>

                                {activeTier === 'standard' && (
                                    <div className="admin-form-group mt-3">
                                        <label className="admin-form-label">Distância Inicial (KM) - tarifa base cobre até este valor</label>
                                        <input
                                            type="number" step="0.1" className="admin-form-input"
                                            value={form.start_distance_limit ?? 0}
                                            onChange={(e) => setForm({ ...form, start_distance_limit: parseFloat(e.target.value) || 0 })}
                                        />
                                    </div>
                                )}
                            </div>

                            <div className="flex gap-3 pt-4 border-t border-gray-700">
                                <Button variant="secondary" onClick={closeModal} className="flex-1">
                                    Cancelar
                                </Button>
                                <Button variant="primary" onClick={handleSave} className="flex-1" disabled={saving}>
                                    {saving ? 'Salvando...' : (editingId ? 'Salvar Alterações' : 'Criar Categoria')}
                                </Button>
                            </div>
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );
};

export default AdminCategoriesView;
