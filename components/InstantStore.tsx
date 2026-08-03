import React, { useState, useEffect, useRef } from 'react';
import { UserProfile, StoreProduct, PixPaymentResponse, PayerFormData, CardFormData } from '../types';
import { fetchStoreProducts, purchaseStoreProduct, updateUserProfile, fetchUserProfile } from '../services/supabaseClient';
import { createProductPixPayment, createProductCardPayment, getPaymentStatus, checkPaymentByReference } from '../services/paymentService';
import { Browser } from '@capacitor/browser';

interface InstantStoreProps {
    currentUser: UserProfile;
    onClose: () => void;
    onUpdateUser?: (updated: UserProfile) => void;
}

export const InstantStore: React.FC<InstantStoreProps> = ({ currentUser, onClose, onUpdateUser }) => {
    const [products, setProducts] = useState<StoreProduct[]>([]);
    const [loading, setLoading] = useState(true);
    const [buying, setBuying] = useState<string | null>(null);
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState<StoreProduct | null>(null);
    const [paymentStep, setPaymentStep] = useState<'select' | 'data' | 'card_form' | 'pay' | 'success' | 'checking_payment'>('select');
    const [paymentMethod, setPaymentMethod] = useState<'pix' | 'card'>('pix');
    const [formData, setFormData] = useState<PayerFormData>({
        firstName: currentUser.username.split(' ')[0] || '',
        lastName: currentUser.username.split(' ').slice(1).join(' ') || 'Cliente',
        email: currentUser.email || '',
        cpf: currentUser.cpf || '',
        phone: currentUser.phone || '',
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

    const [pixData, setPixData] = useState<PixPaymentResponse | null>(null);
    const [isVerifying, setIsVerifying] = useState(false);

    // Polling Control
    const pollingInterval = useRef<any>(null);

    useEffect(() => {
        loadData();
        return () => {
            if (pollingInterval.current) clearInterval(pollingInterval.current);
        };
    }, []);

    // Polling Automático baseado no Step
    useEffect(() => {
        if (paymentStep === 'pay' && showPaymentModal && selectedProduct) {
            if (paymentMethod === 'pix' && pixData) {
                // Polling por ID para Pix
                startPollingById(Number(pixData.id));
            } else {
                // Polling por Referência para Cartão
                const ref = `prod-${currentUser.id}-${selectedProduct.id}`;
                startAutoCheck(ref);
            }
        } else {
            if (pollingInterval.current) clearInterval(pollingInterval.current);
        }
    }, [paymentStep, showPaymentModal, pixData, paymentMethod, selectedProduct]);

    const loadData = async () => {
        setLoading(true);
        const data = await fetchStoreProducts();
        setProducts(data);
        setLoading(false);
    };

    const startPollingById = (id: number) => {
        if (pollingInterval.current) clearInterval(pollingInterval.current);
        pollingInterval.current = setInterval(async () => {
            const status = await getPaymentStatus(id);
            console.log("[Store] Polling Pix status:", status);
            if (status === 'approved') {
                handlePaymentSuccess();
            }
        }, 5000);
    };

    const startAutoCheck = (reference: string) => {
        if (pollingInterval.current) clearInterval(pollingInterval.current);
        pollingInterval.current = setInterval(async () => {
            const result = await checkPaymentByReference(reference);
            console.log("[Store] Polling Ref status:", result.status);
            if (result.found && result.status === 'approved') {
                handlePaymentSuccess();
            }
        }, 7000);
    };

    const handlePaymentSuccess = async () => {
        if (pollingInterval.current) clearInterval(pollingInterval.current);
        if (!selectedProduct) return;

        console.log("[Store] Iniciando registro de compra aprovada:", selectedProduct.name);
        setIsVerifying(true);
        try {
            const result = await purchaseStoreProduct(currentUser.id, selectedProduct, paymentMethod);
            console.log("[Store] Resultado do registro no Supabase:", result);

            if (result.success) {
                // Update profile with newest data
                await updateUserProfile(currentUser.id, {
                    cpf: formData.cpf,
                    address_zip: formData.zipCode,
                    address_street: formData.street,
                    address_number: formData.number,
                    address_neighborhood: formData.neighborhood,
                    address_city: formData.city,
                    email: formData.email
                });

                // Trigger UI refresh
                const updated = await fetchUserProfile(currentUser.id);
                if (updated && onUpdateUser) onUpdateUser(updated);

                setPaymentStep('success');
            } else {
                console.error("[Store] Erro ao registrar compra:", result.message);
                alert(result.message);
            }
        } catch (err) {
            console.error("[Store] Erro catastrófico no registro:", err);
            alert("Erro ao finalizar pedido. Por favor, contate o suporte.");
        } finally {
            setIsVerifying(false);
        }
    };

    const handlePurchaseAttempt = (product: StoreProduct, method: 'coins' | 'pix') => {
        if (buying) return;

        if (method === 'coins') {
            const confirmMsg = `Deseja resgatar "${product.name}" por ${product.price_coins} moedas ? `;
            if (!window.confirm(confirmMsg)) return;
            processCoinPurchase(product);
        } else {
            setSelectedProduct(product);
            setPaymentStep('data');
            setShowPaymentModal(true);
            // Limpar dados do cartão de tentativas anteriores
            setCardData({
                cardNumber: '',
                cardholderName: '',
                expirationMonth: '',
                expirationYear: '',
                securityCode: '',
                installments: 1
            });
        }
    };

    const handleZipCodeBlur = async () => {
        const cep = formData.zipCode?.replace(/\D/g, '');
        if (cep?.length === 8) {
            try {
                const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
                const data = await res.json();
                if (!data.erro) {
                    setFormData(prev => ({
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

    const processCoinPurchase = async (product: StoreProduct) => {
        setBuying(product.id);
        try {
            const result = await purchaseStoreProduct(currentUser.id, product, 'coins');
            if (result.success) {
                alert(result.message);
                loadData();
            } else {
                alert(result.message);
            }
        } finally {
            setBuying(null);
        }
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

    const handleGeneratePayment = async () => {
        if (!formData.email || !formData.cpf || !formData.phone || !formData.birthDate || !formData.zipCode || !formData.street || !formData.number) {
            alert("Preencha todos os campos obrigatórios (E-mail, CPF, WhatsApp, Nascimento, CEP, Rua e Número).");
            return;
        }

        if (paymentMethod === 'card') {
            setPaymentStep('card_form');
            return;
        }

        setIsVerifying(true);
        try {
            const res = await createProductPixPayment(selectedProduct!, currentUser, formData);
            console.log("[Store] Pix Res Received:", res);
            if (res && res.point_of_interaction) {
                setPixData(res);
                setPaymentStep('pay');
                if (res.id) startPollingById(Number(res.id));
            } else {
                const raw = JSON.stringify(res);
                throw new Error("Resposta incompleta (sem point_of_interaction). Conteúdo: " + raw.substring(0, 150));
            }
        } catch (e: any) {
            alert("Erro ao gerar PIX: " + e.message);
        } finally {
            setIsVerifying(false);
        }
    };

    const handleProcessCardPayment = async () => {
        if (!cardData.cardNumber || !cardData.cardholderName || !cardData.expirationMonth || !cardData.securityCode) {
            alert("Preencha todos os dados do cartão.");
            return;
        }

        setIsVerifying(true);
        try {
            const res = await createProductCardPayment(selectedProduct!, currentUser, formData, cardData);
            if (res.success) {
                await handlePaymentSuccess();
            } else {
                alert(res.message);
            }
        } catch (e: any) {
            alert("Erro no cartão: " + e.message);
        } finally {
            setIsVerifying(false);
        }
    };

    const handleManualCheck = async () => {
        if (!selectedProduct) return;
        setIsVerifying(true);
        console.log("[Store] Verificação manual solicitada...");

        try {
            let status = 'unknown';
            if (paymentMethod === 'pix' && pixData) {
                console.log("[Store] Verificando Pix por ID:", pixData.id);
                status = await getPaymentStatus(pixData.id);
            } else {
                const ref = `prod-${currentUser.id}-${selectedProduct.id}`;
                console.log("[Store] Verificando por Referência:", ref);
                const result = await checkPaymentByReference(ref);
                console.log("[Store] Resultado da busca por referência:", result);
                status = result.status;
            }

            console.log("[Store] Status final encontrado:", status);

            if (status === 'approved' || status === 'authorized') {
                console.log("[Store] Pagamento verificado com sucesso!");
                await handlePaymentSuccess();
            } else {
                console.warn("[Store] Pagamento ainda pendente ou não encontrado. Status:", status);
                alert("Seu pagamento ainda consta como pendente no Mercado Pago. Se você já pagou, aguarde 1 minuto e tente novamente clicando no botão.");
            }
        } catch (e) {
            console.error("[Store] Erro na verificação manual:", e);
            alert("Ocorreu um erro ao verificar seu pagamento. Tente novamente em instantes.");
        } finally {
            setIsVerifying(false);
        }
    };

    return (
        <div className="flex-1 flex flex-col h-full bg-[#0b141a] text-white animate-slide-up">
            {/* Store Header */}
            <div className="bg-[#1f2c34] p-4 flex items-center justify-between shadow-xl shrink-0 pt-safe border-b border-white/5">
                <div className="flex items-center gap-3">
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition">
                        <span className="material-icons">close</span>
                    </button>
                    <div>
                        <h1 className="text-xl font-bold tracking-tight">Loja de Prêmios</h1>
                        <p className="text-[10px] text-yellow-400 font-bold uppercase tracking-widest">Resgate Instantâneo</p>
                    </div>
                </div>
                <div className="bg-yellow-400/10 px-3 py-1.5 rounded-full flex items-center gap-2 border border-yellow-400/20">
                    <span className="material-icons text-yellow-500 text-sm">stars</span>
                    <span className="text-yellow-400 font-black text-sm">{currentUser.wallet_coins || 0}</span>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                {loading ? (
                    <div className="flex flex-col items-center justify-center p-20 gap-4 opacity-50">
                        <div className="w-10 h-10 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin"></div>
                        <p className="font-bold text-sm">Preparando Vitrine...</p>
                    </div>
                ) : products.length === 0 ? (
                    <div className="text-center p-20 opacity-40">
                        <span className="material-icons text-6xl mb-4">storefront</span>
                        <p>Loja vazia no momento.</p>
                        <p className="text-xs">Volte mais tarde para novos prêmios.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-6 pb-20">
                        {products.map((product) => (
                            <div key={product.id} className="bg-[#1f2c34] rounded-[32px] overflow-hidden border border-white/5 shadow-2xl group transition-all">
                                {/* Product Image Area */}
                                <div className="h-56 relative overflow-hidden">
                                    <img
                                        src={product.image_url || 'https://images.unsplash.com/photo-1549007994-cb92ca714503?q=80&w=1000&auto=format&fit=crop'}
                                        alt={product.name}
                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-[#1f2c34] via-transparent to-transparent"></div>

                                    {/* Badges */}
                                    <div className="absolute top-4 left-4 flex flex-col gap-2">
                                        <div className="bg-green-600 text-white text-[10px] font-black px-3 py-1 rounded-full shadow-lg uppercase tracking-tighter">
                                            {product.stock} em estoque
                                        </div>
                                    </div>
                                </div>

                                {/* Content */}
                                <div className="p-6">
                                    <h3 className="text-2xl font-black text-white mb-2 leading-tight tracking-tight italic uppercase">
                                        {product.name}
                                    </h3>
                                    <p className="text-gray-400 text-sm leading-relaxed mb-6 line-clamp-2">
                                        {product.description || 'Um prêmio exclusivo para os melhores usuários do ChegoJá.'}
                                    </p>

                                    <div className="grid grid-cols-2 gap-4">
                                        {/* Coin Option */}
                                        <button
                                            onClick={() => handlePurchaseAttempt(product, 'coins')}
                                            disabled={!!buying}
                                            className="bg-yellow-400 text-black p-4 rounded-2xl flex flex-col items-center justify-center gap-1 active:scale-95 transition-all shadow-[0_5px_15px_rgba(234,179,8,0.3)] disabled:opacity-50"
                                        >
                                            <div className="flex items-center gap-1">
                                                <span className="material-icons text-base">stars</span>
                                                <span className="font-black text-lg">{product.price_coins}</span>
                                            </div>
                                            <span className="text-[9px] font-black uppercase tracking-widest opacity-70">Moedas</span>
                                        </button>

                                        {/* PIX Option */}
                                        <button
                                            onClick={() => handlePurchaseAttempt(product, 'pix')}
                                            disabled={!!buying}
                                            className="bg-white/5 border border-white/10 text-white p-4 rounded-2xl flex flex-col items-center justify-center gap-1 active:scale-95 transition-all hover:bg-white/10 disabled:opacity-50"
                                        >
                                            <div className="flex items-center gap-1">
                                                <span className="material-icons text-base text-whatsapp-green">payments</span>
                                                <span className="font-black text-lg">R$ {product.price_brl.toFixed(2)}</span>
                                            </div>
                                            <span className="text-[9px] font-black uppercase tracking-widest opacity-50">Comprar Agora</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Bottom Note */}
            <div className="p-4 bg-whatsapp-panel border-t border-white/5 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-accent-500/10 flex items-center justify-center text-accent-500 shrink-0">
                    <span className="material-icons">info</span>
                </div>
                <p className="text-[10px] text-gray-500 font-medium leading-tight">
                    Ao resgatar com moedas ou comprar via PIX/Cartão, entraremos em contato via chat para combinar a entrega do seu produto instantâneo.
                </p>
            </div>

            {/* PAYMENT MODAL */}
            {showPaymentModal && selectedProduct && (
                <div className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center p-0 md:p-4 animate-fade-in">
                    <div className="bg-white w-full h-full md:h-auto md:max-w-md md:rounded-3xl overflow-hidden flex flex-col text-black">
                        {/* Header */}
                        <div className="bg-[#1f2c34] text-white p-5 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <button onClick={() => {
                                    setShowPaymentModal(false);
                                    setPaymentStep('select');
                                }} className="p-1 hover:bg-white/10 rounded-full transition">
                                    <span className="material-icons">close</span>
                                </button>
                                <span className="font-bold">Pagamento Seguro</span>
                            </div>
                            <span className="text-whatsapp-green font-black tracking-tighter italic">CHEGOJÁ</span>
                        </div>

                        <div className="p-6 md:p-8 overflow-y-auto">
                            {/* Product Info Small */}
                            <div className="flex items-center gap-4 bg-gray-50 p-4 rounded-2xl mb-6">
                                <img src={selectedProduct.image_url} className="w-16 h-16 rounded-xl object-cover shadow-sm" alt={selectedProduct.name} />
                                <div className="flex-1">
                                    <h4 className="font-bold text-sm leading-tight text-gray-800">{selectedProduct.name}</h4>
                                    <p className="text-accent-600 font-black text-lg">R$ {selectedProduct.price_brl.toFixed(2)}</p>
                                </div>
                            </div>

                            {paymentStep === 'data' && (
                                <div className="space-y-4 animate-slide-up">
                                    <h5 className="font-black text-[10px] uppercase tracking-widest text-gray-400 mb-2 text-center">Dados para Faturamento</h5>

                                    <div className="space-y-3">
                                        <div className="bg-gray-100 p-1 rounded-xl flex">
                                            <input
                                                placeholder="Seu E-mail"
                                                type="email"
                                                value={formData.email}
                                                onChange={e => setFormData({ ...formData, email: e.target.value })}
                                                className="w-full bg-transparent p-3 outline-none text-sm font-medium"
                                            />
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="bg-gray-100 p-1 rounded-xl flex">
                                                <input
                                                    placeholder="CPF"
                                                    type="text"
                                                    value={formData.cpf}
                                                    onChange={e => {
                                                        const val = e.target.value.replace(/\D/g, '')
                                                            .replace(/(\d{3})(\d)/, '$1.$2')
                                                            .replace(/(\d{3})(\d)/, '$1.$2')
                                                            .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
                                                        setFormData({ ...formData, cpf: val.slice(0, 14) });
                                                    }}
                                                    className="w-full bg-transparent p-3 outline-none text-sm font-medium"
                                                    maxLength={14}
                                                />
                                            </div>
                                            <div className="bg-gray-100 p-1 rounded-xl flex">
                                                <input
                                                    placeholder="WhatsApp"
                                                    type="text"
                                                    value={formData.phone}
                                                    onChange={e => {
                                                        const val = e.target.value.replace(/\D/g, '')
                                                            .replace(/^(\d{2})(\d)/g, '($1) $2')
                                                            .replace(/(\d{5})(\d)/, '$1-$2');
                                                        setFormData({ ...formData, phone: val.slice(0, 15) });
                                                    }}
                                                    className="w-full bg-transparent p-3 outline-none text-sm font-medium"
                                                    maxLength={15}
                                                />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="bg-gray-100 p-1 rounded-xl flex">
                                                <input
                                                    placeholder="Nascimento"
                                                    type="date"
                                                    value={formData.birthDate || ''}
                                                    onChange={e => setFormData({ ...formData, birthDate: e.target.value })}
                                                    className="w-full bg-transparent p-3 outline-none text-sm font-medium"
                                                />
                                            </div>
                                            <div className="bg-gray-100 p-1 rounded-xl flex">
                                                <input
                                                    placeholder="CEP"
                                                    type="text"
                                                    value={formData.zipCode}
                                                    onBlur={handleZipCodeBlur}
                                                    onChange={e => {
                                                        const val = e.target.value.replace(/\D/g, '').replace(/^(\d{5})(\d)/, '$1-$2');
                                                        setFormData({ ...formData, zipCode: val.slice(0, 9) });
                                                    }}
                                                    className="w-full bg-transparent p-3 outline-none text-sm font-medium"
                                                    maxLength={9}
                                                />
                                            </div>
                                        </div>
                                        <div className="bg-gray-100 p-1 rounded-xl flex">
                                            <input
                                                placeholder="Endereço (Rua/Avenida)"
                                                type="text"
                                                value={formData.street}
                                                onChange={e => setFormData({ ...formData, street: e.target.value })}
                                                className="w-full bg-transparent p-3 outline-none text-sm font-medium"
                                            />
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="bg-gray-100 p-1 rounded-xl flex">
                                                <input
                                                    placeholder="Número"
                                                    type="text"
                                                    value={formData.number}
                                                    onChange={e => setFormData({ ...formData, number: e.target.value })}
                                                    className="w-full bg-transparent p-3 outline-none text-sm font-medium"
                                                />
                                            </div>
                                            <div className="bg-gray-100 p-1 rounded-xl flex">
                                                <input
                                                    placeholder="Bairro"
                                                    type="text"
                                                    value={formData.neighborhood}
                                                    onChange={e => setFormData({ ...formData, neighborhood: e.target.value })}
                                                    className="w-full bg-transparent p-3 outline-none text-sm font-medium"
                                                />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="bg-gray-100 p-1 rounded-xl flex">
                                                <input
                                                    placeholder="Cidade"
                                                    type="text"
                                                    value={formData.city}
                                                    onChange={e => setFormData({ ...formData, city: e.target.value })}
                                                    className="w-full bg-transparent p-3 outline-none text-sm font-medium"
                                                />
                                            </div>
                                            <div className="bg-gray-100 p-1 rounded-xl flex">
                                                <input
                                                    placeholder="Estado (UF)"
                                                    type="text"
                                                    maxLength={2}
                                                    value={formData.state}
                                                    onChange={e => setFormData({ ...formData, state: e.target.value.toUpperCase() })}
                                                    className="w-full bg-transparent p-3 outline-none text-sm font-medium"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="pt-4">
                                        <p className="text-[10px] font-bold text-gray-400 uppercase mb-3 text-center">Método de Pagamento</p>
                                        <div className="grid grid-cols-2 gap-3">
                                            <button
                                                onClick={() => setPaymentMethod('pix')}
                                                className={`p-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all ${paymentMethod === 'pix' ? 'border-whatsapp-green bg-green-50 text-whatsapp-green' : 'border-gray-50 opacity-40 hover:opacity-100'}`}
                                            >
                                                <span className="material-icons">pix</span>
                                                <span className="text-[9px] font-black uppercase">PIX Agora</span>
                                            </button>
                                            <button
                                                onClick={() => setPaymentMethod('card')}
                                                className={`p-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all ${paymentMethod === 'card' ? 'border-accent-500 bg-accent-50 text-accent-500' : 'border-gray-50 opacity-40 hover:opacity-100'}`}
                                            >
                                                <span className="material-icons">credit_card</span>
                                                <span className="text-[9px] font-black uppercase">Cartão</span>
                                            </button>
                                        </div>
                                    </div>

                                    <button
                                        onClick={handleGeneratePayment}
                                        disabled={isVerifying}
                                        className="w-full bg-black text-white p-5 rounded-2xl font-black uppercase tracking-widest text-sm shadow-xl mt-6 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                                    >
                                        {isVerifying ? (
                                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                        ) : (
                                            <>
                                                {paymentMethod === 'pix' ? 'Gerar PIX' : 'Dados do Cartão'}
                                                <span className="material-icons text-sm">{paymentMethod === 'pix' ? 'qr_code' : 'arrow_forward'}</span>
                                            </>
                                        )}
                                    </button>
                                </div>
                            )}

                            {paymentStep === 'card_form' && (
                                <div className="space-y-4 animate-slide-up">
                                    <h5 className="font-black text-[10px] uppercase tracking-widest text-gray-400 mb-2 text-center">Dados do Cartão</h5>

                                    <div className="space-y-3">
                                        <div className="bg-gray-100 p-1 rounded-xl relative">
                                            <input
                                                placeholder="Número do Cartão"
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
                                                className="w-full bg-transparent p-3 outline-none text-sm font-medium pr-16"
                                                maxLength={19}
                                            />
                                            {cardData.cardNumber.length >= 2 && (
                                                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2 bg-white/80 px-2 py-1 rounded-lg border border-gray-200">
                                                    <span className="text-[9px] font-black uppercase text-accent-600">{getCardBrand(cardData.cardNumber)}</span>
                                                    <span className="material-icons text-sm text-accent-600">credit_card</span>
                                                </div>
                                            )}
                                        </div>
                                        <div className="bg-gray-100 p-1 rounded-xl">
                                            <input
                                                placeholder="Nome como está no Cartão"
                                                type="text"
                                                value={cardData.cardholderName}
                                                onChange={e => setCardData({ ...cardData, cardholderName: e.target.value.toUpperCase() })}
                                                className="w-full bg-transparent p-3 outline-none text-sm font-medium"
                                            />
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="bg-gray-100 p-1 rounded-xl flex gap-1 items-center">
                                                <input
                                                    placeholder="MM"
                                                    maxLength={2}
                                                    value={cardData.expirationMonth}
                                                    onChange={e => setCardData({ ...cardData, expirationMonth: e.target.value.replace(/\D/g, '') })}
                                                    className="w-12 bg-transparent p-3 outline-none text-sm font-medium text-center"
                                                />
                                                <span className="text-gray-300">/</span>
                                                <input
                                                    placeholder="AA"
                                                    maxLength={2}
                                                    value={cardData.expirationYear}
                                                    onChange={e => setCardData({ ...cardData, expirationYear: e.target.value.replace(/\D/g, '') })}
                                                    className="w-12 bg-transparent p-3 outline-none text-sm font-medium text-center"
                                                />
                                            </div>
                                            <div className="bg-gray-100 p-1 rounded-xl">
                                                <input
                                                    placeholder="CVV"
                                                    maxLength={4}
                                                    value={cardData.securityCode}
                                                    onChange={e => setCardData({ ...cardData, securityCode: e.target.value.replace(/\D/g, '') })}
                                                    className="w-full bg-transparent p-3 outline-none text-sm font-medium text-center"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <button
                                        onClick={handleProcessCardPayment}
                                        disabled={isVerifying}
                                        className="w-full bg-accent-600 text-white p-5 rounded-2xl font-black uppercase tracking-widest text-sm shadow-xl mt-6 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                                    >
                                        {isVerifying ? (
                                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                        ) : (
                                            <>
                                                Confirmar Pagamento
                                                <span className="material-icons text-sm">lock</span>
                                            </>
                                        )}
                                    </button>

                                    <button
                                        onClick={() => setPaymentStep('data')}
                                        className="w-full py-2 text-[10px] font-black text-gray-400 uppercase tracking-widest hover:text-gray-600 transition"
                                    >
                                        Voltar para E-mail/CPF
                                    </button>
                                </div>
                            )}

                            {paymentStep === 'pay' && (
                                <div className="text-center animate-slide-up">
                                    <div className="bg-yellow-100 text-yellow-800 p-2 rounded-full text-[10px] font-bold inline-flex items-center gap-2 mb-6 px-4 animate-pulse">
                                        <span className="material-icons text-xs">hourglass_empty</span>
                                        Aguardando Pagamento...
                                    </div>

                                    {paymentMethod === 'pix' && pixData ? (
                                        <>
                                            <div className="bg-gray-50 p-4 rounded-3xl inline-block mb-6 border border-gray-100">
                                                <img
                                                    src={pixData.point_of_interaction.transaction_data.qr_code_base64?.startsWith('data:')
                                                        ? pixData.point_of_interaction.transaction_data.qr_code_base64
                                                        : `data:image/png;base64,${pixData.point_of_interaction.transaction_data.qr_code_base64}`}
                                                    className="w-48 h-48 md:w-56 md:h-56"
                                                    alt="QR Code"
                                                />
                                            </div>

                                            <div className="mb-6">
                                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-2">Pix Copia e Cola</p>
                                                <div className="flex gap-2 bg-gray-50 p-2 rounded-xl border border-gray-200">
                                                    <input
                                                        readOnly
                                                        value={pixData.point_of_interaction.transaction_data.qr_code}
                                                        className="flex-1 bg-transparent px-2 text-[10px] text-gray-600 outline-none truncate font-mono"
                                                    />
                                                    <button
                                                        onClick={() => {
                                                            navigator.clipboard.writeText(pixData.point_of_interaction.transaction_data.qr_code);
                                                            alert("Código Copiado!");
                                                        }}
                                                        className="bg-accent-600 text-white p-2 rounded-lg hover:bg-accent-700 transition"
                                                    >
                                                        <span className="material-icons text-sm">content_copy</span>
                                                    </button>
                                                </div>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="py-10">
                                            <div className="w-20 h-20 bg-accent-50 text-accent-500 rounded-full flex items-center justify-center mx-auto mb-4">
                                                <span className="material-icons text-4xl">credit_card</span>
                                            </div>
                                            <h4 className="font-bold text-gray-800 mb-2">Pagamento com Cartão</h4>
                                            <p className="text-xs text-gray-500 px-8 leading-relaxed mb-6">
                                                Finalize o pagamento na janela que abrimos. Assim que concluir o pagamento, seu pedido será processado automaticamente.
                                            </p>
                                        </div>
                                    )}

                                    <div className="space-y-3 pt-4">
                                        <button
                                            onClick={handleManualCheck}
                                            disabled={isVerifying}
                                            className="w-full bg-whatsapp-green text-white p-5 rounded-2xl font-black uppercase tracking-widest text-sm shadow-xl active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                                        >
                                            {isVerifying ? (
                                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                            ) : (
                                                <>
                                                    <span className="material-icons">refresh</span>
                                                    JÁ PAGUEI! CONFIRMAR AGORA
                                                </>
                                            )}
                                        </button>

                                        <button
                                            onClick={() => setPaymentStep('data')}
                                            className="w-full py-2 text-[10px] font-black text-gray-400 uppercase tracking-widest hover:text-gray-600 transition"
                                        >
                                            Alterar Dados / Voltar
                                        </button>
                                    </div>
                                </div>
                            )}

                            {paymentStep === 'success' && (
                                <div className="text-center py-10 animate-scale-up">
                                    <div className="w-24 h-24 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-xl border-4 border-white">
                                        <span className="material-icons text-6xl">check_circle</span>
                                    </div>
                                    <h3 className="text-3xl font-black mb-2 italic uppercase tracking-tighter">Pedido Confirmado!</h3>
                                    <p className="text-sm text-gray-500 mb-8 px-4">Parabéns! Seu pagamento foi processado. Nossa equipe entrará em contato via chat em instantes para combinar a entrega.</p>
                                    <button
                                        onClick={() => {
                                            setShowPaymentModal(false);
                                            setPaymentStep('select');
                                        }}
                                        className="w-full bg-black text-white p-5 rounded-2xl font-black uppercase tracking-widest text-sm shadow-xl active:scale-95 transition-all"
                                    >
                                        ÓTIMO! VOLTAR PARA LOJA
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
