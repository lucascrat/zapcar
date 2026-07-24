import React, { useState, useEffect } from 'react';
import { AppPaymentRequest, WalletTransaction } from '../../../types';
import {
    fetchPaymentRequests,
    updatePaymentRequestStatus,
    fetchAllWalletTransactions
} from '../../../services/supabaseClient';
import { Card, Button, Badge } from '../../components/shared';

export const AdminWalletsView: React.FC = () => {
    const [requests, setRequests] = useState<AppPaymentRequest[]>([]);
    const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'pending' | 'paid' | 'rejected'>('pending');
    const [processingId, setProcessingId] = useState<string | null>(null);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [reqs, txs] = await Promise.all([
                fetchPaymentRequests(),
                fetchAllWalletTransactions()
            ]);
            setRequests(reqs);
            setTransactions(txs as any);
        } catch (error) {
            console.error("Erro ao carregar dados financeiros:", error);
        }
        setLoading(false);
    };

    const handleStatusUpdate = async (id: string, status: 'paid' | 'rejected') => {
        const note = status === 'rejected' ? prompt("Motivo da rejeição:") || "" : "";
        if (status === 'rejected' && !note) return;

        setProcessingId(id);
        try {
            const success = await updatePaymentRequestStatus(id, status, note);
            if (success) {
                alert(`Solicitação ${status === 'paid' ? 'aprovada' : 'rejeitada'} com sucesso!`);
                await loadData();
            } else {
                alert("Erro ao atualizar status.");
            }
        } catch (error) {
            alert("Erro inesperado.");
        }
        setProcessingId(null);
    };

    const filteredRequests = requests.filter(r => filter === 'all' || r.status === filter);

    const stats = {
        pending: requests.filter(r => r.status === 'pending').length,
        totalAmountPending: requests
            .filter(r => r.status === 'pending')
            .reduce((acc, r) => acc + (r.amount_money || 0), 0),
        paidToday: requests
            .filter(r => r.status === 'paid' && new Date(r.updated_at).toDateString() === new Date().toDateString())
            .reduce((acc, r) => acc + (r.amount_money || 0), 0)
    };

    if (loading) {
        return <div className="admin-loading">Carregando dados financeiros...</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-white">Financeiro / Saques</h2>
                    <p className="text-sm text-gray-400 mt-1">Gerencie solicitações de pagamento e histórico</p>
                </div>
                <Button variant="secondary" onClick={loadData}>
                    <span className="material-icons">refresh</span>
                    Atualizar
                </Button>
            </div>

            {/* Stats Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="admin-stat-card">
                    <div className="flex flex-col">
                        <span className="text-gray-400 text-sm uppercase tracking-wider">Pendentes</span>
                        <span className="text-3xl font-bold text-yellow-500">{stats.pending}</span>
                    </div>
                    <span className="material-icons text-yellow-500/20" style={{ fontSize: '48px' }}>pending</span>
                </Card>
                <Card className="admin-stat-card">
                    <div className="flex flex-col">
                        <span className="text-gray-400 text-sm uppercase tracking-wider">Total Pendente</span>
                        <span className="text-3xl font-bold text-white">R$ {stats.totalAmountPending.toFixed(2)}</span>
                    </div>
                    <span className="material-icons text-blue-500/20" style={{ fontSize: '48px' }}>payments</span>
                </Card>
                <Card className="admin-stat-card">
                    <div className="flex flex-col">
                        <span className="text-gray-400 text-sm uppercase tracking-wider">Pago Hoje</span>
                        <span className="text-3xl font-bold text-green-500">R$ {stats.paidToday.toFixed(2)}</span>
                    </div>
                    <span className="material-icons text-green-500/20" style={{ fontSize: '48px' }}>check_circle</span>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Withdrawal Requests */}
                <div className="lg:col-span-2 space-y-4">
                    <Card>
                        <div className="admin-card-header flex items-center justify-between">
                            <h3 className="admin-card-title">Solicitações de Saque</h3>
                            <div className="admin-tabs admin-tabs-sm">
                                <button
                                    className={`admin-tab ${filter === 'pending' ? 'active' : ''}`}
                                    onClick={() => setFilter('pending')}
                                >
                                    Pendentes
                                </button>
                                <button
                                    className={`admin-tab ${filter === 'paid' ? 'active' : ''}`}
                                    onClick={() => setFilter('paid')}
                                >
                                    Pagos
                                </button>
                                <button
                                    className={`admin-tab ${filter === 'rejected' ? 'active' : ''}`}
                                    onClick={() => setFilter('rejected')}
                                >
                                    Rejeitados
                                </button>
                                <button
                                    className={`admin-tab ${filter === 'all' ? 'active' : ''}`}
                                    onClick={() => setFilter('all')}
                                >
                                    Todos
                                </button>
                            </div>
                        </div>
                        <div className="admin-table-wrapper">
                            <table className="admin-table">
                                <thead>
                                    <tr>
                                        <th>Usuário</th>
                                        <th>Tipo</th>
                                        <th>Valor</th>
                                        <th>PIX</th>
                                        <th>Data</th>
                                        <th>Status</th>
                                        <th>Ações</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredRequests.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} className="text-center py-8 text-gray-500">
                                                Nenhuma solicitação encontrada
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredRequests.map(req => (
                                            <tr key={req.id}>
                                                <td>
                                                    <div className="flex items-center gap-2">
                                                        <div className="admin-avatar-sm">
                                                            {req.user?.username?.charAt(0) || 'U'}
                                                        </div>
                                                        <div>
                                                            <div className="font-medium text-white">{req.user?.username || 'Desconhecido'}</div>
                                                            <div className="flex items-center gap-1">
                                                                <div className="text-xs text-gray-500 font-mono">{req.id.slice(0, 8)}...</div>
                                                                <button onClick={() => { navigator.clipboard.writeText(req.id); alert('ID Copiado!'); }} className="text-gray-600 hover:text-gray-400">
                                                                    <span className="material-icons" style={{ fontSize: '10px' }}>content_copy</span>
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td>
                                                    <Badge variant={req.type === 'driver_payout' ? 'info' : 'warning'}>
                                                        {req.type === 'driver_payout' ? 'Motorista' : 'Cliente'}
                                                    </Badge>
                                                </td>
                                                <td>
                                                    <div className="font-bold text-white">
                                                        R$ {(req.amount_money || 0).toFixed(2)}
                                                    </div>
                                                    {req.amount_coins > 0 && (
                                                        <div className="text-xs text-yellow-500">
                                                            {req.amount_coins} moedas
                                                        </div>
                                                    )}
                                                </td>
                                                <td>
                                                    <div className="text-xs font-mono bg-gray-800 p-1 rounded border border-gray-700 max-w-[150px] truncate">
                                                        {req.pix_key}
                                                    </div>
                                                </td>
                                                <td>
                                                    <div className="text-xs">
                                                        {new Date(req.created_at).toLocaleDateString()}<br />
                                                        {new Date(req.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </div>
                                                </td>
                                                <td>
                                                    <Badge variant={
                                                        req.status === 'paid' ? 'success' :
                                                            req.status === 'pending' ? 'warning' : 'danger'
                                                    }>
                                                        {req.status === 'paid' ? 'Pago' :
                                                            req.status === 'pending' ? 'Pendente' : 'Rejeitado'}
                                                    </Badge>
                                                </td>
                                                <td>
                                                    {req.status === 'pending' && (
                                                        <div className="flex gap-2">
                                                            <button
                                                                className="admin-action-btn success"
                                                                title="Aprovar Pagamento"
                                                                onClick={() => handleStatusUpdate(req.id, 'paid')}
                                                                disabled={!!processingId}
                                                            >
                                                                <span className="material-icons">check</span>
                                                            </button>
                                                            <button
                                                                className="admin-action-btn danger"
                                                                title="Rejeitar e Estornar"
                                                                onClick={() => handleStatusUpdate(req.id, 'rejected')}
                                                                disabled={!!processingId}
                                                            >
                                                                <span className="material-icons">close</span>
                                                            </button>
                                                        </div>
                                                    )}
                                                    {req.status !== 'pending' && req.admin_note && (
                                                        <div className="text-[10px] text-gray-500 italic max-w-[100px] truncate" title={req.admin_note}>
                                                            Obs: {req.admin_note}
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                </div>

                {/* Recent Transactions */}
                <div className="space-y-4">
                    <Card>
                        <div className="admin-card-header">
                            <h3 className="admin-card-title">Últimas Transações</h3>
                        </div>
                        <div className="admin-card-body p-0">
                            <div className="divide-y divide-gray-800">
                                {transactions.slice(0, 15).map(tx => (
                                    <div key={tx.id} className="p-3 hover:bg-white/5 transition-colors">
                                        <div className="flex justify-between items-start mb-1">
                                            <span className="text-xs font-semibold text-white">
                                                {(tx as any).user?.username || 'Sistema'}
                                            </span>
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] text-gray-500">
                                                    {new Date(tx.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                                <button onClick={() => { navigator.clipboard.writeText(tx.id); alert('ID Copiado!'); }} className="text-gray-600 hover:text-gray-400">
                                                    <span className="material-icons" style={{ fontSize: '10px' }}>content_copy</span>
                                                </button>
                                            </div>
                                        </div>
                                        <p className="text-[11px] text-gray-400 line-clamp-1">{tx.description}</p>
                                        <div className="flex justify-between items-center mt-1">
                                            <div className="flex gap-2">
                                                {tx.amount_money !== 0 && (
                                                    <span className={`text-[11px] font-bold ${tx.amount_money > 0 ? 'text-green-500' : 'text-red-500'}`}>
                                                        {tx.amount_money > 0 ? '+' : ''}R$ {tx.amount_money.toFixed(2)}
                                                    </span>
                                                )}
                                                {tx.amount_coins !== 0 && (
                                                    <span className={`text-[11px] font-bold ${tx.amount_coins > 0 ? 'text-yellow-500' : 'text-orange-500'}`}>
                                                        {tx.amount_coins > 0 ? '+' : ''}{tx.amount_coins} moedas
                                                    </span>
                                                )}
                                            </div>
                                            <span className="text-[9px] uppercase tracking-tighter text-gray-600 font-bold">{tx.type}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="p-3 text-center border-t border-gray-800">
                                <button className="text-xs text-primary hover:underline" onClick={() => loadData()}>
                                    Ver todas as transações
                                </button>
                            </div>
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
};

export default AdminWalletsView;
