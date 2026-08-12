// Efí Pay (ex-Gerencianet) payment backend - Pix + Cartão (Cobranças)
// Substitui o antigo VPS externo (168.231.98.99:3000/payment-manager).
// Mantém o MESMO contrato de request/response que services/paymentService.ts
// já espera, para não precisar tocar nos componentes de UI.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

declare const Deno: any;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// --- ENV / SECRETS ---
const EFI_CLIENT_ID = Deno.env.get("EFI_CLIENT_ID") || "";
const EFI_CLIENT_SECRET = Deno.env.get("EFI_CLIENT_SECRET") || "";
const EFI_CERT_PEM = Deno.env.get("EFI_CERT_PEM") || "";
const EFI_KEY_PEM = Deno.env.get("EFI_KEY_PEM") || "";
const EFI_PIX_KEY = Deno.env.get("EFI_PIX_KEY") || "";
// "production" | "homolog"
const EFI_ENV = (Deno.env.get("EFI_ENV") || "production").toLowerCase();

const PIX_BASE = EFI_ENV === "homolog" ? "https://pix-h.api.efipay.com.br" : "https://pix.api.efipay.com.br";
const COB_BASE = EFI_ENV === "homolog" ? "https://cobrancas-h.api.efipay.com.br" : "https://cobrancas.api.efipay.com.br";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  db: { schema: "chegoja" },
});

// mTLS client usado em TODAS as chamadas pra API da Efí
let efiHttpClient: any = null;
function getEfiClient() {
  if (!efiHttpClient) {
    if (!EFI_CERT_PEM || !EFI_KEY_PEM) {
      throw new Error("Certificado Efí não configurado (EFI_CERT_PEM / EFI_KEY_PEM ausentes).");
    }
    efiHttpClient = Deno.createHttpClient({ cert: EFI_CERT_PEM, key: EFI_KEY_PEM });
  }
  return efiHttpClient;
}

// --- OAuth2 (client_credentials) ---
async function getEfiToken(base: string): Promise<string> {
  if (!EFI_CLIENT_ID || !EFI_CLIENT_SECRET) {
    throw new Error("Credenciais Efí não configuradas (EFI_CLIENT_ID / EFI_CLIENT_SECRET ausentes).");
  }
  const basic = btoa(`${EFI_CLIENT_ID}:${EFI_CLIENT_SECRET}`);
  const res = await fetch(`${base}/oauth/token`, {
    method: "POST",
    client: getEfiClient(),
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Basic ${basic}`,
    },
    body: JSON.stringify({ grant_type: "client_credentials" }),
  } as any);
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    console.error("[Efi] Erro ao obter token:", data);
    throw new Error(data.error_description || data.mensagem || "Falha na autenticação com a Efí");
  }
  return data.access_token;
}

async function efiFetch(base: string, path: string, options: { method: string; body?: any }) {
  const token = await getEfiToken(base);
  const res = await fetch(`${base}${path}`, {
    method: options.method,
    client: getEfiClient(),
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  } as any);
  const data = await res.json();
  if (!res.ok) {
    console.error(`[Efi] Erro em ${path}:`, data);
    const msg = data.mensagem || data.nome || data.error_description ||
      (data.violacoes && data.violacoes[0]?.razao) || "Erro na comunicação com a Efí";
    throw new Error(msg);
  }
  return data;
}

// --- Normalização de status pro vocabulario que o front-end ja espera
// (herdado de uma integracao anterior com Mercado Pago: approved / authorized / pending / in_process / rejected)
function normalizePixStatus(efiStatus: string): string {
  switch (efiStatus) {
    case "CONCLUIDA": return "approved";
    case "REMOVIDA_PELO_USUARIO_RECEBEDOR":
    case "REMOVIDA_PELO_PSP": return "rejected";
    case "ATIVA":
    default: return "pending";
  }
}

function normalizeCardStatus(efiStatus: string): string {
  switch (efiStatus) {
    case "paid":
    case "settled": return "approved";
    case "waiting":
    case "new":
    case "link": return "in_process";
    case "unpaid":
    case "refunded":
    case "contested":
    case "canceled":
    case "expired": return "rejected";
    default: return "pending";
  }
}

// --- Helpers ---
function generateTxid(): string {
  // Efí exige txid alfanumerico de 26 a 35 caracteres
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < 32; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function onlyDigits(v: string | undefined | null): string {
  return (v || "").replace(/\D/g, "");
}

async function resolveAmount(planId: string | undefined, product: any): Promise<{ amount: number; description: string; planTitle?: string }> {
  if (planId) {
    const { data, error } = await supabase.from("driver_plans").select("price, title").eq("id", planId).single();
    if (error || !data) throw new Error("Plano inválido");
    return { amount: Number(data.price), description: `Assinatura ChegoJá - ${data.title}`, planTitle: data.title };
  }
  if (product && typeof product.price_brl === "number") {
    return { amount: Number(product.price_brl), description: product.name || "Compra ChegoJá" };
  }
  throw new Error("Não foi possível determinar o valor do pagamento (sem planId nem product).");
}

function buildReference(payerData: any, planId?: string): string {
  if (payerData?.reference) return payerData.reference;
  if (planId) return `sub-${payerData.__userId}-${planId}`;
  if (payerData?.product?.id) return `prod-${payerData.__userId}-${payerData.product.id}`;
  return `pay-${payerData.__userId}-${Date.now()}`;
}

// --- ACTIONS ---

async function actionCreatePix(body: any) {
  const { planId, user, payerData } = body;
  const { amount, description } = await resolveAmount(planId, payerData?.product);

  const cpf = onlyDigits(payerData.cpf);
  const cnpj = cpf.length === 14 ? cpf : undefined;
  const payerName = [payerData.firstName, payerData.lastName].filter(Boolean).join(" ").trim() || user.username || "Cliente ChegoJá";

  const reference = buildReference({ ...payerData, __userId: user.id }, planId);
  const txid = generateTxid();

  const devedor: any = cnpj
    ? { cnpj, nome: payerName }
    : { cpf: cpf.slice(0, 11), nome: payerName };

  const cobBody = {
    calendario: { expiracao: 3600 },
    devedor,
    valor: { original: amount.toFixed(2) },
    chave: EFI_PIX_KEY,
    solicitacaoPagador: description.slice(0, 140),
  };

  const cob = await efiFetch(PIX_BASE, `/v2/cob/${txid}`, { method: "PUT", body: cobBody });

  let qrcode = "";
  let imagemQrcode = "";
  if (cob.loc?.id) {
    const qr = await efiFetch(PIX_BASE, `/v2/loc/${cob.loc.id}/qrcode`, { method: "GET" });
    qrcode = qr.qrcode || "";
    imagemQrcode = qr.imagemQrcode || "";
  }

  await supabase.from("efi_payments").insert({
    id: txid,
    type: "pix",
    efi_id: txid,
    reference,
    status: "pending",
    raw_status: cob.status || "ATIVA",
    amount,
    user_id: user.id,
    plan_id: planId || null,
    product_id: payerData?.product?.id || null,
  });

  return {
    id: txid,
    status: "pending",
    point_of_interaction: {
      transaction_data: { qr_code: qrcode, qr_code_base64: imagemQrcode },
    },
  };
}

async function actionCard(body: any) {
  const { planId, paymentToken, installments, payerData } = body;
  const { amount, description } = await resolveAmount(planId, payerData?.product);

  const cpf = onlyDigits(payerData.cpf);
  const payerName = [payerData.firstName, payerData.lastName].filter(Boolean).join(" ").trim() || "Cliente ChegoJá";
  const reference = payerData?.reference || `pay-${Date.now()}`;

  // 1. Criar cobrança
  const chargeBody = {
    items: [{ name: description.slice(0, 60), value: Math.round(amount * 100), amount: 1 }],
  };
  const charge = await efiFetch(COB_BASE, `/v1/charge`, { method: "POST", body: chargeBody });
  const chargeId = charge.data?.charge_id;
  if (!chargeId) throw new Error("Efí não retornou charge_id");

  // 2. Pagar com o token gerado no navegador (EfiPay JS SDK)
  const payBody = {
    payment_token: paymentToken,
    customer: {
      name: payerName,
      cpf: cpf.length === 11 ? cpf : undefined,
      cnpj: cpf.length === 14 ? cpf : undefined,
      email: payerData.email || undefined,
      phone_number: onlyDigits(payerData.phone) || undefined,
      birth: payerData.birthDate || undefined,
    },
    installments: installments || 1,
  };
  const payResult = await efiFetch(COB_BASE, `/v1/charge/${chargeId}/pay/credit-card`, { method: "POST", body: payBody });
  const efiStatus = payResult.data?.status || "unknown";
  const mapped = normalizeCardStatus(efiStatus);

  await supabase.from("efi_payments").insert({
    id: String(chargeId),
    type: "card",
    efi_id: String(chargeId),
    reference,
    status: mapped,
    raw_status: efiStatus,
    amount,
    user_id: body.user?.id || null,
    plan_id: planId || null,
    product_id: payerData?.product?.id || null,
  });

  return {
    success: mapped === "approved",
    status: mapped,
    message: mapped === "approved" ? "Pagamento aprovado" : `Pagamento ${efiStatus}`,
    paymentId: String(chargeId),
  };
}

async function actionCheck(paymentId: string) {
  const { data: row } = await supabase.from("efi_payments").select("*").eq("id", String(paymentId)).maybeSingle();
  if (!row) return { status: "unknown" };

  let efiStatus = row.raw_status;
  let mapped = row.status;

  try {
    if (row.type === "pix") {
      const cob = await efiFetch(PIX_BASE, `/v2/cob/${row.efi_id}`, { method: "GET" });
      efiStatus = cob.status;
      mapped = normalizePixStatus(efiStatus);
    } else {
      const charge = await efiFetch(COB_BASE, `/v1/charge/${row.efi_id}`, { method: "GET" });
      efiStatus = charge.data?.status;
      mapped = normalizeCardStatus(efiStatus);
    }
    if (mapped !== row.status) {
      await supabase.from("efi_payments").update({ status: mapped, raw_status: efiStatus, updated_at: new Date().toISOString() }).eq("id", row.id);
    }
  } catch (e) {
    console.error("[Efi] Erro ao checar status, retornando ultimo status conhecido:", e);
  }

  return { status: mapped };
}

async function actionCheckReference(reference: string) {
  const { data: row } = await supabase
    .from("efi_payments")
    .select("*")
    .eq("reference", reference)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!row) return { found: false, status: "not_found" };
  const result = await actionCheck(row.id);
  return { found: true, status: result.status };
}

// --- SERVER ---
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action } = body;

    let result: any;
    switch (action) {
      case "create":
        result = await actionCreatePix(body);
        break;
      case "card":
        result = await actionCard(body);
        break;
      case "check":
        result = await actionCheck(body.paymentId);
        break;
      case "check_reference":
        result = await actionCheckReference(body.reference);
        break;
      default:
        throw new Error("Ação inválida");
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    console.error("[efi-payment] Erro:", error);
    return new Response(JSON.stringify({ error: error.message || "Erro interno" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
