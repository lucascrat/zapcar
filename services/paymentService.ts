
import { MP_ACCESS_TOKEN } from '../constants';
import { supabase, fetchDriverPlans } from './supabaseClient';
import { UserProfile, PayerFormData, PixPaymentResponse } from '../types';

// --- FALLBACK METHODS (Direct API via Proxy) ---
// Usados quando a Edge Function não está implantada ou falha

const createPixPaymentDirect = async (
    planId: string,
    user: UserProfile,
    payerData: PayerFormData
): Promise<PixPaymentResponse> => {
    console.log("Usando método de pagamento: Fallback (Proxy)");

    const plans = await fetchDriverPlans();
    const plan = plans.find(p => p.id === planId);
    if (!plan) throw new Error("Plano inválido");

    const cleanCpf = payerData.cpf.replace(/\D/g, '');

    const body = {
        transaction_amount: plan.price,
        description: `Assinatura ChegoJá - ${plan.title}`,
        payment_method_id: "pix",
        payer: {
            email: payerData.email,
            first_name: payerData.firstName,
            last_name: payerData.lastName,
            identification: {
                type: "CPF",
                number: cleanCpf
            }
        },
        external_reference: user.id
    };

    // Usa corsproxy.io para contornar o bloqueio CORS do navegador
    const response = await fetch(`https://corsproxy.io/?https://api.mercadopago.com/v1/payments`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${MP_ACCESS_TOKEN}`,
            "Content-Type": "application/json",
            "X-Idempotency-Key": `${user.id}-${Date.now()}`
        },
        body: JSON.stringify(body)
    });

    const data = await response.json();

    if (!response.ok) {
        console.error("MP Fallback Error:", data);
        throw new Error(data.message || "Erro ao comunicar com Mercado Pago via Proxy");
    }

    return data as PixPaymentResponse;
};

const getPaymentStatusDirect = async (paymentId: number): Promise<string> => {
    try {
        const response = await fetch(`https://corsproxy.io/?https://api.mercadopago.com/v1/payments/${paymentId}`, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${MP_ACCESS_TOKEN}`
            }
        });

        const data = await response.json();
        return data.status || 'unknown';
    } catch (error) {
        console.error("Fallback Status Check Error:", error);
        return 'unknown';
    }
};

// --- MAIN EXPORTED METHODS ---

export const createPixPayment = async (
    planId: string,
    user: UserProfile,
    payerData: PayerFormData
): Promise<PixPaymentResponse | null> => {

    // Tenta Edge Function Primeiro
    try {
        const { data, error } = await supabase.functions.invoke('payment-manager', {
            body: {
                action: 'create',
                planId,
                user,
                payerData
            }
        });

        if (error) throw error; // Força cair no catch se der erro na function
        if (data.error) throw new Error(data.error);

        if (data.id && data.point_of_interaction) {
            return data as PixPaymentResponse;
        } else {
            throw new Error("Resposta inválida do servidor.");
        }

    } catch (edgeError: any) {
        console.warn("Edge Function falhou, ativando fallback local...", edgeError);
        // Fallback para chamada direta via Proxy
        try {
            return await createPixPaymentDirect(planId, user, payerData);
        } catch (fallbackError: any) {
            console.error("Payment Service Final Error:", fallbackError);
            throw new Error("Não foi possível gerar o pagamento. Tente novamente.");
        }
    }
};

export const getPaymentStatus = async (paymentId: number): Promise<string> => {
    try {
        const { data, error } = await supabase.functions.invoke('payment-manager', {
            body: {
                action: 'check',
                paymentId
            }
        });

        if (error) throw error;
        return data.status || 'unknown';

    } catch (error) {
        // Silently fallback to direct check
        return await getPaymentStatusDirect(paymentId);
    }
};

export const activatePlan = async (userId: string, planId: string): Promise<boolean> => {
    const plans = await fetchDriverPlans();
    const plan = plans.find(p => p.id === planId);
    if (!plan) return false;

    const now = new Date();

    const { data: user, error: fetchError } = await supabase.from('profiles').select('subscription_expires_at').eq('id', userId).single();

    if (fetchError) {
        if (fetchError.code === '42703') {
            console.error("CRITICAL DB ERROR: Column 'subscription_expires_at' missing.", fetchError);
            alert("Erro Crítico: O banco de dados está desatualizado (Falta coluna de assinatura). Por favor, peça ao administrador para rodar o SQL de atualização.");
        } else {
            console.error("Erro ao buscar perfil para ativar plano:", JSON.stringify(fetchError));
        }
        return false;
    }

    let baseDate = now;
    if (user && user.subscription_expires_at) {
        const currentExpire = new Date(user.subscription_expires_at);
        // Se a assinatura ainda é válida, soma dias ao final dela
        if (currentExpire > now) {
            baseDate = currentExpire;
        }
    }

    const newExpire = new Date(baseDate);
    newExpire.setDate(newExpire.getDate() + plan.days);

    const { error } = await supabase
        .from('profiles')
        .update({ subscription_expires_at: newExpire.toISOString() })
        .eq('id', userId);

    if (error) {
        console.error("Erro ao ativar plano (Update):", error.message || JSON.stringify(error));
        alert("Erro ao salvar assinatura. Tente novamente.");
        return false;
    }

    return true;
};

export const checkSubscriptionStatus = (expiresAt?: string): { isValid: boolean, daysLeft: number } => {
    if (!expiresAt) return { isValid: false, daysLeft: 0 };

    const now = new Date();
    const expire = new Date(expiresAt);

    const diffTime = expire.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return {
        isValid: diffTime > 0,
        daysLeft: diffDays > 0 ? diffDays : 0
    };
};
