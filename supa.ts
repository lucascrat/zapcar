
export const SUPABASE_SETUP_SQL = `
-- =================================================================================
-- RESET COMPLETO E RECRIACÃO DO BANCO DE DADOS + STORAGE
-- COPIE E COLE TUDO ISSO NO SQL EDITOR DO SUPABASE
-- =================================================================================

-- 1. LIMPEZA (CUIDADO: ISSO APAGA TODOS OS DADOS)
DROP TABLE IF EXISTS public.messages CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.app_settings CASCADE;

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
    is_approved BOOLEAN DEFAULT TRUE, -- Clientes nascem aprovados, motoristas mudamos no insert
    avatar_url TEXT,
    vehicle_model TEXT,
    vehicle_plate TEXT,
    vehicle_color TEXT,
    vehicle_type TEXT CHECK (vehicle_type IN ('car', 'motorcycle')),
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

-- =================================================================================
-- 5. Criar Tabela de Configurações do App (Taxímetro)
CREATE TABLE public.app_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    car_base_price FLOAT DEFAULT 5.0,
    car_price_km FLOAT DEFAULT 2.5,
    car_price_min FLOAT DEFAULT 0.5,
    car_start_distance_limit FLOAT DEFAULT 0.0,
    moto_base_price FLOAT DEFAULT 3.5,
    moto_price_km FLOAT DEFAULT 1.8,
    moto_price_min FLOAT DEFAULT 0.3,
    moto_start_distance_limit FLOAT DEFAULT 0.0
);

-- Inserir configuração padrão
INSERT INTO public.app_settings (car_base_price, car_price_km, car_price_min, car_start_distance_limit, moto_base_price, moto_price_km, moto_price_min, moto_start_distance_limit)
VALUES (5.0, 2.5, 0.5, 0.0, 3.5, 1.8, 0.3, 0.0);

-- =================================================================================
-- 6. Adicionar chaves estrangeiras
ALTER TABLE public.messages 
ADD CONSTRAINT messages_sender_id_fkey 
FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.messages 
ADD CONSTRAINT messages_receiver_id_fkey 
FOREIGN KEY (receiver_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- =================================================================================
-- 7. STORAGE (Arquivos de mídia)

INSERT INTO storage.buckets (id, name, public) 
VALUES ('chat-media', 'chat-media', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Permitir upload publico" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'chat-media');
CREATE POLICY "Permitir leitura publica" ON storage.objects FOR SELECT USING (bucket_id = 'chat-media');

-- =================================================================================
-- 8. Configurar Segurança (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Políticas permissivas
CREATE POLICY "Acesso total perfis" ON public.profiles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso total mensagens" ON public.messages FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso total settings" ON public.app_settings FOR ALL USING (true) WITH CHECK (true);

-- =================================================================================
-- 9. Configurar Realtime
DROP PUBLICATION IF EXISTS supabase_realtime;
CREATE PUBLICATION supabase_realtime FOR TABLE messages, profiles, app_settings;

-- FIM DO SCRIPT
`;