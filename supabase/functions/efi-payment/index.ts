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

  // Erro aqui não pode ficar em silêncio: sem essa linha, actionCheck/
  // actionCheckReference nunca encontram o pagamento pra consultar o status
  // na Efí - o app fica esperando aprovação pra sempre, mesmo já pago
  // (foi exatamente esse bug - permission denied silencioso por falta de
  // GRANT pro service_role, corrigido em
  // supabase/migrations/20260827_grant_efi_payments_service_role.sql).
  const { error: insertErr } = await supabase.from("efi_payments").insert({
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
  if (insertErr) {
    console.error("[Efi] FALHA ao registrar efi_payments (Pix) - polling/verificação nunca vão achar esse pagamento:", insertErr);
  }

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

  const { error: insertErr } = await supabase.from("efi_payments").insert({
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
  if (insertErr) {
    console.error("[Efi] FALHA ao registrar efi_payments (cartão):", insertErr);
  }

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

// ---------------------------------------------------------------------------
// SAQUE AUTOMÁTICO (Pix Envio da Efí)
// ---------------------------------------------------------------------------
// idEnvio: chave de idempotência da Efí (alfanumérico, <=35). Derivada do id do
// payment_request, então reenviar a mesma solicitação nunca paga duas vezes.
function buildIdEnvio(requestId: string): string {
  return ("CJ" + String(requestId).replace(/[^a-zA-Z0-9]/g, "")).slice(0, 35);
}

const VALID_DDD = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28,
  31, 32, 33, 34, 35, 37, 38, 41, 42, 43, 44, 45, 46, 47, 48, 49,
  51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69,
  71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89,
  91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

function isValidCPF(d: string): boolean {
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  let s = 0;
  for (let i = 0; i < 9; i++) s += parseInt(d[i]) * (10 - i);
  let r = (s * 10) % 11; if (r === 10) r = 0;
  if (r !== parseInt(d[9])) return false;
  s = 0;
  for (let i = 0; i < 10; i++) s += parseInt(d[i]) * (11 - i);
  r = (s * 10) % 11; if (r === 10) r = 0;
  return r === parseInt(d[10]);
}

// Última linha de defesa antes de mandar a chave pra Efí. O app já normaliza no
// cadastro (utils/pixKey.ts), mas motorista antigo pode ter chave salva no
// formato errado - celular gravado como "85981201088" quando a Efí exige
// "+5585981201088". Sem isto o envio é recusado DEPOIS do saldo já debitado.
function normalizePixKeyServer(raw: string): string {
  const value = (raw || "").trim();
  if (!value) return "";
  if (value.includes("@")) return value.toLowerCase();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    return value.toLowerCase();
  }
  let d = onlyDigits(value);
  if (!d) return value;
  if (d.length === 13 && d.startsWith("55")) d = d.slice(2);
  if (d.length === 14) return d;                       // CNPJ
  if (d.length === 11) {
    if (isValidCPF(d)) return d;                       // CPF
    if (VALID_DDD.has(Number(d.slice(0, 2))) && d[2] === "9") return `+55${d}`; // celular
  }
  return value;
}

// Confirma que quem chamou é admin de verdade (JWT do Supabase Auth + admin_users
// via a RPC is_admin, que roda no contexto do usuário). Usado só no "adminForced".
async function requireAdmin(req: any): Promise<void> {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Não autorizado");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const userClient = createClient(SUPABASE_URL, anonKey, {
    db: { schema: "chegoja" },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: isAdmin, error } = await userClient.rpc("is_admin");
  if (error || isAdmin !== true) throw new Error("Apenas administradores podem forçar o pagamento.");
}

// Marca o pedido como "não saiu automático" e devolve pra fila do admin.
async function bailPayout(requestId: string, reason: string) {
  await supabase.from("payment_requests").update({
    efi_idenvio: null,
    payout_error: reason,
    updated_at: new Date().toISOString(),
  }).eq("id", requestId);
  return { status: "pending", message: reason };
}

// Estorna o saldo e marca o pedido como rejeitado (envio recusado pela Efí).
async function refundAndReject(reqRow: any, reason: string) {
  const amount = Number(reqRow.amount_money || 0);
  await supabase.rpc("increment_financial_balance", { user_id_param: reqRow.user_id, amount_param: amount });
  await supabase.from("wallet_transactions").insert({
    user_id: reqRow.user_id,
    type: "bonus",
    amount_money: amount,
    description: "Estorno: envio PIX não realizado",
  });
  await supabase.from("payment_requests").update({
    status: "rejected",
    payout_error: reason,
    admin_note: "Envio automático falhou - saldo estornado",
    updated_at: new Date().toISOString(),
  }).eq("id", reqRow.id);
  return { status: "rejected", message: reason };
}

async function actionPayout(req: any, body: any) {
  const requestId: string = body.requestId;
  const adminForced: boolean = body.adminForced === true;
  if (!requestId) throw new Error("requestId ausente");
  if (adminForced) await requireAdmin(req);

  const { data: reqRow, error } = await supabase
    .from("payment_requests").select("*").eq("id", requestId).maybeSingle();
  if (error || !reqRow) throw new Error("Solicitação não encontrada");
  if (reqRow.type !== "driver_payout") throw new Error("Solicitação não é de saque de motorista");
  if (reqRow.status === "paid") return { status: "paid", message: "Já pago" };
  if (reqRow.status === "rejected") return { status: "rejected", message: "Solicitação rejeitada" };
  if (reqRow.status !== "pending") return { status: reqRow.status };

  const amount = Number(reqRow.amount_money || 0);
  if (!(amount >= 5)) return await bailPayout(requestId, "Valor inválido");

  // Guarda-corpos server-side (ignora tudo isso se for admin forçando na mão)
  if (!adminForced) {
    const { data: st } = await supabase
      .from("app_settings")
      .select("auto_payout_enabled, auto_payout_max_amount, auto_payout_daily_limit")
      .limit(1).maybeSingle();
    const enabled = st?.auto_payout_enabled === true;
    const maxAmount = Number(st?.auto_payout_max_amount || 0);
    const dailyLimit = Number(st?.auto_payout_daily_limit || 0);

    if (!enabled) return await bailPayout(requestId, "Pagamento automático desativado");
    if (!(maxAmount > 0) || amount > maxAmount) return await bailPayout(requestId, "Acima do teto automático");

    if (dailyLimit > 0) {
      const since = new Date(); since.setHours(0, 0, 0, 0);
      const { data: todays } = await supabase
        .from("payment_requests")
        .select("amount_money")
        .eq("user_id", reqRow.user_id)
        .eq("type", "driver_payout")
        .eq("auto", true)
        .in("status", ["paid", "pending"])
        .neq("id", requestId)
        .gte("created_at", since.toISOString());
      const used = (todays || []).reduce((a: number, r: any) => a + Number(r.amount_money || 0), 0);
      if (used + amount > dailyLimit) return await bailPayout(requestId, "Limite diário atingido");
    }
  }

  const pixKey = normalizePixKeyServer(String(reqRow.pix_key || ""));
  if (!pixKey) return await bailPayout(requestId, "Motorista sem chave PIX cadastrada");

  const idEnvio = buildIdEnvio(requestId);

  // "Reserva" o pedido: grava o idEnvio só se ainda estiver nulo. Se outra
  // chamada concorrente já reservou, sai sem reenviar.
  const { data: claimed } = await supabase
    .from("payment_requests")
    .update({ efi_idenvio: idEnvio, payout_error: null, updated_at: new Date().toISOString() })
    .eq("id", requestId)
    .is("efi_idenvio", null)
    .select()
    .maybeSingle();
  if (!claimed) {
    return { status: "processing", message: "Envio já em andamento" };
  }

  // Manda também o CPF/CNPJ do motorista quando ele tem um cadastrado. A Efí
  // recomenda enviar chave + documento juntos: ela confere no DICT se a chave
  // pertence mesmo àquele titular e, quando não bate, devolve um erro dizendo
  // isso - em vez do NAO_REALIZADO mudo que não explica nada. De quebra impede
  // que um saque caia na chave de outra pessoa.
  const favorecido: Record<string, string> = { chave: pixKey };
  const { data: profile } = await supabase
    .from("profiles").select("cpf").eq("id", reqRow.user_id).maybeSingle();
  const doc = onlyDigits(profile?.cpf || "");
  if (doc.length === 11) favorecido.cpf = doc;
  else if (doc.length === 14) favorecido.cnpj = doc;

  // Dispara o Pix Envio
  let efiResp: any;
  try {
    efiResp = await efiFetch(PIX_BASE, `/v2/gn/pix/${idEnvio}`, {
      method: "PUT",
      body: {
        valor: amount.toFixed(2),
        pagador: { chave: EFI_PIX_KEY, infoPagador: "Saque ChegoJá" },
        favorecido,
      },
    });
  } catch (e: any) {
    // Falha de comunicação/validação: libera o idEnvio pra permitir nova tentativa
    return await bailPayout(requestId, String(e?.message || e).slice(0, 400));
  }

  console.log(`[Efi] envio solicitado ${idEnvio}:`, JSON.stringify(efiResp));
  const efiStatus: string = efiResp?.status || "EM_PROCESSAMENTO";
  const e2e: string | null = efiResp?.e2eId || null;

  if (efiStatus === "NAO_REALIZADO") {
    return await refundAndReject(reqRow, describeEfiPayout(efiResp));
  }

  if (efiStatus === "REALIZADO") {
    await supabase.from("payment_requests").update({
      status: "paid",
      efi_e2e_id: e2e,
      paid_at: new Date().toISOString(),
      admin_note: adminForced ? "Pago via PIX pelo admin" : "Pago automaticamente via PIX",
      updated_at: new Date().toISOString(),
    }).eq("id", requestId);
    return { status: "paid", e2eId: e2e };
  }

  // EM_PROCESSAMENTO: continua 'pending', mas já com o e2eId pra consulta depois
  await supabase.from("payment_requests").update({
    efi_e2e_id: e2e,
    admin_note: "PIX em processamento",
    updated_at: new Date().toISOString(),
  }).eq("id", requestId);
  return { status: "processing", e2eId: e2e };
}

// Cadastra o webhook da chave Pix na Efí - EXIGIDO pela Efí antes de liberar o
// Pix Envio ("A chave informada não tem webhook cadastrado na conta Efí
// autenticada"). Idempotente e sem input do chamador: chave e URL são fixas do
// lado do servidor, então reexecutar só re-registra o mesmo endereço.
async function actionSetupWebhook() {
  if (!EFI_PIX_KEY) throw new Error("EFI_PIX_KEY não configurada");
  const webhookUrl = `${SUPABASE_URL}/functions/v1/efi-payment/webhook`;
  const token = await getEfiToken(PIX_BASE);
  const res = await fetch(`${PIX_BASE}/v2/webhook/${encodeURIComponent(EFI_PIX_KEY)}`, {
    method: "PUT",
    client: getEfiClient(),
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
      // Sem mTLS do nosso lado (Edge Function não expõe cert de cliente):
      // a Efí aceita pulando a validação com este header.
      "x-skip-mtls-checking": "true",
    },
    body: JSON.stringify({ webhookUrl }),
  } as any);
  if (res.status === 200 || res.status === 204) {
    return { ok: true, webhookUrl };
  }
  const data = await res.json().catch(() => ({}));
  throw new Error(data.mensagem || (data.violacoes && data.violacoes[0]?.razao) || `Efí retornou ${res.status} ao cadastrar webhook`);
}

// Notificações da Efí (a validação do cadastro e os avisos de pix chegam aqui;
// a Efí anexa "/pix" à URL cadastrada). Sempre responde 200 - o polling já
// cobre a atualização de status, isto é só um acelerador best-effort.
async function handleEfiWebhook(body: any) {
  try {
    const items = Array.isArray(body?.pix) ? body.pix : [];
    for (const item of items) {
      const e2e = item?.endToEndId;
      if (e2e) {
        const { data: reqRow } = await supabase
          .from("payment_requests").select("id").eq("efi_e2e_id", e2e).maybeSingle();
        if (reqRow) await actionCheckPayout(reqRow.id);
      }
      if (item?.txid) {
        await actionCheck(String(item.txid)).catch(() => {});
      }
    }
  } catch (e) {
    console.error("[Efi] webhook processing error (respondendo 200 mesmo assim):", e);
  }
  return { ok: true };
}

// A Efí não devolve um "motivo" em campo próprio quando um envio termina como
// NAO_REALIZADO - a explicação vem espalhada no corpo (devoluções, rejeição,
// descrição). Guardamos o resumo em payout_error pra o admin (e a gente) saber
// o que aconteceu em vez de só "NAO_REALIZADO".
// payment_requests é legível por qualquer um (policy payment_requests_read),
// então payout_error leva só o que o motorista/admin precisam ver - nunca o
// corpo cru da Efí, que carrega a chave PIX da empresa. O JSON completo vai pro
// console.log da função, visível só a quem tem acesso ao projeto Supabase.
function describeEfiPayout(r: any): string {
  // Num envio que a Efí conseguiu executar, a consulta traz
  // favorecido.identificacao com o nome/CPF de quem recebeu. Quando a chave não
  // existe no DICT (pessoa informou o celular mas nunca cadastrou como chave
  // PIX no banco), a Efí aceita a ordem, devolve um e2eId e depois marca
  // NAO_REALIZADO - sem favorecido nenhum no registro. É o sintoma que separa
  // "chave inexistente" de qualquer outra falha, e a causa mais comum aqui.
  if (r?.status === "NAO_REALIZADO" && !r?.favorecido) {
    return "Chave PIX não encontrada em nenhum banco. Confirme com o motorista se ela está mesmo cadastrada como chave PIX (informar o número do celular não basta - ele precisa registrar o celular como chave no app do banco).";
  }

  const parts: string[] = [];
  if (r?.status) parts.push(String(r.status));
  for (const k of ["motivo", "descricao", "rejeicao", "detalhe"]) {
    if (r?.[k]) parts.push(`${k}=${typeof r[k] === "string" ? r[k] : JSON.stringify(r[k])}`);
  }
  if (Array.isArray(r?.devolucoes) && r.devolucoes.length) {
    parts.push(`devolucoes=${JSON.stringify(r.devolucoes).slice(0, 200)}`);
  }
  if (r?.horario?.solicitacao && !r?.horario?.liquidacao) {
    parts.push('enviado mas não liquidado - verifique o saldo da conta Efí');
  }
  return parts.join(' | ').slice(0, 400);
}

/** `force` reconsulta mesmo pedido já rejeitado - usado pra diagnosticar. */
async function actionCheckPayout(requestId: string, force = false) {
  const { data: reqRow } = await supabase
    .from("payment_requests").select("*").eq("id", requestId).maybeSingle();
  if (!reqRow) return { status: "not_found" };
  if (!reqRow.efi_e2e_id) return { status: reqRow.status };
  if (!force && reqRow.status !== "pending") return { status: reqRow.status };

  let raw: any = null;
  try {
    raw = await efiFetch(PIX_BASE, `/v2/gn/pix/enviados/${reqRow.efi_e2e_id}`, { method: "GET" });
  } catch (e: any) {
    console.error("[Efi] check_payout falhou:", e);
    if (force) {
      await supabase.from("payment_requests")
        .update({ payout_error: `consulta falhou: ${String(e?.message || e)}`.slice(0, 500) })
        .eq("id", requestId);
    }
    return { status: reqRow.status };
  }

  const efiStatus: string = raw?.status || "";
  const detail = describeEfiPayout(raw);
  console.log(`[Efi] envio ${reqRow.efi_e2e_id}:`, JSON.stringify(raw));

  if (force) {
    // Diagnóstico: registra o que a Efí respondeu sem mexer no status/saldo.
    await supabase.from("payment_requests").update({ payout_error: detail }).eq("id", requestId);
    return { status: reqRow.status, detail };
  }

  if (efiStatus === "REALIZADO") {
    await supabase.from("payment_requests").update({
      status: "paid",
      paid_at: new Date().toISOString(),
      admin_note: "Pago via PIX (confirmado)",
      updated_at: new Date().toISOString(),
    }).eq("id", requestId);
    return { status: "paid" };
  }
  if (efiStatus === "NAO_REALIZADO") {
    return await refundAndReject(reqRow, `Efí: ${detail}`);
  }
  return { status: "processing" };
}

/** Saldo da conta Efí - causa nº 1 de envio aceito que depois não se realiza. */
async function actionEfiBalance() {
  const saldo = await efiFetch(PIX_BASE, "/v2/gn/saldo", { method: "GET" });
  return { saldo };
}

/**
 * Diagnóstico: joga no log da função (nunca na resposta HTTP) o saldo e a lista
 * de Pix enviados no período, que traz o favorecido de cada envio - a consulta
 * por e2eId sozinha não mostra pra quem o dinheiro foi.
 */
async function actionDebugSent(body: any) {
  const fim = body?.fim || new Date().toISOString();
  const inicio = body?.inicio || new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const out: Record<string, unknown> = {};
  try {
    out.saldo = await efiFetch(PIX_BASE, "/v2/gn/saldo", { method: "GET" });
  } catch (e: any) { out.saldoErro = String(e?.message || e); }
  try {
    out.enviados = await efiFetch(
      PIX_BASE,
      `/v2/gn/pix/enviados?inicio=${encodeURIComponent(inicio)}&fim=${encodeURIComponent(fim)}`,
      { method: "GET" },
    );
  } catch (e: any) { out.enviadosErro = String(e?.message || e); }
  // Algum Pix Envio já se realizou nesta conta alguma vez? Se a lista vier
  // vazia em meses, o problema é configuração da conta na Efí, não o payload.
  try {
    const desde = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();
    const hist = await efiFetch(
      PIX_BASE,
      `/v2/gn/pix/enviados?inicio=${encodeURIComponent(desde)}&fim=${encodeURIComponent(fim)}`,
      { method: "GET" },
    );
    out.historico90d = hist?.parametros?.paginacao?.quantidadeTotalDeItens;
    out.historico90dAmostra = (hist?.pix || []).slice(0, 3);
  } catch (e: any) { out.historico90dErro = String(e?.message || e); }

  // O webhook realmente ficou associado à chave de origem? Sem ele a Efí recusa
  // o envio - já aconteceu aqui uma vez ("conta_chave_sem_webhook").
  try {
    out.webhook = await efiFetch(PIX_BASE, `/v2/webhook/${encodeURIComponent(EFI_PIX_KEY)}`, { method: "GET" });
  } catch (e: any) { out.webhookErro = String(e?.message || e); }
  console.log("[Efi][debug_sent]", JSON.stringify(out));
  return { ok: true, logged: true };
}

// --- SERVER ---
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Endpoint do webhook da Efí (validação do cadastro + notificações de pix).
  // Precisa responder 200 pra qualquer chamada, senão a Efí rejeita o cadastro.
  const url = new URL(req.url);
  if (url.pathname.includes("/webhook")) {
    const body = await req.json().catch(() => ({}));
    const result = await handleEfiWebhook(body);
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
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
      case "payout":
        result = await actionPayout(req, body);
        break;
      case "check_payout":
        result = await actionCheckPayout(body.requestId);
        break;
      case "recheck_payout": {
        // Diagnóstico: reconsulta na Efí e grava o motivo em payout_error, sem
        // alterar status nem saldo. Não devolve o corpo na resposta (o detalhe
        // fica no banco, onde só quem já enxerga payment_requests lê).
        const r = await actionCheckPayout(body.requestId, true);
        result = { ok: true, status: r.status };
        break;
      }
      case "efi_balance":
        await requireAdmin(req);
        result = await actionEfiBalance();
        break;
      case "debug_sent":
        result = await actionDebugSent(body);
        break;
      case "setup_webhook":
        result = await actionSetupWebhook();
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
