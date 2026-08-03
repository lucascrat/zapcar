/**
 * AdminPlansView - Gerenciamento de planos de assinatura
 */

import React, { useState, useEffect } from 'react';
import { Card, Button } from '../../components/shared';
import { supabase } from '../../../services/supabaseClient';

interface Plan {
    id: string;
    title: string;
    days: number;
    price: number;
    description: string;
    created_at: string;
}

// Mensagem para falhas de permissão (RLS). Um bloqueio de RLS pode chegar como
// erro 42501 (INSERT) ou, no caso de UPDATE/DELETE, como sucesso com 0 linhas
// afetadas - por isso os handlers abaixo checam as duas situações.
const RLS_HINT =
    'O banco recusou a operação por falta de permissão (RLS) na tabela driver_plans. ' +
    'É necessário liberar a política de escrita no Supabase.';

// A coluna "id" é TEXT e não tem valor padrão no banco, então precisa ser
// gerada aqui na criação do plano.
const buildPlanId = (title: string): string => {
    const slug = title
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{M}+/gu, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 24);
    return `plan_${slug || 'custom'}_${Math.random().toString(36).slice(2, 7)}`;
};

export const AdminPlansView: React.FC = () => {
    const [plans, setPlans] = useState<Plan[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [formData, setFormData] = useState({
        title: '',
        days: 30,
        price: 0,
        description: ''
    });

    useEffect(() => {
        loadPlans();
    }, []);

    const loadPlans = async () => {
        setIsLoading(true);
        const { data, error } = await supabase
            .from('driver_plans')
            .select('*')
            .order('price', { ascending: true });

        if (error) {
            console.error('[AdminPlansView] Erro ao carregar planos:', error);
            alert('Erro ao carregar planos: ' + error.message);
        } else if (data) {
            setPlans(data as Plan[]);
        }
        setIsLoading(false);
    };

    const handleAddPlan = async () => {
        if (!formData.title.trim() || formData.price <= 0 || formData.days <= 0) {
            alert('Preencha nome, preço e dias de acesso.');
            return;
        }

        setIsSaving(true);
        const { data, error } = await supabase
            .from('driver_plans')
            .insert([{
                id: buildPlanId(formData.title),
                title: formData.title.trim(),
                description: formData.description.trim(),
                price: formData.price,
                days: formData.days
            }])
            .select();
        setIsSaving(false);

        if (error) {
            console.error('[AdminPlansView] Erro ao criar plano:', error);
            alert('Erro ao criar plano: ' + error.message + (error.code === '42501' ? `\n\n${RLS_HINT}` : ''));
            return;
        }

        if (!data || data.length === 0) {
            alert(RLS_HINT);
            return;
        }

        alert('✅ Plano criado com sucesso!');
        setShowAddModal(false);
        setFormData({ title: '', days: 30, price: 0, description: '' });
        loadPlans();
    };

    const handleDeletePlan = async (planId: string) => {
        if (!confirm('Deseja excluir este plano?')) return;

        const { data, error } = await supabase
            .from('driver_plans')
            .delete()
            .eq('id', planId)
            .select();

        if (error) {
            console.error('[AdminPlansView] Erro ao excluir plano:', error);
            alert('Erro ao excluir plano: ' + error.message);
            return;
        }

        if (!data || data.length === 0) {
            alert(RLS_HINT);
            return;
        }

        alert('Plano excluído!');
        loadPlans();
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                        <span className="material-icons">monetization_on</span>
                        Planos de Assinatura
                    </h2>
                    <p className="text-sm text-gray-400 mt-1">Gerencie os planos disponíveis para motoristas</p>
                </div>
                <Button variant="primary" onClick={() => setShowAddModal(true)}>
                    <span className="material-icons" style={{ fontSize: '18px' }}>add</span>
                    Criar Novo Plano
                </Button>
            </div>

            {/* Plans Grid */}
            {isLoading ? (
                <div className="admin-empty-state">
                    <span className="material-icons">hourglass_empty</span>
                    <p className="admin-empty-state-title">Carregando...</p>
                </div>
            ) : plans.length === 0 ? (
                <div className="admin-empty-state">
                    <span className="material-icons">inventory_2</span>
                    <p className="admin-empty-state-title">Nenhum plano cadastrado</p>
                    <p className="admin-empty-state-text">Crie o primeiro plano de assinatura</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {plans.map((plan) => (
                        <Card key={plan.id}>
                            <div className="admin-card-body">
                                <div className="flex items-start justify-between mb-4">
                                    <h3 className="text-xl font-bold text-white">{plan.title}</h3>
                                    <span className="text-xs text-gray-500 font-mono">{plan.days}d</span>
                                </div>

                                <div className="mb-6">
                                    <p className="text-4xl font-bold text-white">
                                        R$ {Number(plan.price).toFixed(2)}
                                    </p>
                                    <p className="text-sm text-gray-400 mt-1">{plan.days} dias de acesso</p>
                                </div>

                                {plan.description && (
                                    <p className="text-sm text-gray-300 mb-6 min-h-[60px]">{plan.description}</p>
                                )}

                                <div className="flex gap-2 pt-4 border-t border-gray-700">
                                    <button
                                        className="admin-detail-action-btn danger"
                                        onClick={() => handleDeletePlan(plan.id)}
                                    >
                                        <span className="material-icons" style={{ fontSize: '16px' }}>delete</span>
                                        Excluir
                                    </button>
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            {/* Add Plan Modal */}
            {showAddModal && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={() => setShowAddModal(false)}>
                    <Card style={{ maxWidth: '500px', width: '90%' }} onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                        <div className="admin-card-header">
                            <h3 className="admin-card-title">Criar Novo Plano</h3>
                            <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-white">
                                <span className="material-icons">close</span>
                            </button>
                        </div>
                        <div className="admin-card-body space-y-4">
                            <div className="admin-form-group">
                                <label className="admin-form-label">Nome do Plano *</label>
                                <input
                                    type="text"
                                    className="admin-form-input"
                                    placeholder="Ex: Plano Mensal"
                                    value={formData.title}
                                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                />
                            </div>

                            <div className="admin-form-row">
                                <div className="admin-form-group">
                                    <label className="admin-form-label">Dias de Acesso *</label>
                                    <input
                                        type="number"
                                        className="admin-form-input"
                                        value={formData.days}
                                        onChange={(e) => setFormData({ ...formData, days: parseInt(e.target.value) || 0 })}
                                    />
                                </div>

                                <div className="admin-form-group">
                                    <label className="admin-form-label">Preço (R$) *</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        className="admin-form-input"
                                        value={formData.price}
                                        onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })}
                                    />
                                </div>
                            </div>

                            <div className="admin-form-group">
                                <label className="admin-form-label">Descrição</label>
                                <textarea
                                    className="admin-form-input"
                                    rows={3}
                                    placeholder="Benefícios do plano..."
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                />
                            </div>

                            <div className="flex gap-3 pt-4 border-t border-gray-700">
                                <Button variant="secondary" onClick={() => setShowAddModal(false)} className="flex-1">
                                    Cancelar
                                </Button>
                                <Button variant="primary" onClick={handleAddPlan} className="flex-1" disabled={isSaving}>
                                    {isSaving ? 'Criando...' : 'Criar Plano'}
                                </Button>
                            </div>
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );
};

export default AdminPlansView;
