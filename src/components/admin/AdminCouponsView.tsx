/**
 * AdminCouponsView - Gerenciamento de cupons de desconto
 */

import React, { useState, useEffect, useRef } from 'react';
import { Card, Button } from '../../components/shared';
import { fetchAllCoupons, deleteCoupon, uploadFile } from '../../../services/supabaseClient';
import { supabase } from '../../../services/supabaseClient';
import type { Coupon } from '../../../types';

export const AdminCouponsView: React.FC = () => {
    const [coupons, setCoupons] = useState<Coupon[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [saving, setSaving] = useState(false);
    const imageInputRef = useRef<HTMLInputElement>(null);
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string>('');
    const [formData, setFormData] = useState({
        code: '',
        discount_value: 0,
        vehicle_type: 'all' as 'car' | 'motorcycle' | 'all',
        total_quantity: 100,
        image_url: ''
    });

    useEffect(() => {
        loadCoupons();
    }, []);

    const loadCoupons = async () => {
        setIsLoading(true);
        try {
            const data = await fetchAllCoupons();
            setCoupons(data);
        } catch (err) {
            console.error('Erro ao carregar cupons:', err);
        }
        setIsLoading(false);
    };

    const resetForm = () => {
        setFormData({ code: '', discount_value: 0, vehicle_type: 'all', total_quantity: 100, image_url: '' });
        setImageFile(null);
        setImagePreview('');
        if (imageInputRef.current) imageInputRef.current.value = '';
    };

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setImageFile(file);
            const url = URL.createObjectURL(file);
            setImagePreview(url);
        }
    };

    const handleAddCoupon = async () => {
        if (formData.discount_value <= 0) {
            alert('Informe o valor do desconto');
            return;
        }
        if (formData.total_quantity <= 0) {
            alert('Informe a quantidade total');
            return;
        }

        setSaving(true);
        try {
            // Upload image first if provided
            let imageUrl = '';
            if (imageFile) {
                try {
                    const uploadedUrl = await uploadFile(imageFile, 'images');
                    if (uploadedUrl) {
                        imageUrl = uploadedUrl;
                    } else {
                        console.warn('Upload de imagem falhou, continuando sem imagem');
                    }
                } catch (uploadErr) {
                    console.warn('Erro no upload da imagem:', uploadErr);
                }
            }

            // Insert coupon directly to get the real error
            const { data, error } = await supabase
                .from('coupons')
                .insert({
                    code: formData.code ? formData.code.toUpperCase() : null,
                    discount_value: formData.discount_value,
                    vehicle_type: formData.vehicle_type,
                    total_quantity: formData.total_quantity,
                    used_quantity: 0,
                    is_active: true,
                    image_url: imageUrl
                })
                .select()
                .single();

            if (error) {
                console.error('Erro Supabase ao criar cupom:', error);
                alert('Erro ao cadastrar cupom: ' + error.message + (error.details ? '\nDetalhes: ' + error.details : '') + (error.hint ? '\nDica: ' + error.hint : ''));
            } else {
                alert('Cupom criado com sucesso!');
                setShowAddModal(false);
                resetForm();
                loadCoupons();
            }
        } catch (err: any) {
            console.error('Exceção ao criar cupom:', err);
            alert('Erro ao cadastrar cupom: ' + (err?.message || String(err)));
        }
        setSaving(false);
    };

    const handleToggleStatus = async (couponId: string, currentStatus: boolean) => {
        const { error } = await supabase
            .from('coupons')
            .update({ is_active: !currentStatus })
            .eq('id', couponId);

        if (error) {
            alert('Erro ao atualizar status: ' + error.message);
        }
        loadCoupons();
    };

    const handleDeleteCoupon = async (couponId: string) => {
        if (!confirm('Deseja excluir este cupom?')) return;

        const success = await deleteCoupon(couponId);
        if (!success) {
            alert('Erro ao excluir cupom');
        }
        loadCoupons();
    };

    const getVehicleLabel = (type: string) => {
        switch (type) {
            case 'car': return 'Carro';
            case 'motorcycle': return 'Moto';
            case 'all': return 'Todos';
            default: return type;
        }
    };

    const getVehicleIcon = (type: string) => {
        switch (type) {
            case 'car': return 'directions_car';
            case 'motorcycle': return 'two_wheeler';
            default: return 'local_offer';
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                        <span className="material-icons">confirmation_number</span>
                        Cupons de Desconto
                    </h2>
                    <p className="text-sm text-gray-400 mt-1">Gerencie cupons promocionais</p>
                </div>
                <Button variant="primary" onClick={() => setShowAddModal(true)}>
                    <span className="material-icons" style={{ fontSize: '18px' }}>add</span>
                    Criar Cupom
                </Button>
            </div>

            {isLoading ? (
                <div className="admin-empty-state">
                    <span className="material-icons">hourglass_empty</span>
                    <p className="admin-empty-state-title">Carregando...</p>
                </div>
            ) : (
                <Card>
                    <div className="admin-card-body no-padding">
                        {coupons.length === 0 ? (
                            <div className="admin-empty-state">
                                <span className="material-icons">confirmation_number</span>
                                <p className="admin-empty-state-title">Nenhum cupom cadastrado</p>
                            </div>
                        ) : (
                            <table className="admin-table">
                                <thead>
                                    <tr>
                                        <th>Imagem</th>
                                        <th>Código</th>
                                        <th>Desconto</th>
                                        <th>Veículo</th>
                                        <th>Usos</th>
                                        <th>Status</th>
                                        <th>Criado em</th>
                                        <th>Ações</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {coupons.map((coupon) => (
                                        <tr key={coupon.id}>
                                            <td>
                                                {coupon.image_url ? (
                                                    <img
                                                        src={coupon.image_url}
                                                        alt="Cupom"
                                                        style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover' }}
                                                    />
                                                ) : (
                                                    <span className="material-icons" style={{ color: '#00a884', fontSize: 28 }}>confirmation_number</span>
                                                )}
                                            </td>
                                            <td>
                                                <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '14px', color: '#00a884' }}>
                                                    {(coupon as any).code || '—'}
                                                </span>
                                            </td>
                                            <td>
                                                <span style={{ fontWeight: 700, fontSize: '16px', color: '#00a884' }}>
                                                    R$ {coupon.discount_value.toFixed(2)}
                                                </span>
                                            </td>
                                            <td>
                                                <span className="flex items-center gap-1">
                                                    <span className="material-icons" style={{ fontSize: 18 }}>{getVehicleIcon(coupon.vehicle_type)}</span>
                                                    {getVehicleLabel(coupon.vehicle_type)}
                                                </span>
                                            </td>
                                            <td>
                                                <span className={coupon.used_quantity >= coupon.total_quantity ? 'text-red-400' : 'text-gray-300'}>
                                                    {coupon.used_quantity} / {coupon.total_quantity}
                                                </span>
                                            </td>
                                            <td>
                                                <span className={`admin-status-badge ${coupon.is_active ? 'online' : 'offline'}`}>
                                                    {coupon.is_active ? 'Ativo' : 'Inativo'}
                                                </span>
                                            </td>
                                            <td style={{ fontSize: '12px', color: 'var(--color-text-tertiary)' }}>
                                                {new Date(coupon.created_at).toLocaleDateString('pt-BR')}
                                            </td>
                                            <td>
                                                <div className="admin-quick-actions">
                                                    <button
                                                        className="admin-quick-action-btn"
                                                        onClick={() => handleToggleStatus(coupon.id, coupon.is_active)}
                                                        title={coupon.is_active ? 'Desativar' : 'Ativar'}
                                                    >
                                                        <span className="material-icons">{coupon.is_active ? 'visibility_off' : 'visibility'}</span>
                                                    </button>
                                                    <button
                                                        className="admin-quick-action-btn danger"
                                                        onClick={() => handleDeleteCoupon(coupon.id)}
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

            {showAddModal && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={() => { setShowAddModal(false); resetForm(); }}>
                    <Card style={{ maxWidth: '500px', width: '90%' }} onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                        <div className="admin-card-header">
                            <h3 className="admin-card-title">Criar Novo Cupom</h3>
                            <button onClick={() => { setShowAddModal(false); resetForm(); }} className="text-gray-400 hover:text-white">
                                <span className="material-icons">close</span>
                            </button>
                        </div>
                        <div className="admin-card-body space-y-4">
                            <div className="admin-form-group">
                                <label className="admin-form-label">Código do Cupom</label>
                                <input
                                    type="text"
                                    className="admin-form-input"
                                    placeholder="Ex: PROMO10 (opcional)"
                                    value={formData.code}
                                    onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                                    style={{ textTransform: 'uppercase' }}
                                />
                            </div>

                            <div className="admin-form-group">
                                <label className="admin-form-label">Imagem do Cupom</label>
                                <input
                                    ref={imageInputRef}
                                    type="file"
                                    accept="image/*"
                                    className="admin-form-input"
                                    onChange={handleImageChange}
                                />
                                {imagePreview && (
                                    <img src={imagePreview} alt="Preview" style={{ width: 80, height: 80, borderRadius: 8, objectFit: 'cover', marginTop: 8 }} />
                                )}
                            </div>

                            <div className="admin-form-row">
                                <div className="admin-form-group">
                                    <label className="admin-form-label">Valor do Desconto (R$) *</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0.01"
                                        className="admin-form-input"
                                        placeholder="Ex: 5.00"
                                        value={formData.discount_value || ''}
                                        onChange={(e) => setFormData({ ...formData, discount_value: parseFloat(e.target.value) || 0 })}
                                    />
                                </div>

                                <div className="admin-form-group">
                                    <label className="admin-form-label">Tipo de Veículo</label>
                                    <select
                                        className="admin-form-input"
                                        value={formData.vehicle_type}
                                        onChange={(e) => setFormData({ ...formData, vehicle_type: e.target.value as 'car' | 'motorcycle' | 'all' })}
                                    >
                                        <option value="all">Todos</option>
                                        <option value="car">Carro</option>
                                        <option value="motorcycle">Moto</option>
                                    </select>
                                </div>
                            </div>

                            <div className="admin-form-group">
                                <label className="admin-form-label">Quantidade Total *</label>
                                <input
                                    type="number"
                                    min="1"
                                    className="admin-form-input"
                                    placeholder="Ex: 100"
                                    value={formData.total_quantity || ''}
                                    onChange={(e) => setFormData({ ...formData, total_quantity: parseInt(e.target.value) || 0 })}
                                />
                            </div>

                            <div className="flex gap-3 pt-4 border-t border-gray-700">
                                <Button variant="secondary" onClick={() => { setShowAddModal(false); resetForm(); }} className="flex-1">
                                    Cancelar
                                </Button>
                                <Button variant="primary" onClick={handleAddCoupon} className="flex-1" disabled={saving}>
                                    {saving ? 'Criando...' : 'Criar Cupom'}
                                </Button>
                            </div>
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );
};

export default AdminCouponsView;
