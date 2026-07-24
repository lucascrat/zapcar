
import React, { useState, useEffect } from 'react';
import {
    fetchAllProfilesForAdmin,
    payDriverBalance,
    fetchStoreProducts,
    fetchAppSettings,
    updateAppSettings,
    fetchStoreOrders,
    updateStoreOrderStatus,
    createStoreProduct,
    updateStoreProduct,
    deleteStoreProduct,
    uploadStoreProductImage,
    fetchAllWalletTransactions,
    fetchPaymentRequests,
    updatePaymentRequestStatus,
    updatePaymentRequestPixKey,
    supabase
} from '../services/supabaseClient';
import { StoreOrder, UserProfile, StoreProduct, AppSettings, WalletTransaction, AppPaymentRequest } from '../types';

interface AdminWalletManagerProps {
    onClose?: () => void;
}

export const AdminWalletManager: React.FC<AdminWalletManagerProps> = () => {
    const [profiles, setProfiles] = useState<UserProfile[]>([]);
    const [products, setProducts] = useState<StoreProduct[]>([]);
    const [orders, setOrders] = useState<StoreOrder[]>([]);
    const [transactions, setTransactions] = useState<any[]>([]);
    const [paymentRequests, setPaymentRequests] = useState<AppPaymentRequest[]>([]);
    const [settings, setSettings] = useState<AppSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeSubTab, setActiveSubTab] = useState<'requests' | 'payouts' | 'store' | 'config' | 'orders' | 'history' | 'ranking'>('requests');
    const [distributeTotal, setDistributeTotal] = useState<string>('1000');
    const [isDistributing, setIsDistributing] = useState(false);

    // Product Modal State
    const [isProductModalOpen, setIsProductModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Partial<StoreProduct> | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [localCoinValue, setLocalCoinValue] = useState<string>('0.80');
    const [approvingRequestId, setApprovingRequestId] = useState<string | null>(null);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        const [drs, pros, sets, ords, trans, reqs] = await Promise.all([
            fetchAllProfilesForAdmin(),
            fetchStoreProducts(),
            fetchAppSettings(),
            fetchStoreOrders(),
            fetchAllWalletTransactions(),
            fetchPaymentRequests()
        ]);
        setProfiles(drs.sort((a, b) => (b.financial_balance || 0) - (a.financial_balance || 0)));
        setProducts(pros);
        setSettings(sets);
        if (sets?.coin_value_brl) {
            setLocalCoinValue(sets.coin_value_brl.toString());
        }
        setOrders(ords);
        setTransactions(trans);
        setPaymentRequests(reqs);
        setLoading(false);
    };

    const handleApproveRequest = async (req: AppPaymentRequest) => {
        const confirmMsg = req.type === 'client_withdrawal'
            ? `Confirmar pagamento PIX de R$ ${req.amount_money.toFixed(2)} para a chave ${req.pix_key}?\n\nCertifique-se de ter feito a transferência PIX manualmente antes de confirmar.`
            : `Confirmar pagamento de R$ ${req.amount_money.toFixed(2)} para o motorista?\n\nChave PIX: ${req.pix_key}`;

        if (!window.confirm(confirmMsg)) return;

        setApprovingRequestId(req.id);
        const success = await updatePaymentRequestStatus(req.id, 'paid');
        if (success) {
            alert("Solicitação marcada como PAGA!");
            loadData();
        } else {
            alert("Erro ao atualizar status.");
        }
        setApprovingRequestId(null);
    };

    const handleRejectRequest = async (req: AppPaymentRequest) => {
        const reason = prompt("Motivo da rejeição (opcional):");
        if (reason === null) return; // Cancelled

        setApprovingRequestId(req.id);
        const success = await updatePaymentRequestStatus(req.id, 'rejected', reason || undefined);
        if (success) {
            alert("Solicitação rejeitada e valor estornado.");
            loadData();
        } else {
            alert("Erro ao rejeitar solicitação.");
        }
        setApprovingRequestId(null);
    };

    const handleEditRequest = async (req: AppPaymentRequest) => {
        const newKey = prompt("Corrigir Chave PIX:", req.pix_key);
        if (newKey && newKey !== req.pix_key) {
            setApprovingRequestId(req.id);
            const success = await updatePaymentRequestPixKey(req.id, newKey);
            if (success) {
                alert("Chave PIX atualizada com sucesso!");
                loadData();
            } else {
                alert("Erro ao atualizar chave PIX.");
            }
            setApprovingRequestId(null);
        }
    };

    const handlePayout = async (driverId: string, amount: number) => {
        if (!window.confirm(`Confirmar pagamento de R$ ${amount.toFixed(2)} para este motorista?\nCertifique-se de já ter feito a transferência PIX.`)) return;

        // Uses old payout method (direct balance deduction without request)
        // Should ideally be replaced by the Request system, but keeping for compatibility
        // Simulating a request workflow for legacy manual payouts directly from list
        // Actually, payDriverBalance in supabaseClient does existing logic. Let's keep it.
        alert("Use a aba 'Solicitações' se o motorista pediu o saque. Para pagamentos avulsos, use esta função.");
    };

    const handleMarkDelivered = async (orderId: string) => {
        if (!window.confirm("Marcar este prêmio como entregue?")) return;
        const success = await updateStoreOrderStatus(orderId, 'delivered');
        if (success) {
            alert("Status atualizado!");
            loadData();
        }
    };

    const handleUpdateCoinValue = async (val: string) => {
        if (!settings) return;
        const newValue = parseFloat(val);
        if (isNaN(newValue) || newValue <= 0) {
            alert("Por favor, insira um valor válido maior que zero.");
            return;
        }

        if (!window.confirm(`Isso irá recalcular o preço em moedas de TODOS os ${products.length} produtos da loja. Deseja continuar?`)) return;

        setIsSaving(true);
        const newSettings = { ...settings, coin_value_brl: newValue };
        const errorMsg = await updateAppSettings(newSettings);

        if (!errorMsg) {
            setSettings(newSettings);

            // Recalcular moedas para todos os produtos
            let errorCount = 0;
            for (const product of products) {
                const newPriceCoins = Math.round((product.price_brl || 0) / newValue);
                const error = await updateStoreProduct(product.id, { price_coins: newPriceCoins });
                if (error) errorCount++;
            }

            if (errorCount === 0) {
                alert("Valor da moeda atualizado e todos os produtos foram recalculados!");
            } else {
                alert(`Configuração salva, mas houve erro em ${errorCount} produtos durante a atualização.`);
            }
            loadData();
        } else {
            alert(`Erro ao salvar configurações: ${errorMsg}`);
        }
        setIsSaving(false);
    };

    const handleSaveProduct = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingProduct?.name || !editingProduct?.price_coins) {
            alert("Preencha o nome e o preço em moedas.");
            return;
        }

        setIsSaving(true);

        let finalImageUrl = editingProduct.image_url;

        // Upload local image if selected
        if (selectedFile) {
            const uploadedUrl = await uploadStoreProductImage(selectedFile);
            if (uploadedUrl) {
                finalImageUrl = uploadedUrl;
            } else {
                alert("Erro ao enviar imagem. Verifique sua conexão.");
                setIsSaving(false);
                return;
            }
        }

        const productData = {
            ...editingProduct,
            image_url: finalImageUrl,
            price_coins: Number(editingProduct.price_coins),
            price_brl: Number(editingProduct.price_brl || 0),
            stock: Number(editingProduct.stock || 0),
            active: true
        };

        let errorMsg: string | null = null;
        if (editingProduct.id) {
            errorMsg = await updateStoreProduct(editingProduct.id, productData);
        } else {
            errorMsg = await createStoreProduct(productData);
        }

        if (!errorMsg) {
            alert("Produto salvo!");
            setIsProductModalOpen(false);
            setEditingProduct(null);
            setSelectedFile(null);
            setImagePreview(null);
            loadData();
        } else {
            alert(`Erro ao salvar: ${errorMsg}`);
        }
        setIsSaving(false);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setSelectedFile(file);
            const reader = new FileReader();
            reader.onloadend = () => {
                setImagePreview(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleDeleteProduct = async (id: string) => {
        if (!window.confirm("Deseja realmente excluir este produto?")) return;
        const errorMsg = await deleteStoreProduct(id);
        if (!errorMsg) {
            alert("Produto excluído!");
            loadData();
        } else {
            alert(`Erro ao excluir: ${errorMsg}`);
        }
    };

    return (
        <div className="flex-1 flex flex-col h-full bg-[#0b141a] text-white">
            {/* Sub-Tabs */}
            <div className="flex bg-whatsapp-panel p-1 m-4 rounded-xl border border-white/5 overflow-x-auto no-scrollbar">
                {[
                    { id: 'requests', label: 'Solicitações', icon: 'notifications_active' },
                    { id: 'payouts', label: 'Saldos Motoristas', icon: 'payments' },
                    { id: 'history', label: 'Histórico', icon: 'account_balance_wallet' },
                    { id: 'ranking', label: 'Ranking Moedas', icon: 'leaderboard' },
                    { id: 'orders', label: 'Prêmios', icon: 'local_shipping' },
                    { id: 'store', label: 'Loja', icon: 'inventory_2' },
                    { id: 'config', label: 'Economia', icon: 'settings_input_component' }
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveSubTab(tab.id as any)}
                        className={`flex-none md:flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-xs font-bold transition-all ${activeSubTab === tab.id
                            ? 'bg-whatsapp-green text-white shadow-lg'
                            : 'text-gray-400 hover:text-white hover:bg-white/5'
                            }`}
                    >
                        <span className="material-icons text-sm">{tab.icon}</span>
                        {tab.label}
                    </button>
                ))}
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-10 custom-scrollbar">
                {loading ? (
                    <div className="p-10 text-center opacity-50">Carregando...</div>
                ) : activeSubTab === 'requests' ? (
                    <div className="space-y-4">
                        <div className="bg-blue-600/10 border border-blue-500/20 p-4 rounded-xl text-xs text-blue-300 mb-6">
                            <p className="font-bold flex items-center gap-2 mb-1">
                                <span className="material-icons text-xs">info</span>
                                Solicitações de Saque
                            </p>
                            Aqui aparecem os pedidos de saque de motoristas (saldo de corridas) e clientes (moedas convertidas).
                        </div>
                        {paymentRequests.filter(r => r.status === 'pending').length === 0 ? (
                            <div className="p-20 text-center text-gray-500 italic">Nenhuma solicitação pendente.</div>
                        ) : (
                            paymentRequests.filter(r => r.status === 'pending').map(req => (
                                <div key={req.id} className="bg-whatsapp-panel/60 border border-white/5 p-4 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-whatsapp-green/30 transition-all">
                                    <div className="flex items-center gap-4">
                                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${req.type === 'driver_payout' ? 'bg-blue-500/20 text-blue-400' : 'bg-yellow-500/20 text-yellow-500'}`}>
                                            <span className="material-icons text-2xl">
                                                {req.type === 'driver_payout' ? 'directions_car' : 'savings'}
                                            </span>
                                        </div>
                                        <div>
                                            <p className="font-bold text-gray-100 flex items-center gap-2">
                                                {req.user?.username || 'Usuário'}
                                                <span className={`text-[9px] px-2 py-0.5 rounded-full uppercase font-black ${req.type === 'driver_payout' ? 'bg-blue-500/10 text-blue-400' : 'bg-yellow-500/10 text-yellow-400'}`}>
                                                    {req.type === 'driver_payout' ? 'Motorista' : 'Cliente'}
                                                </span>
                                            </p>
                                            <p className="text-[10px] text-gray-400 font-mono mt-1">
                                                PIX: <span className="text-white bg-white/5 px-1 rounded">{req.pix_key}</span>
                                            </p>
                                            <p className="text-[10px] text-gray-500 mt-1">
                                                {new Date(req.created_at).toLocaleString('pt-BR')}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-4 border-t border-white/5 pt-4 md:border-t-0 md:pt-0 justify-between md:justify-end w-full md:w-auto">
                                        <div className="text-right">
                                            <p className="text-[10px] text-gray-500 uppercase font-black">Valor do Saque</p>
                                            <p className="text-xl font-black text-whatsapp-green">R$ {req.amount_money.toFixed(2)}</p>
                                            {req.amount_coins > 0 && <p className="text-[9px] text-yellow-500 font-bold">({req.amount_coins} moedas)</p>}
                                        </div>

                                        <div className="flex flex-col gap-2">
                                            <button
                                                onClick={() => handleApproveRequest(req)}
                                                disabled={approvingRequestId === req.id}
                                                className="bg-whatsapp-green hover:bg-green-500 text-white font-black px-4 py-2 rounded-xl text-[10px] uppercase tracking-wider transition-all active:scale-95 shadow-lg flex items-center gap-2 justify-center"
                                            >
                                                {approvingRequestId === req.id ? '...' : 'Pagar via PIX'}
                                            </button>
                                            <button
                                                onClick={() => handleEditRequest(req)}
                                                disabled={approvingRequestId === req.id}
                                                className="bg-blue-500/10 hover:bg-blue-500 text-blue-400 hover:text-white font-black px-4 py-2 rounded-xl text-[10px] uppercase tracking-wider transition-all active:scale-95 border border-blue-500/20"
                                            >
                                                Corrigir Dados
                                            </button>
                                            <button
                                                onClick={() => handleRejectRequest(req)}
                                                disabled={approvingRequestId === req.id}
                                                className="bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white font-black px-4 py-2 rounded-xl text-[10px] uppercase tracking-wider transition-all active:scale-95 border border-red-500/20"
                                            >
                                                Rejeitar
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}

                        {/* Completed/Rejected History Section */}
                        {paymentRequests.filter(r => r.status !== 'pending').length > 0 && (
                            <div className="mt-8 pt-6 border-t border-white/5 opacity-60">
                                <h4 className="text-xs font-bold text-gray-500 uppercase mb-4">Histórico Recente de Solicitações</h4>
                                <div className="space-y-2">
                                    {paymentRequests.filter(r => r.status !== 'pending').slice(0, 5).map(req => (
                                        <div key={req.id} className="flex justify-between items-center bg-black/20 p-3 rounded-lg">
                                            <div className="text-xs">
                                                <span className="font-bold text-gray-300">{req.user?.username}</span>
                                                <span className="mx-2 text-gray-600">•</span>
                                                <span className="text-gray-500">R$ {req.amount_money.toFixed(2)}</span>
                                            </div>
                                            <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase ${req.status === 'paid' ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'}`}>
                                                {req.status === 'paid' ? 'Pago' : 'Rejeitado'}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                ) : activeSubTab === 'payouts' ? (
                    <div className="space-y-4">
                        <div className="bg-blue-600/10 border border-blue-500/20 p-4 rounded-xl text-xs text-blue-300 mb-6">
                            <p className="font-bold flex items-center gap-2 mb-1">
                                <span className="material-icons text-xs">info</span>
                                Conciliação de Motoristas
                            </p>
                            Estes saldos são oriundos de cupons de descontos usados por clientes e bônus. O pagamento deve ser feito manualmente via PIX e registrado aqui.
                        </div>

                        {profiles.filter(d => d.role === 'driver' && (d.financial_balance || 0) > 0).length === 0 ? (
                            <div className="p-20 text-center text-gray-500 italic">Nenhum motorista com saldo pendente.</div>
                        ) : (
                            profiles.filter(d => d.role === 'driver' && (d.financial_balance || 0) > 0).map(driver => (
                                <div key={driver.id} className="bg-whatsapp-panel/60 border border-white/5 p-4 rounded-2xl flex items-center justify-between hover:border-whatsapp-green/30 transition-all">
                                    <div className="flex items-center gap-4">
                                        <img src={driver.avatar_url || 'https://via.placeholder.com/40'} className="w-12 h-12 rounded-full object-cover" />
                                        <div>
                                            <p className="font-bold text-gray-100">{driver.username}</p>
                                            <p className="text-[10px] text-gray-400 font-mono">PIX: {driver.pix_key || 'Não cadastrado'}</p>
                                            <p className="text-[10px] text-gray-500 font-mono">Whats: {driver.whatsapp || driver.phone || 'Sem contato'}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-6">
                                        <div className="text-right">
                                            <p className="text-[10px] text-gray-500 uppercase font-black">Saldo a Receber</p>
                                            <p className="text-xl font-black text-whatsapp-green italic">R$ {driver.financial_balance?.toFixed(2)}</p>
                                        </div>
                                        <button
                                            onClick={() => handlePayout(driver.id, driver.financial_balance || 0)}
                                            className="bg-whatsapp-green hover:bg-green-500 text-white font-black px-4 py-2 rounded-xl text-[10px] uppercase tracking-wider transition-all active:scale-95 shadow-lg"
                                        >
                                            Pagar
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                ) : activeSubTab === 'history' ? (
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4 mb-6">
                            <div className="bg-whatsapp-green/10 border border-whatsapp-green/20 p-4 rounded-2xl">
                                <p className="text-[10px] text-gray-400 uppercase font-bold">Total Recebido (BRL)</p>
                                <p className="text-2xl font-black text-whatsapp-green">R$ {transactions.reduce((acc, t) => acc + (t.amount_money > 0 ? t.amount_money : 0), 0).toFixed(2)}</p>
                            </div>
                            <div className="bg-orange-500/10 border border-orange-500/20 p-4 rounded-2xl">
                                <p className="text-[10px] text-gray-400 uppercase font-bold">Total de Vendas</p>
                                <p className="text-2xl font-black text-orange-500">{transactions.filter(t => t.type === 'purchase').length}</p>
                            </div>
                        </div>

                        {transactions.length === 0 ? (
                            <div className="p-20 text-center text-gray-500 italic">Nenhuma transação encontrada.</div>
                        ) : (
                            transactions.map(t => (
                                <div key={t.id} className="bg-whatsapp-panel/40 border border-white/5 p-4 rounded-2xl flex items-center justify-between hover:border-white/10 transition-all">
                                    <div className="flex items-center gap-4">
                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${t.amount_money > 0 ? 'bg-whatsapp-green/20 text-whatsapp-green' : 'bg-red-500/20 text-red-500'}`}>
                                            <span className="material-icons">{t.amount_money > 0 ? 'add_circle' : 'remove_circle'}</span>
                                        </div>
                                        <div>
                                            <p className="font-bold text-gray-100">{t.description}</p>
                                            <p className="text-[10px] text-gray-400 flex items-center gap-1">
                                                <span className="font-bold text-white">{t.user?.username || 'Usuário'}</span>
                                                • {new Date(t.created_at).toLocaleString('pt-BR')}
                                            </p>
                                            <p className="text-[9px] text-gray-500">{t.user?.whatsapp || t.user?.phone || 'Sem contato'}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className={`text-lg font-black ${t.amount_money > 0 ? 'text-whatsapp-green' : 'text-red-500'}`}>
                                            {t.amount_money > 0 ? '+' : ''} R$ {Math.abs(t.amount_money).toFixed(2)}
                                        </p>
                                        <span className="text-[8px] bg-white/5 text-gray-400 px-2 py-0.5 rounded-full font-bold uppercase">{t.type}</span>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                ) : activeSubTab === 'ranking' ? (
                    <div className="space-y-6">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-yellow-500/10 border border-yellow-500/20 p-4 rounded-2xl">
                                <p className="text-[10px] text-gray-400 uppercase font-bold">Total de Moedas em Perfis</p>
                                <p className="text-2xl font-black text-yellow-500">
                                    {profiles.reduce((acc, u) => acc + (u.wallet_coins || 0), 0)}
                                </p>
                            </div>
                            <div className="bg-green-500/10 border border-green-500/20 p-4 rounded-2xl">
                                <p className="text-[10px] text-gray-400 uppercase font-bold">Moedas Ganhas (earning)</p>
                                <p className="text-2xl font-black text-green-500">
                                    {transactions.filter(t => t.type === 'earning').reduce((acc, t) => acc + (t.amount_coins || 0), 0)}
                                </p>
                            </div>
                        </div>

                        <div className="bg-whatsapp-panel/60 border border-white/10 rounded-2xl p-4">
                            <h3 className="font-black text-lg mb-3 flex items-center gap-2"><span className="material-icons text-sm">leaderboard</span> Ranking de Clientes por Moedas</h3>
                            <div className="space-y-2">
                                {profiles
                                    .filter(u => u.role === 'client')
                                    .map(u => {
                                        const earned = transactions.filter(t => t.type === 'earning' && t.user_id === u.id).reduce((acc, t) => acc + (t.amount_coins || 0), 0);
                                        return { user: u, earned };
                                    })
                                    .sort((a, b) => (b.user.wallet_coins || 0) - (a.user.wallet_coins || 0))
                                    .slice(0, 20)
                                    .map(({ user, earned }, idx) => (
                                        <div key={user.id} className="flex items-center justify-between bg-black/20 p-3 rounded-xl">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full overflow-hidden">
                                                    <img src={user.avatar_url || '/logo.png'} className="w-full h-full object-cover" />
                                                </div>
                                                <div>
                                                    <p className="font-bold">{idx + 1}. {user.username}</p>
                                                    <p className="text-[10px] text-gray-500">Ganhas: {earned} • Carteira: {user.wallet_coins || 0}</p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <span className="text-[10px] bg-white/5 text-gray-400 px-2 py-0.5 rounded-full font-bold uppercase">Cliente</span>
                                            </div>
                                        </div>
                                    ))}
                            </div>
                        </div>

                        <div className="bg-blue-600/10 border border-blue-500/20 p-4 rounded-2xl">
                            <h3 className="font-black text-lg mb-3 flex items-center gap-2"><span className="material-icons text-sm">scatter_plot</span> Distribuir Moedas Proporcionalmente</h3>
                            <p className="text-[11px] text-gray-400 mb-3">Distribui com base nas moedas ganhas (earning) registradas em wallet_transactions. Quem usa mais ganha mais. Se todos tiverem 0, distribui igualmente.</p>
                            <div className="flex items-center gap-3 mb-3">
                                <input
                                    type="number"
                                    value={distributeTotal}
                                    onChange={(e) => setDistributeTotal(e.target.value)}
                                    className="bg-black/20 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-whatsapp-green transition-all w-40"
                                />
                                <span className="text-sm font-bold text-gray-400">Moedas a distribuir</span>
                            </div>
                            <button
                                onClick={async () => {
                                    const total = parseInt(distributeTotal) || 0;
                                    if (total <= 0) { alert('Informe um total válido.'); return; }
                                    setIsDistributing(true);
                                    try {
                                        const clients = profiles.filter(u => u.role === 'client');
                                        const earnedMap: Record<string, number> = {};
                                        for (const t of transactions) {
                                            if (t.type === 'earning' && t.amount_coins > 0 && t.user_id) {
                                                earnedMap[t.user_id] = (earnedMap[t.user_id] || 0) + t.amount_coins;
                                            }
                                        }
                                        const weights = clients.map(u => ({ id: u.id, w: earnedMap[u.id] || 0 }));
                                        const sumW = weights.reduce((acc, it) => acc + it.w, 0);
                                        const perUser = sumW > 0
                                            ? weights.map(it => ({ id: it.id, amt: Math.floor(total * (it.w / sumW)) }))
                                            : clients.map(u => ({ id: u.id, amt: Math.floor(total / Math.max(clients.length, 1)) }));
                                        // Ajuste para somar exatamente o total (distribui resto aos primeiros)
                                        const sumAmt = perUser.reduce((acc, it) => acc + it.amt, 0);
                                        let remainder = total - sumAmt;
                                        for (let i = 0; i < perUser.length && remainder > 0; i++) {
                                            perUser[i].amt += 1; remainder -= 1;
                                        }
                                        // Aplicar
                                        for (const it of perUser) {
                                            if (it.amt > 0) {
                                                await supabase.rpc('increment_coins', { user_id_param: it.id, amount_param: it.amt });
                                                await supabase.from('wallet_transactions').insert({
                                                    user_id: it.id, type: 'bonus', amount_coins: it.amt, description: 'Distribuição Proporcional (Admin)'
                                                });
                                            }
                                        }
                                        alert('Distribuição concluída!');
                                        loadData();
                                    } catch (e) {
                                        alert('Erro na distribuição. Verifique sua conexão.');
                                    }
                                    setIsDistributing(false);
                                }}
                                disabled={isDistributing}
                                className="bg-whatsapp-green hover:bg-green-500 text-white font-black px-4 py-3 rounded-xl text-[10px] uppercase tracking-wider transition-all active:scale-95 shadow-lg"
                            >
                                {isDistributing ? 'Distribuindo...' : 'Distribuir Agora'}
                            </button>
                        </div>
                    </div>
                ) : activeSubTab === 'orders' ? (
                    <div className="space-y-4">
                        <div className="bg-orange-500/10 border border-orange-500/20 p-4 rounded-xl text-xs text-orange-300 mb-6">
                            <p className="font-bold flex items-center gap-2 mb-1">
                                <span className="material-icons text-xs">shopping_basket</span>
                                Pedidos de Prêmios
                            </p>
                            Aqui você gerencia as solicitações de troca de moedas/compras dos clientes.
                        </div>

                        {orders.length === 0 ? (
                            <div className="p-20 text-center text-gray-500 italic">Nenhum pedido realizado.</div>
                        ) : (
                            orders.map(order => (
                                <div key={order.id} className={`bg-whatsapp-panel/40 border ${order.status === 'delivered' ? 'border-whatsapp-green/20' : 'border-white/5'} p-4 rounded-2xl flex flex-col gap-4`}>
                                    <div className="flex justify-between items-start">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 bg-white/5 rounded-lg overflow-hidden shrink-0">
                                                <img src={order.product?.image_url} className="w-full h-full object-cover" />
                                            </div>
                                            <div>
                                                <p className="font-bold text-gray-100">{order.product?.name || 'Produto Removido'}</p>
                                                <p className="text-[10px] text-gray-400">Cliente: <span className="text-white font-bold">{order.user?.username}</span></p>
                                                <p className="text-[9px] text-gray-500">{new Date(order.created_at).toLocaleString('pt-BR')}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            {order.status === 'pending' ? (
                                                <span className="text-[10px] bg-orange-500/20 text-orange-500 px-2 py-0.5 rounded-full font-bold uppercase">Pendente</span>
                                            ) : (
                                                <span className="text-[10px] bg-green-500/20 text-green-500 px-2 py-0.5 rounded-full font-bold uppercase">Entregue</span>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between border-t border-white/5 pt-3">
                                        <div className="flex gap-4">
                                            <div className="flex flex-col">
                                                <span className="text-[8px] text-gray-500 uppercase font-bold">Pagamento</span>
                                                <span className="text-xs font-black text-white">{order.payment_method === 'coins' ? `${order.amount_coins} Moedas` : `R$ ${order.amount_money?.toFixed(2)}`}</span>
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-[8px] text-gray-500 uppercase font-bold">WhatsApp</span>
                                                <span className="text-xs font-black text-whatsapp-green">{order.user?.whatsapp || order.user?.phone || 'N/A'}</span>
                                            </div>
                                        </div>

                                        {order.status === 'pending' && (
                                            <button
                                                onClick={() => handleMarkDelivered(order.id)}
                                                className="bg-whatsapp-green text-white px-3 py-1.5 rounded-lg text-[10px] font-black uppercase hover:bg-green-500 transition-colors"
                                            >
                                                Marcar Entregue
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                ) : activeSubTab === 'store' ? (
                    <div className="space-y-6">
                        <div className="flex justify-between items-center mb-2 px-2">
                            <h3 className="font-bold text-lg">Catálogo da Loja</h3>
                            <button
                                onClick={() => {
                                    setEditingProduct({});
                                    setSelectedFile(null);
                                    setImagePreview(null);
                                    setIsProductModalOpen(true);
                                }}
                                className="bg-whatsapp-green text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 hover:bg-green-500 transition-all active:scale-95 shadow-lg shadow-green-500/20"
                            >
                                <span className="material-icons text-sm">add</span>
                                Novo Produto
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {products.length === 0 ? (
                                <div className="col-span-full p-20 text-center text-gray-500 italic">Nenhum produto cadastrado.</div>
                            ) : (
                                products.map(p => (
                                    <div key={p.id} className="bg-whatsapp-panel/40 border border-white/5 rounded-2xl overflow-hidden flex gap-4 p-3 relative group hover:border-whatsapp-green/30 transition-all">
                                        <div className="w-20 h-20 rounded-xl overflow-hidden bg-white/5 shrink-0">
                                            <img src={p.image_url || 'https://via.placeholder.com/100'} className="w-full h-full object-cover" />
                                        </div>
                                        <div className="flex-1 min-w-0 pr-10">
                                            <h4 className="font-bold text-gray-100 truncate">{p.name}</h4>
                                            <p className="text-[10px] text-gray-500 line-clamp-1 mb-2">{p.description}</p>
                                            <div className="flex gap-3">
                                                <span className="text-[10px] bg-yellow-400/20 text-yellow-400 px-2 py-0.5 rounded-full font-bold">{p.price_coins} Moedas</span>
                                                <span className="text-[10px] bg-green-500/20 text-green-500 px-2 py-0.5 rounded-full font-bold">R$ {p.price_brl}</span>
                                            </div>
                                        </div>

                                        {/* Actions */}
                                        <div className="absolute top-3 right-3 flex flex-col gap-2">
                                            <button
                                                onClick={() => {
                                                    setEditingProduct(p);
                                                    setSelectedFile(null);
                                                    setImagePreview(p.image_url || null);
                                                    setIsProductModalOpen(true);
                                                }}
                                                className="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center hover:bg-blue-500 hover:text-white transition-all"
                                            >
                                                <span className="material-icons text-sm">edit</span>
                                            </button>
                                            <button
                                                onClick={() => handleDeleteProduct(p.id)}
                                                className="w-8 h-8 rounded-lg bg-red-500/20 text-red-500 flex items-center justify-center hover:bg-red-500 hover:text-white transition-all"
                                            >
                                                <span className="material-icons text-sm">delete</span>
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="max-w-md mx-auto space-y-8 py-10">
                        <div className="bg-gradient-to-r from-yellow-500/10 to-transparent p-6 rounded-[24px] border border-yellow-500/20">
                            <div className="flex items-center gap-4 mb-6">
                                <div className="w-12 h-12 bg-yellow-500/20 rounded-2xl flex items-center justify-center text-yellow-500">
                                    <span className="material-icons text-2xl">savings</span>
                                </div>
                                <div>
                                    <h3 className="font-black text-xl italic uppercase tracking-tighter">Valor da Moeda</h3>
                                    <p className="text-xs text-gray-500">Defina quanto vale cada moeda para o cliente.</p>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="text-[10px] font-black uppercase text-gray-400 mb-2 block">1 Moeda equivale a (em R$):</label>
                                    <div className="flex flex-col gap-4">
                                        <div className="flex items-center gap-3">
                                            <span className="text-2xl font-black text-gray-500">R$</span>
                                            <input
                                                type="number"
                                                step="0.05"
                                                value={localCoinValue}
                                                onChange={(e) => setLocalCoinValue(e.target.value)}
                                                className="bg-whatsapp-panel text-white text-3xl font-black rounded-2xl p-4 w-full outline-none border border-white/5 focus:border-yellow-500/50 transition-all"
                                            />
                                        </div>
                                        <button
                                            onClick={() => handleUpdateCoinValue(localCoinValue)}
                                            className="w-full bg-yellow-500 hover:bg-yellow-400 text-black font-black py-4 rounded-2xl transition-all shadow-lg shadow-yellow-500/20 active:scale-95 flex items-center justify-center gap-2"
                                        >
                                            <span className="material-icons">save</span>
                                            SALVAR VALOR
                                        </button>
                                    </div>
                                    <p className="text-[9px] text-gray-500 mt-2 italic">* Este valor é usado apenas para exibir o saldo estimado para o cliente.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Product Modal */}
            {isProductModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                    <div className="bg-[#1f2c33] w-full max-w-md rounded-3xl overflow-hidden shadow-2xl border border-white/10 animate-in fade-in zoom-in duration-200">
                        <div className="p-6 border-b border-white/5 flex justify-between items-center">
                            <h3 className="text-xl font-bold">{editingProduct?.id ? 'Editar Produto' : 'Novo Produto'}</h3>
                            <button onClick={() => setIsProductModalOpen(false)} className="text-gray-400 hover:text-white">
                                <span className="material-icons">close</span>
                            </button>
                        </div>
                        <form onSubmit={handleSaveProduct} className="p-6 space-y-4">
                            <div>
                                <label className="text-[10px] font-bold uppercase text-gray-500 mb-1 block">Nome do Produto</label>
                                <input
                                    type="text"
                                    required
                                    value={editingProduct?.name || ''}
                                    onChange={e => setEditingProduct({ ...editingProduct, name: e.target.value })}
                                    className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-whatsapp-green transition-all"
                                    placeholder="Ex: Uber Gift Card"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-bold uppercase text-gray-500 mb-1 block">Descrição</label>
                                <textarea
                                    value={editingProduct?.description || ''}
                                    onChange={e => setEditingProduct({ ...editingProduct, description: e.target.value })}
                                    className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-whatsapp-green transition-all h-20"
                                    placeholder="Detalhes do prêmio..."
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-bold uppercase text-gray-500 mb-1 block">Preço (Moedas)</label>
                                    <input
                                        type="number"
                                        required
                                        value={editingProduct?.price_coins || ''}
                                        onChange={e => {
                                            const coins = parseInt(e.target.value) || 0;
                                            const brl = coins * (settings?.coin_value_brl || 1.0);
                                            setEditingProduct({
                                                ...editingProduct,
                                                price_coins: coins,
                                                price_brl: parseFloat(brl.toFixed(2))
                                            });
                                        }}
                                        className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-whatsapp-green transition-all"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold uppercase text-gray-500 mb-1 block">Preço (BRL via PIX)</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={editingProduct?.price_brl || ''}
                                        onChange={e => {
                                            const brl = parseFloat(e.target.value) || 0;
                                            const coins = Math.round(brl / (settings?.coin_value_brl || 1.0));
                                            setEditingProduct({
                                                ...editingProduct,
                                                price_brl: brl,
                                                price_coins: coins
                                            });
                                        }}
                                        className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-whatsapp-green transition-all"
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-bold uppercase text-gray-500 mb-1 block">Loja/Estoque</label>
                                    <input
                                        type="number"
                                        value={editingProduct?.stock || ''}
                                        onChange={e => setEditingProduct({ ...editingProduct, stock: parseInt(e.target.value) })}
                                        className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-whatsapp-green transition-all"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold uppercase text-gray-500 mb-1 block">Foto do Produto</label>
                                    <div className="flex items-center gap-4">
                                        <div className="w-20 h-20 bg-black/20 border border-white/10 rounded-2xl overflow-hidden flex items-center justify-center shrink-0">
                                            {imagePreview ? (
                                                <img src={imagePreview} className="w-full h-full object-cover" />
                                            ) : (
                                                <span className="material-icons text-gray-600">image</span>
                                            )}
                                        </div>
                                        <div className="flex-1">
                                            <label className="bg-white/5 border border-white/10 text-white px-4 py-2 rounded-xl text-xs font-bold cursor-pointer hover:bg-white/10 transition-all block text-center">
                                                Escolher local...
                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    onChange={handleFileChange}
                                                    className="hidden"
                                                />
                                            </label>
                                            <p className="text-[8px] text-gray-500 mt-2">Formatos: PNG, JPG ou WEBP. Máx: 2MB.</p>
                                        </div>
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold uppercase text-gray-500 mb-1 block">Ou link da imagem (URL)</label>
                                    <input
                                        type="text"
                                        value={editingProduct?.image_url || ''}
                                        onChange={e => {
                                            setEditingProduct({ ...editingProduct, image_url: e.target.value });
                                            setImagePreview(e.target.value);
                                        }}
                                        className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-whatsapp-green transition-all"
                                        placeholder="https://..."
                                    />
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={isSaving}
                                className="w-full bg-whatsapp-green hover:bg-green-500 text-white font-bold py-4 rounded-2xl transition-all shadow-lg shadow-green-500/20 active:scale-95 disabled:opacity-50"
                            >
                                {isSaving ? 'Salvando...' : 'Salvar Produto'}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
