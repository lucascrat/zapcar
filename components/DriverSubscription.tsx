
import React, { useState, useEffect, useRef } from 'react';
import { DRIVER_PLANS } from '../constants';
import { createPixPayment, getPaymentStatus, activatePlan } from '../services/paymentService';
import { UserProfile, PayerFormData, PixPaymentResponse } from '../types';

interface DriverSubscriptionProps {
    currentUser: UserProfile;
    onClose: () => void;
    isBlocked?: boolean; // Nova propriedade para forçar pagamento
}

type Step = 'select_plan' | 'enter_data' | 'payment_qr' | 'success';

export const DriverSubscription: React.FC<DriverSubscriptionProps> = ({ currentUser, onClose, isBlocked = false }) => {
    const [step, setStep] = useState<Step>('select_plan');
    const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    
    // Form Data
    const [formData, setFormData] = useState<PayerFormData>({
        firstName: currentUser.username.split(' ')[0] || '',
        lastName: currentUser.username.split(' ').slice(1).join(' ') || 'Motorista',
        email: '',
        cpf: ''
    });

    // Pix Data
    const [pixData, setPixData] = useState<PixPaymentResponse | null>(null);
    const pollingInterval = useRef<any>(null);

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
                const status = await getPaymentStatus(pixData.id);
                console.log("Status Pagamento:", status);
                
                if (status === 'approved') {
                    clearInterval(pollingInterval.current);
                    setIsLoading(true);
                    if (selectedPlanId) {
                        await activatePlan(currentUser.id, selectedPlanId);
                        setStep('success');
                    }
                    setIsLoading(false);
                }
            }, 5000); // Checa a cada 5 segundos
        }
    }, [step, pixData, selectedPlanId, currentUser.id]);

    const handleSelectPlan = (planId: string) => {
        setSelectedPlanId(planId);
        setStep('enter_data');
    };

    const handleGeneratePix = async () => {
        if (!formData.email || !formData.cpf || formData.cpf.length < 11) {
            alert("Por favor, preencha E-mail e CPF corretamente.");
            return;
        }
        if (!selectedPlanId) return;

        setIsLoading(true);
        try {
            const response = await createPixPayment(selectedPlanId, currentUser, formData);
            if (response) {
                setPixData(response);
                setStep('payment_qr');
            }
        } catch (e: any) {
            alert("Erro ao gerar Pix: " + e.message);
        } finally {
            setIsLoading(false);
        }
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
        <div className="fixed inset-0 z-[100] bg-black/90 flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-4xl bg-white rounded-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className={`${isBlocked ? 'bg-red-600' : 'bg-blue-600'} p-4 md:p-6 text-white shrink-0 flex justify-between items-center`}>
                    <div>
                        <h2 className="text-xl md:text-2xl font-bold">
                            {isBlocked ? 'Acesso Bloqueado' : 'Assinatura Motorista'}
                        </h2>
                        <p className="opacity-90 text-xs md:text-sm">
                            {isBlocked && "Sua assinatura venceu. Renove para continuar."}
                            {!isBlocked && step === 'select_plan' && "Escolha seu plano"}
                            {!isBlocked && step === 'enter_data' && "Dados para Pagamento"}
                            {!isBlocked && step === 'payment_qr' && "Pagamento Pix"}
                            {!isBlocked && step === 'success' && "Sucesso!"}
                        </p>
                    </div>
                    {/* Só mostra botão de fechar se NÃO estiver bloqueado */}
                    {!isBlocked && (
                        <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-full transition">
                            <span className="material-icons">close</span>
                        </button>
                    )}
                </div>

                <div className="p-4 md:p-6 overflow-y-auto bg-gray-50 flex-1 custom-scrollbar">
                    
                    {/* STEP 1: SELECT PLAN */}
                    {step === 'select_plan' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            {DRIVER_PLANS.map(plan => (
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
                    )}

                    {/* STEP 2: ENTER DATA */}
                    {step === 'enter_data' && (
                        <div className="max-w-md mx-auto bg-white p-6 rounded-xl shadow-md">
                            <h3 className="font-bold text-gray-800 mb-4 text-center">Dados para a Nota (Pix)</h3>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
                                    <input 
                                        type="email" 
                                        value={formData.email}
                                        onChange={e => setFormData({...formData, email: e.target.value})}
                                        className="w-full p-3 border border-gray-300 rounded-lg outline-none focus:ring-2 ring-blue-500"
                                        placeholder="seu@email.com"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">CPF</label>
                                    <input 
                                        type="text" 
                                        value={formData.cpf}
                                        onChange={e => setFormData({...formData, cpf: formatCPF(e.target.value)})}
                                        className="w-full p-3 border border-gray-300 rounded-lg outline-none focus:ring-2 ring-blue-500"
                                        placeholder="000.000.000-00"
                                        maxLength={14}
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
                                        <input 
                                            type="text" 
                                            value={formData.firstName}
                                            onChange={e => setFormData({...formData, firstName: e.target.value})}
                                            className="w-full p-3 border border-gray-300 rounded-lg outline-none focus:ring-2 ring-blue-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Sobrenome</label>
                                        <input 
                                            type="text" 
                                            value={formData.lastName}
                                            onChange={e => setFormData({...formData, lastName: e.target.value})}
                                            className="w-full p-3 border border-gray-300 rounded-lg outline-none focus:ring-2 ring-blue-500"
                                        />
                                    </div>
                                </div>
                            </div>
                            <div className="mt-6 flex gap-3">
                                <button onClick={() => setStep('select_plan')} className="flex-1 py-3 text-gray-600 bg-gray-100 rounded-lg font-bold">Voltar</button>
                                <button 
                                    onClick={handleGeneratePix} 
                                    disabled={isLoading}
                                    className="flex-[2] py-3 text-white bg-blue-600 hover:bg-blue-700 rounded-lg font-bold flex items-center justify-center gap-2"
                                >
                                    {isLoading ? 'Gerando...' : 'Gerar QR Code Pix'}
                                    {!isLoading && <span className="material-icons text-sm">qr_code</span>}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* STEP 3: QR CODE */}
                    {step === 'payment_qr' && pixData && (
                        <div className="max-w-sm mx-auto bg-white p-6 rounded-xl shadow-md text-center">
                            <div className="bg-green-100 text-green-800 px-4 py-2 rounded-full text-xs font-bold inline-flex items-center gap-2 mb-4 animate-pulse">
                                <span className="material-icons text-sm">hourglass_empty</span> Aguardando Pagamento...
                            </div>
                            
                            <h3 className="font-bold text-gray-800 mb-2">Escaneie o QR Code</h3>
                            <p className="text-gray-500 text-xs mb-4">Abra o app do seu banco e escolha "Pagar com Pix"</p>
                            
                            <div className="bg-gray-100 p-2 rounded-lg inline-block mb-4 border border-gray-300">
                                <img 
                                    src={`data:image/png;base64,${pixData.point_of_interaction.transaction_data.qr_code_base64}`} 
                                    alt="QR Code Pix" 
                                    className="w-48 h-48 md:w-56 md:h-56 object-contain"
                                />
                            </div>

                            <div className="mb-4">
                                <p className="text-xs text-gray-500 mb-1">Ou use o Copia e Cola:</p>
                                <div className="flex gap-2">
                                    <input 
                                        readOnly 
                                        value={pixData.point_of_interaction.transaction_data.qr_code}
                                        className="flex-1 bg-gray-100 border border-gray-300 rounded px-2 text-xs text-gray-600 outline-none"
                                    />
                                    <button onClick={handleCopyCode} className="bg-blue-600 text-white p-2 rounded hover:bg-blue-700" title="Copiar">
                                        <span className="material-icons text-sm">content_copy</span>
                                    </button>
                                </div>
                            </div>
                            
                            <button onClick={() => setStep('enter_data')} className="text-gray-400 text-xs hover:text-gray-600 underline">
                                Cancelar / Voltar
                            </button>
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
                                    if(onClose) onClose(); 
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
