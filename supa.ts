
export const SUPABASE_SETUP_SQL = `
-- =================================================================================
-- RESET COMPLETO E RECRIACÃO DO BANCO DE DADOS + STORAGE
-- COPIE E COLE TUDO ISSO NO SQL EDITOR DO SUPABASE
-- =================================================================================

-- 1. LIMPEZA (CUIDADO: ISSO APAGA TODOS OS DADOS)
DROP TABLE IF EXISTS public.messages CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

-- 2. Habilitar extensão para UUIDs (se necessário)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =================================================================================
-- 3. Criar Tabela de Perfis (Motoristas e Clientes)
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT NOT NULL,
    phone TEXT, 
    role TEXT NOT NULL CHECK (role IN ('client', 'driver', 'admin')),
    status TEXT NOT NULL DEFAULT 'available',
    avatar_url TEXT,
    vehicle_model TEXT,
    vehicle_plate TEXT,
    vehicle_color TEXT,
    lat FLOAT,
    lng FLOAT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- =================================================================================
-- 4. Criar Tabela de Mensagens
CREATE TABLE public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id UUID NOT NULL,
    receiver_id UUID NOT NULL,
    content TEXT,
    media_url TEXT,
    media_type TEXT CHECK (media_type IN ('text', 'audio', 'image', 'location')),
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Adicionar chaves estrangeiras
ALTER TABLE public.messages 
ADD CONSTRAINT messages_sender_id_fkey 
FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.messages 
ADD CONSTRAINT messages_receiver_id_fkey 
FOREIGN KEY (receiver_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- =================================================================================
-- 5. STORAGE (Arquivos de mídia)
-- Criação do Bucket para armazenar áudios e imagens

INSERT INTO storage.buckets (id, name, public) 
VALUES ('chat-media', 'chat-media', true)
ON CONFLICT (id) DO NOTHING;

-- Políticas de Storage (Permissiva para demonstração)
CREATE POLICY "Permitir upload publico" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'chat-media');
CREATE POLICY "Permitir leitura publica" ON storage.objects FOR SELECT USING (bucket_id = 'chat-media');

-- =================================================================================
-- 6. Configurar Segurança (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Políticas permissivas para facilitar o funcionamento do demo
CREATE POLICY "Acesso total perfis" ON public.profiles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso total mensagens" ON public.messages FOR ALL USING (true) WITH CHECK (true);

-- =================================================================================
-- 7. Configurar Realtime
DROP PUBLICATION IF EXISTS supabase_realtime;
CREATE PUBLICATION supabase_realtime FOR TABLE messages, profiles;

-- FIM DO SCRIPT
`;