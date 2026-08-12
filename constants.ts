
// =============================================================================
// VARIÁVEIS DE AMBIENTE - Todas as credenciais DEVEM vir do .env
// Nunca commite valores reais aqui. Use o arquivo .env na raiz do projeto.
// =============================================================================

const env = (import.meta as any).env || {};

export const SUPABASE_URL = env.VITE_SUPABASE_URL || '';
export const SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY || '';
export const SUPABASE_SCHEMA = env.VITE_SUPABASE_SCHEMA || 'chegoja';

// Validação: Avisar no console se variáveis críticas estão faltando
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('[Config] ERRO CRÍTICO: VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY devem estar definidas no .env');
}

// O nome da aplicação usado em toda a interface
export const APP_NAME = "ChegoJá";

// EFÍ CONFIG - O Client ID/Secret ficam SÓ no servidor (Supabase Edge Function
// efi-payment), nunca em variável VITE_* (essas são embutidas no bundle público
// e ficariam visíveis pra qualquer um). O único dado da Efí que o navegador
// precisa é o Account Code, usado pelo SDK de tokenização de cartão - ele lê
// VITE_EFI_ACCOUNT_CODE diretamente em services/paymentService.ts.

export const GOOGLE_MAPS_API_KEY = env.VITE_GOOGLE_MAPS_API_KEY || '';

export const DRIVER_PLANS = [
    {
        id: 'plan_24h',
        title: 'Plano Diário',
        description: 'Acesso total por 24 horas',
        price: 10.00,
        days: 1
    },
    {
        id: 'plan_7d',
        title: 'Plano Semanal',
        description: 'Acesso total por 7 dias',
        price: 33.00,
        days: 7
    },
    {
        id: 'plan_15d',
        title: 'Plano Quinzenal',
        description: 'Acesso total por 15 dias',
        price: 66.00,
        days: 15
    },
    {
        id: 'plan_30d',
        title: 'Plano Mensal',
        description: 'Acesso total por 30 dias',
        price: 100.00,
        days: 30
    }
];
