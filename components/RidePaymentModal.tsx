
import React, { useState, useEffect, useRef } from 'react';
import { Ride, UserProfile, PayerFormData, CardFormData, PixPaymentResponse } from '../types';
import { supabase } from '../services/supabaseClient';
import { createRidePixPayment, createRideCardPayment, getPaymentStatus, checkPaymentByReference } from '../services/paymentService'; // Import new services

interface RidePaymentModalProps {
    ride: Ride;
    currentUser: UserProfile;
    onPaymentComplete: () => void;
}

export const RidePaymentModal: React.FC<RidePaymentModalProps> = ({ ride, currentUser, onPaymentComplete }) => {
    // UI State
    const [useCoins, setUseCoins] = useState(false);
    const [selectedMethod, setSelectedMethod] = useState<'cash' | 'pix' | 'card'>('cash');
    const [step, setStep] = useState<'select' | 'data' | 'pay' | 'success' | 'waiting_confirmation'>('select');
    const [loading, setLoading] = useState(false);

    // Data State
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

    // Polling Ref
    const pollingInterval = useRef<any>(null);

    // Calculated Values
    const ridePrice = ride.estimated_price || 0;
    const userCoins = currentUser.wallet_coins || 0;
    const COIN_VALUE = 0.50; // Assumption based on previous logic, adjust if needed

    const maxDiscount = useCoins ? Math.min(ridePrice, userCoins * COIN_VALUE) : 0;
    const coinsToUse = useCoins ? Math.ceil(maxDiscount / COIN_VALUE) : 0;
    const finalCashAmount = Math.max(0, ridePrice - maxDiscount);
    const isFullCoinPayment = finalCashAmount === 0;

    // Monitor ride status changes (e.g. driver confirmed)
    useEffect(() => {
        if (ride.status === 'finished' || ride.payment_status === 'completed') {
            if (step !== 'success') {
                setStep('success');
                setTimeout(onPaymentComplete, 3000);
            }
        }
    }, [ride.status, ride.payment_status]);

    // Safety polling while waiting for confirmation
    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (step === 'waiting_confirmation') {
            interval = setInterval(async () => {
                const { data } = await supabase.from('rides').select('status, payment_status').eq('id', ride.id).single();
                if (data && (data.status === 'finished' || data.payment_status === 'completed')) {
                    setStep('success');
                    setTimeout(onPaymentComplete, 3000);
                }
            }, 3000);
        }
        return () => clearInterval(interval);
    }, [step, ride.id]);

    // Cleanup polling
    useEffect(() => {
        return () => {
            if (pollingInterval.current) clearInterval(pollingInterval.current);
        };
    }, []);

    const startPolling = (pixId?: string | number, reference?: string) => {
        if (pollingInterval.current) clearInterval(pollingInterval.current);

        pollingInterval.current = setInterval(async () => {
            let status = 'unknown';
            if (pixId) {
                status = await getPaymentStatus(pixId);
            } else if (reference) {
                const res = await checkPaymentByReference(reference);
                if (res.found) status = res.status;
            }

            console.log("[PaymentPoll] Status:", status);
            if (status === 'approved' || status === 'paid') {
                finalizePaymentProcess(true);
            }
        }, 5000);
    };

    const handleInitialConfirm = () => {
        if (isFullCoinPayment || selectedMethod === 'cash') {
            // Se for dinheiro ou 100% moedas, finaliza direto (notifica motorista no caso de dinheiro)
            finalizePaymentProcess(false);
        } else {
            // Se for PIX ou Cartão e tem valor a pagar, vai para o form
            setStep('data');
        }
    };

    const handleGeneratePayment = async () => {
        if (!formData.cpf || !formData.email) {
            alert("CPF e E-mail são obrigatórios para emitir o pagamento.");
            return;
        }

        setLoading(true);
        try {
            // Prepare the ride object with the FINAL price (deducting coins)
            const rideForPayment = {
                ...ride,
                final_price: finalCashAmount
            };

            if (selectedMethod === 'pix') {
                const res = await createRidePixPayment(rideForPayment, currentUser, formData);
                if (res) {
                    setPixData(res);
                    setStep('pay');
                    if (res.id) startPolling(res.id);
                }
            } else if (selectedMethod === 'card') {
                if (!cardData.cardNumber || !cardData.securityCode) {
                    alert("Preencha os dados do cartão.");
                    setLoading(false);
                    return;
                }
                const res = await createRideCardPayment(rideForPayment, currentUser, formData, cardData);
                if (res.success) {
                    finalizePaymentProcess(true);
                } else {
                    alert("Erro no cartão: " + res.message);
                }
            }
        } catch (e: any) {
            console.error(e);
            alert("Erro ao processar: " + e.message);
        } finally {
            setLoading(false);
        }
    };

    const finalizePaymentProcess = async (isDigitalPayment: boolean) => {
        if (pollingInterval.current) clearInterval(pollingInterval.current);
        setLoading(true);

        try {
            // 1. Process Coins if used
            if (coinsToUse > 0) {
                await supabase.rpc('pay_ride_with_coins', {
                    p_ride_id: ride.id,
                    p_client_id: currentUser.id,
                    p_driver_id: ride.driver_id,
                    p_coins_amount: coinsToUse,
                    p_discount_value: maxDiscount
                });
            }

            // 2. Update Ride Status
            // Se foi pagamento digital (PIX/Cartão) aprovado, marcamos como PROCESSED/COMPLETED.
            // Se foi Dinheiro, marcamos como waiting driver confirm? 
            // - A logica anterior era: Se Cash, apenas fecha modal? Não, notificava motorista.
            // O App motorista já está em 'waiting_payment'.
            // Se o usuário paga via App (Digital), o status deve ir para 'finished' AUTOMATICAMENTE e avisar o motorista.
            // Se for Dinheiro, o usuário clica 'Confirmar', o App dele fica aguardando o motorista dar 'OK'.

            if (isDigitalPayment || isFullCoinPayment) {
                await supabase.from('rides').update({
                    payment_method: isFullCoinPayment ? 'coins' : selectedMethod,
                    payment_status: 'completed',
                    status: 'finished', // Encerra a corrida pois já pagou
                    final_price: finalCashAmount
                }).eq('id', ride.id);

                // Show success screen briefly then close
                setStep('success');
                setTimeout(onPaymentComplete, 3000);

            } else {
                // Pagamento em Dinheiro (Direto ao Motorista)
                await supabase.from('rides').update({
                    payment_method: 'cash',
                    final_price: finalCashAmount
                }).eq('id', ride.id);

                // No fluxo de dinheiro, mostramos msg para aguardar motorista
                setStep('waiting_confirmation');
            }

        } catch (e) {
            console.error(e);
            alert("Erro ao finalizar.");
        } finally {
            setLoading(false);
        }
    };

    const getCardBrand = (number: string) => {
        const n = number.replace(/\s/g, '');
        if (/^4/.test(n)) return 'visa';
        if (/^5[1-5]/.test(n)) return 'mastercard';
        if (/^3[47]/.test(n)) return 'amex';
        return 'credit_card';
    };

    // Sub-components for rendering
    const renderSelectStep = () => (
        <div className="p-6 space-y-6">
            <div className="flex justify-between items-end">
                <span className="text-gray-400 text-sm uppercase font-bold">Total a Pagar</span>
                <span className="text-3xl font-black text-white">R$ {ridePrice.toFixed(2)}</span>
            </div>

            {userCoins > 0 && (
                <div className={`p-4 rounded-xl border transition cursor-pointer ${useCoins ? 'bg-yellow-500/20 border-yellow-500' : 'bg-white/5 border-white/5'}`}
                    onClick={() => setUseCoins(!useCoins)}
                >
                    <div className="flex items-center gap-3">
                        <div className={`w-5 h-5 rounded border flex items-center justify-center ${useCoins ? 'bg-yellow-500 border-yellow-500' : 'border-gray-500'}`}>
                            {useCoins && <span className="material-icons text-xs text-black font-bold">check</span>}
                        </div>
                        <div className="flex-1 text-left">
                            <p className={`font-bold text-sm ${useCoins ? 'text-yellow-400' : 'text-gray-300'}`}>Usar Saldo em Moedas</p>
                            <p className="text-xs text-gray-500">Saldo: {userCoins} (Desc. máx: R$ {(userCoins * COIN_VALUE).toFixed(2)})</p>
                        </div>
                        {useCoins && (
                            <span className="font-bold text-yellow-400">- R$ {maxDiscount.toFixed(2)}</span>
                        )}
                    </div>
                </div>
            )}

            {!isFullCoinPayment && (
                <div className="grid grid-cols-3 gap-3">
                    <button onClick={() => setSelectedMethod('cash')} className={`py-3 rounded-xl border flex flex-col items-center gap-1 transition ${selectedMethod === 'cash' ? 'bg-green-600 border-green-600 text-white' : 'bg-white/5 border-white/5 text-gray-400'}`}>
                        <span className="material-icons text-xl">attach_money</span>
                        <span className="text-[10px] font-bold uppercase">Dinheiro</span>
                    </button>
                    <button onClick={() => setSelectedMethod('pix')} className={`py-3 rounded-xl border flex flex-col items-center gap-1 transition ${selectedMethod === 'pix' ? 'bg-whatsapp-green border-whatsapp-green text-white' : 'bg-white/5 border-white/5 text-gray-400'}`}>
                        <span className="material-icons text-xl">pix</span>
                        <span className="text-[10px] font-bold uppercase">Pix</span>
                    </button>
                    <button onClick={() => setSelectedMethod('card')} className={`py-3 rounded-xl border flex flex-col items-center gap-1 transition ${selectedMethod === 'card' ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white/5 border-white/5 text-gray-400'}`}>
                        <span className="material-icons text-xl">credit_card</span>
                        <span className="text-[10px] font-bold uppercase">Cartão</span>
                    </button>
                </div>
            )}

            <div className="pt-4 border-t border-white/10">
                <div className="flex justify-between items-center mb-4">
                    <span className="text-gray-400 text-sm">A Pagar Agora</span>
                    <span className="text-2xl font-black text-whatsapp-green">R$ {finalCashAmount.toFixed(2)}</span>
                </div>
                <button
                    onClick={handleInitialConfirm}
                    disabled={loading}
                    className="w-full py-4 bg-whatsapp-green hover:bg-emerald-500 text-white font-black rounded-2xl shadow-xl uppercase tracking-widest transition active:scale-95 disabled:opacity-50"
                >
                    {isFullCoinPayment || selectedMethod === 'cash' ? 'Confirmar Pagamento' : `Pagar com ${selectedMethod === 'pix' ? 'PIX' : 'Cartão'}`}
                </button>
            </div>
        </div>
    );

    const renderDataStep = () => (
        <div className="p-6 space-y-4 animate-slide-up bg-white text-black h-full overflow-y-auto">
            <div className="flex items-center gap-2 mb-2">
                <button onClick={() => setStep('select')} className="p-2 -ml-2"><span className="material-icons">arrow_back</span></button>
                <h3 className="font-bold text-lg">Dados de Pagamento</h3>
            </div>

            <input placeholder="CPF (Apenas números)" value={formData.cpf} onChange={e => setFormData({ ...formData, cpf: e.target.value })} className="w-full bg-gray-100 p-3 rounded-xl outline-none" />
            <input placeholder="E-mail" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} className="w-full bg-gray-100 p-3 rounded-xl outline-none" />

            {selectedMethod === 'card' && (
                <>
                    <input placeholder="Número do Cartão" value={cardData.cardNumber} onChange={e => setCardData({ ...cardData, cardNumber: e.target.value })} className="w-full bg-gray-100 p-3 rounded-xl outline-none" maxLength={19} />
                    <div className="grid grid-cols-2 gap-3">
                        <input placeholder="Validade (MM)" maxLength={2} value={cardData.expirationMonth} onChange={e => setCardData({ ...cardData, expirationMonth: e.target.value })} className="bg-gray-100 p-3 rounded-xl outline-none" />
                        <input placeholder="Ano (AA)" maxLength={2} value={cardData.expirationYear} onChange={e => setCardData({ ...cardData, expirationYear: e.target.value })} className="bg-gray-100 p-3 rounded-xl outline-none" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <input placeholder="CVV" maxLength={4} value={cardData.securityCode} onChange={e => setCardData({ ...cardData, securityCode: e.target.value })} className="bg-gray-100 p-3 rounded-xl outline-none" />
                        <input placeholder="Nome no Cartão" value={cardData.cardholderName} onChange={e => setCardData({ ...cardData, cardholderName: e.target.value })} className="bg-gray-100 p-3 rounded-xl outline-none" />
                    </div>
                </>
            )}

            <button onClick={handleGeneratePayment} disabled={loading} className="w-full py-4 bg-black text-white font-black rounded-2xl shadow-xl uppercase tracking-widest mt-4">
                {loading ? 'Processando...' : (selectedMethod === 'pix' ? 'Gerar PIX' : 'Pagar Agora')}
            </button>
        </div>
    );

    const renderPayStep = () => (
        <div className="p-6 space-y-6 text-center animate-slide-up bg-white text-black h-full">
            {selectedMethod === 'pix' && pixData ? (
                <>
                    <h3 className="font-bold text-lg mb-4">Pague com PIX</h3>
                    <div className="bg-gray-100 p-4 rounded-xl inline-block">
                        <img src={pixData.point_of_interaction.transaction_data.qr_code_base64.startsWith('data:') ? pixData.point_of_interaction.transaction_data.qr_code_base64 : `data:image/png;base64,${pixData.point_of_interaction.transaction_data.qr_code_base64}`} className="w-48 h-48 mx-auto" alt="QR Code" />
                    </div>
                    <div className="flex gap-2 bg-gray-50 p-2 rounded-xl border border-gray-200 mt-4">
                        <input readOnly value={pixData.point_of_interaction.transaction_data.qr_code} className="flex-1 bg-transparent px-2 text-xs truncate" />
                        <button onClick={() => navigator.clipboard.writeText(pixData.point_of_interaction.transaction_data.qr_code)} className="text-blue-600 font-bold text-xs uppercase">Copiar</button>
                    </div>
                    <p className="text-xs text-gray-500 mt-4 animate-pulse">Aguardando confirmação automática...</p>
                </>
            ) : (
                <p>Processando...</p>
            )}
        </div>
    );

    const renderWaitingConfirmationStep = () => (
        <div className="p-10 text-center animate-slide-up bg-white text-black h-full flex flex-col items-center justify-center">
            <div className="w-20 h-20 bg-yellow-100 rounded-full flex items-center justify-center mb-6 animate-pulse">
                <span className="material-icons text-4xl text-yellow-600">hourglass_empty</span>
            </div>
            <h2 className="text-xl font-black uppercase mb-2">Aguardando Confirmação</h2>
            <p className="text-sm text-gray-500 mb-6 max-w-xs mx-auto">
                Realize o pagamento de <strong className="text-black">R$ {finalCashAmount.toFixed(2)}</strong> diretamente ao motorista.
            </p>
            <p className="text-xs text-gray-400">Assim que o motorista confirmar, esta tela fechará automaticamente.</p>
        </div>
    );

    const renderSuccessStep = () => (
        <div className="p-10 text-center animate-scale-up bg-green-500 h-full flex flex-col items-center justify-center text-white">
            <span className="material-icons text-6xl mb-4">check_circle</span>
            <h2 className="text-2xl font-black uppercase">Pagamento Confirmado!</h2>
            <p className="text-sm mt-2">Sua corrida foi finalizada.</p>
        </div>
    );

    return (
        <div className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
            <div className="w-full h-[90vh] sm:h-auto sm:max-w-md bg-whatsapp-panel border border-white/10 rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl animate-slide-up flex flex-col">
                {step === 'select' && (
                    <div className="p-6 text-center border-b border-white/5 bg-whatsapp-green/10">
                        <h2 className="text-2xl font-black text-white uppercase tracking-tight">Pagamento</h2>
                    </div>
                )}

                <div className="flex-1 overflow-y-auto">
                    {step === 'select' && renderSelectStep()}
                    {step === 'data' && renderDataStep()}
                    {step === 'pay' && renderPayStep()}
                    {step === 'waiting_confirmation' && renderWaitingConfirmationStep()}
                    {step === 'success' && renderSuccessStep()}
                </div>
            </div>
        </div>
    );
};
