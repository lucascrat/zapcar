
import React, { useState, useEffect } from 'react';
import { UserProfile, UserRole, WalletTransaction, AppSettings, StoreOrder } from '../types';
import { fetchWalletTransactions, fetchAppSettings, addCoinsToUser, updateUserProfile, fetchStoreOrders, createPaymentRequest, fetchUserProfile, supabase } from '../services/supabaseClient';
import { AdMobService } from '../services/adMobService';
import { formatBRL, convertCoinsToBRL } from '../utils/currency';

interface WalletScreenProps {
    currentUser: UserProfile;
    onClose: () => void;
    onOpenStore: () => void;
    onUpdateUser?: (updated: UserProfile) => void;
}

export const WalletScreen: React.FC<WalletScreenProps> = ({ currentUser, onClose, onOpenStore, onUpdateUser }) => {
    const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
    const [orders, setOrders] = useState<StoreOrder[]>([]);
    const [settings, setSettings] = useState<AppSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [isWatchingVideo, setIsWatchingVideo] = useState(false);
    const [cooldownMs, setCooldownMs] = useState(0);
    const [showEditProfile, setShowEditProfile] = useState(false);
    const [userCoins, setUserCoins] = useState<number>(currentUser.wallet_coins || 0);
    const [isUpdatingBalance, setIsUpdatingBalance] = useState(false);
    const [conversionError, setConversionError] = useState<string | null>(null);

    // Withdrawal State
    const [showWithdrawModal, setShowWithdrawModal] = useState(false);
    const [withdrawAmount, setWithdrawAmount] = useState('');
    const [withdrawPixKey, setWithdrawPixKey] = useState(currentUser.pix_key || '');
    const [pixType, setPixType] = useState<'cpf' | 'email' | 'phone' | 'random'>('phone');
    const [processingWithdraw, setProcessingWithdraw] = useState(false);

    // Edit Form State
    const [pixKey, setPixKey] = useState(currentUser.pix_key || '');
    const [whatsapp, setWhatsapp] = useState(currentUser.whatsapp || currentUser.phone || '');
    const [updating, setUpdating] = useState(false);

    useEffect(() => {
        if (typeof currentUser.wallet_coins === 'number') {
            setUserCoins(currentUser.wallet_coins);
        }
    }, [currentUser.wallet_coins]);

    useEffect(() => {
        loadData();
        if (window.Capacitor?.isNativePlatform()) {
            AdMobService.showBanner().catch(() => {});
        }
        const settingsSub = supabase
            .channel('wallet_settings_sync')
            .on('postgres_changes', { event: '*', schema: 'chegoja', table: 'app_settings' }, (payload) => {
                setSettings(payload.new as AppSettings);
            })
            .subscribe();
        const refresh = async () => {
            setIsUpdatingBalance(true);
            try {
                const [s, refreshed] = await Promise.all([fetchAppSettings(), fetchUserProfile(currentUser.id)]);
                if (s) setSettings(s);
                if (refreshed && typeof refreshed.wallet_coins === 'number') {
                    setUserCoins(refreshed.wallet_coins || 0);
                }
            } finally {
                setIsUpdatingBalance(false);
            }
        };
        const refreshInterval = setInterval(refresh, 30000);
        const tick = () => {
            try {
                const key = `reward_last_ts:${currentUser.id}`;
                const last = parseInt(localStorage.getItem(key) || '0');
                const now = Date.now();
                const remain = Math.max(0, (last + 10 * 60 * 1000) - now);
                setCooldownMs(remain);
            } catch { setCooldownMs(0); }
        };
        tick();
        const t = setInterval(tick, 1000);
        return () => {
            if (window.Capacitor?.isNativePlatform()) {
                AdMobService.removeBanner().catch(() => {});
            }
            supabase.removeChannel(settingsSub);
            clearInterval(refreshInterval);
            clearInterval(t);
        };
    }, []);

    const loadData = async () => {
        setLoading(true);
        const [txs, ords, s] = await Promise.all([
            fetchWalletTransactions(currentUser.id),
            fetchStoreOrders(),
            fetchAppSettings()
        ]);
        setTransactions(txs);
        setOrders(ords.filter(o => o.user_id === currentUser.id));
        setSettings(s);
        const refreshed = await fetchUserProfile(currentUser.id);
        if (refreshed && typeof refreshed.wallet_coins === 'number') {
            setUserCoins(refreshed.wallet_coins || 0);
        }
        setLoading(false);
    };

    const handleUpdateProfile = async () => {
        setUpdating(true);
        const success = await updateUserProfile(currentUser.id, {
            pix_key: pixKey,
            whatsapp: whatsapp
        });
        if (success) {
            alert("Dados atualizados com sucesso!");
            setShowEditProfile(false);
            // Update local state for withdrawal key too
            setWithdrawPixKey(pixKey);
        }
        setUpdating(false);
    };

    const handleWithdrawRequest = async () => {
        if (!withdrawAmount || !withdrawPixKey) return;
        const amount = parseFloat(withdrawAmount);
        if (isNaN(amount) || amount <= 0) {
            alert("Valor inválido.");
            return;
        }

        // Calculate Coins needed if Client
        let amountCoins = 0;
        if (currentUser.role === UserRole.CLIENT && settings?.coin_value_brl) {
            amountCoins = Math.ceil(amount / settings.coin_value_brl);
        }

        // Validation for Clients: Min 100 coins
        if (currentUser.role === UserRole.CLIENT) {
            if (amountCoins < 100) {
                alert(`O valor mínimo para saque é de 100 moedas (aprox. R$ ${(100 * (settings?.coin_value_brl || 0)).toFixed(2)}).`);
                return;
            }
        } else {
             // Driver validation
             if (amount < 5) {
                alert("O valor mínimo para saque é R$ 5,00.");
                return;
             }
        }

        setProcessingWithdraw(true);

        let finalPixKey = withdrawPixKey;
        // Se for cliente, adiciona o tipo de chave para facilitar admin
        if (currentUser.role === UserRole.CLIENT) {
             finalPixKey = `[${pixType.toUpperCase()}] ${withdrawPixKey}`;
        }

        const type = currentUser.role === UserRole.DRIVER ? 'driver_payout' : 'client_withdrawal';

        const result = await createPaymentRequest(
            currentUser.id,
            type,
            amount,
            amountCoins,
            finalPixKey
        );

        if (result.success) {
            alert(result.message);
            setShowWithdrawModal(false);
            setWithdrawAmount('');
            loadData(); // Reload to see deduction
        } else {
            alert(result.message);
        }

        setProcessingWithdraw(false);
    };

    const handleWatchVideo = async () => {
        if (cooldownMs > 0) {
            const m = Math.floor(cooldownMs / 60000);
            const s = Math.floor((cooldownMs % 60000) / 1000);
            alert(`Aguarde ${m}m ${s}s para assistir outro vídeo premiado.`);
            return;
        }
        setIsWatchingVideo(true);
        try {
            // Simulator or Real AdMob
            let success = false;
            try {
                success = await AdMobService.showRewardVideo();
            } catch (adError) {
                console.error("Erro interno do AdMob:", adError);
                // Se falhar o AdMob, tentamos simular sucesso em DEV ou mostrar erro
                // Em produção, deve ser false.
                success = false;
            }

            if (success) {
                try {
                    const result = await addCoinsToUser(currentUser.id, 1, 'Vídeo Premiado');
                    
                    // Sucesso total OU sucesso parcial (histórico falhou mas saldo foi)
                    // A função addCoinsToUser retorna { success: true } mesmo se o histórico falhar
                    if (result.success) {
                        if (window.Android?.showToast) window.Android.showToast("Parabéns! Você ganhou 1 moeda.");
                        
                        // 1. Atualização Otimista (Visual Imediato)
                        const currentCoins = typeof userCoins === 'number' ? userCoins : 0;
                        const newBalance = currentCoins + 1;
                        setUserCoins(newBalance);
                        
                        // 2. Persistência Local (Cache)
                        if (currentUser) {
                            const updatedUser = { ...currentUser, wallet_coins: newBalance };
                            // Atualiza estado global se existir função
                            if (onUpdateUser) onUpdateUser(updatedUser as UserProfile);
                            // Salva no localStorage para próxima abertura
                            try { localStorage.setItem('chegoja_user', JSON.stringify(updatedUser)); } catch {}
                        }

                        // 3. Sincronização com Servidor (Background)
                        fetchUserProfile(currentUser.id).then(refreshed => {
                            if (refreshed && typeof refreshed.wallet_coins === 'number') {
                                // Se o servidor retornar valor diferente, corrigimos
                                if (refreshed.wallet_coins !== newBalance) {
                                    setUserCoins(refreshed.wallet_coins);
                                    if (onUpdateUser) onUpdateUser(refreshed);
                                }
                            }
                        });

                        loadData();
                        try {
                            localStorage.setItem(`reward_last_ts:${currentUser.id}`, String(Date.now()));
                            const now = Date.now();
                            const remain = Math.max(0, (now + 10 * 60 * 1000) - now);
                            setCooldownMs(remain);
                        } catch {}
                    } else {
                        // Erro explícito do backend (ex: tabela não existe)
                        console.error("Erro backend:", result.message);
                        alert("Erro ao salvar moeda: " + (result.message || "Tente novamente."));
                    }
                } catch (creditError) {
                    console.error("Erro fatal ao creditar:", creditError);
                    alert("Erro de conexão. Verifique sua internet.");
                }
            } else {
                console.log("Vídeo cancelado ou falhou no carregamento.");
            }
        } catch (e) {
            console.error("Erro ao processar vídeo:", e);
        } finally {
            setIsWatchingVideo(false);
        }
    };

    const isDriver = currentUser.role === UserRole.DRIVER;

    return (
        <div className="flex-1 flex flex-col h-full bg-[#0b141a] text-white animate-fade-in relative">
            {/* Header */}
            <div className="bg-whatsapp-panel p-4 flex items-center justify-between shadow-lg shrink-0 pt-safe">
                <div className="flex items-center gap-3">
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition">
                        <span className="material-icons">arrow_back</span>
                    </button>
                    <h1 className="text-xl font-bold tracking-tight">Minha Carteira</h1>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar">
                {/* Balance Card */}
                <div className="bg-gradient-to-br from-[#00a884] to-[#017561] rounded-[32px] p-8 shadow-2xl relative overflow-hidden group">
                    {/* Decorative elements */}
                    <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-3xl group-hover:bg-white/20 transition-all duration-700"></div>
                    <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-black/10 rounded-full blur-3xl"></div>

                    <div className="relative z-10 flex flex-col items-center">
                        <p className="text-white/80 text-xs font-black uppercase tracking-[0.2em] mb-2">
                            {isDriver ? 'Saldo Disponível' : 'Minhas Moedas'}
                        </p>
                        <div className="flex items-center gap-3">
                            <span className="material-icons text-3xl text-yellow-300">
                                {isDriver ? 'account_balance_wallet' : 'stars'}
                            </span>
                            <h2 className="text-5xl font-black text-white tracking-tighter italic">
                                {(() => {
                                    try {
                                        if (isDriver) return formatBRL(currentUser.financial_balance || 0);
                                        const brl = convertCoinsToBRL(userCoins, settings?.coin_value_brl || 0);
                                        return formatBRL(brl);
                                    } catch (e: any) {
                                        setConversionError('Conversão indisponível');
                                        return formatBRL(0);
                                    }
                                })()}
                            </h2>
                            {isUpdatingBalance && (
                                <div className="w-6 h-6 border-4 border-white/40 border-t-transparent rounded-full animate-spin"></div>
                            )}
                        </div>
                        {!isDriver && (
                            <div className="mt-3">
                                <span className="inline-flex items-center gap-2 bg-black/20 text-white px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border border-white/10">
                                    <span className="material-icons text-xs">stars</span>
                                    {userCoins} Moedas
                                </span>
                                {conversionError && (
                                    <div className="mt-2 text-[10px] text-gray-300 font-bold">
                                        {conversionError}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Action Buttons inside Card */}
                        <div className="mt-6 w-full flex justify-center">
                            {isDriver ? (
                                <button
                                    onClick={() => setShowWithdrawModal(true)}
                                    // disabled={(currentUser.financial_balance || 0) <= 0}
                                    className="bg-white text-teal-800 px-6 py-2 rounded-full font-black text-xs uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-lg flex items-center gap-2"
                                >
                                    <span className="material-icons text-sm">payments</span>
                                    Pedir Pagamento
                                </button>
                            ) : (
                                <button
                                    onClick={() => setShowWithdrawModal(true)}
                                    // disabled={((currentUser.wallet_coins || 0) * (settings?.coin_value_brl || 0)) < 5}
                                    className="bg-white text-teal-800 px-6 py-2 rounded-full font-black text-xs uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-lg flex items-center gap-2 disabled:opacity-50 disabled:grayscale"
                                >
                                    <span className="material-icons text-sm">pix</span>
                                    Sacar via PIX (Min R$ 5)
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Main Actions */}
                <div className="grid grid-cols-1 gap-4">
                    {!isDriver ? (
                        <>
                            <button
                                onClick={handleWatchVideo}
                                disabled={isWatchingVideo || cooldownMs > 0}
                                className="bg-[#202c33] border border-white/10 p-6 rounded-[24px] flex items-center justify-between hover:bg-[#2a3942] transition-all active:scale-95 group shadow-xl"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-2xl bg-yellow-400/10 flex items-center justify-center text-yellow-400 group-hover:scale-110 transition-transform">
                                        <span className="material-icons text-2xl">play_circle_filled</span>
                                    </div>
                                    <div className="text-left">
                                        <p className="font-bold text-base">Vídeo Premiado</p>
                                        <p className="text-xs text-gray-500">Ganhe moedas assistindo vídeos</p>
                                    </div>
                                </div>
                                <div className="bg-yellow-400 text-black font-black px-3 py-1 rounded-full text-[10px] uppercase">
                                    {cooldownMs > 0 ? `Aguarde ${Math.floor(cooldownMs/60000)}m ${Math.floor((cooldownMs%60000)/1000)}s` : '+1 Moeda'}
                                </div>
                            </button>

                            <button
                                onClick={onOpenStore}
                                className="bg-[#202c33] border border-white/10 p-6 rounded-[24px] flex items-center justify-between hover:bg-[#2a3942] transition-all active:scale-95 group shadow-xl"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-2xl bg-orange-500/10 flex items-center justify-center text-orange-500 group-hover:scale-110 transition-transform">
                                        <span className="material-icons text-2xl">shopping_bag</span>
                                    </div>
                                    <div className="text-left">
                                        <p className="font-bold text-base">Loja de Prêmios</p>
                                        <p className="text-xs text-gray-500">Troque suas moedas por produtos</p>
                                    </div>
                                </div>
                                <span className="material-icons text-gray-600">chevron_right</span>
                            </button>
                        </>
                    ) : (
                        <div className="bg-accent-600/10 border border-accent-500/20 p-6 rounded-[24px] flex flex-col gap-3">
                            <h3 className="text-accent-400 font-bold flex items-center gap-2">
                                <span className="material-icons text-sm">info</span> Regras de Pagamento
                            </h3>
                            <p className="text-xs text-gray-400 leading-relaxed text-justify">
                                O seu saldo é atualizado automaticamente sempre que um cliente utiliza um cupom de desconto em sua corrida ou se houver bonificação da plataforma. Os pagamentos são realizados via PIX pelo administrador conforme o calendário vigente.
                            </p>
                            <button
                                onClick={() => setShowEditProfile(true)}
                                className="mt-2 bg-accent-600 hover:bg-accent-500 text-white font-black py-4 rounded-2xl flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg uppercase text-[10px] tracking-wider"
                            >
                                <span className="material-icons text-sm">edit</span>
                                Alterar Dados de Recebimento
                            </button>
                        </div>
                    )}
                </div>

                {/* EDIT PROFILE MODAL (Driver Only) */}
                {showEditProfile && (
                    <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 animate-fade-in">
                        <div className="bg-whatsapp-panel w-full max-w-sm rounded-[32px] border border-white/5 shadow-2xl overflow-hidden animate-slide-up">
                            <div className="p-6 border-b border-white/5 flex justify-between items-center">
                                <h3 className="font-bold text-lg">Dados de Pagamento</h3>
                                <button onClick={() => setShowEditProfile(false)} className="text-gray-500 hover:text-white transition">
                                    <span className="material-icons">close</span>
                                </button>
                            </div>
                            <div className="p-6 space-y-5">
                                <div>
                                    <label className="text-[10px] font-black uppercase text-gray-500 mb-2 block">Sua Chave PIX</label>
                                    <input
                                        type="text"
                                        placeholder="CPF, E-mail, Celular ou Aleatória"
                                        value={pixKey}
                                        onChange={(e) => setPixKey(e.target.value)}
                                        className="w-full bg-[#0b141a] text-white rounded-xl p-4 border border-white/10 focus:border-whatsapp-green outline-none transition-all"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black uppercase text-gray-500 mb-2 block">Seu WhatsApp (Somente números)</label>
                                    <input
                                        type="tel"
                                        placeholder="Ex: 11999999999"
                                        value={whatsapp}
                                        onChange={(e) => setWhatsapp(e.target.value)}
                                        className="w-full bg-[#0b141a] text-white rounded-xl p-4 border border-white/10 focus:border-whatsapp-green outline-none transition-all"
                                    />
                                    <p className="text-[8px] text-gray-500 mt-2">DICA: Usamos este número para entrar em contato após as transferências.</p>
                                </div>

                                <button
                                    onClick={handleUpdateProfile}
                                    disabled={updating}
                                    className="w-full bg-whatsapp-green text-white font-black py-4 rounded-xl flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50 uppercase text-xs"
                                >
                                    {updating ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : "Salvar Alterações"}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* WITHDRAW MODAL */}
                {showWithdrawModal && (
                    <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 animate-fade-in">
                        <div className="bg-whatsapp-panel w-full max-w-sm rounded-[32px] border border-white/5 shadow-2xl overflow-hidden animate-slide-up">
                            <div className="p-6 border-b border-white/5 flex justify-between items-center">
                                <h3 className="font-bold text-lg">Solicitar Saque</h3>
                                <button onClick={() => setShowWithdrawModal(false)} className="text-gray-500 hover:text-white transition">
                                    <span className="material-icons">close</span>
                                </button>
                            </div>
                            <div className="p-6 space-y-5">
                                <div className="bg-white/5 p-4 rounded-xl text-center">
                                    <p className="text-xs text-gray-400 uppercase font-bold mb-1">Disponível para Saque</p>
                                    <p className="text-2xl font-black text-white">
                                        R$ {currentUser.role === UserRole.DRIVER
                                            ? (currentUser.financial_balance || 0).toFixed(2)
                                            : ((currentUser.wallet_coins || 0) * (settings?.coin_value_brl || 0)).toFixed(2)}
                                    </p>
                                    {currentUser.role === UserRole.CLIENT && (
                                        <p className="text-[10px] text-green-400 font-bold mt-1">Mínimo: R$ 5,00</p>
                                    )}
                                </div>

                                {currentUser.role === UserRole.CLIENT && (
                                    <div className="mb-4">
                                        <label className="text-[10px] font-black uppercase text-gray-500 mb-2 block">Tipo de Chave PIX</label>
                                        <div className="grid grid-cols-2 gap-2">
                                            {[
                                                { id: 'cpf', label: 'CPF/CNPJ' },
                                                { id: 'phone', label: 'Celular' },
                                                { id: 'email', label: 'E-mail' },
                                                { id: 'random', label: 'Aleatória' }
                                            ].map((t) => (
                                                <button
                                                    key={t.id}
                                                    onClick={() => setPixType(t.id as any)}
                                                    className={`p-3 rounded-xl text-[10px] font-black uppercase transition-all border ${pixType === t.id ? 'bg-whatsapp-green border-whatsapp-green text-white' : 'bg-white/5 border-white/5 text-gray-400 hover:bg-white/10'}`}
                                                >
                                                    {t.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div>
                                    <label className="text-[10px] font-black uppercase text-gray-500 mb-2 block">Valor do Saque (R$)</label>
                                    <input
                                        type="number"
                                        placeholder="0.00"
                                        value={withdrawAmount}
                                        onChange={(e) => setWithdrawAmount(e.target.value)}
                                        className="w-full bg-[#0b141a] text-white rounded-xl p-4 border border-white/10 focus:border-whatsapp-green outline-none transition-all text-xl font-bold text-center"
                                    />
                                </div>

                                <div>
                                    <label className="text-[10px] font-black uppercase text-gray-500 mb-2 block">Chave PIX de Destino</label>
                                    <input
                                        type="text"
                                        placeholder="Sua chave PIX"
                                        value={withdrawPixKey}
                                        onChange={(e) => setWithdrawPixKey(e.target.value)}
                                        className="w-full bg-[#0b141a] text-white rounded-xl p-4 border border-white/10 focus:border-whatsapp-green outline-none transition-all text-center"
                                    />
                                </div>

                                <button
                                    onClick={handleWithdrawRequest}
                                    disabled={processingWithdraw || !withdrawAmount || Number(withdrawAmount) <= 0 || !withdrawPixKey}
                                    className="w-full bg-green-600 hover:bg-green-500 text-white font-black py-4 rounded-xl flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50 disabled:grayscale uppercase text-xs shadow-lg shadow-green-600/20"
                                >
                                    {processingWithdraw ? (
                                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                    ) : (
                                        <>
                                            <span className="material-icons">payments</span>
                                            Confirmar Saque
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* History Section */}
                <div className="space-y-6">
                    <div className="flex gap-4 border-b border-white/5 pb-2">
                        <h3 className="text-white font-bold text-lg flex items-center gap-2 px-2 border-b-2 border-whatsapp-green pb-2">
                            Histórico
                        </h3>
                    </div>

                    {loading ? (
                        <div className="p-10 text-center text-gray-500">Carregando...</div>
                    ) : (
                        <div className="space-y-8">
                            {/* PRIZES SECTION (Clients only) */}
                            {!isDriver && orders.length > 0 && (
                                <div className="space-y-4">
                                    <h4 className="text-[10px] font-black uppercase text-gray-500 tracking-widest px-2 group flex items-center gap-2">
                                        <span className="material-icons text-xs">redeem</span> Meus Prêmios
                                    </h4>
                                    <div className="space-y-3">
                                        {orders.map(order => (
                                            <div key={order.id} className="bg-[#202c33] border border-white/5 p-4 rounded-2xl flex items-center justify-between shadow-lg">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-12 h-12 rounded-xl border border-white/10 overflow-hidden shrink-0">
                                                        <img
                                                            src={order.product?.image_url || 'https://via.placeholder.com/60'}
                                                            className="w-full h-full object-cover"
                                                            alt={order.product?.name}
                                                        />
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-bold text-gray-100">{order.product?.name}</p>
                                                        <p className="text-[10px] text-gray-500 font-medium">
                                                            {order.payment_method === 'coins' ? `${order.amount_coins} moedas` : `R$ ${order.amount_money?.toFixed(2)}`} • {new Date(order.created_at).toLocaleDateString()}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    {order.status === 'pending' ? (
                                                        <span className="text-[9px] bg-orange-500/20 text-orange-400 px-2.5 py-1 rounded-full font-black uppercase tracking-tighter shadow-sm border border-orange-500/10">Pendente</span>
                                                    ) : (
                                                        <span className="text-[9px] bg-whatsapp-green/20 text-whatsapp-green px-2.5 py-1 rounded-full font-black uppercase tracking-tighter shadow-sm border border-whatsapp-green/10">Entregue</span>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* TRANSACTIONS SECTION */}
                            <div className="space-y-4">
                                <h4 className="text-[10px] font-black uppercase text-gray-500 tracking-widest px-2 flex items-center gap-2">
                                    <span className="material-icons text-xs">swap_vert</span> Movimentações
                                </h4>
                                {transactions.length === 0 ? (
                                    <div className="p-14 text-center text-gray-600 italic text-xs bg-black/10 rounded-3xl border border-dashed border-white/5">
                                        Nenhuma movimentação ainda.
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {transactions.map((tx) => (
                                            <div key={tx.id} className="bg-[#202c33] border border-white/5 p-4 rounded-2xl flex items-center justify-between shadow-md">
                                                <div className="flex items-center gap-4">
                                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${tx.type === 'earning' ? 'bg-green-500/10 text-green-500' :
                                                        tx.type === 'purchase' ? 'bg-orange-500/10 text-orange-500' :
                                                            'bg-blue-500/10 text-blue-500'
                                                        }`}>
                                                        <span className="material-icons text-xl">
                                                            {tx.type === 'earning' ? 'add_circle' :
                                                                tx.type === 'purchase' ? 'shopping_cart' :
                                                                    'payments'}
                                                        </span>
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-bold text-gray-200">{tx.description}</p>
                                                        <p className="text-[10px] text-gray-500">
                                                            {new Date(tx.created_at).toLocaleDateString('pt-BR')} às {new Date(tx.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    {tx.amount_coins !== 0 && (
                                                        <p className={`text-sm font-black ${tx.amount_coins > 0 ? 'text-green-500' : 'text-red-500'}`}>
                                                            {tx.amount_coins > 0 ? '+' : ''}{tx.amount_coins}
                                                            <span className="text-[10px] ml-1 font-bold">moedas</span>
                                                        </p>
                                                    )}
                                                    {tx.amount_money !== 0 && (
                                                        <p className={`text-sm font-black ${tx.amount_money > 0 ? 'text-green-500' : 'text-red-500'}`}>
                                                            {tx.amount_money > 0 ? '+' : '-'}<span className="text-[10px] mr-1">R$</span>{Math.abs(tx.amount_money).toFixed(2)}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
