
// Leitura das variáveis de ambiente (Vercel/Vite)
// Se a variável existir (Produção), usa ela. Se não, usa o valor hardcoded (Desenvolvimento/Demo).

export const SUPABASE_URL = (import.meta as any).env?.VITE_SUPABASE_URL || 'https://hqdscaqtuqqfwdonwmhk.supabase.co';

// ATENÇÃO: A chave abaixo é uma SERVICE_ROLE key apenas para fins de demonstração/prototipagem rápida.
// EM PRODUÇÃO (Ao fazer deploy na Vercel, Netlify ou Firebase):
// 1. Crie seu próprio projeto no Supabase.
// 2. Use a chave 'ANON' (public) do seu projeto, não a service_role.
// 3. Configure as Políticas de Segurança (RLS) no Supabase.
// 4. Se possível, utilize variáveis de ambiente (import.meta.env.VITE_SUPABASE_ANON_KEY).
export const SUPABASE_ANON_KEY = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhxZHNjYXF0dXFxZndkb253bWhrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDUzNzk5NCwiZXhwIjoyMDc2MTEzOTk0fQ.2TZPojTWpjNYnCy26hvlMcWlgNIQ7JPRcAQ0fI5ICjQ';

// O nome da aplicação usado em toda a interface
export const APP_NAME = "ChegoJá";

// MERCADO PAGO CONFIG
export const MP_PUBLIC_KEY = "APP_USR-8c0ec0f9-7ebd-4f40-aa15-af833ba6c60d";
export const MP_ACCESS_TOKEN = "APP_USR-1939457864483191-010313-c30b9728ff8f0b7d7766bfa707db2149-166153505";

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