
import { MP_ACCESS_TOKEN, DRIVER_PLANS } from '../constants';
import { supabase } from './supabaseClient';
import { UserProfile, PayerFormData, PixPaymentResponse } from '../types';

// Cria um pagamento Pix direto (Checkout Transparente)
export const createPixPayment = async (
    planId: string, 
    user: UserProfile, 
    payerData: PayerFormData
): Promise<PixPaymentResponse | null> => {
    const plan = DRIVER_PLANS.find(p => p.id === planId);
    if (!plan) throw new Error("Plano não encontrado");

    const url = "https://api.mercadopago.com/v1/payments";
    
    // Limpar CPF (apenas números)
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

    try {
        const response = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${MP_ACCESS_TOKEN}`,
                "X-Idempotency-Key": `${user.id}-${Date.now()}` // Evita duplicação
            },
            body: JSON.stringify(body)
        });

        const data = await response.json();
        
        if (data.id && data.point_of_interaction) {
            return data as PixPaymentResponse;
        } else {
            console.error("MP Error:", data);
            throw new Error(data.message || "Erro ao gerar Pix");
        }
    } catch (error) {
        console.error("Payment Service Error:", error);
        throw error;
    }
};

// Verifica o status do pagamento (Polling)
export const getPaymentStatus = async (paymentId: number): Promise<string> => {
    const url = `https://api.mercadopago.com/v1/payments/${paymentId}`;
    
    try {
        const response = await fetch(url, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${MP_ACCESS_TOKEN}`
            }
        });
        const data = await response.json();
        return data.status; // 'approved', 'pending', etc.
    } catch (error) {
        console.error("Erro ao verificar status:", error);
        return 'unknown';
    }
};

export const activatePlan = async (userId: string, planId: string): Promise<boolean> => {
    const plan = DRIVER_PLANS.find(p => p.id === planId);
    if (!plan) return false;

    const now = new Date();
    
    const { data: user } = await supabase.from('profiles').select('subscription_expires_at').eq('id', userId).single();
    
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
        console.error("Erro ao ativar plano:", error);
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
