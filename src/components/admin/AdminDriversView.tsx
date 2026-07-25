/**
 * AdminDriversView - View de motoristas para desktop
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { UserProfile, DriverStatus } from '../../../types';
import { checkSubscriptionStatus } from '../../../services/paymentService';
import { useBreakpoint } from '../../hooks/useMediaQuery';
import { Modal } from '../shared/Modal';
import { Badge, Button, Input } from '../shared';
import { Card } from '../shared';
import { useToast } from '../shared/Toast';
import {
    updateUserProfile,
    updateDriverVehicle,
    addSubscriptionDays,
    updateDriverPassword
} from '../../../services/supabaseClient';
import { getMapProviderPromise } from '../../../services/googleMapsLoader';
import {
    createMap, addNavigationControl, addMarker, removeMarker, fitBounds, panTo, setZoom, onMapReady,
    MapHandle, MarkerHandle,
} from '../../../services/mapAdapter';

interface AdminDriversViewProps {
    drivers: (UserProfile & { monthly_rides?: number })[];
    selectedDriver: UserProfile | null;
    onSelectDriver: (driver: UserProfile | null) => void;
    searchTerm?: string;
    onSearchChange?: (value: string) => void;
    filterStatus: DriverStatus | 'all' | 'pending';
    onFilterChange: (filter: DriverStatus | 'all' | 'pending') => void;
    isLoading?: boolean;
    onApprove?: (driver: UserProfile) => void;
    onDelete?: (driver: UserProfile) => void;
    onViewDetails?: (driver: UserProfile) => void;
    onOpenChat?: (driver: UserProfile) => void;
    onRefresh?: () => void;
}

export const AdminDriversView: React.FC<AdminDriversViewProps> = ({
    drivers,
    selectedDriver,
    onSelectDriver,
    searchTerm = '',
    onSearchChange,
    filterStatus,
    onFilterChange,
    isLoading = false,
    onApprove,
    onDelete,
    onViewDetails,
    onOpenChat,
    onRefresh,
}) => {
    // Validate props
    if (!drivers) {
        console.error('[AdminDriversView] drivers prop is undefined or null');
        return (
            <div className="admin-empty-state">
                <span className="material-icons">error</span>
                <p className="admin-empty-state-title">Erro ao carregar motoristas</p>
                <p className="admin-empty-state-text">A lista de motoristas não foi fornecida corretamente.</p>
            </div>
        );
    }

    if (!onFilterChange) {
        console.error('[AdminDriversView] onFilterChange prop is undefined');
    }

    const [activeDetailTab, setActiveDetailTab] = useState<'info' | 'vehicle' | 'subscription'>('info');
    const { isMobile } = useBreakpoint();
    const toast = useToast();

    // Edit States
    const [isEditing, setIsEditing] = useState(false);
    const [isAddingDays, setIsAddingDays] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [editData, setEditData] = useState<Partial<UserProfile>>({});
    const [addDaysValue, setAddDaysValue] = useState(30);
    const [newPass, setNewPass] = useState('');

    const filteredDrivers = drivers.filter(driver => {
        // Filter by search
        if (searchTerm) {
            const query = searchTerm.toLowerCase();
            const matchesSearch =
                driver.username.toLowerCase().includes(query) ||
                driver.phone?.toLowerCase().includes(query) ||
                driver.vehicle_plate?.toLowerCase().includes(query);
            if (!matchesSearch) return false;
        }

        // Filter by status
        if (filterStatus === 'pending') {
            return !driver.is_approved;
        }
        if (filterStatus !== 'all') {
            return driver.status === filterStatus;
        }
        return true;
    });



    const getStatusBadge = (driver: UserProfile) => {
        if (!driver.is_approved) {
            return <Badge variant="warning">Pendente</Badge>;
        }

        switch (driver.status) {
            case DriverStatus.AVAILABLE:
                return <Badge variant="success">Online</Badge>;
            case DriverStatus.BUSY:
                return <Badge variant="info">Ocupado</Badge>;
            default:
                return <Badge variant="secondary">Offline</Badge>;
        }
    };

    const getSubscriptionBadge = (driver: UserProfile) => {
        const sub = checkSubscriptionStatus(driver.subscription_expires_at);
        if (!sub.isValid) {
            return <Badge variant="danger">Expirado</Badge>;
        }
        if (sub.daysLeft <= 7) {
            return <Badge variant="warning">{sub.daysLeft}d restantes</Badge>;
        }
        return <Badge variant="success">Ativo</Badge>;
    };

    const formatDate = (date?: string) => {
        if (!date) return '-';
        return new Date(date).toLocaleDateString('pt-BR');
    };

    const handleStartEdit = () => {
        if (!selectedDriver) return;
        setEditData({
            username: selectedDriver.username,
            email: selectedDriver.email,
            phone: selectedDriver.phone,
            whatsapp: selectedDriver.whatsapp,
            cpf: selectedDriver.cpf,
            pix_key: selectedDriver.pix_key,
            vehicle_model: selectedDriver.vehicle_model,
            vehicle_plate: selectedDriver.vehicle_plate,
            vehicle_color: selectedDriver.vehicle_color,
            vehicle_type: selectedDriver.vehicle_type,
        });
        setNewPass('');
        setIsEditing(true);
    };

    const handleSaveEdit = async () => {
        if (!selectedDriver) return;
        setIsSaving(true);
        try {
            // Update Profile
            await updateUserProfile(selectedDriver.id, {
                username: editData.username,
                email: editData.email,
                phone: editData.phone,
                whatsapp: editData.whatsapp,
                cpf: editData.cpf,
                pix_key: editData.pix_key,
            });

            // Update Vehicle
            await updateDriverVehicle(selectedDriver.id, {
                vehicle_model: editData.vehicle_model,
                vehicle_plate: editData.vehicle_plate,
                vehicle_color: editData.vehicle_color,
                vehicle_type: editData.vehicle_type,
            });

            // Update Password if provided
            if (newPass.trim()) {
                await updateDriverPassword(selectedDriver.id, newPass.trim());
            }

            toast.success('Dados atualizados com sucesso!');
            setIsEditing(false);
            if (onRefresh) onRefresh();
            // Update local selected driver
            onSelectDriver({ ...selectedDriver, ...editData });
        } catch (error) {
            console.error("Error updating driver:", error);
            toast.error('Erro ao atualizar dados.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleConfirmAddDays = async () => {
        if (!selectedDriver) return;
        setIsSaving(true);
        try {
            const success = await addSubscriptionDays(selectedDriver.id, addDaysValue);
            if (success) {
                toast.success(`${addDaysValue} dias adicionados com sucesso!`);
                setIsAddingDays(false);
                if (onRefresh) onRefresh();

                // Refresh local selected driver subscription
                const newExpiry = new Date(selectedDriver.subscription_expires_at || Date.now());
                newExpiry.setDate(newExpiry.getDate() + addDaysValue);
                onSelectDriver({ ...selectedDriver, subscription_expires_at: newExpiry.toISOString() });
            } else {
                toast.error('Erro ao adicionar dias.');
            }
        } catch (error) {
            console.error("Error adding days:", error);
            toast.error('Erro ao processar solicitação.');
        } finally {
            setIsSaving(false);
        }
    };

    // ============ MAPA DE MOTORISTAS ONLINE ============
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapInstanceRef = useRef<MapHandle | null>(null);
    const markersRef = useRef<MarkerHandle[]>([]);
    const [showMap, setShowMap] = useState(true);
    // Incrementa quando o mapa termina de ser criado (async, pode depender
    // do carregamento do script do Google) — o efeito de sincronizar
    // marcadores usa isso pra rodar de novo assim que o mapa fica pronto,
    // em vez de depender só da identidade instável de updateMapMarkers.
    const [mapReadyTick, setMapReadyTick] = useState(0);

    const CAR_SVG = '<svg xmlns="http://www.w3.org/2000/svg" height="36" viewBox="0 0 24 24" width="36"><path d="M0 0h24v24H0z" fill="none"/><path fill="#25D366" stroke="#111b21" stroke-width="0.5" d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/></svg>';
    const MOTO_SVG = '<svg xmlns="http://www.w3.org/2000/svg" height="36" viewBox="0 0 24 24" width="36"><path d="M0 0h24v24H0z" fill="none"/><path fill="#FFA500" stroke="#111b21" stroke-width="0.5" d="M19 7c0-1.1-.9-2-2-2h-3l-1.4-1.4C12.2 3.2 11.7 3 11.2 3H8C6.9 3 6 3.9 6 5v2H4c-1.1 0-2 .9-2 2v4h2c0 1.66 1.34 3 3 3s3-1.34 3-3h4c0 1.66 1.34 3 3 3s3-1.34 3-3h2v-4l-3-3zM7 14c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm10 0c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z"/></svg>';

    const onlineDriversWithLocation = drivers.filter(
        d => d.status === DriverStatus.AVAILABLE && d.lat && d.lng
    );

    const updateMapMarkers = useCallback(() => {
        const handle = mapInstanceRef.current;
        if (!handle) return;

        // Clear existing markers
        markersRef.current.forEach(m => removeMarker(m));
        markersRef.current = [];

        const positions: { lat: number; lng: number }[] = [];

        onlineDriversWithLocation.forEach(driver => {
            if (!driver.lat || !driver.lng) return;

            positions.push({ lat: driver.lat, lng: driver.lng });

            const isMoto = driver.vehicle_type === 'motorcycle';
            const svgIcon = isMoto ? MOTO_SVG : CAR_SVG;

            const el = document.createElement('div');
            el.innerHTML = svgIcon;
            el.style.cursor = 'pointer';

            const content = `
                <div style="background:#1a2332;color:#fff;padding:12px 16px;border-radius:10px;font-family:system-ui;min-width:180px;">
                    <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
                        ${driver.avatar_url
                    ? `<img src="${driver.avatar_url}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;border:2px solid #00a884;" />`
                    : `<div style="width:36px;height:36px;border-radius:50%;background:#00a884;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;">${driver.username?.charAt(0).toUpperCase()}</div>`
                }
                        <div>
                            <div style="font-weight:700;font-size:14px;">${driver.username}</div>
                            <div style="font-size:11px;color:#8696a0;">${driver.phone || ''}</div>
                        </div>
                    </div>
                    <div style="display:flex;gap:8px;align-items:center;font-size:12px;color:#8696a0;">
                        <span style="color:${isMoto ? '#FFA500' : '#25D366'};font-weight:600;">
                            ${isMoto ? '🏍️' : '🚗'} ${driver.vehicle_model || (isMoto ? 'Moto' : 'Carro')}
                        </span>
                        <span style="background:#111b21;padding:2px 8px;border-radius:4px;font-family:monospace;font-weight:700;color:#00a884;">
                            ${driver.vehicle_plate || '---'}
                        </span>
                    </div>
                </div>
            `;

            const marker = addMarker(handle, {
                lat: driver.lat, lng: driver.lng, element: el, popupHtml: content,
            });
            markersRef.current.push(marker);
        });

        if (positions.length > 1) {
            fitBounds(handle, positions, 60);
        } else if (positions.length === 1) {
            panTo(handle, positions[0]);
            setZoom(handle, 14);
        }
    }, [onlineDriversWithLocation]);

    // Ref sempre atualizada, para o efeito de inicialização (que roda uma
    // única vez) não precisar depender de updateMapMarkers — essa função
    // muda de identidade a cada render (onlineDriversWithLocation é um
    // array novo sempre), o que fazia o efeito reexecutar repetidamente e
    // criar mais de uma instância de mapa correndo pro mesmo container.
    const updateMapMarkersRef = useRef(updateMapMarkers);
    updateMapMarkersRef.current = updateMapMarkers;

    // Initialize map
    useEffect(() => {
        if (!mapContainerRef.current || !showMap || mapInstanceRef.current) return;
        let cancelled = false;

        getMapProviderPromise().then((provider) => {
            if (cancelled || !mapContainerRef.current || mapInstanceRef.current) return;

            // Default center (Brazil)
            const defaultCenter = { lat: -5.08, lng: -42.8 };

            const handle = createMap(provider, mapContainerRef.current, {
                center: defaultCenter,
                zoom: 13,
                style: 'dark',
            });
            addNavigationControl(handle);
            mapInstanceRef.current = handle;
            setMapReadyTick(t => t + 1);

            onMapReady(handle, () => updateMapMarkersRef.current());
        });

        return () => { cancelled = true; };
    }, [showMap]);

    // Update markers when drivers change (ou quando o mapa fica pronto)
    useEffect(() => {
        if (mapInstanceRef.current) {
            updateMapMarkers();
        }
    }, [drivers, updateMapMarkers, mapReadyTick]);

    return (
        <div className={`admin-data-grid ${selectedDriver ? 'details-mode' : 'list-mode'}`}>
            {!selectedDriver ? (
                /* Main Table Screen */
                <>
                {/* Mapa de Motoristas Online */}
                <div style={{ marginBottom: '20px' }}>
                    <Card>
                        <div className="admin-card-header" style={{ cursor: 'pointer' }} onClick={() => setShowMap(!showMap)}>
                            <h3 className="admin-card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span className="material-icons" style={{ color: '#00a884' }}>map</span>
                                Motoristas Online no Mapa ({onlineDriversWithLocation.length})
                            </h3>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#8696a0' }}>
                                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#25D366', display: 'inline-block' }} />
                                    Carros
                                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#FFA500', display: 'inline-block', marginLeft: 8 }} />
                                    Motos
                                </div>
                                <span className="material-icons" style={{ color: '#8696a0', transition: 'transform 0.2s', transform: showMap ? 'rotate(0deg)' : 'rotate(-90deg)' }}>
                                    expand_more
                                </span>
                            </div>
                        </div>
                        {showMap && (
                            <div
                                ref={mapContainerRef}
                                style={{
                                    width: '100%',
                                    height: '420px',
                                    borderRadius: '0 0 12px 12px',
                                    overflow: 'hidden',
                                }}
                            />
                        )}
                    </Card>
                </div>

                <div className="admin-card">
                    <div className="admin-card-header">
                        <h3 className="admin-card-title">
                            Motoristas ({filteredDrivers.length})
                        </h3>
                        <div className="admin-tabs" style={{ marginBottom: 0, maxWidth: '360px' }}>
                            <button
                                type="button"
                                className={`admin-tab ${filterStatus === 'all' ? 'active' : ''}`}
                                onClick={() => onFilterChange('all')}
                            >
                                Todos
                            </button>
                            <button
                                type="button"
                                className={`admin-tab ${filterStatus === 'pending' ? 'active' : ''}`}
                                onClick={() => onFilterChange('pending')}
                            >
                                Pendentes
                            </button>
                            <button
                                type="button"
                                className={`admin-tab ${filterStatus === DriverStatus.AVAILABLE ? 'active' : ''}`}
                                onClick={() => onFilterChange(DriverStatus.AVAILABLE)}
                            >
                                Online
                            </button>
                        </div>
                    </div>

                    <div className="admin-card-body no-padding">
                        {isLoading ? (
                            <div className="admin-empty-state">
                                <span className="material-icons">hourglass_empty</span>
                                <p className="admin-empty-state-title">Carregando...</p>
                            </div>
                        ) : filteredDrivers.length === 0 ? (
                            <div className="admin-empty-state">
                                <span className="material-icons">person_off</span>
                                <p className="admin-empty-state-title">Nenhum motorista encontrado</p>
                                <p className="admin-empty-state-text">
                                    {drivers.length === 0
                                        ? 'Não há motoristas cadastrados no sistema.'
                                        : `Filtro: ${filterStatus} | Total de motoristas: ${drivers.length} | Busca: "${searchTerm || 'nenhuma'}"`
                                    }
                                </p>
                                {drivers.length > 0 && (
                                    <p className="admin-empty-state-text" style={{ marginTop: '8px', fontSize: '12px', opacity: 0.7 }}>
                                        Tente alterar os filtros ou limpar a busca
                                    </p>
                                )}
                            </div>
                        ) : isMobile ? (
                            /* Mobile Card List */
                            <div className="admin-mobile-cards">
                                {filteredDrivers.map((driver) => (
                                    <div
                                        key={driver.id}
                                        className="admin-mobile-card"
                                        onClick={() => onSelectDriver(driver)}
                                    >
                                        <div className="admin-mobile-card-header">
                                            <div className="admin-driver-row">
                                                {driver.avatar_url ? (
                                                    <img src={driver.avatar_url} alt="" className="admin-driver-avatar" />
                                                ) : (
                                                    <div className="admin-driver-avatar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 600 }}>
                                                        {driver.username ? driver.username[0].toUpperCase() : 'U'}
                                                    </div>
                                                )}
                                                <div className="admin-driver-info">
                                                    <p className="admin-driver-name">{driver.username}</p>
                                                    <p className="admin-driver-vehicle">{driver.phone || 'Sem telefone'}</p>
                                                </div>
                                            </div>
                                            <div className="admin-mobile-card-badges">
                                                {getStatusBadge(driver)}
                                                {getSubscriptionBadge(driver)}
                                            </div>
                                        </div>

                                        <div className="admin-mobile-card-details">
                                            <div className="admin-mobile-detail-item">
                                                <span className="material-icons">directions_car</span>
                                                <span>{driver.vehicle_model || '-'} ({driver.vehicle_plate || '-'})</span>
                                            </div>
                                            <div className="admin-mobile-detail-item">
                                                <span className="material-icons">route</span>
                                                <span>{driver.monthly_rides || 0} corridas/mês</span>
                                            </div>
                                        </div>

                                        <div className="admin-mobile-card-actions" onClick={(e) => e.stopPropagation()}>
                                            {!driver.is_approved && onApprove && (
                                                <Button
                                                    size="sm"
                                                    variant="success"
                                                    onClick={() => onApprove(driver)}
                                                    className="flex-1"
                                                >
                                                    <span className="material-icons">check</span> Aprovar
                                                </Button>
                                            )}
                                            <Button
                                                size="sm"
                                                variant="secondary"
                                                onClick={() => onSelectDriver(driver)}
                                                className="flex-1"
                                            >
                                                <span className="material-icons">visibility</span> Detalhes
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="danger"
                                                onClick={() => onDelete?.(driver)}
                                                className="p-2"
                                            >
                                                <span className="material-icons">delete</span>
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            /* Desktop Table View */
                            <div className="admin-table-wrapper">
                                <table className="admin-table">
                                    <thead>
                                        <tr>
                                            <th>Motorista</th>
                                            <th>Veículo</th>
                                            <th>Placa</th>
                                            <th>Status</th>
                                            <th>Corridas</th>
                                            <th>Assinatura</th>
                                            <th>Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredDrivers.map((driver) => (
                                            <tr
                                                key={driver.id}
                                                onClick={(e) => { e.preventDefault(); onSelectDriver(driver); }}
                                                style={{ cursor: 'pointer' }}
                                            >
                                                <td>
                                                    <div className="admin-driver-row">
                                                        {driver.avatar_url ? (
                                                            <img src={driver.avatar_url} alt="" className="admin-driver-avatar" />
                                                        ) : (
                                                            <div className="admin-driver-avatar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 600 }}>
                                                                {driver.username ? driver.username[0].toUpperCase() : 'U'}
                                                            </div>
                                                        )}
                                                        <div className="admin-driver-info">
                                                            <p className="admin-driver-name">{driver.username}</p>
                                                            <p className="admin-driver-vehicle">{driver.phone || 'Sem telefone'}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td>
                                                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <span className="material-icons" style={{ fontSize: '16px', color: 'var(--color-text-tertiary)' }}>
                                                            {driver.vehicle_type === 'motorcycle' ? 'two_wheeler' : 'directions_car'}
                                                        </span>
                                                        {driver.vehicle_model || '-'}
                                                    </span>
                                                </td>
                                                <td style={{ fontFamily: 'monospace', fontSize: '13px' }}>
                                                    {driver.vehicle_plate || '-'}
                                                </td>
                                                <td>{getStatusBadge(driver)}</td>
                                                <td style={{ fontWeight: 600 }}>{driver.monthly_rides || 0}</td>
                                                <td>{getSubscriptionBadge(driver)}</td>
                                                <td>
                                                    <div className="admin-quick-actions">
                                                        {!driver.is_approved && onApprove && (
                                                            <button
                                                                type="button"
                                                                className="admin-quick-action-btn"
                                                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onApprove(driver); }}
                                                                title="Aprovar"
                                                            >
                                                                <span className="material-icons">check</span>
                                                            </button>
                                                        )}
                                                        <button
                                                            type="button"
                                                            className="admin-quick-action-btn"
                                                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onSelectDriver(driver); }}
                                                            title="Ver detalhes"
                                                        >
                                                            <span className="material-icons">visibility</span>
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="admin-quick-action-btn danger"
                                                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete?.(driver); }}
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
                            </div>
                        )}
                    </div>
                </div>
                </>
            ) : (
                /* Detail Screen (Solo View) */
                <div className="admin-card admin-detail-panel solo-view">
                    <div className="admin-detail-header">
                        <button
                            className="admin-detail-back-btn"
                            onClick={() => onSelectDriver(null as any)}
                        >
                            <span className="material-icons">arrow_back</span>
                            Voltar para a lista
                        </button>

                        <div className="admin-detail-top-info">
                            {selectedDriver.avatar_url ? (
                                <img src={selectedDriver.avatar_url} alt="" className="admin-detail-avatar" />
                            ) : (
                                <div className="admin-detail-avatar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 600, fontSize: '32px', background: 'var(--color-surface)' }}>
                                    {selectedDriver.username ? selectedDriver.username[0].toUpperCase() : 'U'}
                                </div>
                            )}
                            <div className="admin-detail-name-group">
                                <h3 className="admin-detail-name">{selectedDriver.username}</h3>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <p className="admin-detail-id">ID: {selectedDriver.id.slice(0, 8)}</p>
                                    {getStatusBadge(selectedDriver)}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="admin-detail-stats">
                        <div className="admin-detail-stat">
                            <p className="admin-detail-stat-value">{(selectedDriver as any).monthly_rides || 0}</p>
                            <p className="admin-detail-stat-label">Corridas/Mês</p>
                        </div>
                        <div className="admin-detail-stat">
                            <p className="admin-detail-stat-value">{selectedDriver.wallet_coins || 0}</p>
                            <p className="admin-detail-stat-label">Moedas</p>
                        </div>
                        <div className="admin-detail-stat">
                            <p className="admin-detail-stat-value">
                                {checkSubscriptionStatus(selectedDriver.subscription_expires_at).daysLeft || 0}
                            </p>
                            <p className="admin-detail-stat-label">Dias Plano</p>
                        </div>
                    </div>

                    <div className="admin-tabs" style={{ margin: '16px 20px' }}>
                        <button
                            type="button"
                            className={`admin-tab ${activeDetailTab === 'info' ? 'active' : ''}`}
                            onClick={() => setActiveDetailTab('info')}
                        >
                            Informações
                        </button>
                        <button
                            type="button"
                            className={`admin-tab ${activeDetailTab === 'vehicle' ? 'active' : ''}`}
                            onClick={() => setActiveDetailTab('vehicle')}
                        >
                            Veículo
                        </button>
                        <button
                            type="button"
                            className={`admin-tab ${activeDetailTab === 'subscription' ? 'active' : ''}`}
                            onClick={() => setActiveDetailTab('subscription')}
                        >
                            Assinatura
                        </button>
                    </div>

                    <div className="admin-detail-content">
                        {activeDetailTab === 'info' && (
                            <div className="admin-detail-section">
                                <h4 className="admin-detail-section-title">Dados Pessoais</h4>
                                <div className="admin-grid-details">
                                    <div className="admin-detail-row">
                                        <span className="admin-detail-row-label">Telefone</span>
                                        <span className="admin-detail-row-value">{selectedDriver.phone || '-'}</span>
                                    </div>
                                    <div className="admin-detail-row">
                                        <span className="admin-detail-row-label">WhatsApp</span>
                                        <span className="admin-detail-row-value">{selectedDriver.whatsapp || '-'}</span>
                                    </div>
                                    <div className="admin-detail-row">
                                        <span className="admin-detail-row-label">Email</span>
                                        <span className="admin-detail-row-value">{selectedDriver.email || '-'}</span>
                                    </div>
                                    <div className="admin-detail-row">
                                        <span className="admin-detail-row-label">CPF</span>
                                        <span className="admin-detail-row-value">{selectedDriver.cpf || '-'}</span>
                                    </div>
                                    <div className="admin-detail-row">
                                        <span className="admin-detail-row-label">PIX</span>
                                        <span className="admin-detail-row-value">{selectedDriver.pix_key || '-'}</span>
                                    </div>
                                    <div className="admin-detail-row">
                                        <span className="admin-detail-row-label">Cadastro</span>
                                        <span className="admin-detail-row-value">{formatDate(selectedDriver.created_at)}</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeDetailTab === 'vehicle' && (
                            <div className="admin-detail-section">
                                <h4 className="admin-detail-section-title">Dados do Veículo</h4>
                                <div className="admin-grid-details">
                                    <div className="admin-detail-row">
                                        <span className="admin-detail-row-label">Tipo</span>
                                        <span className="admin-detail-row-value">
                                            {selectedDriver.vehicle_type === 'motorcycle' ? '🏍️ Moto' : '🚗 Carro'}
                                        </span>
                                    </div>
                                    <div className="admin-detail-row">
                                        <span className="admin-detail-row-label">Modelo</span>
                                        <span className="admin-detail-row-value">{selectedDriver.vehicle_model || '-'}</span>
                                    </div>
                                    <div className="admin-detail-row">
                                        <span className="admin-detail-row-label">Placa</span>
                                        <span className="admin-detail-row-value" style={{ fontFamily: 'monospace' }}>
                                            {selectedDriver.vehicle_plate || '-'}
                                        </span>
                                    </div>
                                    <div className="admin-detail-row">
                                        <span className="admin-detail-row-label">Cor</span>
                                        <span className="admin-detail-row-value">{selectedDriver.vehicle_color || '-'}</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeDetailTab === 'subscription' && (
                            <div className="admin-detail-section">
                                <h4 className="admin-detail-section-title">Assinatura</h4>
                                <div className="admin-grid-details">
                                    <div className="admin-detail-row">
                                        <span className="admin-detail-row-label">Status</span>
                                        {getSubscriptionBadge(selectedDriver)}
                                    </div>
                                    <div className="admin-detail-row">
                                        <span className="admin-detail-row-label">Expira em</span>
                                        <span className="admin-detail-row-value">
                                            {formatDate(selectedDriver.subscription_expires_at)}
                                        </span>
                                    </div>
                                    <div className="admin-detail-row">
                                        <span className="admin-detail-row-label">Dias restantes</span>
                                        <span className="admin-detail-row-value">
                                            {checkSubscriptionStatus(selectedDriver.subscription_expires_at).daysLeft || 0}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex flex-wrap gap-3 mt-6">
                        {!selectedDriver.is_approved && onApprove && (
                            <Button
                                variant="primary"
                                onClick={() => onApprove(selectedDriver)}
                            >
                                <span className="material-icons mr-2">check_circle</span>
                                Aprovar Motorista
                            </Button>
                        )}
                        <Button
                            variant="secondary"
                            onClick={handleStartEdit}
                        >
                            <span className="material-icons mr-2">edit</span>
                            Editar Dados
                        </Button>
                        <Button
                            variant="secondary"
                            onClick={() => setIsAddingDays(true)}
                        >
                            <span className="material-icons mr-2">add_circle</span>
                            Adicionar Dias
                        </Button>
                        {onOpenChat && (
                            <Button
                                variant="secondary"
                                onClick={() => onOpenChat(selectedDriver)}
                            >
                                <span className="material-icons mr-2">chat</span>
                                Abrir Chat
                            </Button>
                        )}
                        {onDelete && (
                            <Button
                                variant="danger"
                                onClick={() => onDelete(selectedDriver)}
                            >
                                <span className="material-icons mr-2">delete</span>
                                Excluir Motorista
                            </Button>
                        )}
                    </div>
                </div>
            )}

            {/* Edit Modal */}
            <Modal
                isOpen={isEditing}
                onClose={() => setIsEditing(false)}
                title="Editar Motorista"
                subtitle={selectedDriver?.username}
                size="lg"
            >
                <div className="admin-form">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Input
                            label="Nome de Usuário"
                            value={editData.username || ''}
                            onChange={e => setEditData({ ...editData, username: e.target.value })}
                        />
                        <Input
                            label="CPF"
                            value={editData.cpf || ''}
                            onChange={e => setEditData({ ...editData, cpf: e.target.value })}
                        />
                        <Input
                            label="Telefone"
                            value={editData.phone || ''}
                            onChange={e => setEditData({ ...editData, phone: e.target.value })}
                        />
                        <Input
                            label="WhatsApp"
                            value={editData.whatsapp || ''}
                            onChange={e => setEditData({ ...editData, whatsapp: e.target.value })}
                        />
                        <div className="md:col-span-2">
                            <Input
                                label="PIX (Chave)"
                                value={editData.pix_key || ''}
                                onChange={e => setEditData({ ...editData, pix_key: e.target.value })}
                            />
                        </div>

                        <div className="md:col-span-2 my-2 h-[1px] bg-white/5" />

                        <Input
                            label="Modelo Veículo"
                            value={editData.vehicle_model || ''}
                            onChange={e => setEditData({ ...editData, vehicle_model: e.target.value })}
                        />
                        <Input
                            label="Placa"
                            className="uppercase"
                            value={editData.vehicle_plate || ''}
                            onChange={e => setEditData({ ...editData, vehicle_plate: e.target.value.toUpperCase() })}
                        />
                        <Input
                            label="Cor"
                            value={editData.vehicle_color || ''}
                            onChange={e => setEditData({ ...editData, vehicle_color: e.target.value })}
                        />
                        <div className="flex flex-col gap-1.5">
                            <label className="text-[12px] font-medium text-gray-400 uppercase tracking-wider">Tipo</label>
                            <select
                                className="w-full bg-[#2a3942] border border-white/10 rounded-xl p-3 text-white focus:border-green-500 outline-none transition-all"
                                value={editData.vehicle_type || 'car'}
                                onChange={e => setEditData({ ...editData, vehicle_type: e.target.value as any })}
                            >
                                <option value="car">🚗 Carro</option>
                                <option value="motorcycle">🏍️ Moto</option>
                            </select>
                        </div>

                        <div className="md:col-span-2 my-2 h-[1px] bg-white/5" />

                        <div className="md:col-span-2">
                            <Input
                                label="Alterar Senha"
                                hint="Deixe em branco para manter a atual"
                                placeholder="Nova senha..."
                                value={newPass}
                                onChange={e => setNewPass(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 mt-8">
                        <Button
                            variant="secondary"
                            onClick={() => setIsEditing(false)}
                            disabled={isSaving}
                        >
                            Cancelar
                        </Button>
                        <Button
                            variant="primary"
                            onClick={handleSaveEdit}
                            loading={isSaving}
                        >
                            Salvar Alterações
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Add Days Modal */}
            <Modal
                isOpen={isAddingDays}
                onClose={() => setIsAddingDays(false)}
                title="Adicionar Dias de Assinatura"
                subtitle={selectedDriver?.username}
                size="sm"
            >
                <div className="space-y-6 py-4">
                    <p className="text-sm text-gray-500">
                        Escolha quantos dias deseja adicionar à assinatura deste motorista.
                    </p>

                    <div className="grid grid-cols-2 gap-2">
                        {[7, 15, 30, 90].map(days => (
                            <button
                                key={days}
                                className={`p-3 rounded-xl border transition-all font-bold ${addDaysValue === days
                                    ? 'bg-green-500 border-green-500 text-white shadow-lg shadow-green-500/20'
                                    : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'}`}
                                onClick={() => setAddDaysValue(days)}
                            >
                                + {days} Dias
                            </button>
                        ))}
                    </div>

                    <Input
                        label="Ou digite valor manual"
                        type="number"
                        placeholder="Ex: 10"
                        value={addDaysValue}
                        onChange={e => setAddDaysValue(parseInt(e.target.value) || 0)}
                    />

                    <div className="flex justify-end gap-3 pt-4">
                        <Button variant="secondary" onClick={() => setIsAddingDays(false)} disabled={isSaving}>
                            Cancelar
                        </Button>
                        <Button variant="primary" onClick={handleConfirmAddDays} loading={isSaving}>
                            Confirmar
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default AdminDriversView;
