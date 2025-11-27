
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