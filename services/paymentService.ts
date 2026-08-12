import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { supabase, fetchDriverPlans } from './supabaseClient';
import { UserProfile, PayerFormData, PixPaymentResponse, StoreProduct, CardFormData } from '../types';
import { validateCPF } from '../utils/validateCPF';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../constants';

// --- HELPERS ---

/** Parse seguro de JSON - evita crash se resposta for malformada */
const safeParseJson = async (response: Response): Promise<any> => {
    try {
        const text = await response.text();
        return JSON.parse(text);
    } catch {
        throw new Error(`Resposta inválida do servidor (não é JSON válido)`);
    }
};

export const initializeEfi = async () => {
    // Efí Bank não exige inicialização de SDK para Pix via API Transparente
    return true;
};

// --- MAIN EXPORTED METHODS ---

const IS_NATIVE = Capacitor.isNativePlatform();
// Backend de pagamentos: Edge Function do Supabase (efi-payment), que fala
// direto com a API da Efí via mTLS. Substituiu o VPS externo antigo.
const FINAL_VPS_URL = `${SUPABASE_URL}/functions/v1/efi-payment`;
const PAYMENT_AUTH_HEADERS = {
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'apikey': SUPABASE_ANON_KEY,
};

// Log seguro - sem expor URL em produção
if ((import.meta as any).env?.DEV) {
    console.log(`[PaymentService] Plataforma: ${IS_NATIVE ? 'Nativa' : 'Web'}`);
}

export const createPixPayment = async (
    planId: string,
    user: UserProfile,
    payerData: PayerFormData
): Promise<PixPaymentResponse | null> => {
    try {
        if (!payerData.cpf || !validateCPF(payerData.cpf)) {
            throw new Error("CPF é obrigatório e deve ser válido. Verifique os dígitos informados.");
        }

        console.log(`[Payment] Gerando Pix via ${FINAL_VPS_URL}...`);

        let responseData;

        if (IS_NATIVE) {
            console.log(`[Payment] Enviando POST Nativo para: ${FINAL_VPS_URL}`);
            const response = await CapacitorHttp.post({
                url: FINAL_VPS_URL,
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    ...PAYMENT_AUTH_HEADERS
                },
                data: {
                    action: 'create',
                    planId,
                    user,
                    payerData: {
                        ...payerData,
                        cpf: payerData.cpf.replace(/\D/g, '')
                    }
                }
            });
            console.log(`[Payment] Pix Mobile Status: ${response.status}`);
            if (response.status !== 200) {
                const errorInfo = typeof response.data === 'string' ? response.data.substring(0, 100) : JSON.stringify(response.data);
                throw new Error(`Servidor respondeu com status ${response.status}: ${errorInfo}`);
            }
            responseData = response.data;
        } else {
            const response = await fetch(FINAL_VPS_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...PAYMENT_AUTH_HEADERS },
                body: JSON.stringify({
                    action: 'create',
                    planId,
                    user,
                    payerData: {
                        ...payerData,
                        cpf: payerData.cpf.replace(/\D/g, '')
                    }
                })
            });
            if (!response.ok) {
                const text = await response.text();
                throw new Error(`HTTP Error ${response.status}: ${text.substring(0, 100)}`);
            }
            responseData = await safeParseJson(response);
        }

        if (responseData && responseData.error) throw new Error(responseData.error);

        return responseData as PixPaymentResponse;
    } catch (error: any) {
        console.error("Erro ao gerar Pix:", error);
        console.error("[Payment] Erro Pix Mobile:", error.message);
        throw error;
    }
};

export const createProductPixPayment = async (
    product: StoreProduct,
    user: UserProfile,
    payerData: PayerFormData
): Promise<PixPaymentResponse | null> => {
    try {
        if (!payerData.cpf || !validateCPF(payerData.cpf)) {
            throw new Error("CPF é obrigatório e deve ser válido. Verifique os dígitos informados.");
        }

        console.log(`[Payment] Gerando Pix Produto via ${FINAL_VPS_URL}...`);

        let responseData;

        if (IS_NATIVE) {
            const response = await CapacitorHttp.post({
                url: FINAL_VPS_URL,
                headers: { 'Content-Type': 'application/json', ...PAYMENT_AUTH_HEADERS },
                data: {
                    action: 'create',
                    user,
                    payerData: {
                        ...payerData,
                        product,
                        cpf: payerData.cpf.replace(/\D/g, '')
                    }
                }
            });
            console.log(`[Payment] Pix Product Mobile Status: ${response.status}`);
            if (response.status !== 200) {
                const errorInfo = typeof response.data === 'string' ? response.data.substring(0, 100) : JSON.stringify(response.data);
                throw new Error(`Servidor respondeu com status ${response.status}: ${errorInfo}`);
            }
            responseData = response.data;
        } else {
            const response = await fetch(FINAL_VPS_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...PAYMENT_AUTH_HEADERS },
                body: JSON.stringify({
                    action: 'create',
                    user,
                    payerData: {
                        ...payerData,
                        product,
                        cpf: payerData.cpf.replace(/\D/g, '')
                    }
                })
            });
            if (!response.ok) {
                const text = await response.text();
                throw new Error(`HTTP Error ${response.status}: ${text.substring(0, 100)}`);
            }
            responseData = await safeParseJson(response);
        }

        if (responseData && responseData.error) throw new Error(responseData.error);

        return responseData as PixPaymentResponse;
    } catch (e: any) {
        console.error("Erro no createProductPixPayment:", e);
        console.error("[Payment] Erro Pix Produto Mobile:", e.message);
        throw e;
    }
};

export const createProductCardPayment = async (
    product: StoreProduct,
    user: UserProfile,
    payerData: PayerFormData,
    cardData: CardFormData
): Promise<{ success: boolean; status: string; message: string; paymentId?: string }> => {
    try {
        console.log("[Payment] Iniciando pagamento com cartão Efí...");

        // Usamos o SDK global da Efí ($gn) carregado no index.html
        const paymentToken = await new Promise<string>(async (resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error("A Efí Pay não respondeu a tempo. Verifique sua conexão."));
            }, 30000);

            try {
                const EfiPay = (window as any).EfiPay;
                if (!EfiPay) {
                    clearTimeout(timeout);
                    reject(new Error("Módulo Efí Pay não inicializado. Verifique se o domínio está autorizado."));
                    return;
                }

                // Normalização das datas (Essencial para o novo SDK)
                const cleanCardNumber = cardData.cardNumber.replace(/\s/g, '');
                const expMonth = cardData.expirationMonth.toString().padStart(2, '0');
                const rawYear = cardData.expirationYear.toString();
                const expYear = rawYear.length === 2 ? `20${rawYear}` : rawYear;

                // Detecção de bandeira mais robusta
                let brand = 'visa';
                const n = cleanCardNumber;
                if (/^4/.test(n)) brand = 'visa';
                else if (/^5[1-5]/.test(n)) brand = 'mastercard';
                else if (/^3[47]/.test(n)) brand = 'amex';
                else if (/^6(?:011|5[0-9]{2})/.test(n)) brand = 'discover';
                else if (/^(606282|3841)/.test(n)) brand = 'hipercard';
                else if (/^(4011|4389|4514|50(41|67|90)|6277|6362)/.test(n)) brand = 'elo';
                else if (/^3(?:0[0-5]|[68][0-9])/.test(n)) brand = 'diners';

                const cardDataPayload = {
                    brand: brand,
                    number: cleanCardNumber,
                    cvv: cardData.securityCode,
                    expirationMonth: expMonth,
                    expirationYear: expYear,
                    holderName: cardData.cardholderName.trim().toUpperCase(),
                    holderDocument: String(payerData.cpf).replace(/\D/g, ''),
                    reuse: false
                };

                const result = await EfiPay.CreditCard
                    .setAccount((import.meta as any).env?.VITE_EFI_ACCOUNT_CODE || '')
                    .setEnvironment("production")
                    .setCreditCardData(cardDataPayload)
                    .getPaymentToken();

                clearTimeout(timeout);
                console.log("[Efí Pay] Token gerado com sucesso.");
                resolve(result.payment_token);
            } catch (err: any) {
                clearTimeout(timeout);
                console.error("[Efí Pay Error]:", err);
                reject(new Error(err.error_description || err.message || "Erro ao validar cartão na Efí"));
            }
        });

        console.log(`[Payment] Enviando Token ao Servidor via ${FINAL_VPS_URL}...`);

        let responseData;

        const cardBody = {
            action: 'card',
            paymentToken,
            installments: cardData.installments || 1,
            payerData: {
                ...payerData,
                product,
                reference: `prod-${user.id}-${product.id}-${Date.now()}`,
                cpf: payerData.cpf.replace(/\D/g, ''),
                email: payerData.email?.trim().toLowerCase() || user.email || '',
                phone: payerData.phone || user.phone || '',
                birthDate: payerData.birthDate || ''
            }
        };

        if (IS_NATIVE) {
            const response = await CapacitorHttp.post({
                url: FINAL_VPS_URL,
                headers: { 'Content-Type': 'application/json', ...PAYMENT_AUTH_HEADERS },
                data: cardBody
            });
            responseData = response.data;
        } else {
            const response = await fetch(FINAL_VPS_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...PAYMENT_AUTH_HEADERS },
                body: JSON.stringify(cardBody)
            });
            responseData = await safeParseJson(response);
        }

        if (responseData && responseData.error) throw new Error(responseData.error);

        return responseData;
    } catch (e: any) {
        console.error("Erro no pagamento de cartão:", e);
        return { success: false, status: 'error', message: e.message };
    }
};

export const createSubscriptionCardPayment = async (
    planId: string,
    user: UserProfile,
    payerData: PayerFormData,
    cardData: CardFormData
): Promise<{ success: boolean; status: string; message: string; paymentId?: string }> => {
    try {
        console.log("[Payment] Iniciando pagamento de assinatura com cartão Efí...");

        // Usamos o SDK global da Efí ($gn) carregado no index.html
        const paymentToken = await new Promise<string>(async (resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error("A Efí Pay não respondeu a tempo."));
            }, 30000);

            try {
                const EfiPay = (window as any).EfiPay;
                if (!EfiPay) {
                    clearTimeout(timeout);
                    reject(new Error("Efí Pay não carregado."));
                    return;
                }

                const cleanCardNumber = cardData.cardNumber.replace(/\s/g, '');
                const expMonth = cardData.expirationMonth.toString().padStart(2, '0');
                const rawYear = cardData.expirationYear.toString();
                const expYear = rawYear.length === 2 ? `20${rawYear}` : rawYear;

                let brand = 'visa';
                if (/^4/.test(cleanCardNumber)) brand = 'visa';
                else if (/^5[1-5]/.test(cleanCardNumber)) brand = 'mastercard';
                else if (/^3[47]/.test(cleanCardNumber)) brand = 'amex';
                else if (/^(606282|3841)/.test(cleanCardNumber)) brand = 'hipercard';
                else if (/^(4011|4389|4514|50(41|67|90)|6277|6362)/.test(cleanCardNumber)) brand = 'elo';

                const result = await EfiPay.CreditCard
                    .setAccount((import.meta as any).env?.VITE_EFI_ACCOUNT_CODE || '')
                    .setEnvironment("production")
                    .setCreditCardData({
                        brand: brand,
                        number: cleanCardNumber,
                        cvv: cardData.securityCode,
                        expirationMonth: expMonth,
                        expirationYear: expYear,
                        holderName: cardData.cardholderName.trim().toUpperCase(),
                        holderDocument: String(payerData.cpf).replace(/\D/g, ''),
                        reuse: false
                    })
                    .getPaymentToken();

                clearTimeout(timeout);
                resolve(result.payment_token);
            } catch (err: any) {
                clearTimeout(timeout);
                reject(new Error(err.error_description || err.message || "Erro no cartão"));
            }
        });

        console.log(`[Subscription] Enviando Token via ${FINAL_VPS_URL}...`);

        let responseData;
        const subBody = {
            action: 'card',
            planId,
            paymentToken,
            installments: 1,
            payerData: {
                ...payerData,
                reference: `plan-${user.id}-${planId}-${Date.now()}`,
                cpf: payerData.cpf.replace(/\D/g, ''),
                email: payerData.email?.trim().toLowerCase() || user.email || '',
                phone: payerData.phone || user.phone || '',
                birthDate: payerData.birthDate || ''
            }
        };

        if (IS_NATIVE) {
            const response = await CapacitorHttp.post({
                url: FINAL_VPS_URL,
                headers: { 'Content-Type': 'application/json', ...PAYMENT_AUTH_HEADERS },
                data: subBody
            });
            responseData = response.data;
        } else {
            const response = await fetch(FINAL_VPS_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...PAYMENT_AUTH_HEADERS },
                body: JSON.stringify(subBody)
            });
            responseData = await safeParseJson(response);
        }

        console.log("[Payment] Resposta Assinatura:", responseData);
        return responseData;
    } catch (e: any) {
        console.error("Erro no pagamento de assinatura:", e);
        console.error("[Payment] Erro Assinatura Mobile:", e.message);
        return { success: false, status: 'error', message: e.message };
    }
};

export const checkPaymentByReference = async (reference: string): Promise<{ found: boolean; status: string }> => {
    try {
        let responseData;
        if (IS_NATIVE) {
            const response = await CapacitorHttp.post({
                url: FINAL_VPS_URL,
                headers: { 'Content-Type': 'application/json', ...PAYMENT_AUTH_HEADERS },
                data: { action: 'check_reference', reference }
            });
            responseData = response.data;
        } else {
            const response = await fetch(FINAL_VPS_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...PAYMENT_AUTH_HEADERS },
                body: JSON.stringify({ action: 'check_reference', reference })
            });
            responseData = await safeParseJson(response);
        }
        return { found: responseData.success, status: responseData.status };
    } catch (e) {
        console.error("Erro ao verificar por referência:", e);
        return { found: false, status: 'error' };
    }
};

export const getPaymentStatus = async (paymentId: string | number): Promise<string> => {
    try {
        let responseData;
        if (IS_NATIVE) {
            const response = await CapacitorHttp.post({
                url: FINAL_VPS_URL,
                headers: { 'Content-Type': 'application/json', ...PAYMENT_AUTH_HEADERS },
                data: { action: 'check', paymentId: String(paymentId) }
            });
            responseData = response.data;
        } else {
            const response = await fetch(FINAL_VPS_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...PAYMENT_AUTH_HEADERS },
                body: JSON.stringify({ action: 'check', paymentId: String(paymentId) })
            });
            responseData = await safeParseJson(response);
        }
        return responseData.status || 'unknown';
    } catch (error) {
        console.error("Erro ao verificar status:", error);
        return 'unknown';
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
        return false;
    }

    // --- REGISTRAR TRANSAÇÃO FINANCEIRA PARA O ADMIN ---
    await supabase.from('wallet_transactions').insert({
        user_id: userId,
        type: 'purchase',
        amount_money: plan.price,
        description: `Assinatura: Plano ${plan.title}`
    });

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

// --- RIDE PAYMENT SERVICES ---

export const createRidePixPayment = async (
    ride: { id: string; estimated_price?: number; final_price?: number },
    user: UserProfile,
    payerData: PayerFormData
): Promise<PixPaymentResponse | null> => {
    try {
        if (!payerData.cpf || !validateCPF(payerData.cpf)) {
            throw new Error("CPF é obrigatório e deve ser válido. Verifique os dígitos informados.");
        }

        // Create a 'fake' product to reuse the VPS logic which expects a product object
        const finalAmount = ride.final_price || ride.estimated_price || 0;
        const rideProduct: StoreProduct = {
            id: ride.id, // Use ride ID as product ID
            name: `Corrida ChegoJá`,
            description: `Pagamento da corrida ${ride.id}`,
            price_brl: finalAmount,
            price_coins: 0,
            image_url: '',
            stock: 1,
            active: true,
            created_at: new Date().toISOString()
        };

        console.log(`[Payment] Gerando Pix Corrida via ${FINAL_VPS_URL} para R$ ${finalAmount}...`);

        let responseData;

        // Reusing the product structure but for a ride
        const payload = {
            action: 'create', // Uses the same 'create' action as store products
            user,
            payerData: {
                ...payerData,
                product: rideProduct,
                reference: `ride-${ride.id}-${Date.now()}`,
                cpf: payerData.cpf.replace(/\D/g, '')
            }
        };

        if (IS_NATIVE) {
            const response = await CapacitorHttp.post({
                url: FINAL_VPS_URL,
                headers: { 'Content-Type': 'application/json', ...PAYMENT_AUTH_HEADERS },
                data: payload
            });
            if (response.status !== 200) {
                const errorInfo = typeof response.data === 'string' ? response.data.substring(0, 100) : JSON.stringify(response.data);
                throw new Error(`Servidor respondeu com status ${response.status}: ${errorInfo}`);
            }
            responseData = response.data;
        } else {
            const response = await fetch(FINAL_VPS_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...PAYMENT_AUTH_HEADERS },
                body: JSON.stringify(payload)
            });
            if (!response.ok) {
                const text = await response.text();
                throw new Error(`HTTP Error ${response.status}: ${text.substring(0, 100)}`);
            }
            responseData = await safeParseJson(response);
        }

        if (responseData && responseData.error) throw new Error(responseData.error);

        return responseData as PixPaymentResponse;
    } catch (e: any) {
        console.error("Erro no createRidePixPayment:", e);
        console.error("[Payment] Erro Pix Corrida Mobile:", e.message);
        throw e;
    }
};

export const createRideCardPayment = async (
    ride: { id: string; estimated_price?: number; final_price?: number },
    user: UserProfile,
    payerData: PayerFormData,
    cardData: CardFormData
): Promise<{ success: boolean; status: string; message: string; paymentId?: string }> => {
    try {
        console.log("[Payment] Iniciando pagamento de corrida com cartão Efí...");

        // Usamos o SDK global da Efí ($gn) carregado no index.html
        const paymentToken = await new Promise<string>(async (resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error("A Efí Pay não respondeu a tempo."));
            }, 30000);

            try {
                const EfiPay = (window as any).EfiPay;
                if (!EfiPay) {
                    clearTimeout(timeout);
                    reject(new Error("Módulo Efí Pay não inicializado."));
                    return;
                }

                const cleanCardNumber = cardData.cardNumber.replace(/\s/g, '');
                const expMonth = cardData.expirationMonth.toString().padStart(2, '0');
                const rawYear = cardData.expirationYear.toString();
                const expYear = rawYear.length === 2 ? `20${rawYear}` : rawYear;

                let brand = 'visa';
                if (/^4/.test(cleanCardNumber)) brand = 'visa';
                else if (/^5[1-5]/.test(cleanCardNumber)) brand = 'mastercard';
                else if (/^3[47]/.test(cleanCardNumber)) brand = 'amex';
                else if (/^(606282|3841)/.test(cleanCardNumber)) brand = 'hipercard';
                else if (/^(4011|4389|4514|50(41|67|90)|6277|6362)/.test(cleanCardNumber)) brand = 'elo';

                const result = await EfiPay.CreditCard
                    .setAccount((import.meta as any).env?.VITE_EFI_ACCOUNT_CODE || '')
                    .setEnvironment("production")
                    .setCreditCardData({
                        brand: brand,
                        number: cleanCardNumber,
                        cvv: cardData.securityCode,
                        expirationMonth: expMonth,
                        expirationYear: expYear,
                        holderName: cardData.cardholderName.trim().toUpperCase(),
                        holderDocument: String(payerData.cpf).replace(/\D/g, ''),
                        reuse: false
                    })
                    .getPaymentToken();

                clearTimeout(timeout);
                console.log("[Efí Pay] Token gerado com sucesso.");
                resolve(result.payment_token);
            } catch (err: any) {
                clearTimeout(timeout);
                console.error("[Efí Pay Error]:", err);
                reject(new Error(err.error_description || err.message || "Erro ao validar cartão na Efí"));
            }
        });

        const finalAmount = ride.final_price || ride.estimated_price || 0;
        const rideProduct: StoreProduct = {
            id: ride.id,
            name: `Corrida ChegoJá`,
            description: `Pagamento da corrida ${ride.id}`,
            price_brl: finalAmount,
            price_coins: 0,
            image_url: '',
            stock: 1,
            active: true,
            created_at: new Date().toISOString()
        };

        const cardBody = {
            action: 'card', // Reusing card action
            paymentToken,
            installments: cardData.installments || 1,
            payerData: {
                ...payerData,
                product: rideProduct, // Backend expects a product object
                reference: `ride-${user.id}-${ride.id}-${Date.now()}`,
                cpf: payerData.cpf.replace(/\D/g, ''),
                email: payerData.email?.trim().toLowerCase() || user.email || '',
                phone: payerData.phone || user.phone || '',
                birthDate: payerData.birthDate || ''
            }
        };

        let responseData;
        if (IS_NATIVE) {
            const response = await CapacitorHttp.post({
                url: FINAL_VPS_URL,
                headers: { 'Content-Type': 'application/json', ...PAYMENT_AUTH_HEADERS },
                data: cardBody
            });
            responseData = response.data;
        } else {
            const response = await fetch(FINAL_VPS_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...PAYMENT_AUTH_HEADERS },
                body: JSON.stringify(cardBody)
            });
            responseData = await safeParseJson(response);
        }

        if (responseData && responseData.error) throw new Error(responseData.error);

        return responseData;
    } catch (e: any) {
        console.error("Erro no pagamento de corrida com cartão:", e);
        return { success: false, status: 'error', message: e.message };
    }
};
