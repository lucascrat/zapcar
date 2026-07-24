
import React, { useState, useEffect, useRef } from 'react';
import { fetchDriverPlans } from '../services/supabaseClient';
import { createPixPayment, getPaymentStatus, activatePlan, createSubscriptionCardPayment, checkPaymentByReference } from '../services/paymentService';
import { UserProfile, PayerFormData, PixPaymentResponse, DriverPlan, CardFormData } from '../types';
import { Browser } from '@capacitor/browser';


interface DriverSubscriptionProps {
    currentUser: UserProfile;
    onClose: () => void;
    isBlocked?: boolean; // Nova propriedade para forçar pagamento
}

type Step = 'plans' | 'payer_data' | 'card_form' | 'payment_qr' | 'success';

export const DriverSubscription: React.FC<DriverSubscriptionProps> = ({ currentUser, onClose, isBlocked = false }) => {
    const [plans, setPlans] = useState<DriverPlan[]>([]);
    const [step, setStep] = useState<Step>('plans');
    const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
    const [paymentMethod, setPaymentMethod] = useState<'pix' | 'card'>('pix');
    const [pixData, setPixData] = useState<PixPaymentResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [payerData, setPayerData] = useState<PayerFormData>({
        firstName: currentUser.username.split(' ')[0] || '',
        lastName: currentUser.username.split(' ').slice(1).join(' ') || 'Motorista',
        email: '',
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

    const pollingInterval = useRef<any>(null);

    // Carregar planos do Supabase
    useEffect(() => {
        const loadPlans = async () => {
            setLoading(true);
            const data = await fetchDriverPlans();
            setPlans(data);
            setLoading(false);
        };
        loadPlans();
    }, []);

    // Limpar polling ao desmontar
    useEffect(() => {
        return () => {
            if (pollingInterval.current) clearInterval(pollingInterval.current);
        };
    }, []);

    // Polling logic when QR code is shown
    useEffect(() => {
        if (step === 'payment_qr' && pixData) {
            pollingInterval.current = setInterval(async () => {
                let status = 'unknown';

                // Primeiro tenta pelo ID direto
                status = await getPaymentStatus(pixData.id);
                console.log("[Subscription] Polling Pix ID:", pixData.id, "Status:", status);

                // Se não aprovado, tenta por referência (segurança extra)
                if (status !== 'approved' && status !== 'authorized' && selectedPlanId) {
                    const ref = `sub-${currentUser.id}-${selectedPlanId}`;
                    const refResult = await checkPaymentByReference(ref);
                    console.log("[Subscription] Polling Ref Fallback:", refResult.status);
                    status = refResult.status;
                }

                if (status === 'approved' || status === 'authorized') {
                    console.log("[Subscription] Pagamento Detectado! Finalizando...");
                    clearInterval(pollingInterval.current);
                    setLoading(true);
                    if (selectedPlanId) {
                        await activatePlan(currentUser.id, selectedPlanId);
                        setStep('success');
                    }
                    setLoading(false);
                }
            }, 5000); // Checa a cada 5 segundos
        }
    }, [step, pixData, selectedPlanId, currentUser.id]);

    const handleSelectPlan = (planId: string) => {
        setSelectedPlanId(planId);
        setStep('payer_data');
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

    // Navegação Inteligente do Botão Voltar
    const handleBack = () => {
        if (step === 'success') {
            onClose();
            window.location.reload();
        } else if (step === 'payment_qr' || step === 'card_form') {
            setStep('payer_data');
        } else if (step === 'payer_data') {
            setStep('plans');
        } else if (step === 'plans') {
            if (!isBlocked) {
                onClose();
            }
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
        if (!payerData.email || !payerData.cpf || !payerData.phone || !payerData.birthDate || !payerData.zipCode || !payerData.street || !payerData.number) {
            setError("Por favor, preencha todos os campos obrigatórios (E-mail, CPF, WhatsApp, Nascimento, CEP, Rua e Número).");
            return;
        }
        if (!selectedPlanId) return;

        if (paymentMethod === 'card') {
            setError(null);  // Limpar erros anteriores
            setStep('card_form');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const response = await createPixPayment(selectedPlanId, currentUser, payerData);
            console.log("[Subscription] Pix Response Received:", response);
            if (response && response.point_of_interaction) {
                setPixData(response);
                setStep('payment_qr');
            } else {
                const raw = JSON.stringify(response);
                setError("Resposta incompleta (sem point_of_interaction). Conteúdo: " + raw.substring(0, 150));
            }
        } catch (e: any) {
            setError(e.message || "Erro ao gerar pagamento.");
        } finally {
            setLoading(false);
        }
    };

    const handleProcessCardPayment = async () => {
        if (!cardData.cardNumber || !cardData.cardholderName || !cardData.expirationMonth || !cardData.expirationYear || !cardData.securityCode) {
            setError("Preencha todos os dados do cartão.");
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const result = await createSubscriptionCardPayment(selectedPlanId!, currentUser, payerData, cardData);
            if (result.success) {
                handlePaymentApproved();
            } else {
                setError(result.message);
            }
        } catch (e: any) {
            setError(e.message || "Erro no cartão.");
        } finally {
            setLoading(false);
        }
    };

    const startAutoCheck = (reference: string) => {
        if (pollingInterval.current) clearInterval(pollingInterval.current);

        pollingInterval.current = setInterval(async () => {
            console.log(`[Subscription] Polling Ref: ${reference}`);
            const result = await checkPaymentByReference(reference);
            console.log(`[Subscription] Polling Result for ${reference}:`, result.status);

            if (result.found && result.status === 'approved') {
                handlePaymentApproved();
            }
        }, 7000);
    };

    const handleManualCheck = async () => {
        setLoading(true);
        console.log("[Subscription] Iniciando verificação manual...");
        try {
            let status = 'unknown';

            // 1. Tentar verificação direta se tivermos os dados do Pix atual
            if (pixData) {
                console.log("[Subscription] Verificando Pix por ID:", pixData.id);
                status = await getPaymentStatus(pixData.id);
                console.log("[Subscription] Status do ID atual:", status);
            }

            // 2. Se não estiver aprovado, buscar por REFERÊNCIA (mais abrangente)
            if (status !== 'approved' && selectedPlanId) {
                const ref = `sub-${currentUser.id}-${selectedPlanId}`;
                console.log("[Subscription] Buscando por Referência como Fallback:", ref);
                const result = await checkPaymentByReference(ref);
                console.log("[Subscription] Resultado da busca por referência:", result);
                status = result.status;
            }

            console.log("[Subscription] Status final da verificação:", status);

            if (status === 'approved') {
                console.log("[Subscription] Pagamento confirmado! Ativando plano...");
                await handlePaymentApproved();
            } else {
                console.warn("[Subscription] Pagamento ainda pendente. Status:", status);
                alert("Seu pagamento ainda não foi detectado como aprovado. Se você já pagou, aguarde 1 minuto e tente novamente.");
            }
        } catch (e) {
            console.error("[Subscription] Erro na verificação manual:", e);
            alert("Erro ao verificar pagamento. Tente novamente em instantes.");
        } finally {
            setLoading(false);
        }
    };

    const handlePaymentApproved = async () => {
        if (pollingInterval.current) clearInterval(pollingInterval.current);
        setLoading(true);
        if (selectedPlanId) {
            const success = await activatePlan(currentUser.id, selectedPlanId);
            if (success) {
                setStep('success');
            } else {
                alert("Erro ao ativar o plano. Sua transação foi aprovada mas houve um erro no banco. Contate o suporte.");
            }
        }
        setLoading(false);
    };

    const handleCopyCode = () => {
        if (pixData?.point_of_interaction.transaction_data.qr_code) {
            navigator.clipboard.writeText(pixData.point_of_interaction.transaction_data.qr_code);
            alert("Código Pix copiado!");
        }
    };

    const formatCPF = (value: string) => {
        return value
            .replace(/\D/g, '')
            .replace(/(\d{3})(\d)/, '$1.$2')
            .replace(/(\d{3})(\d)/, '$1.$2')
            .replace(/(\d{3})(\d{1,2})/, '$1-$2')
            .replace(/(-\d{2})\d+?$/, '$1');
    };

    return (
        <div className="fixed inset-0 z-[100] bg-black/90 flex flex-col items-center justify-center p-0 md:p-4">
            <div className="w-full max-w-4xl bg-white md:rounded-2xl overflow-hidden flex flex-col h-full md:max-h-[90vh]">
                {/* AdMob Banner Removed */}
                {/* HEADER */}
                <div className={`${isBlocked ? 'bg-red-600' : 'bg-blue-600'} p-4 text-white shrink-0 flex items-center shadow-md relative`}>
                    {/* Botão Voltar (Esquerda) */}
                    <button
                        onClick={handleBack}
                        className={`mr-3 p-2 rounded-full hover:bg-white/20 transition ${isBlocked && step === 'plans' ? 'invisible' : ''}`}
                    >
                        <span className="material-icons">arrow_back</span>
                    </button>

                    <div className="flex-1">
                        <h2 className="text-lg md:text-xl font-bold leading-tight">
                            {isBlocked ? 'Acesso Bloqueado' : 'Assinatura Motorista'}
                        </h2>
                        <p className="opacity-90 text-xs">
                            {isBlocked && "Sua assinatura venceu. Renove para continuar."}
                            {!isBlocked && step === 'plans' && "Escolha seu plano"}
                            {!isBlocked && step === 'payer_data' && "Dados para Pagamento"}
                            {!isBlocked && step === 'payment_qr' && "Pagamento Pix"}
                            {!isBlocked && step === 'success' && "Sucesso!"}
                            {!isBlocked && step === 'card_form' && "Dados do Cartão"}
                        </p>
                    </div>

                    {/* Botão Fechar (Direita) - Apenas se não bloqueado */}
                    {!isBlocked && (
                        <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-full transition ml-2">
                            <span className="material-icons">close</span>
                        </button>
                    )}
                </div>

                <div className="p-4 md:p-6 overflow-y-auto bg-gray-50 flex-1 custom-scrollbar pb-24">

                    {/* STEP 1: SELECT PLAN */}
                    {step === 'plans' && (
                        loading ? (
                            <div className="text-center py-12">
                                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                                <p className="text-gray-600">Carregando planos...</p>
                            </div>
                        ) : plans.length === 0 ? (
                            <div className="text-center py-12">
                                <p className="text-gray-600">Nenhum plano disponível no momento.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                {plans.map(plan => (
                                    <div key={plan.id} className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden flex flex-col hover:shadow-xl transition-shadow relative">
                                        {plan.id === 'plan_30d' && (
                                            <div className="absolute top-0 right-0 bg-yellow-400 text-yellow-900 text-[10px] font-bold px-2 py-1 rounded-bl-lg shadow-sm">
                                                MELHOR VALOR
                                            </div>
                                        )}
                                        <div className="p-6 flex-1 text-center">
                                            <h3 className="font-bold text-gray-800 text-lg mb-2">{plan.title}</h3>
                                            <div className="text-3xl font-bold text-blue-600 mb-2">
                                                R$ {plan.price.toFixed(2).replace('.', ',')}
                                            </div>
                                            <p className="text-gray-500 text-sm mb-4">{plan.description}</p>
                                            <div className="text-xs text-gray-400 font-mono">
                                                R$ {(plan.price / plan.days).toFixed(2)} / dia
                                            </div>
                                        </div>
                                        <div className="p-4 bg-gray-50 border-t border-gray-100">
                                            <button
                                                onClick={() => handleSelectPlan(plan.id)}
                                                className="w-full py-3 rounded-lg font-bold text-white shadow-md transition flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 active:scale-95"
                                            >
                                                Selecionar
                                                <span className="material-icons text-sm">arrow_forward</span>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )
                    )}

                    {/* STEP 2: ENTER DATA */}
                    {step === 'payer_data' && (
                        <div className="max-w-md mx-auto bg-white p-6 rounded-xl shadow-md">
                            <h3 className="font-bold text-gray-800 mb-4 text-center">Dados para Pagamento</h3>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">E-mail *</label>
                                    <input
                                        type="email"
                                        value={payerData.email}
                                        onChange={e => setPayerData({ ...payerData, email: e.target.value })}
                                        className="w-full p-3 border border-gray-300 rounded-lg outline-none focus:ring-2 ring-blue-500 text-black"
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
                                            className="w-full p-3 border border-gray-300 rounded-lg outline-none focus:ring-2 ring-blue-500 text-black"
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
                                            className="w-full p-3 border border-gray-300 rounded-lg outline-none focus:ring-2 ring-blue-500 text-black"
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
                                            className="w-full p-3 border border-gray-300 rounded-lg outline-none focus:ring-2 ring-blue-500 text-black"
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
                                            className="w-full p-3 border border-gray-300 rounded-lg outline-none focus:ring-2 ring-blue-500 text-black"
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
                                        className="w-full p-3 border border-gray-300 rounded-lg outline-none focus:ring-2 ring-blue-500 text-black"
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
                                            className="w-full p-3 border border-gray-300 rounded-lg outline-none focus:ring-2 ring-blue-500 text-black"
                                            placeholder="Ex: 1000"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Bairro *</label>
                                        <input
                                            type="text"
                                            value={payerData.neighborhood}
                                            onChange={e => setPayerData({ ...payerData, neighborhood: e.target.value })}
                                            className="w-full p-3 border border-gray-300 rounded-lg outline-none focus:ring-2 ring-blue-500 text-black"
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
                                            className="w-full p-3 border border-gray-300 rounded-lg outline-none focus:ring-2 ring-blue-500 text-black"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Estado (UF) *</label>
                                        <input
                                            type="text"
                                            maxLength={2}
                                            value={payerData.state}
                                            onChange={e => setPayerData({ ...payerData, state: e.target.value.toUpperCase() })}
                                            className="w-full p-3 border border-gray-300 rounded-lg outline-none focus:ring-2 ring-blue-500 text-black"
                                            placeholder="Ex: SP"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="mt-6 border-t pt-6">
                                <label className="block text-sm font-medium text-gray-700 mb-3">Forma de Pagamento</label>
                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        onClick={() => setPaymentMethod('pix')}
                                        className={`p-4 rounded-xl border-2 flex flex-col items-center gap-2 transition-all ${paymentMethod === 'pix' ? 'border-blue-600 bg-blue-50 text-blue-600' : 'border-gray-200 opacity-60 text-gray-400'}`}
                                    >
                                        <span className="material-icons">pix</span>
                                        <span className="text-xs font-bold">PIX Agora</span>
                                    </button>
                                    <button
                                        onClick={() => setPaymentMethod('card')}
                                        className={`p-4 rounded-xl border-2 flex flex-col items-center gap-2 transition-all ${paymentMethod === 'card' ? 'border-blue-600 bg-blue-50 text-blue-600' : 'border-gray-200 opacity-60 text-gray-400'}`}
                                    >
                                        <span className="material-icons">credit_card</span>
                                        <span className="text-xs font-bold">Cartão</span>
                                    </button>
                                </div>
                            </div>

                            {error && (
                                <div className="bg-red-50 text-red-600 p-3 rounded-xl text-xs font-bold flex items-center gap-2 mt-4 animate-shake">
                                    <span className="material-icons text-sm">error</span>
                                    {error}
                                </div>
                            )}

                            <div className="mt-8 flex gap-3">
                                <button onClick={() => setStep('plans')} className="flex-1 py-4 text-gray-600 bg-gray-100 rounded-xl font-bold">Voltar</button>
                                <button
                                    onClick={handleGeneratePayment}
                                    disabled={loading}
                                    className="flex-[2] py-4 text-white bg-blue-600 hover:bg-blue-700 rounded-xl font-bold shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
                                >
                                    {loading ? 'Processando...' : (paymentMethod === 'pix' ? 'Gerar PIX' : 'Ir para Pagamento')}
                                    {!loading && <span className="material-icons text-sm">{paymentMethod === 'pix' ? 'qr_code' : 'open_in_new'}</span>}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* STEP 2.5: CARD FORM */}
                    {step === 'card_form' && (
                        <div className="max-w-md mx-auto bg-white p-6 rounded-xl shadow-md">
                            <h3 className="font-bold text-gray-800 mb-4 text-center">Dados do Cartão</h3>
                            <div className="space-y-4">
                                <div>
                                    <div className="flex justify-between items-center mb-1">
                                        <label className="block text-sm font-medium text-gray-700">Número do Cartão</label>
                                        {cardData.cardNumber.length >= 2 && (
                                            <div className="flex items-center gap-1.5 px-2 py-0.5 bg-blue-50 rounded-lg border border-blue-100">
                                                <span className="text-[10px] font-black uppercase text-blue-600">{getCardBrand(cardData.cardNumber)}</span>
                                                <span className="material-icons text-sm text-blue-600">credit_card</span>
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
                                        className="w-full p-3 border border-gray-300 rounded-lg outline-none focus:ring-2 ring-blue-500 text-black"
                                        placeholder="0000 0000 0000 0000"
                                        maxLength={19}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Nome no Cartão</label>
                                    <input
                                        type="text"
                                        value={cardData.cardholderName}
                                        onChange={e => setCardData({ ...cardData, cardholderName: e.target.value.toUpperCase() })}
                                        className="w-full p-3 border border-gray-300 rounded-lg outline-none focus:ring-2 ring-blue-500 text-black"
                                        placeholder="NOME COMPLETO"
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Validade (MM/AA)</label>
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                maxLength={2}
                                                value={cardData.expirationMonth}
                                                onChange={e => setCardData({ ...cardData, expirationMonth: e.target.value.replace(/\D/g, '') })}
                                                className="w-1/2 p-3 border border-gray-300 rounded-lg outline-none focus:ring-2 ring-blue-500 text-black"
                                                placeholder="MM"
                                            />
                                            <input
                                                type="text"
                                                maxLength={2}
                                                value={cardData.expirationYear}
                                                onChange={e => setCardData({ ...cardData, expirationYear: e.target.value.replace(/\D/g, '') })}
                                                className="w-1/2 p-3 border border-gray-300 rounded-lg outline-none focus:ring-2 ring-blue-500 text-black"
                                                placeholder="AA"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">CVV</label>
                                        <input
                                            type="text"
                                            maxLength={4}
                                            value={cardData.securityCode}
                                            onChange={e => setCardData({ ...cardData, securityCode: e.target.value.replace(/\D/g, '') })}
                                            className="w-full p-3 border border-gray-300 rounded-lg outline-none focus:ring-2 ring-blue-500 text-black"
                                            placeholder="123"
                                        />
                                    </div>
                                </div>
                            </div>

                            {error && (
                                <div className="bg-red-50 text-red-600 p-3 rounded-xl text-xs font-bold flex items-center gap-2 mt-4 animate-shake">
                                    <span className="material-icons text-sm">error</span>
                                    {error}
                                </div>
                            )}

                            <div className="mt-8 flex gap-3">
                                <button onClick={() => setStep('payer_data')} className="flex-1 py-4 text-gray-600 bg-gray-100 rounded-xl font-bold">Voltar</button>
                                <button
                                    onClick={handleProcessCardPayment}
                                    disabled={loading}
                                    className="flex-[2] py-4 text-white bg-blue-600 hover:bg-blue-700 rounded-xl font-bold shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
                                >
                                    {loading ? 'Processando...' : 'Pagar Agora'}
                                    {!loading && <span className="material-icons text-sm">lock</span>}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* STEP 3: QR CODE / WAITING */}
                    {step === 'payment_qr' && (
                        <div className="max-w-md mx-auto bg-white p-6 md:p-8 rounded-2xl shadow-xl text-center border border-gray-100">
                            <div className="bg-green-100 text-green-800 px-4 py-2 rounded-full text-xs font-bold inline-flex items-center gap-2 mb-6 animate-pulse">
                                <span className="material-icons text-sm">hourglass_empty</span>
                                {paymentMethod === 'pix' ? 'Aguardando Pix...' : 'Aguardando Cartão...'}
                            </div>

                            {paymentMethod === 'pix' && pixData ? (
                                <>
                                    <h3 className="font-bold text-gray-800 mb-2">Escaneie o QR Code</h3>
                                    <p className="text-gray-500 text-xs mb-6 px-4">O acesso será liberado automaticamente após o pagamento</p>

                                    <div className="bg-gray-50 p-4 rounded-3xl inline-block mb-6 border-2 border-dashed border-gray-200">
                                        <img
                                            src={pixData.point_of_interaction.transaction_data.qr_code_base64?.startsWith('data:')
                                                ? pixData.point_of_interaction.transaction_data.qr_code_base64
                                                : `data:image/png;base64,${pixData.point_of_interaction.transaction_data.qr_code_base64}`}
                                            alt="QR Code Pix"
                                            className="w-48 h-48 md:w-56 md:h-56 object-contain"
                                        />
                                    </div>

                                    <div className="mb-8">
                                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-2">Copia e Cola</p>
                                        <div className="flex gap-2 bg-gray-100 p-2 rounded-xl border border-gray-200">
                                            <input
                                                readOnly
                                                value={pixData.point_of_interaction.transaction_data.qr_code}
                                                className="flex-1 bg-transparent px-2 text-[10px] text-gray-600 outline-none truncate"
                                            />
                                            <button onClick={handleCopyCode} className="bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700 transition" title="Copiar">
                                                <span className="material-icons text-sm">content_copy</span>
                                            </button>
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div className="py-8">
                                    <span className="material-icons text-6xl text-blue-100 mb-4">credit_card</span>
                                    <h3 className="font-bold text-gray-800 text-lg mb-2">Pagamento com Cartão</h3>
                                    <p className="text-gray-500 text-sm mb-8">Após pagar no navegador, clique no botão abaixo para liberar seu acesso.</p>
                                </div>
                            )}

                            <div className="space-y-3">
                                <button
                                    onClick={handleManualCheck}
                                    disabled={loading}
                                    className="w-full py-4 bg-green-600 hover:bg-green-700 text-white font-black rounded-xl shadow-lg shadow-green-600/20 flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
                                >
                                    <span className="material-icons">refresh</span>
                                    {loading ? 'Verificando...' : 'JÁ PAGUEI! LIBERAR MEU ACESSO'}
                                </button>

                                <button onClick={() => setStep('payer_data')} className="w-full py-3 text-gray-400 text-xs hover:text-gray-600 font-bold">
                                    CANCELAR / VOLTAR
                                </button>
                            </div>
                        </div>
                    )}

                    {/* STEP 4: SUCCESS */}
                    {step === 'success' && (
                        <div className="max-w-md mx-auto bg-white p-8 rounded-xl shadow-md text-center">
                            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                <span className="material-icons text-5xl text-green-600">check_circle</span>
                            </div>
                            <h2 className="text-2xl font-bold text-gray-800 mb-2">Pagamento Aprovado!</h2>
                            <p className="text-gray-600 mb-6">Sua assinatura foi ativada com sucesso. Você já pode ficar online e aceitar corridas.</p>
                            <button
                                onClick={() => {
                                    if (onClose) onClose();
                                    window.location.reload();
                                }}
                                className="w-full py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg shadow-lg"
                            >
                                Começar a Trabalhar
                            </button>
                        </div>
                    )}

                </div>
            </div>
        </div>
    );
};
