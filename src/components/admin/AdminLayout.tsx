/**
 * AdminLayout - Layout principal do painel admin (Desktop Focused)
 */

import React, { useState, useRef, useEffect } from 'react';
import { UserProfile, AdminTab } from '../../../types';
import { APP_NAME } from '../../../constants';
import '../../styles/admin.css';
import '../../styles/admin-modern.css';
import '../../styles/admin-responsive.css';

interface AdminLayoutProps {
    currentUser: UserProfile;
    children: React.ReactNode;
    activeTab: AdminTab;
    onTabChange: (tab: AdminTab) => void;
    onLogout: () => void;
    stats?: {
        totalDrivers: number;
        onlineDrivers: number;
        onlineCars: number;
        onlineMotorcycles: number;
        pendingApprovals: number;
        todayRides: number;
        todayEarnings: number;
        pendingMessages?: number;
    };
    searchQuery?: string;
    onSearchChange?: (query: string) => void;
    onRefresh?: () => void;
}

interface NavItem {
    id: AdminTab;
    icon: string;
    label: string;
    badge?: number;
    badgeType?: 'default' | 'success' | 'warning';
    section: 'main' | 'management' | 'marketing' | 'tools';
}

export const AdminLayout: React.FC<AdminLayoutProps> = ({
    currentUser,
    children,
    activeTab,
    onTabChange,
    onLogout,
    stats,
    searchQuery = '',
    onSearchChange,
    onRefresh,
}) => {
    const [showNotifications, setShowNotifications] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
    const mobileSearchRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isMobileSearchOpen && mobileSearchRef.current) {
            mobileSearchRef.current.focus();
        }
    }, [isMobileSearchOpen]);

    const bottomNavItems = [
        { id: 'overview' as AdminTab, icon: 'dashboard', label: 'Dashboard' },
        { id: 'drivers' as AdminTab, icon: 'people', label: 'Motoristas' },
        { id: 'rides' as AdminTab, icon: 'route', label: 'Corridas' },
        { id: 'settings' as AdminTab, icon: 'settings', label: 'Config' },
    ];

    const navItems: NavItem[] = [
        // Main
        { id: 'overview', icon: 'dashboard', label: 'Dashboard', section: 'main' },
        { id: 'drivers', icon: 'people', label: 'Todos os Motoristas', badge: stats?.totalDrivers, section: 'main' },
        { id: 'performance', icon: 'insights', label: 'Desempenho dos Motoristas', section: 'main' },
        { id: 'approvals', icon: 'verified_user', label: 'Aprovação', badge: stats?.pendingApprovals, badgeType: 'warning', section: 'main' },
        { id: 'rides', icon: 'route', label: 'Central de Corridas', section: 'main' },

        // Management
        { id: 'clients', icon: 'person', label: 'Gestão de Clientes', section: 'management' },
        { id: 'support', icon: 'support_agent', label: 'Central de Atendimento', badge: stats?.pendingMessages, badgeType: 'success', section: 'management' },
        { id: 'central', icon: 'headset_mic', label: 'Central de Despacho', section: 'management' },
        { id: 'wallets', icon: 'account_balance_wallet', label: 'Financeiro', section: 'management' },
        { id: 'store', icon: 'storefront', label: 'Loja / Produtos', section: 'management' },

        // Marketing
        { id: 'banners', icon: 'image', label: 'Banners', section: 'marketing' },
        { id: 'coupons', icon: 'confirmation_number', label: 'Cupons', section: 'marketing' },
        { id: 'notifications', icon: 'campaign', label: 'Notificações', section: 'marketing' },
        { id: 'bingo', icon: 'casino', label: 'Bingo', section: 'marketing' },
        { id: 'rewards', icon: 'emoji_events', label: 'Premiações', section: 'marketing' },

        // Tools
        { id: 'settings', icon: 'settings', label: 'Configurações', section: 'tools' },
        { id: 'categories', icon: 'category', label: 'Categorias de Veículo', section: 'tools' },
        { id: 'plans', icon: 'monetization_on', label: 'Planos', section: 'tools' },
        { id: 'taximeter', icon: 'speed', label: 'Simulador', section: 'tools' },
        { id: 'chat', icon: 'smart_toy', label: 'Bot WhatsApp', section: 'tools' },
    ];

    const sections = [
        { key: 'main', label: 'Principal' },
        { key: 'management', label: 'Gerenciamento' },
        { key: 'marketing', label: 'Marketing' },
        { key: 'tools', label: 'Ferramentas' },
    ];

    const getInitials = (name?: string) => {
        if (!name) return 'AD';
        try {
            return name.split(' ').filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2);
        } catch (e) {
            return 'AD';
        }
    };

    const getTabTitle = () => {
        const item = navItems.find(n => n.id === activeTab);
        return item?.label || 'Dashboard';
    };

    return (
        <div className="admin-layout">
            {/* Mobile Overlay */}
            <div
                className={`admin-mobile-overlay ${isMobileMenuOpen ? 'active' : ''}`}
                onClick={() => setIsMobileMenuOpen(false)}
            />

            {/* Sidebar */}
            <aside className={`admin-sidebar ${isMobileMenuOpen ? 'mobile-open' : ''}`}>
                <div className="admin-sidebar-header">
                    <div className="admin-sidebar-logo">
                        <div className="admin-sidebar-logo-icon">
                            <span className="material-icons">admin_panel_settings</span>
                        </div>
                        <div>
                            <h1 className="admin-sidebar-title">{APP_NAME || 'ChegoJá'}</h1>
                            <p className="admin-sidebar-subtitle">Painel Administrativo</p>
                        </div>
                    </div>
                </div>

                <nav className="admin-nav">
                    {sections.map(section => (
                        <div key={section.key} className="admin-nav-section">
                            <h3 className="admin-nav-section-title">{section.label}</h3>
                            {navItems
                                .filter(item => item.section === section.key)
                                .map(item => (
                                    <div
                                        key={item.id}
                                        className={`admin-nav-item ${activeTab === item.id ? 'active' : ''}`}
                                        onClick={() => {
                                            onTabChange(item.id);
                                            setIsMobileMenuOpen(false);
                                        }}
                                        role="button"
                                        tabIndex={0}
                                    >
                                        <span className="material-icons">{item.icon}</span>
                                        <span className="admin-nav-item-label">{item.label}</span>
                                        {item.badge !== undefined && item.badge > 0 && (
                                            <span className={`admin-nav-item-badge ${item.badgeType || ''}`}>
                                                {item.badge}
                                            </span>
                                        )}
                                    </div>
                                ))}
                        </div>
                    ))}
                </nav>

                <div className="admin-sidebar-footer">
                    <div className="admin-sidebar-user">
                        <div className="admin-sidebar-user-avatar-wrapper">
                            {currentUser?.avatar_url ? (
                                <img src={currentUser.avatar_url} alt="" className="admin-sidebar-user-avatar" />
                            ) : (
                                <div className="admin-sidebar-user-avatar">
                                    {getInitials(currentUser?.username)}
                                </div>
                            )}
                        </div>
                        <div className="admin-sidebar-user-info">
                            <p className="admin-sidebar-user-name">{currentUser?.username || 'Admin'}</p>
                            <p className="admin-sidebar-user-role">Administrador</p>
                        </div>
                        <button className="admin-sidebar-logout" onClick={onLogout} title="Sair">
                            <span className="material-icons">logout</span>
                        </button>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="admin-main">
                {/* Header */}
                <header className="admin-header">
                    <button
                        className="admin-mobile-header-toggle"
                        onClick={() => setIsMobileMenuOpen(true)}
                    >
                        <span className="material-icons">menu</span>
                    </button>
                    <div>
                        <h2 className="admin-header-title">{getTabTitle()}</h2>
                        <p className="admin-header-subtitle">
                            {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
                        </p>
                    </div>

                    <div className="admin-header-search-wrapper">
                        {onSearchChange && (
                            <div className="admin-header-search">
                                <span className="material-icons">search</span>
                                <input
                                    type="text"
                                    placeholder="Buscar..."
                                    value={searchQuery}
                                    onChange={(e) => onSearchChange(e.target.value)}
                                />
                            </div>
                        )}
                    </div>

                    <div className="admin-header-actions">
                        {/* Mobile search button */}
                        {onSearchChange && (
                            <button
                                className="admin-header-action-btn admin-mobile-header-toggle"
                                title="Buscar"
                                onClick={() => setIsMobileSearchOpen(true)}
                                style={{ display: undefined }}
                            >
                                <span className="material-icons">search</span>
                            </button>
                        )}
                        <button
                            className="admin-header-action-btn"
                            title="Atualizar dados"
                            onClick={() => onRefresh?.()}
                        >
                            <span className="material-icons">refresh</span>
                        </button>
                        <div style={{ position: 'relative' }}>
                            <button
                                className="admin-header-action-btn"
                                title="Notificações"
                                onClick={() => setShowNotifications(!showNotifications)}
                            >
                                <span className="material-icons">notifications</span>
                                {stats && stats.pendingApprovals > 0 && <span className="notification-dot" />}
                            </button>

                            {showNotifications && (
                                <div className="admin-notifications-flyout">
                                    <div className="admin-notifications-header">
                                        <h4 className="admin-notifications-title">Notificações</h4>
                                        <button
                                            style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer' }}
                                            onClick={() => setShowNotifications(false)}
                                        >
                                            <span className="material-icons" style={{ fontSize: '18px' }}>close</span>
                                        </button>
                                    </div>

                                    {stats && stats.pendingApprovals > 0 ? (
                                        <div
                                            className="admin-notification-item unread"
                                            onClick={() => { onTabChange('approvals'); setShowNotifications(false); }}
                                        >
                                            <div className="admin-notification-icon">
                                                <span className="material-icons">person_add</span>
                                            </div>
                                            <div className="admin-notification-content">
                                                <p className="admin-notification-text">
                                                    <strong>{stats.pendingApprovals}</strong> motorista(s) aguardando aprovação
                                                </p>
                                                <p className="admin-notification-time">Agora</p>
                                            </div>
                                        </div>
                                    ) : (
                                        <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
                                            <span className="material-icons" style={{ fontSize: '32px', opacity: 0.5 }}>notifications_none</span>
                                            <p style={{ margin: '8px 0 0 0', fontSize: '13px' }}>Sem notificações</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </header>

                {/* Stats Cards */}
                {stats && activeTab === 'drivers' && (
                    <div className="admin-content" style={{ paddingBottom: 0 }}>
                        <div className="admin-stats-grid">
                            <div className="admin-stat-card" style={{ '--stat-color': 'rgba(59, 130, 246, 0.15)', '--stat-color-solid': '#3b82f6' } as any}>
                                <div className="admin-stat-icon">
                                    <span className="material-icons">people</span>
                                </div>
                                <p className="admin-stat-label">Total Motoristas</p>
                                <p className="admin-stat-value">{stats.totalDrivers || 0}</p>
                            </div>

                            <div className="admin-stat-card" style={{ '--stat-color': 'rgba(16, 185, 129, 0.15)', '--stat-color-solid': '#10b981' } as any}>
                                <div className="admin-stat-icon">
                                    <span className="material-icons">online_prediction</span>
                                </div>
                                <p className="admin-stat-label">Online Agora</p>
                                <p className="admin-stat-value">{stats.onlineDrivers || 0}</p>
                            </div>

                            <div className="admin-stat-card" style={{ '--stat-color': 'rgba(59, 130, 246, 0.15)', '--stat-color-solid': '#3b82f6' } as any}>
                                <div className="admin-stat-icon">
                                    <span className="material-icons">directions_car</span>
                                </div>
                                <p className="admin-stat-label">Carros Online</p>
                                <p className="admin-stat-value">{stats.onlineCars || 0}</p>
                            </div>

                            <div className="admin-stat-card" style={{ '--stat-color': 'rgba(249, 115, 22, 0.15)', '--stat-color-solid': '#f97316' } as any}>
                                <div className="admin-stat-icon">
                                    <span className="material-icons">two_wheeler</span>
                                </div>
                                <p className="admin-stat-label">Motos Online</p>
                                <p className="admin-stat-value">{stats.onlineMotorcycles || 0}</p>
                            </div>

                            <div className="admin-stat-card" style={{ '--stat-color': 'rgba(245, 158, 11, 0.15)', '--stat-color-solid': '#f59e0b' } as any}>
                                <div className="admin-stat-icon">
                                    <span className="material-icons">pending_actions</span>
                                </div>
                                <p className="admin-stat-label">Aguardando Aprovação</p>
                                <p className="admin-stat-value">{stats.pendingApprovals || 0}</p>
                            </div>

                            <div className="admin-stat-card" style={{ '--stat-color': 'rgba(16, 185, 129, 0.15)', '--stat-color-solid': '#10b981' } as any}>
                                <div className="admin-stat-icon">
                                    <span className="material-icons">monetization_on</span>
                                </div>
                                <p className="admin-stat-label">Faturamento Hoje</p>
                                <p className="admin-stat-value">
                                    <span style={{ fontSize: '14px', opacity: 0.6, marginRight: '4px' }}>R$</span>
                                    {(stats.todayEarnings || 0).toFixed(2).replace('.', ',')}
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                <div className="admin-content">
                    {children}
                </div>
            </main>

            {/* Bottom Navigation (Mobile) */}
            <nav className="admin-bottom-nav">
                {bottomNavItems.map(item => (
                    <button
                        key={item.id}
                        className={`admin-bottom-nav-item ${activeTab === item.id ? 'active' : ''}`}
                        onClick={() => onTabChange(item.id)}
                    >
                        <span className="material-icons">{item.icon}</span>
                        <span className="admin-bottom-nav-label">{item.label}</span>
                        {item.id === 'drivers' && stats && stats.pendingApprovals > 0 && (
                            <span className="admin-bottom-nav-badge">{stats.pendingApprovals}</span>
                        )}
                    </button>
                ))}
                <button
                    className="admin-bottom-nav-item"
                    onClick={() => setIsMobileMenuOpen(true)}
                >
                    <span className="material-icons">menu</span>
                    <span className="admin-bottom-nav-label">Mais</span>
                </button>
            </nav>

            {/* Mobile Search Overlay */}
            {isMobileSearchOpen && onSearchChange && (
                <div className="admin-mobile-search open">
                    <input
                        ref={mobileSearchRef}
                        type="text"
                        placeholder="Buscar motorista, cliente..."
                        value={searchQuery}
                        onChange={(e) => onSearchChange(e.target.value)}
                        onKeyDown={(e) => e.key === 'Escape' && setIsMobileSearchOpen(false)}
                    />
                    <button
                        className="admin-mobile-search-close"
                        onClick={() => setIsMobileSearchOpen(false)}
                    >
                        <span className="material-icons">close</span>
                    </button>
                </div>
            )}
        </div>
    );
};

export default AdminLayout;
