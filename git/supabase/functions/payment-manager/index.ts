
// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

declare const Deno: any;

// PREÇOS E PLANOS (Espelhado do Frontend para segurança)
const PLANS: Record<string, { title: string; price: number }> = {
  'plan_24h': { title: 'Plano Diário', price: 5.00 },
  'plan_7d':  { title: 'Plano Semanal', price: 33.00 },
  'plan_15d': { title: 'Plano Quinzenal', price: 66.00 },
  'plan_30d': { title: 'Plano Mensal', price: 100.00 }
};

// Pegar token das variáveis de ambiente (Recomendado) ou usar Hardcoded como fallback para este exemplo
const MP_ACCESS_TOKEN = Deno.env.get('MP_ACCESS_TOKEN') || "APP_USR-1939457864483191-010313-c30b9728ff8f0b7d7766bfa707db2149-166153505";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { action, planId, user, payerData, paymentId } = await req.json()

    // --- ACTION: CREATE PAYMENT ---
    if (action === 'create') {
        if (!PLANS[planId]) {
            throw new Error("Plano inválido")
        }

        const plan = PLANS[planId];
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
            external_reference: user.id,
            notification_url: "https://seusite.com/api/webhook" // Opcional: configurar webhook real depois
        };

        const response = await fetch("https://api.mercadopago.com/v1/payments", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${MP_ACCESS_TOKEN}`,
                "X-Idempotency-Key": `${user.id}-${Date.now()}`
            },
            body: JSON.stringify(body)
        });

        const data = await response.json();

        if (!response.ok) {
            console.error("MP Error:", data);
            throw new Error(data.message || "Erro ao comunicar com Mercado Pago");
        }

        return new Response(JSON.stringify(data), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })
    }

    // --- ACTION: CHECK STATUS ---
    if (action === 'check') {
        const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${MP_ACCESS_TOKEN}`
            }
        });

        const data = await response.json();
        
        return new Response(JSON.stringify({ status: data.status }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })
    }

    throw new Error("Ação inválida")

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
