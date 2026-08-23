/**
 * AdminDashboardDesktop - Novo dashboard focado em desktop
 * Wrapper que integra o AdminLayout com as views modulares
 */

import React, { useState, useEffect, useRef } from 'react';
import { AdminLayout } from '../src/components/admin/AdminLayout';
import { AdminDriversView } from '../src/components/admin/AdminDriversView';
import { AdminSettingsView } from '../src/components/admin/AdminSettingsView';
import { AdminNotificationsView } from '../src/components/admin/AdminNotificationsView';
import { AdminRidesView } from '../src/components/admin/AdminRidesView';
import { AdminPlansView } from '../src/components/admin/AdminPlansView';
import { AdminBannersView } from '../src/components/admin/AdminBannersView';
import { AdminCouponsView } from '../src/components/admin/AdminCouponsView';
import { AdminBingoView } from '../src/components/admin/AdminBingoView';
import { AdminDispatchView } from '../src/components/admin/AdminDispatchView';
import { AdminWalletsView } from '../src/components/admin/AdminWalletsView';
import { AdminStoreView } from '../src/components/admin/AdminStoreView';
import { AdminBotView } from '../src/components/admin/AdminBotView';
import { AdminTaximeterView } from '../src/components/admin/AdminTaximeterView';
import { AdminOverviewView } from '../src/components/admin/AdminOverviewView';
import { AdminClientsView } from '../src/components/admin/AdminClientsView';
import { AdminRewardsView } from '../src/components/admin/AdminRewardsView';
import { AdminSupportView } from '../src/components/admin/AdminSupportView';
import { AdminDriverPerformanceView } from '../src/components/admin/AdminDriverPerformanceView';
import { ErrorBoundary } from '../src/components/shared/ErrorBoundary';
import { ToastProvider, useToast } from '../src/components/shared';
import { UserProfile, AdminTab, DriverStatus } from '../types';
import { SUPABASE_URL, SUPABASE_SCHEMA } from '../constants';
import {
    fetchAllDriversWithStats,
    approveDriver,
    deleteDriver,
    fetchUnreadSupportCount,
    supabase
} from '../services/supabaseClient';
import { soundService } from '../services/soundService';

interface AdminDashboardDesktopProps {
    currentUser: UserProfile;
    onLogout: () => void;
}

const AdminDashboardContent: React.FC<AdminDashboardDesktopProps> = ({
    currentUser,
    onLogout
}) => {
    const { toast } = useToast();
    const [activeTab, setActiveTab] = useState<AdminTab>('overview');
    const [drivers, setDrivers] = useState<(UserProfile & { monthly_rides?: number })[]>([]);
    const [selectedDriver, setSelectedDriver] = useState<UserProfile | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterStatus, setFilterStatus] = useState<DriverStatus | 'all' | 'pending'>('all');
    const [unreadMessages, setUnreadMessages] = useState(0);
    const [openChatPartnerId, setOpenChatPartnerId] = useState<string | null>(null);
    // Evita som duplicado: quando a aba "support" está aberta, o próprio
    // AdminSupportView já toca o alerta por conversa; aqui só cuidamos do
    // badge global e da notificação de sistema quando o admin está noutra aba.
    const activeTabRef = useRef(activeTab);
    useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);

    // Calculate stats
    const onlineDriversList = drivers.filter(d => d.status === DriverStatus.AVAILABLE);
    const stats = {
        totalDrivers: drivers.length,
        onlineDrivers: onlineDriversList.length,
        onlineCars: onlineDriversList.filter(d => d.vehicle_type === 'car').length,
        onlineMotorcycles: onlineDriversList.filter(d => d.vehicle_type === 'motorcycle').length,
        pendingApprovals: drivers.filter(d => !d.is_approved).length,
        todayRides: 0, // TODO: Fetch from rides table
        todayEarnings: 0, // TODO: Calculate from rides
        pendingMessages: unreadMessages,
    };

    // Load unread support message count
    const loadUnreadMessages = async () => {
        const count = await fetchUnreadSupportCount(currentUser.id);
        setUnreadMessages(count);
    };

    // Load drivers
    const loadDrivers = async (silent = false) => {
        if (!silent) setIsLoading(true);
        try {
            console.log('[AdminDashboard] Starting to load drivers...');
            console.log('[AdminDashboard] Supabase URL:', SUPABASE_URL);
            console.log('[AdminDashboard] Schema:', SUPABASE_SCHEMA);

            const data = await fetchAllDriversWithStats();
            console.log('[AdminDashboard] Drivers loaded successfully:', data.length);
            console.log('[AdminDashboard] First driver sample:', data[0]);

            setDrivers(data);
        } catch (error) {
            console.error("[AdminDashboard] Error loading drivers:", error);
            console.error("[AdminDashboard] Error details:", {
                message: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined
            });
            toast('Erro ao carregar motoristas.', 'error');
        } finally {
            if (!silent) setIsLoading(false);
        }
    };

    useEffect(() => {
        loadDrivers();
        loadUnreadMessages();

        // Realtime subscription
        const subscription = supabase
            .channel('admin_realtime')
            .on('postgres_changes', {
                event: '*',
                schema: 'chegoja',
                table: 'profiles'
            }, () => {
                loadDrivers(true);
            })
            .subscribe();

        // Alerta global de novas mensagens de suporte (motorista/cliente -> admin),
        // independente de qual aba do painel está aberta no momento.
        const messagesSubscription = supabase
            .channel('admin_support_alert')
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'chegoja',
                table: 'messages'
            }, (payload) => {
                const msg = payload.new as { receiver_id?: string; sender_id?: string };
                if (msg?.receiver_id === currentUser.id) {
                    loadUnreadMessages();
                    // Se a Central de Atendimento já está aberta, ela mesma decide se toca
                    // o alerta (só quando a conversa recebida não é a que já está aberta).
                    // Evita tocar o som duas vezes ao mesmo tempo.
                    if (activeTabRef.current !== 'support') {
                        soundService.playMessageAlert();
                    }
                    // Notificação do sistema (aba minimizada/em segundo plano) - avisa o
                    // admin mesmo se ele não estiver olhando o painel no momento.
                    if (document.hidden) {
                        soundService.sendNotification(
                            'Nova mensagem no suporte',
                            'Um motorista ou cliente respondeu no chat. Abra a Central de Atendimento.'
                        );
                    }
                }
            })
            .subscribe();

        return () => {
            subscription.unsubscribe();
            messagesSubscription.unsubscribe();
        };
    }, []);

    // Abre a Central de Atendimento na conversa certa ao tocar na notificação
    // push de nova mensagem (disparado pelo pushService).
    useEffect(() => {
        const handleOpenChat = (event: any) => {
            const partnerId = event.detail?.partnerId;
            if (!partnerId) return;
            setOpenChatPartnerId(partnerId);
            setActiveTab('support');
        };
        window.addEventListener('openChat', handleOpenChat);
        return () => window.removeEventListener('openChat', handleOpenChat);
    }, []);

    // Reset filter when changing tabs
    useEffect(() => {
        if (activeTab === 'drivers') {
            setFilterStatus('all');
        } else if (activeTab === 'approvals') {
            setFilterStatus('pending');
        }
    }, [activeTab]);

    // Handle approve
    const handleApprove = async (driver: UserProfile) => {
        const confirmApprove = window.confirm(`Deseja aprovar o motorista ${driver.username}?`);
        if (!confirmApprove) return;

        const success = await approveDriver(driver.id);
        if (success) {
            loadDrivers();
            toast('Motorista aprovado com sucesso!', 'success');
        } else {
            toast('Erro ao aprovar motorista.', 'error');
        }
    };

    // Handle delete
    const handleDelete = async (driver: UserProfile) => {
        const confirmDelete = window.confirm(`Tem certeza que deseja excluir o motorista ${driver.username}?`);
        if (!confirmDelete) return;

        const success = await deleteDriver(driver.id);
        if (success) {
            setSelectedDriver(null);
            loadDrivers();
            toast('Motorista excluído com sucesso!', 'success');
        } else {
            toast('Erro ao excluir motorista.', 'error');
        }
    };

    const handleOpenChat = (driver: UserProfile) => {
        setActiveTab('chat');
        // If we have a specific driver chat logic, we could set selectedDriver here
        // For now, it just switches to the bot/chat view
    };

    // Render content based on active tab
    const renderContent = () => {
        switch (activeTab) {
            case 'drivers':
            case 'approvals':
                return (
                    <ErrorBoundary>
                        <AdminDriversView
                            drivers={drivers}
                            selectedDriver={selectedDriver}
                            onSelectDriver={setSelectedDriver}
                            searchTerm={searchQuery}
                            onSearchChange={setSearchQuery}
                            filterStatus={activeTab === 'approvals' ? 'pending' : filterStatus}
                            onFilterChange={setFilterStatus}
                            isLoading={isLoading}
                            onApprove={handleApprove}
                            onDelete={handleDelete}
                            onOpenChat={handleOpenChat}
                            onRefresh={() => loadDrivers(true)}
                        />
                    </ErrorBoundary>
                );

            case 'settings':
                return <AdminSettingsView />;

            case 'notifications':
                return <AdminNotificationsView />;

            case 'rides':
                return <AdminRidesView />;

            case 'plans':
                return <AdminPlansView />;

            case 'banners':
                return <AdminBannersView />;

            case 'coupons':
                return <AdminCouponsView />;

            case 'bingo':
                return <AdminBingoView />;

            case 'rewards':
                return <AdminRewardsView />;

            case 'support':
                return <AdminSupportView currentUser={currentUser} onUnreadChange={loadUnreadMessages} initialPartnerId={openChatPartnerId} />;

            case 'performance':
                return <AdminDriverPerformanceView />;

            case 'central':
                return <AdminDispatchView />;

            case 'wallets':
                return <AdminWalletsView />;

            case 'store':
                return <AdminStoreView />;

            case 'chat':
                return <AdminBotView />;

            case 'overview':
                return <AdminOverviewView />;

            case 'clients':
                return <AdminClientsView />;

            case 'taximeter':
                return <AdminTaximeterView />;

            default:
                return (
                    <div className="admin-empty-state">
                        <span className="material-icons">construction</span>
                        <p className="admin-empty-state-title">Em desenvolvimento</p>
                        <p className="admin-empty-state-text">
                            Esta seção está sendo construída. Volte em breve!
                        </p>
                    </div>
                );
        }
    };

    return (
        <AdminLayout
            currentUser={currentUser}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onLogout={onLogout}
            stats={stats}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onRefresh={() => loadDrivers(false)}
        >
            {renderContent()}
        </AdminLayout>
    );
};

export const AdminDashboardDesktop: React.FC<AdminDashboardDesktopProps> = (props) => {
    return (
        <ToastProvider>
            <AdminDashboardContent {...props} />
        </ToastProvider>
    );
};

export default AdminDashboardDesktop;
