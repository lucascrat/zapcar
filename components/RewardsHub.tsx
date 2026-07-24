import React, { useState, useEffect } from 'react';
import { UserProfile, UserRole, WalletTransaction, AppSettings, StoreProduct, StoreOrder, PayerFormData, PixPaymentResponse, CardFormData } from '../types';
import { fetchWalletTransactions, fetchAppSettings, addCoinsToUser, fetchStoreProducts, purchaseStoreProduct, fetchStoreOrders, fetchUserProfile, updateUserProfile, createPaymentRequest } from '../services/supabaseClient';
import { createProductPixPayment, createProductCardPayment, getPaymentStatus, checkPaymentByReference } from '../services/paymentService';
import { AdMobService } from '../services/adMobService';
import { BingoUserView } from './BingoUserView';
import { Browser } from '@capacitor/browser';

interface RewardsHubProps {
    currentUser: UserProfile;
    onClose: () => void;
    onOpenBingo?: () => void;
    onUpdateUser?: (updated: UserProfile) => void;
    initialTab?: RewardsTab;
}

type RewardsTab = 'earn' | 'store' | 'wallet' | 'bingo';

export const RewardsHub: React.FC<RewardsHubProps> = ({ currentUser, onClose, onUpdateUser, initialTab = 'earn' }) => {
    const [activeTab, setActiveTab] = useState<RewardsTab>(initialTab);
    const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
    const [orders, setOrders] = useState<StoreOrder[]>([]);
    const [products, setProducts] = useState<StoreProduct[]>([]);
    const [settings, setSettings] = useState<AppSettings | null>(null);
    const [loading, setLoading] = useState(true);
    const [isWatchingVideo, setIsWatchingVideo] = useState(false);
    const [buying, setBuying] = useState<string | null>(null);
    const [userCoins, setUserCoins] = useState<number>(currentUser.wallet_coins || 0);
    const [cooldownMs, setCooldownMs] = useState(0);

    // Payment States
    const [paymentStep, setPaymentStep] = useState<'selecting_method' | 'entering_data' | 'entering_card' | 'showing_qr' | 'processing_card' | 'waiting_external' | 'checking_payment' | 'success' | 'failed' | null>(null);
    const [paymentMethod, setPaymentMethod] = useState<'pix' | 'card' | null>(null);
    const [selectedProduct, setSelectedProduct] = useState<StoreProduct | null>(null);
    const [pixData, setPixData] = useState<PixPaymentResponse | null>(null);
    const [externalReference, setExternalReference] = useState<string | null>(null);
    const safeName = (currentUser.username || '').trim();
    const first = safeName ? safeName.split(' ')[0] : '';
    const last = safeName ? safeName.split(' ').slice(1).join(' ') || 'Cliente' : 'Cliente';
    const [payerData, setPayerData] = useState<PayerFormData>({
        firstName: first,
        lastName: last,
        email: currentUser.email || '',
        cpf: currentUser.cpf || '',
        phone: currentUser.phone || currentUser.whatsapp || '',
        birthDate: '',
        zipCode: currentUser.address_zip || '',
        street: currentUser.address_street || '',
        number: currentUser.address_number || '',
        neighborhood: currentUser.address_neighborhood || '',
        city: currentUser.address_city || '',
        state: ''
    });
    const [cardData, setCardData] = useState<CardFormData>({
        cardNumber: '',
        cardholderName: '',
        expirationMonth: '',
        expirationYear: '',
        securityCode: '',
        installments: 1
    });
    const [cardError, setCardError] = useState<string | null>(null);
    const pollingRef = React.useRef<any>(null);
    
    const [processingWithdraw, setProcessingWithdraw] = useState(false);
    const [withdrawAmount, setWithdrawAmount] = useState('');
    const [withdrawPixKey, setWithdrawPixKey] = useState(currentUser.pix_key || '');
    const [pixType, setPixType] = useState<'cpf' | 'phone' | 'email' | 'random'>('cpf');
    const [showWithdrawModal, setShowWithdrawModal] = useState(false);

    useEffect(() => {
        if (typeof currentUser.wallet_coins === 'number') {
            setUserCoins(currentUser.wallet_coins);
        }
    }, [currentUser.wallet_coins]);

    // Initial Load Safety
    useEffect(() => {
        console.log("[RewardsHub] Mounted. ActiveTab:", activeTab);
        if (activeTab === 'wallet') {
            loadWalletData();
        }
    }, []);

    useEffect(() => {
        loadSharedData();
        refreshUser(); // Garante o saldo atualizado ao abrir
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
            if (pollingRef.current) clearInterval(pollingRef.current);
            if (window.Capacitor?.isNativePlatform()) {
                AdMobService.removeBanner().catch(() => {});
            }
            clearInterval(t);
        };
    }, []);

    useEffect(() => {
        if (activeTab === 'wallet') {
            loadWalletData();
            refreshUser();
        }
        if (activeTab === 'store') loadStoreData();
        if (window.Capacitor?.isNativePlatform()) {
            if (['earn','store','wallet'].includes(activeTab)) {
                AdMobService.showBanner().catch(() => {});
            } else {
                AdMobService.hideBanner().catch(() => {});
            }
        }
    }, [activeTab]);

    const refreshUser = async () => {
        const updated = await fetchUserProfile(currentUser.id);
        if (updated) {
            setUserCoins(updated.wallet_coins || 0);
            if (onUpdateUser) onUpdateUser(updated);
        }
    };

    const loadSharedData = async () => {
        const s = await fetchAppSettings();
        setSettings(s);
    };

    const loadWalletData = async () => {
        setLoading(true);
        const [txs, ords] = await Promise.all([
            fetchWalletTransactions(currentUser.id),
            fetchStoreOrders()
        ]);
        setTransactions(txs);
        setOrders(ords.filter(o => o.user_id === currentUser.id));
        setLoading(false);
    };

    const loadStoreData = async () => {
        setLoading(true);
        const data = await fetchStoreProducts();
        setProducts(data);
        setLoading(false);
    };

    useEffect(() => {
        if (activeTab === 'store' && products.length > 0 && window.Capacitor?.isNativePlatform()) {
            setTimeout(() => {
                AdMobService.showNative('native-store-slot-1').catch(() => {});
                AdMobService.showNative('native-store-slot-2').catch(() => {});
            }, 300);
        }
    }, [activeTab, products]);

    const handleWatchVideo = async () => {
        if (cooldownMs > 0) {
            const m = Math.floor(cooldownMs / 60000);
            const s = Math.floor((cooldownMs % 60000) / 1000);
            alert(`Aguarde ${m}m ${s}s para assistir outro vídeo premiado.`);
            return;
        }
        setIsWatchingVideo(true);
        try {
            const success = await AdMobService.showRewardVideo();
            if (success) {
                const result = await addCoinsToUser(currentUser.id, 1, 'Vídeo Premiado');
                if (result.success) {
                    if (window.Android?.showToast) window.Android.showToast("Parabéns! Você ganhou 1 moeda.");
                    const refreshed = await fetchUserProfile(currentUser.id);
                    if (refreshed) {
                        if (onUpdateUser) onUpdateUser(refreshed);
                        try { localStorage.setItem('chegoja_user', JSON.stringify(refreshed)); } catch {}
                    } else if (onUpdateUser) {
                        onUpdateUser({ ...currentUser, wallet_coins: (currentUser.wallet_coins || 0) + 1 } as UserProfile);
                    }
                    if (activeTab === 'wallet') loadWalletData();
                    try {
                        localStorage.setItem(`reward_last_ts:${currentUser.id}`, String(Date.now()));
                    } catch {}
                } else {
                    alert("Recebemos seu término de vídeo, mas houve erro ao creditar as moedas: " + (result.message || "Tente novamente em alguns segundos."));
                }
            } else {
                alert("Não conseguimos exibir o anúncio premiado agora. Tente novamente mais tarde.");
            }
        } catch (e) {
            console.error("Erro ao processar vídeo:", e);
        } finally {
            setIsWatchingVideo(false);
        }
    };

    const handlePurchase = async (product: StoreProduct, method: 'coins' | 'pix' | 'card') => {
        if (buying) return;

        if (method === 'pix' || method === 'card') {
            setSelectedProduct(product);
            setPaymentMethod(method);
            setPaymentStep('entering_data');
            // Limpar estados de erro e dados do cartão de tentativas anteriores
            setCardError(null);
            setCardData({
                cardNumber: '',
                cardholderName: '',
                expirationMonth: '',
                expirationYear: '',
                securityCode: '',
                installments: 1
            });
            return;
        }

        const confirmMsg = `Deseja resgatar "${product.name}" por ${product.price_coins} moedas ? `;
        if (!window.confirm(confirmMsg)) return;

        setBuying(product.id);
        try {
            const { success, message } = await purchaseStoreProduct(currentUser.id, product, 'coins');
            if (success) {
                alert(message);
                loadStoreData();
                refreshUser();
            } else {
                alert(message);
            }
        } finally {
            setBuying(null);
        }
    };

    const handleZipCodeBlur = async () => {
        const cep = payerData.zipCode?.replace(/\D/g, '');
        if (cep?.length === 8) {
            try {
                const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
                const data = await res.json();
                if (!data.erro) {
                    setPayerData(prev => ({
                        ...prev,
                        street: data.logradouro,
                        neighborhood: data.bairro,
                        city: data.localidade,
                        state: data.uf
                    }));
                }
            } catch (e) {
                console.error("Erro ao buscar CEP:", e);
            }
        }
    };

    const handleGeneratePix = async () => {
        if (!payerData.email || !payerData.cpf || payerData.cpf.length < 11) {
            alert("Por favor, preencha E-mail e CPF corretamente.");
            return;
        }
        if (!selectedProduct) return;

        setBuying(selectedProduct.id);
        try {
            const response = await createProductPixPayment(selectedProduct, currentUser, payerData);
            console.log("[Rewards] Pix Response Received:", response);
            if (response && response.point_of_interaction) {
                setPixData(response);
                setPaymentStep('showing_qr');
                startPolling(response.id as any);
            } else {
                const raw = JSON.stringify(response);
                throw new Error("Resposta da Efí incompleta (sem point_of_interaction). Conteúdo: " + raw.substring(0, 150));
            }
        } catch (e: any) {
            alert("Erro ao gerar Pix: " + e.message);
        } finally {
            setBuying(null);
        }
    };

    const handleGoToCardStep = () => {
        if (!payerData.email || !payerData.cpf || !payerData.phone || !payerData.birthDate || !payerData.zipCode || !payerData.street || !payerData.number) {
            alert("Por favor, preencha todos os campos faturamento corretamente.");
            return;
        }
        setCardError(null);
        setPaymentStep('entering_card');
    };

    const getCardBrand = (number: string) => {
        const n = number.replace(/\s/g, '');
        if (/^4/.test(n)) return 'visa';
        if (/^5[1-5]/.test(n)) return 'mastercard';
        if (/^3[47]/.test(n)) return 'amex';
        if (/^6(?:011|5[0-9]{2})/.test(n)) return 'discover';
        if (/^(606282|3841)/.test(n)) return 'hipercard';
        if (/^(4011|4389|4514|50(41|67|90)|6277|6362)/.test(n)) return 'elo';
        if (/^3(?:0[0-5]|[68][0-9])/.test(n)) return 'diners';
        return 'credit_card';
    };

    const handleProcessCard = async () => {
        if (!selectedProduct) return;

        // Validar campos do cartão antes de processar
        if (!cardData.cardNumber || cardData.cardNumber.replace(/\s/g, '').length < 13) {
            setCardError("Digite um número de cartão válido");
            return;
        }
        if (!cardData.cardholderName || cardData.cardholderName.length < 3) {
            setCardError("Digite o nome como está no cartão");
            return;
        }
        if (!cardData.expirationMonth || !cardData.expirationYear) {
            setCardError("Selecione a data de validade");
            return;
        }
        if (!cardData.securityCode || cardData.securityCode.length < 3) {
            setCardError("Digite o CVV do cartão");
            return;
        }

        setCardError(null);
        setPaymentStep('processing_card');
        setBuying(selectedProduct.id);

        console.log("[Rewards] Iniciando processamento de cartão...");
        try {
            console.log("[Rewards] Chamando createProductCardPayment...");
            const result = await createProductCardPayment(selectedProduct, currentUser, payerData, cardData);
            console.log("[Rewards] Resultado do pagamento:", result.success ? "SUCESSO" : "FALHA");

            if (result.success) {
                await handleFinalizePurchase();
                setPaymentStep('success');
            } else {
                console.warn("[Rewards] Pagamento recusado:", result.message);
                setCardError(result.message || "Pagamento Recusado");
                setPaymentStep('entering_card');
            }
        } catch (e: any) {
            console.error("[Rewards] Exceção no processamento:", e);
            setCardError(e.message || "Erro ao processar pagamento");
            setPaymentStep('failed');
        } finally {
            setBuying(null);
        }
    };

    const handleVerifyCardPayment = async () => {
        if (!selectedProduct) return;

        setPaymentStep('checking_payment');

        try {
            const ref = `prod-${currentUser.id}-${selectedProduct.id}`;
            console.log("[Rewards] Verificando cartão por referência:", ref);
            const result = await checkPaymentByReference(ref);

            if (result.found && result.status === 'approved') {
                console.log("[Rewards] Pagamento Cartão aprovado!");
                await handleFinalizePurchase();
            } else if (result.found && (result.status === 'pending' || result.status === 'in_process')) {
                alert("Seu pagamento ainda consta como pendente. Se você já pagou, aguarde 1 minuto.");
                setPaymentStep('waiting_external');
            } else {
                alert("Pagamento não encontrado. Se você pagou, aguarde alguns instantes e tente novamente.");
                setPaymentStep('waiting_external');
            }
        } catch (e: any) {
            console.error("[Rewards] Erro ao verificar cartão:", e);
            alert("Erro ao verificar pagamento. Tente novamente.");
            setPaymentStep('waiting_external');
        }
    };

    const startPolling = (paymentId: number) => {
        if (pollingRef.current) clearInterval(pollingRef.current);
        console.log(`[Rewards] Polling Pix ID #${paymentId}`);

        pollingRef.current = setInterval(async () => {
            try {
                let status = await getPaymentStatus(paymentId);
                console.log(`[Rewards] Pix Status: ${status}`);

                // Fallback por referência se o ID falhar em aprovar
                if (status !== 'approved' && selectedProduct) {
                    const ref = `prod-${currentUser.id}-${selectedProduct.id}`;
                    const refResult = await checkPaymentByReference(ref);
                    status = refResult.status;
                }

                if (status === 'approved') {
                    console.log("[Rewards] Pagamento Detectado no Polling!");
                    clearInterval(pollingRef.current);
                    handleFinalizePurchase();
                }
            } catch (e) {
                console.error('[Rewards] Erro no polling:', e);
            }
        }, 5000);
    };

    const startPollingByReference = (reference: string) => {
        if (pollingRef.current) clearInterval(pollingRef.current);
        console.log(`[Rewards] Polling Referência: ${reference}`);

        pollingRef.current = setInterval(async () => {
            try {
                const result = await checkPaymentByReference(reference);
                console.log(`[Rewards] Ref Status: ${result.status}`);

                if (result.found && result.status === 'approved') {
                    clearInterval(pollingRef.current);
                    handleFinalizePurchase();
                }
            } catch (e) {
                console.error('[Rewards] Erro no polling de ref:', e);
            }
        }, 7000);
    };

    const handleVerifyPixPayment = async () => {
        if (!pixData?.id || !selectedProduct) return;

        setPaymentStep('checking_payment');

        try {
            let status = await getPaymentStatus(pixData.id);
            console.log(`[Rewards] Manual Pix ID Status: ${status}`);

            // 2. Busca por referência (segurança extra)
            if (status !== 'approved' && status !== 'authorized') {
                const ref = `prod-${currentUser.id}-${selectedProduct.id}`;
                console.log("[Rewards] Buscando Pix por Referência...");
                const result = await checkPaymentByReference(ref);
                status = result.status;
            }

            if (status === 'approved' || status === 'authorized') {
                if (pollingRef.current) clearInterval(pollingRef.current);
                handleFinalizePurchase();
            } else {
                alert("Pagamento ainda pendente. Se você já pagou, aguarde 1 minuto.");
                setPaymentStep('showing_qr');
            }
        } catch (e) {
            console.error('[Rewards] Erro na verificação manual:', e);
            alert("Erro ao verificar pagamento.");
            setPaymentStep('showing_qr');
        }
    };

    const handleFinalizePurchase = async () => {
        if (!selectedProduct) return;

        console.log("[Rewards] Finalizando compra aprovada...");
        try {
            // Update profile with payer data if changed
            await updateUserProfile(currentUser.id, {
                cpf: payerData.cpf,
                address_zip: payerData.zipCode,
                address_street: payerData.street,
                address_number: payerData.number,
                address_neighborhood: payerData.neighborhood,
                address_city: payerData.city,
                email: payerData.email // Update email too if possible
            });

            const result = await purchaseStoreProduct(currentUser.id, selectedProduct, paymentMethod === 'card' ? 'card' : 'pix');
            if (result.success) {
                setPaymentStep('success');
                loadStoreData();
                refreshUser();
                if (activeTab === 'wallet') loadWalletData();
            } else {
                alert(result.message);
                setPaymentStep(null);
            }
        } catch (err) {
            console.error("[Rewards] Erro ao registrar compra:", err);
            alert("Erro ao registrar seu pedido. Contate o suporte.");
        }
    };

    const handleWithdrawRequest = async () => {
        if (!withdrawAmount || !withdrawPixKey) {
            alert("Preencha todos os campos.");
            return;
        }

        const amountBrl = parseFloat(withdrawAmount.replace(',', '.'));
        if (isNaN(amountBrl) || amountBrl <= 0) {
            alert("Valor inválido.");
            return;
        }

        const coinValue = settings?.coin_value_brl || 0.10;
        const coinsNeeded = Math.ceil(amountBrl / coinValue);

        if (coinsNeeded < 100) {
            alert(`O valor mínimo para saque é de 100 moedas (R$ ${(100 * coinValue).toFixed(2)})`);
            return;
        }

        if (userCoins < coinsNeeded) {
            alert(`Saldo insuficiente. Você precisa de ${coinsNeeded} moedas para sacar R$ ${amountBrl.toFixed(2)}.`);
            return;
        }

        setProcessingWithdraw(true);
        try {
            const formattedKey = `[${pixType.toUpperCase()}] ${withdrawPixKey}`;
            
            const { success, message } = await createPaymentRequest(
                currentUser.id, 
                'client_withdrawal', 
                amountBrl, 
                coinsNeeded, 
                formattedKey
            );

            if (success) {
                alert("Solicitação de saque enviada com sucesso! Aguarde a aprovação.");
                setShowWithdrawModal(false);
                setWithdrawAmount('');
                refreshUser();
                if (activeTab === 'wallet') loadWalletData();
            } else {
                alert(message || "Erro ao solicitar saque.");
            }
        } catch (error: any) {
            alert("Erro: " + error.message);
        } finally {
            setProcessingWithdraw(false);
        }
    };

    return (
        <div className="flex-1 flex flex-col h-full bg-[#0b141a] text-white animate-fade-in relative">
            {/* Unified Top Header */}
            <div className="bg-[#1f2c34] p-4 flex items-center justify-between shadow-xl shrink-0 pt-safe border-b border-white/5">
                <div className="flex items-center gap-3">
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition text-gray-400">
                        <span className="material-icons">close</span>
                    </button>
                    <div>
                        <h1 className="text-xl font-black tracking-tight uppercase italic text-yellow-500">Prêmios ChegoJá</h1>
                        <p className="text-[9px] text-gray-500 font-bold uppercase tracking-[0.2em]">Onde sua fidelidade vale ouro</p>
                    </div>
                </div>

                {/* Balance Badge */}
                <div className="bg-gradient-to-r from-yellow-500 to-orange-600 px-4 py-2 rounded-2xl flex flex-col items-end shadow-lg shadow-orange-950/20 active:scale-95 transition-transform" onClick={() => setActiveTab('wallet')}>
                    <div className="flex items-center gap-1.5">
                        <span className="material-icons text-white text-xs">stars</span>
                        <span className="text-white font-black text-sm">{userCoins}</span>
                    </div>
                    <span className="text-[8px] font-black text-white/70 uppercase tracking-tighter">Minhas Moedas</span>
                    <span className="mt-1 text-[8px] font-black text-white/90 uppercase tracking-tighter bg-black/20 px-2 py-0.5 rounded-full border border-white/10">
                        R$ {((userCoins * (settings?.coin_value_brl || 0))).toFixed(2)}
                    </span>
                </div>
            </div>

            {/* Custom Navigation Tab Bar */}
            <div className="flex bg-[#1f2c34] p-1 gap-1 border-b border-white/5 shadow-md">
                <button
                    onClick={() => setActiveTab('earn')}
                    className={`flex-1 flex flex-col items-center py-3 rounded-xl transition-all ${activeTab === 'earn' ? 'bg-yellow-400/10 text-yellow-400 font-black' : 'text-gray-500 border-transparent'}`}
                >
                    <span className="material-icons text-xl mb-0.5">{activeTab === 'earn' ? 'play_circle' : 'play_circle_outline'}</span>
                    <span className="text-[10px] uppercase font-black tracking-wider">Ganhar</span>
                </button>
                <button
                    onClick={() => setActiveTab('store')}
                    className={`flex-1 flex flex-col items-center py-3 rounded-xl transition-all ${activeTab === 'store' ? 'bg-orange-500/10 text-orange-500 font-black' : 'text-gray-500 border-transparent'}`}
                >
                    <span className="material-icons text-xl mb-0.5">{activeTab === 'store' ? 'shopping_bag' : 'shopping_outline'}</span>
                    <span className="text-[10px] uppercase font-black tracking-wider">Loja</span>
                </button>
                <button
                    onClick={() => setActiveTab('bingo')}
                    className={`flex-1 flex flex-col items-center py-3 rounded-xl transition-all ${activeTab === 'bingo' ? 'bg-purple-500/10 text-purple-500 font-black' : 'text-gray-500 border-transparent'}`}
                >
                    <span className="material-icons text-xl mb-0.5">casino</span>
                    <span className="text-[10px] uppercase font-black tracking-wider">Bingo</span>
                </button>
                <button
                    onClick={() => setActiveTab('wallet')}
                    className={`flex-1 flex flex-col items-center py-3 rounded-xl transition-all ${activeTab === 'wallet' ? 'bg-green-500/10 text-green-500 font-black' : 'text-gray-500 border-transparent'}`}
                >
                    <span className="material-icons text-xl mb-0.5">{activeTab === 'wallet' ? 'account_balance_wallet' : 'account_balance_wallet'}</span>
                    <span className="text-[10px] uppercase font-black tracking-wider">Carteira</span>
                </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">

                {/* 1. EARN TAB */}
                {activeTab === 'earn' && (
                    <div className="p-6 space-y-6 animate-slide-up">
                        <div className="bg-gradient-to-br from-[#1f2c34] to-[#0b141a] border border-white/5 rounded-[32px] p-8 text-center relative overflow-hidden shadow-2xl">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-yellow-400/5 rounded-full -mr-10 -mt-10 blur-3xl"></div>
                            <div className="w-20 h-20 bg-yellow-400/10 rounded-full flex items-center justify-center mx-auto mb-6 text-yellow-400 shadow-inner">
                                <span className="material-icons text-4xl animate-pulse">movie</span>
                            </div>
                            <h2 className="text-2xl font-black text-white mb-2 uppercase italic tracking-tight">Vídeo Premiado</h2>
                            <p className="text-gray-500 text-sm mb-8 leading-relaxed max-w-[240px] mx-auto">
                                Assista a vídeos de patrocinadores e ganhe 1 moeda ChegoJá instantaneamente por vídeo completo!
                            </p>
                            <button
                                onClick={handleWatchVideo}
                                disabled={isWatchingVideo || cooldownMs > 0}
                                className="w-full bg-gradient-to-r from-yellow-400 to-orange-500 text-black font-black py-5 rounded-3xl flex items-center justify-center gap-3 shadow-xl active:scale-95 transition-all disabled:opacity-50 uppercase italic group"
                            >
                                {isWatchingVideo ? (
                                    <div className="w-6 h-6 border-4 border-black border-t-transparent rounded-full animate-spin"></div>
                                ) : (
                                    <>
                                        <span className="material-icons group-hover:rotate-12 transition-transform">play_arrow</span>
                                        {cooldownMs > 0
                                            ? `Aguarde ${Math.floor(cooldownMs/60000)}m ${Math.floor((cooldownMs%60000)/1000)}s`
                                            : 'Assistir e Ganhar +1'}
                                    </>
                                )}
                            </button>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-[#1f2c34] p-4 rounded-2xl border border-white/5">
                                <span className="material-icons text-blue-400 text-lg mb-2">trending_up</span>
                                <h4 className="text-[10px] font-black uppercase text-gray-500 mb-1">Status de Ganho</h4>
                                <p className="text-sm font-bold text-white">Ilimitado</p>
                            </div>
                            <div className="bg-[#1f2c34] p-4 rounded-2xl border border-white/5">
                                <span className="material-icons text-green-400 text-lg mb-2">verified</span>
                                <h4 className="text-[10px] font-black uppercase text-gray-500 mb-1">Crédito</h4>
                                <p className="text-sm font-bold text-white">Instantâneo</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* 2. STORE TAB */}
                {activeTab === 'store' && (
                    <div className="p-4 space-y-6 animate-slide-up">
                        {loading ? (
                            <div className="py-20 flex flex-col items-center gap-4 opacity-30">
                                <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
                                <p className="font-bold">Carregando Vitrine...</p>
                            </div>
                        ) : products.length === 0 ? (
                            <div className="py-20 text-center opacity-40">
                                <span className="material-icons text-6xl mb-4">storefront</span>
                                <p className="font-bold">Loja fechada no momento.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-6 pb-10">
                                {products.map((product, idx) => (
                                    <div key={product.id} className="bg-[#1f2c34] rounded-[32px] overflow-hidden border border-white/5 shadow-xl group transition-all">
                                        <div className="h-52 relative overflow-hidden">
                                            <img src={product.image_url || 'https://images.unsplash.com/photo-1549007994-cb92ca714503?q=80\u0026w=1000\u0026auto=format\u0026fit=crop'} className="w-full h-full object-cover group-hover:scale-105 transition-all duration-700" />
                                            <div className="absolute inset-0 bg-gradient-to-t from-[#1f2c34] via-transparent to-transparent"></div>
                                            <div className="absolute top-4 left-4 bg-black/40 backdrop-blur-md px-3 py-1 rounded-full border border-white/10">
                                                <span className="text-[10px] font-black text-white">{product.stock} em estoque</span>
                                            </div>
                                        </div>
                                        <div className="p-5">
                                            <h3 className="text-xl font-black text-white mb-2 italic uppercase">{product.name}</h3>
                                            <p className="text-xs text-gray-400 leading-relaxed mb-6 line-clamp-2">{product.description}</p>
                                            <div className="grid grid-cols-3 gap-2">
                                                <button
                                                    onClick={() => handlePurchase(product, 'coins')}
                                                    disabled={!!buying}
                                                    className="bg-yellow-400 text-black py-3 rounded-2xl flex flex-col items-center gap-0.5 active:scale-95 transition-all disabled:opacity-50"
                                                >
                                                    <div className="flex items-center gap-1 font-black text-sm">
                                                        <span className="material-icons text-xs">stars</span>
                                                        <span>{product.price_coins}</span>
                                                    </div>
                                                    <span className="text-[7px] font-black uppercase opacity-60">Moedas</span>
                                                </button>
                                                <button
                                                    onClick={() => handlePurchase(product, 'pix')}
                                                    disabled={!!buying}
                                                    className="bg-white/5 border border-white/10 text-white py-3 rounded-2xl flex flex-col items-center gap-0.5 active:scale-95 transition-all hover:bg-white/10 disabled:opacity-50"
                                                >
                                                    <div className="flex items-center gap-1 font-black text-sm">
                                                        <span className="material-icons text-xs text-green-400">pix</span>
                                                        <span>R${product.price_brl.toFixed(0)}</span>
                                                    </div>
                                                    <span className="text-[7px] font-black uppercase opacity-60">PIX</span>
                                                </button>
                                                <button
                                                    onClick={() => handlePurchase(product, 'card')}
                                                    disabled={!!buying}
                                                    className="bg-purple-600/20 border border-purple-500/30 text-white py-3 rounded-2xl flex flex-col items-center gap-0.5 active:scale-95 transition-all hover:bg-purple-500/30 disabled:opacity-50"
                                                >
                                                    <div className="flex items-center gap-1 font-black text-sm">
                                                        <span className="material-icons text-xs text-purple-400">credit_card</span>
                                                        <span>R${product.price_brl.toFixed(0)}</span>
                                                    </div>
                                                    <span className="text-[7px] font-black uppercase opacity-60">Cartão</span>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {/* Native Ad slot entre os produtos (não obstrutivo) */}
                                <div id="native-store-slot-1" className="w-full min-h-[250px] bg-[#1f2c34] rounded-[32px] border border-white/10 flex items-center justify-center">
                                    <span className="text-[10px] text-gray-500 font-bold">Anúncio</span>
                                </div>
                                <div id="native-store-slot-2" className="w-full min-h-[250px] bg-[#1f2c34] rounded-[32px] border border-white/10 flex items-center justify-center">
                                    <span className="text-[10px] text-gray-500 font-bold">Anúncio</span>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* 3. WALLET TAB (History) */}
                {activeTab === 'wallet' && (
                    <div className="p-4 space-y-6 animate-slide-up">
                        {/* Banner em área segura abaixo do header da carteira */}
                        <div className="w-full">
                            <div className="h-2"></div>
                        </div>
                        <div className="bg-gradient-to-br from-[#00a884] to-[#017561] rounded-3xl p-6 shadow-xl relative overflow-hidden">
                            <span className="material-icons absolute -bottom-4 -right-4 text-9xl transform -rotate-12 opacity-10">receipt_long</span>
                            <div className="relative z-10">
                                <h4 className="text-[10px] font-black uppercase text-white/60 mb-1">Total acumulado</h4>
                                <h2 className="text-4xl font-black text-white italic tracking-tighter">
                                    {userCoins} <span className="text-xl opacity-60">MOEDAS</span>
                                </h2>
                                <p className="mt-2 text-[10px] font-bold text-white/50 bg-black/10 inline-block px-2 py-1 rounded">
                                    VALOR ESTIMADO: R$ {((userCoins) * (settings?.coin_value_brl || 0)).toFixed(2)}
                                </p>
                                <div className="mt-4">
                                    <button
                                        onClick={() => setShowWithdrawModal(true)}
                                        className="bg-white text-[#00a884] px-4 py-2 rounded-full font-black text-[10px] uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-lg flex items-center gap-1.5"
                                    >
                                        <span className="material-icons text-sm">pix</span>
                                        Sacar via PIX
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div className="space-y-4">
                            {/* PRIZES HISTORY SECTION */}
                            {orders.length > 0 && (
                                <div className="space-y-4 mb-8">
                                    <h3 className="text-sm font-black uppercase text-gray-500 ml-2 tracking-widest flex items-center gap-2">
                                        <span className="material-icons text-xs">redeem</span> Meus Prêmios
                                    </h3>
                                    <div className="space-y-3">
                                        {orders.map(order => (
                                            <div key={order.id} className="bg-[#1f2c34] p-4 rounded-2xl border border-white/5 flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-12 h-12 rounded-xl border border-white/5 overflow-hidden shrink-0">
                                                        <img src={order.product?.image_url} className="w-full h-full object-cover" />
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-bold text-white">{order.product?.name}</p>
                                                        <p className="text-[10px] text-gray-500">
                                                            {order.payment_method === 'coins' ? `${order.amount_coins} moedas` : `R$ ${order.amount_money?.toFixed(2)}`}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    {order.status === 'pending' ? (
                                                        <span className="text-[8px] bg-orange-500/20 text-orange-500 px-2 py-0.5 rounded-full font-black uppercase">Pendente</span>
                                                    ) : (
                                                        <span className="text-[8px] bg-whatsapp-green/20 text-whatsapp-green px-2 py-0.5 rounded-full font-black uppercase">Entregue</span>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <h3 className="text-sm font-black uppercase text-gray-500 ml-2 tracking-widest flex items-center gap-2">
                                <span className="material-icons text-xs">history</span> Movimentações
                            </h3>
                            {loading ? (
                                <div className="py-10 text-center opacity-30 animate-pulse font-bold">Lendo registros...</div>
                            ) : transactions.length === 0 ? (
                                <div className="bg-[#1f2c34] p-10 rounded-[32px] text-center opacity-40 border border-dashed border-white/10">
                                    <p className="text-sm">Nenhum registro encontrado.</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {transactions.map(tx => (
                                        <div key={tx.id} className="bg-[#1f2c34] p-4 rounded-2xl border border-white/5 flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${tx.type === 'earning' ? 'bg-green-500/10 text-green-500' :
                                                    tx.type === 'purchase' ? 'bg-orange-500/10 text-orange-500' : 'bg-blue-500/10 text-blue-500'
                                                    }`}>
                                                    <span className="material-icons">{tx.type === 'earning' ? 'add_circle' : tx.type === 'purchase' ? 'shopping_basket' : 'payments'}</span>
                                                </div>
                                                <div>
                                                    <p className="text-xs font-bold text-white">{tx.description}</p>
                                                    <p className="text-[10px] text-gray-500">{new Date(tx.created_at).toLocaleDateString('pt-BR')}</p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                {tx.amount_coins !== 0 && (
                                                    <p className={`text-sm font-black ${tx.amount_coins > 0 ? 'text-green-500' : 'text-red-500'}`}>
                                                        {tx.amount_coins > 0 ? '+' : ''}{tx.amount_coins}
                                                    </p>
                                                )}
                                                {tx.amount_money !== 0 && (
                                                    <p className={`text-sm font-black ${tx.amount_money > 0 ? 'text-green-500' : 'text-red-500'}`}>
                                                        {tx.amount_money > 0 ? '+' : ''}R$ {Math.abs(tx.amount_money).toFixed(2)}
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

                {/* 4. BINGO TAB */}
                {activeTab === 'bingo' && (
                    <div className="flex-1 animate-slide-up">
                        <div className="p-4 bg-purple-900/20 border-b border-purple-500/10 flex items-center gap-2 mb-2">
                            <span className="material-icons text-yellow-400">casino</span>
                            <p className="text-[11px] font-black uppercase text-purple-300">Sorteio de Prêmios Ativo</p>
                        </div>
                        <BingoUserView
                            currentUser={currentUser}
                            onClose={() => setActiveTab('earn')}
                        />
                    </div>
                )}
            </div>

            <div className="p-4 bg-[#1f2c34] border-t border-white/5 flex items-center gap-3">
                <span className="material-icons text-gray-500 text-lg">verified_user</span>
                <p className="text-[9px] text-gray-500 font-medium leading-tight">
                    Sistema de fidelidade verificado. Os prêmios são entregues via contato direto no WhatsApp após o resgate.
                    Assista vídeos completos para garantir suas moedas.
                </p>
            </div>

            {/* WITHDRAW MODAL */}
            {showWithdrawModal && (
                <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 animate-fade-in">
                    <div className="bg-[#1f2c34] w-full max-w-sm rounded-[32px] border border-white/5 shadow-2xl overflow-hidden animate-slide-up">
                        <div className="p-6 border-b border-white/5 flex justify-between items-center">
                            <h3 className="font-bold text-lg text-white">Solicitar Saque</h3>
                            <button onClick={() => setShowWithdrawModal(false)} className="text-gray-500 hover:text-white transition">
                                <span className="material-icons">close</span>
                            </button>
                        </div>
                        <div className="p-6 space-y-5">
                            <div className="bg-white/5 p-4 rounded-xl text-center">
                                <p className="text-xs text-gray-400 uppercase font-bold mb-1">Disponível para Saque</p>
                                <p className="text-2xl font-black text-white">
                                    R$ {((userCoins) * (settings?.coin_value_brl || 0)).toFixed(2)}
                                </p>
                                <p className="text-[10px] text-green-400 font-bold mt-1">Mínimo: 100 Moedas</p>
                            </div>

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
                                            className={`p-3 rounded-xl text-[10px] font-black uppercase transition-all border ${pixType === t.id ? 'bg-green-600 border-green-600 text-white' : 'bg-white/5 border-white/5 text-gray-400 hover:bg-white/10'}`}
                                        >
                                            {t.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="text-[10px] font-black uppercase text-gray-500 mb-2 block">Valor do Saque (R$)</label>
                                <input
                                    type="number"
                                    placeholder="0.00"
                                    value={withdrawAmount}
                                    onChange={(e) => setWithdrawAmount(e.target.value)}
                                    className="w-full bg-[#0b141a] text-white rounded-xl p-4 border border-white/10 focus:border-green-600 outline-none transition-all text-xl font-bold text-center"
                                />
                            </div>

                            <div>
                                <label className="text-[10px] font-black uppercase text-gray-500 mb-2 block">Chave PIX de Destino</label>
                                <input
                                    type="text"
                                    placeholder="Sua chave PIX"
                                    value={withdrawPixKey}
                                    onChange={(e) => setWithdrawPixKey(e.target.value)}
                                    className="w-full bg-[#0b141a] text-white rounded-xl p-4 border border-white/10 focus:border-green-600 outline-none transition-all text-center"
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

            {/* Payment Modal */}
            {paymentStep && selectedProduct && (
                <div className="fixed inset-0 z-[150] bg-black/90 flex items-center justify-center p-4 animate-fade-in">
                    <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl max-h-[90vh] overflow-y-auto">
                        {/* Header */}
                        <div className={`${paymentMethod === 'card' ? 'bg-purple-600' : 'bg-blue-600'} p-4 text-white flex items-center sticky top-0`}>
                            <button
                                onClick={() => {
                                    if (pollingRef.current) clearInterval(pollingRef.current);
                                    setPaymentStep(null);
                                    setPaymentMethod(null);
                                    setPixData(null);
                                    setSelectedProduct(null);
                                }}
                                className="mr-3 p-1 hover:bg-white/20 rounded-full transition"
                            >
                                <span className="material-icons">arrow_back</span>
                            </button>
                            <div>
                                <h2 className="font-bold text-lg">
                                    {paymentMethod === 'card' ? 'Pagamento Cartão' : 'Pagamento PIX'}
                                </h2>
                                <p className="text-xs opacity-80">{selectedProduct.name} - R$ {selectedProduct.price_brl.toFixed(2)}</p>
                            </div>
                        </div>

                        <div className="p-6">
                            {/* Step: Enter Data */}
                            {paymentStep === 'entering_data' && (
                                <div className="space-y-4">
                                    <h3 className="font-bold text-gray-800 text-center mb-4">Dados para o Pagamento</h3>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">E-mail *</label>
                                        <input
                                            type="email"
                                            value={payerData.email}
                                            onChange={e => setPayerData({ ...payerData, email: e.target.value })}
                                            className="w-full p-3 border border-gray-300 rounded-xl outline-none focus:ring-2 ring-blue-500 text-black"
                                            placeholder="seu@email.com"
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">CPF *</label>
                                            <input
                                                type="text"
                                                value={payerData.cpf}
                                                onChange={e => {
                                                    const val = e.target.value.replace(/\D/g, '')
                                                        .replace(/(\d{3})(\d)/, '$1.$2')
                                                        .replace(/(\d{3})(\d)/, '$1.$2')
                                                        .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
                                                    setPayerData({ ...payerData, cpf: val.slice(0, 14) });
                                                }}
                                                className="w-full p-3 border border-gray-300 rounded-xl outline-none focus:ring-2 ring-blue-500 text-black"
                                                placeholder="000.000.000-00"
                                                maxLength={14}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp *</label>
                                            <input
                                                type="text"
                                                value={payerData.phone}
                                                onChange={e => {
                                                    const val = e.target.value.replace(/\D/g, '')
                                                        .replace(/^(\d{2})(\d)/g, '($1) $2')
                                                        .replace(/(\d{5})(\d)/, '$1-$2');
                                                    setPayerData({ ...payerData, phone: val.slice(0, 15) });
                                                }}
                                                className="w-full p-3 border border-gray-300 rounded-xl outline-none focus:ring-2 ring-blue-500 text-black"
                                                placeholder="(00) 00000-0000"
                                                maxLength={15}
                                            />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Nascimento *</label>
                                            <input
                                                type="date"
                                                value={payerData.birthDate}
                                                onChange={e => setPayerData({ ...payerData, birthDate: e.target.value })}
                                                className="w-full p-3 border border-gray-300 rounded-xl outline-none focus:ring-2 ring-blue-500 text-black"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">CEP *</label>
                                            <input
                                                type="text"
                                                value={payerData.zipCode}
                                                onBlur={handleZipCodeBlur}
                                                onChange={e => {
                                                    const val = e.target.value.replace(/\D/g, '').replace(/^(\d{5})(\d)/, '$1-$2');
                                                    setPayerData({ ...payerData, zipCode: val.slice(0, 9) });
                                                }}
                                                className="w-full p-3 border border-gray-300 rounded-xl outline-none focus:ring-2 ring-blue-500 text-black"
                                                placeholder="00000-000"
                                                maxLength={9}
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Endereço (Rua/Avenida) *</label>
                                        <input
                                            type="text"
                                            value={payerData.street}
                                            onChange={e => setPayerData({ ...payerData, street: e.target.value })}
                                            className="w-full p-3 border border-gray-300 rounded-xl outline-none focus:ring-2 ring-blue-500 text-black"
                                            placeholder="Ex: Av. Paulista"
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Número *</label>
                                            <input
                                                type="text"
                                                value={payerData.number}
                                                onChange={e => setPayerData({ ...payerData, number: e.target.value })}
                                                className="w-full p-3 border border-gray-300 rounded-xl outline-none focus:ring-2 ring-blue-500 text-black"
                                                placeholder="Ex: 1000"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Bairro *</label>
                                            <input
                                                type="text"
                                                value={payerData.neighborhood}
                                                onChange={e => setPayerData({ ...payerData, neighborhood: e.target.value })}
                                                className="w-full p-3 border border-gray-300 rounded-xl outline-none focus:ring-2 ring-blue-500 text-black"
                                                placeholder="Ex: Bela Vista"
                                            />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Cidade *</label>
                                            <input
                                                type="text"
                                                value={payerData.city}
                                                onChange={e => setPayerData({ ...payerData, city: e.target.value })}
                                                className="w-full p-3 border border-gray-300 rounded-xl outline-none focus:ring-2 ring-blue-500 text-black"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Estado (UF) *</label>
                                            <input
                                                type="text"
                                                maxLength={2}
                                                value={payerData.state}
                                                onChange={e => setPayerData({ ...payerData, state: e.target.value.toUpperCase() })}
                                                className="w-full p-3 border border-gray-300 rounded-xl outline-none focus:ring-2 ring-blue-500 text-black"
                                                placeholder="Ex: SP"
                                            />
                                        </div>
                                    </div>

                                    {paymentMethod === 'pix' ? (
                                        <button
                                            onClick={handleGeneratePix}
                                            disabled={!!buying}
                                            className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 disabled:opacity-50 mt-4"
                                        >
                                            {buying ? 'Gerando...' : 'Gerar QR Code PIX'}
                                            {!buying && <span className="material-icons text-sm">qr_code</span>}
                                        </button>
                                    ) : (
                                        <button
                                            onClick={handleGoToCardStep}
                                            disabled={!!buying}
                                            className="w-full py-4 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 disabled:opacity-50 mt-4"
                                        >
                                            {buying ? 'Abrindo Checkout...' : 'Pagar com Cartão'}
                                            {!buying && <span className="material-icons text-sm">credit_card</span>}
                                        </button>
                                    )}
                                </div>
                            )}

                            {/* Step: Show QR Code (PIX) */}
                            {paymentStep === 'showing_qr' && pixData && (
                                <div className="text-center">
                                    <div className="bg-green-100 text-green-800 px-4 py-2 rounded-full text-xs font-bold inline-flex items-center gap-2 mb-4 animate-pulse">
                                        <span className="material-icons text-sm">hourglass_empty</span> Aguardando Pagamento...
                                    </div>

                                    <h3 className="font-bold text-gray-800 mb-2">Escaneie o QR Code</h3>
                                    <p className="text-gray-500 text-xs mb-4">Abra o app do seu banco e escolha "Pagar com Pix"</p>

                                    <div className="bg-gray-100 p-2 rounded-xl inline-block mb-4 border border-gray-300">
                                        <img
                                            src={pixData.point_of_interaction.transaction_data.qr_code_base64?.startsWith('data:')
                                                ? pixData.point_of_interaction.transaction_data.qr_code_base64
                                                : `data:image/png;base64,${pixData.point_of_interaction.transaction_data.qr_code_base64}`}
                                            alt="QR Code Pix"
                                            className="w-48 h-48 object-contain mx-auto"
                                        />
                                    </div>

                                    <div className="mb-4">
                                        <p className="text-xs text-gray-500 mb-1">Ou use o Copia e Cola:</p>
                                        <div className="flex gap-2">
                                            <input
                                                readOnly
                                                value={pixData.point_of_interaction.transaction_data.qr_code}
                                                className="flex-1 bg-gray-100 border border-gray-300 rounded-lg px-2 text-xs text-gray-600 outline-none"
                                            />
                                            <button
                                                onClick={() => {
                                                    navigator.clipboard.writeText(pixData.point_of_interaction.transaction_data.qr_code);
                                                    alert("Código Pix copiado!");
                                                }}
                                                className="bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700"
                                                title="Copiar"
                                            >
                                                <span className="material-icons text-sm">content_copy</span>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Botão de verificação manual */}
                                    <button
                                        onClick={handleVerifyPixPayment}
                                        className="w-full py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 mb-2"
                                    >
                                        <span className="material-icons text-sm">check_circle</span>
                                        Já Paguei! Verificar
                                    </button>

                                    <p className="text-[10px] text-gray-400 text-center">
                                        ID do pagamento: {pixData.id}
                                    </p>
                                </div>
                            )}

                            {/* Step: Enter Card Data */}
                            {paymentStep === 'entering_card' && (
                                <div className="space-y-4">
                                    <h3 className="font-bold text-gray-800 text-center mb-4">Dados do Cartão</h3>

                                    {cardError && (
                                        <div className="bg-red-100 text-red-700 p-3 rounded-xl text-sm text-center">
                                            {cardError}
                                        </div>
                                    )}

                                    <div>
                                        <div className="flex justify-between items-center mb-1">
                                            <label className="block text-sm font-medium text-gray-700">Número do Cartão *</label>
                                            {cardData.cardNumber.length >= 2 && (
                                                <div className="flex items-center gap-1.5 px-2 py-0.5 bg-gray-100 rounded-lg border border-gray-200">
                                                    <span className="text-[10px] font-black uppercase text-gray-500">{getCardBrand(cardData.cardNumber)}</span>
                                                    <span className="material-icons text-sm text-purple-600">
                                                        {getCardBrand(cardData.cardNumber) === 'visa' ? 'credit_card' :
                                                            getCardBrand(cardData.cardNumber) === 'mastercard' ? 'credit_card' : 'credit_card'}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                        <input
                                            type="text"
                                            value={cardData.cardNumber}
                                            onChange={e => {
                                                const val = e.target.value
                                                    .replace(/\D/g, '')
                                                    .replace(/(\d{4})(\d)/, '$1 $2')
                                                    .replace(/(\d{4})(\d)/, '$1 $2')
                                                    .replace(/(\d{4})(\d)/, '$1 $2')
                                                    .replace(/(\d{4})\d+?$/, '$1');
                                                setCardData({ ...cardData, cardNumber: val });
                                            }}
                                            className="w-full p-3 border border-gray-300 rounded-xl outline-none focus:ring-2 ring-purple-500 text-black"
                                            placeholder="0000 0000 0000 0000"
                                            maxLength={19}
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Nome no Cartão *</label>
                                        <input
                                            type="text"
                                            value={cardData.cardholderName}
                                            onChange={e => setCardData({ ...cardData, cardholderName: e.target.value.toUpperCase() })}
                                            className="w-full p-3 border border-gray-300 rounded-xl outline-none focus:ring-2 ring-purple-500 text-black uppercase"
                                            placeholder="NOME COMO ESTÁ NO CARTÃO"
                                        />
                                    </div>

                                    <div className="grid grid-cols-3 gap-3">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Mês *</label>
                                            <select
                                                value={cardData.expirationMonth}
                                                onChange={e => setCardData({ ...cardData, expirationMonth: e.target.value })}
                                                className="w-full p-3 border border-gray-300 rounded-xl outline-none focus:ring-2 ring-purple-500 text-black bg-white"
                                            >
                                                <option value="">MM</option>
                                                {Array.from({ length: 12 }, (_, i) => (i + 1).toString().padStart(2, '0')).map(m => (
                                                    <option key={m} value={m}>{m}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Ano *</label>
                                            <select
                                                value={cardData.expirationYear}
                                                onChange={e => setCardData({ ...cardData, expirationYear: e.target.value })}
                                                className="w-full p-3 border border-gray-300 rounded-xl outline-none focus:ring-2 ring-purple-500 text-black bg-white"
                                            >
                                                <option value="">AA</option>
                                                {Array.from({ length: 15 }, (_, i) => (new Date().getFullYear() + i).toString()).map(y => (
                                                    <option key={y} value={y}>{y}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">CVV *</label>
                                            <input
                                                type="text"
                                                value={cardData.securityCode}
                                                onChange={e => setCardData({ ...cardData, securityCode: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                                                className="w-full p-3 border border-gray-300 rounded-xl outline-none focus:ring-2 ring-purple-500 text-black"
                                                placeholder="000"
                                                maxLength={4}
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Parcelas</label>
                                        <select
                                            value={cardData.installments}
                                            onChange={e => setCardData({ ...cardData, installments: parseInt(e.target.value) })}
                                            className="w-full p-3 border border-gray-300 rounded-xl outline-none focus:ring-2 ring-purple-500 text-black bg-white"
                                        >
                                            <option value={1}>1x de R$ {selectedProduct?.price_brl.toFixed(2)} (sem juros)</option>
                                            {[2, 3, 4, 5, 6].map(n => (
                                                <option key={n} value={n}>{n}x de R$ {((selectedProduct?.price_brl || 0) / n).toFixed(2)}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="flex gap-3 mt-4">
                                        <button
                                            onClick={() => setPaymentStep('entering_data')}
                                            className="flex-1 py-3 border border-gray-300 text-gray-700 font-bold rounded-xl"
                                        >
                                            Voltar
                                        </button>
                                        <button
                                            onClick={handleProcessCard}
                                            disabled={!!buying}
                                            className="flex-1 py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 disabled:opacity-50"
                                        >
                                            {buying ? 'Processando...' : 'Pagar'}
                                            {!buying && <span className="material-icons text-sm">lock</span>}
                                        </button>
                                    </div>

                                    <p className="text-[10px] text-gray-400 text-center mt-2">
                                        <span className="material-icons text-xs align-middle">lock</span> Pagamento seguro via Efí Bank
                                    </p>
                                </div>
                            )}

                            {/* Step: Processing Card */}
                            {paymentStep === 'processing_card' && (
                                <div className="text-center py-8">
                                    <div className="w-16 h-16 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin mx-auto mb-4"></div>
                                    <h3 className="font-bold text-gray-800 mb-2">Criando Checkout...</h3>
                                    <p className="text-gray-500 text-sm">Preparando página de pagamento</p>
                                    <p className="text-gray-400 text-xs mt-2">Aguarde um momento</p>
                                </div>
                            )}

                            {/* Step: Waiting External Checkout */}
                            {paymentStep === 'waiting_external' && (
                                <div className="text-center py-6">
                                    <div className="w-20 h-20 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <span className="material-icons text-5xl text-purple-600">open_in_new</span>
                                    </div>
                                    <h2 className="text-xl font-bold text-gray-800 mb-2">Checkout Aberto!</h2>
                                    <p className="text-gray-600 mb-2">Complete o pagamento no navegador que foi aberto.</p>
                                    <p className="text-gray-400 text-sm mb-6">Após concluir, clique no botão abaixo para verificar.</p>

                                    <div className="bg-purple-50 p-4 rounded-xl mb-4 text-left">
                                        <p className="text-xs text-purple-800 font-bold mb-2">📱 Dica:</p>
                                        <p className="text-xs text-purple-600">No checkout você pode pagar com cartão de crédito, débito ou PIX.</p>
                                    </div>

                                    <button
                                        onClick={handleVerifyCardPayment}
                                        className="w-full py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl mb-2 flex items-center justify-center gap-2"
                                    >
                                        <span className="material-icons text-sm">check_circle</span>
                                        Já Paguei! Verificar
                                    </button>
                                    <button
                                        onClick={() => {
                                            setPaymentStep(null);
                                            setPaymentMethod(null);
                                            setSelectedProduct(null);
                                            setExternalReference(null);
                                        }}
                                        className="w-full py-3 border border-gray-300 text-gray-700 font-bold rounded-xl"
                                    >
                                        Cancelar
                                    </button>
                                </div>
                            )}

                            {/* Step: Checking Payment */}
                            {paymentStep === 'checking_payment' && (
                                <div className="text-center py-8">
                                    <div className="w-16 h-16 border-4 border-green-200 border-t-green-600 rounded-full animate-spin mx-auto mb-4"></div>
                                    <h3 className="font-bold text-gray-800 mb-2">Verificando Pagamento...</h3>
                                    <p className="text-gray-500 text-sm">Buscando confirmação na Efí Bank</p>
                                    <p className="text-gray-400 text-xs mt-2">Aguarde um momento</p>
                                </div>
                            )}

                            {/* Step: Failed */}
                            {paymentStep === 'failed' && (
                                <div className="text-center py-6">
                                    <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <span className="material-icons text-5xl text-red-600">error</span>
                                    </div>
                                    <h2 className="text-2xl font-bold text-gray-800 mb-2">Pagamento Recusado</h2>
                                    <p className="text-gray-600 mb-2">{cardError || "O pagamento não foi aprovado."}</p>
                                    <p className="text-gray-400 text-xs mb-6">Verifique os dados do cartão e tente novamente.</p>
                                    <button
                                        onClick={() => {
                                            setCardError(null);
                                            setPaymentStep('entering_card');
                                        }}
                                        className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl mb-2"
                                    >
                                        Tentar Novamente
                                    </button>
                                    <button
                                        onClick={() => {
                                            setPaymentStep(null);
                                            setPaymentMethod(null);
                                            setSelectedProduct(null);
                                        }}
                                        className="w-full py-3 border border-gray-300 text-gray-700 font-bold rounded-xl"
                                    >
                                        Cancelar
                                    </button>
                                </div>
                            )}

                            {/* Step: Success */}
                            {paymentStep === 'success' && (
                                <div className="text-center py-6">
                                    <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <span className="material-icons text-5xl text-green-600">check_circle</span>
                                    </div>
                                    <h2 className="text-2xl font-bold text-gray-800 mb-2">Pagamento Aprovado!</h2>
                                    <p className="text-gray-600 mb-6">Seu pedido foi registrado. Em breve você será contatado para entrega.</p>
                                    <button
                                        onClick={() => {
                                            setPaymentStep(null);
                                            setPaymentMethod(null);
                                            setPixData(null);
                                            setSelectedProduct(null);
                                        }}
                                        className="w-full py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl"
                                    >
                                        Fechar
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
