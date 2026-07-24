/**
 * AdminSidebar - Menu lateral do painel admin
 */

import React from 'react';
import { AdminTab } from '../../../types';

interface MenuItem {
    id: AdminTab;
    icon: string;
    label: string;
    badge?: number;
    color?: string;
}

interface AdminSidebarProps {
    activeTab: AdminTab;
    onTabChange: (tab: AdminTab) => void;
    driverCount?: number;
    pendingApprovals?: number;
    onLogout: () => void;
}

export const AdminSidebar: React.FC<AdminSidebarProps> = ({
    activeTab,
    onTabChange,
    driverCount = 0,
    pendingApprovals = 0,
    onLogout,
}) => {
    const menuItems: MenuItem[] = [
        { id: 'drivers', icon: 'people', label: 'Todos os Motoristas', badge: driverCount },
        { id: 'approvals', icon: 'verified_user', label: 'Aprovação de Motoristas', badge: pendingApprovals, color: '#f59e0b' },
        { id: 'settings', icon: 'settings', label: 'Ajustes' },
        { id: 'bingo', icon: 'casino', label: 'Bingo' },
        { id: 'plans', icon: 'monetization_on', label: 'Planos' },
        { id: 'taximeter', icon: 'speed', label: 'Simular' },
        { id: 'notifications', icon: 'campaign', label: 'Enviar Notificações' },
        { id: 'chat', icon: 'smart_toy', label: 'Bot WhatsApp', color: '#25d366' },
        { id: 'banners', icon: 'image', label: 'Banners', color: '#ec4899' },
        { id: 'coupons', icon: 'confirmation_number', label: 'Cupons', color: '#8b5cf6' },
        { id: 'rides', icon: 'directions_car', label: 'Monitor de Corridas', color: '#00a884' },
        { id: 'central', icon: 'headset_mic', label: 'Central de Despacho' },
        { id: 'wallets', icon: 'account_balance_wallet', label: 'Financeiro / Carteiras' },
        { id: 'store', icon: 'storefront', label: 'Loja / Produtos' },
    ];

    const containerStyle: React.CSSProperties = {
        width: '100%',
        maxWidth: '320px',
        background: 'var(--color-surface, #202c33)',
        borderRadius: '16px',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        maxHeight: 'calc(100vh - 100px)',
        overflowY: 'auto',
    };

    const menuItemStyle = (isActive: boolean, color?: string): React.CSSProperties => ({
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '12px 16px',
        borderRadius: '12px',
        cursor: 'pointer',
        transition: 'all 150ms ease',
        background: isActive
            ? color || 'var(--color-primary, #00a884)'
            : 'transparent',
        color: isActive ? '#ffffff' : 'var(--color-text-secondary, #8696a0)',
    });

    const badgeStyle: React.CSSProperties = {
        marginLeft: 'auto',
        background: 'rgba(255, 255, 255, 0.2)',
        padding: '2px 8px',
        borderRadius: '9999px',
        fontSize: '11px',
        fontWeight: 600,
    };

    return (
        <div style={containerStyle} className="no-scrollbar">
            <div style={{ marginBottom: '16px' }}>
                <h2 style={{ color: '#ffffff', fontSize: '20px', fontWeight: 700, margin: 0 }}>
                    Admin Painel
                </h2>
                <p style={{ color: 'var(--color-text-secondary)', fontSize: '12px', margin: '4px 0 0 0' }}>
                    Gerencie motoristas e configurações
                </p>
            </div>

            {menuItems.map((item) => (
                <div
                    key={item.id}
                    style={menuItemStyle(activeTab === item.id, item.color)}
                    onClick={() => onTabChange(item.id)}
                    role="button"
                    tabIndex={0}
                >
                    <span className="material-icons" style={{ fontSize: '20px' }}>{item.icon}</span>
                    <span style={{ fontSize: '14px', fontWeight: 500 }}>{item.label}</span>
                    {item.badge !== undefined && item.badge > 0 && (
                        <span style={badgeStyle}>{item.badge}</span>
                    )}
                </div>
            ))}

            <div style={{ marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <div
                    style={menuItemStyle(false)}
                    onClick={onLogout}
                    role="button"
                    tabIndex={0}
                >
                    <span className="material-icons" style={{ fontSize: '20px', color: '#ef4444' }}>logout</span>
                    <span style={{ fontSize: '14px', fontWeight: 500, color: '#ef4444' }}>Sair</span>
                </div>
            </div>
        </div>
    );
};
