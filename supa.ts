
export const SUPABASE_SETUP_SQL = `
-- =================================================================================
-- CONFIGURAÇÃO COMPLETA DO BANCO DE DADOS - CHEGOJÁ
-- (Inclui: Perfis, Mensagens, Taxímetro, Bingo, Notificações, Pagamentos e Marquee)
-- =================================================================================

-- COPIE ESTE CÓDIGO E COLE NO SUPABASE > SQL EDITOR > RUN

-- Habilitar extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =================================================================================
-- 1. TABELA DE PERFIS (PROFILES)
-- =================================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT NOT NULL,
    phone TEXT, 
    password TEXT,
    role TEXT NOT NULL CHECK (role IN ('client', 'driver', 'admin')),
    status TEXT NOT NULL DEFAULT 'offline',
    is_approved BOOLEAN DEFAULT TRUE,
    avatar_url TEXT,
    vehicle_model TEXT,
    vehicle_plate TEXT,
    vehicle_color TEXT,
    vehicle_type TEXT CHECK (vehicle_type IN ('car', 'motorcycle')),
    lat FLOAT,
    lng FLOAT,
    subscription_expires_at TIMESTAMP WITH TIME ZONE, -- Campo para Pagamentos
    unread_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- CORREÇÃO CRÍTICA: GARANTIR QUE A COLUNA EXISTE
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS password TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT TRUE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS vehicle_type TEXT CHECK (vehicle_type IN ('car', 'motorcycle'));
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS unread_count INTEGER DEFAULT 0;

-- Criar Admin Padrão se não existir (Evita duplicidade)
INSERT INTO public.profiles (username, password, role, is_approved, avatar_url, status)
SELECT 'Holanda2025', '01Deus02@@@@', 'admin', true, 'https://ui-avatars.com/api/?name=Admin&background=0D8ABC&color=fff', 'available'
WHERE NOT EXISTS (SELECT 1 FROM public.profiles WHERE role = 'admin');


-- =================================================================================
-- 2. TABELA DE MENSAGENS (MESSAGES)
-- =================================================================================
CREATE TABLE IF NOT EXISTS public.messages (
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
-- 3. CONFIGURAÇÕES DO APP (TAXÍMETRO E MARQUEE)
-- =================================================================================
CREATE TABLE IF NOT EXISTS public.app_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    car_base_price FLOAT DEFAULT 5.0,
    car_price_km FLOAT DEFAULT 2.5,
    car_price_min FLOAT DEFAULT 0.5,
    car_start_distance_limit FLOAT DEFAULT 0.0,
    moto_base_price FLOAT DEFAULT 3.5,
    moto_price_km FLOAT DEFAULT 1.8,
    moto_price_min FLOAT DEFAULT 0.3,
    moto_start_distance_limit FLOAT DEFAULT 0.0,
    marquee_text TEXT DEFAULT 'ENTRE E CONCORRA A PRÊMIOS TODA SEMANA! - PRÊMIOS CHEGOJÁ'
);

-- Migração: Adicionar coluna marquee_text e limites de distância se não existirem
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS marquee_text TEXT DEFAULT 'ENTRE E CONCORRA A PRÊMIOS TODA SEMANA! - PRÊMIOS CHEGOJÁ';
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS car_start_distance_limit FLOAT DEFAULT 0.0;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS moto_start_distance_limit FLOAT DEFAULT 0.0;

-- Inserir configurações padrão se a tabela estiver vazia
INSERT INTO public.app_settings DEFAULT VALUES
WHERE NOT EXISTS (SELECT 1 FROM public.app_settings);


-- =================================================================================
-- 4. TABELAS DO BINGO
-- =================================================================================
CREATE TABLE IF NOT EXISTS public.bingo_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prize_image TEXT,
    prize_description TEXT,
    youtube_link TEXT,
    drawn_numbers JSONB DEFAULT '[]'::jsonb,
    is_active BOOLEAN DEFAULT TRUE
);

-- Inserir configuração padrão do Bingo se não existir
INSERT INTO public.bingo_settings (prize_image, prize_description, youtube_link, drawn_numbers)
SELECT 'https://placehold.co/600x400/png?text=Pr%C3%AAmio', 'Prêmio Surpresa', '', '[]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.bingo_settings);

CREATE TABLE IF NOT EXISTS public.bingo_cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    numbers JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(user_id)
);


-- =================================================================================
-- 5. TABELA DE NOTIFICAÇÕES EM MASSA (BROADCASTS)
-- =================================================================================
CREATE TABLE IF NOT EXISTS public.broadcasts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    target_role TEXT NOT NULL CHECK (target_role IN ('client', 'driver', 'all')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);


-- =================================================================================
-- 6. CONFIGURAÇÃO DE STORAGE (BUCKETS)
-- =================================================================================
INSERT INTO storage.buckets (id, name, public) 
VALUES ('chat-media', 'chat-media', true) 
ON CONFLICT (id) DO NOTHING;

-- Políticas de Storage (Permissiva para demonstração)
BEGIN;
  DROP POLICY IF EXISTS "Public Upload" ON storage.objects;
  DROP POLICY IF EXISTS "Public Read" ON storage.objects;
  
  CREATE POLICY "Public Upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'chat-media');
  CREATE POLICY "Public Read" ON storage.objects FOR SELECT USING (bucket_id = 'chat-media');
COMMIT;


-- =================================================================================
-- 7. SEGURANÇA (RLS - ROW LEVEL SECURITY)
-- =================================================================================
-- Habilitar RLS em todas as tabelas
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bingo_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bingo_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broadcasts ENABLE ROW LEVEL SECURITY;

-- Criar políticas de acesso TOTAL (Leitura/Escrita para todos)
-- Nota: Em produção real, você deve restringir isso. Para este app frontend-only, deixamos aberto.

BEGIN;
  -- Remover políticas antigas para evitar erros de duplicidade
  DROP POLICY IF EXISTS "Acesso total perfis" ON public.profiles;
  DROP POLICY IF EXISTS "Acesso total mensagens" ON public.messages;
  DROP POLICY IF EXISTS "Acesso total settings" ON public.app_settings;
  DROP POLICY IF EXISTS "Acesso total bingo_settings" ON public.bingo_settings;
  DROP POLICY IF EXISTS "Acesso total bingo_cards" ON public.bingo_cards;
  DROP POLICY IF EXISTS "Acesso total broadcasts" ON public.broadcasts;
  DROP POLICY IF EXISTS "Public Access" ON public.profiles; -- Nome antigo
  DROP POLICY IF EXISTS "Public Access Msg" ON public.messages; -- Nome antigo

  -- Criar novas políticas
  CREATE POLICY "Acesso total perfis" ON public.profiles FOR ALL USING (true) WITH CHECK (true);
  CREATE POLICY "Acesso total mensagens" ON public.messages FOR ALL USING (true) WITH CHECK (true);
  CREATE POLICY "Acesso total settings" ON public.app_settings FOR ALL USING (true) WITH CHECK (true);
  CREATE POLICY "Acesso total bingo_settings" ON public.bingo_settings FOR ALL USING (true) WITH CHECK (true);
  CREATE POLICY "Acesso total bingo_cards" ON public.bingo_cards FOR ALL USING (true) WITH CHECK (true);
  CREATE POLICY "Acesso total broadcasts" ON public.broadcasts FOR ALL USING (true) WITH CHECK (true);
COMMIT;


-- =================================================================================
-- 8. TABELAS DE PLANOS E ASSINATURAS (DRIVER PLANS & SUBSCRIPTIONS)
-- =================================================================================
CREATE TABLE IF NOT EXISTS public.driver_plans (
    id TEXT PRIMARY KEY, -- ID manual (ex: 'basic', 'pro') ou UUID
    title TEXT NOT NULL,
    description TEXT,
    price NUMERIC NOT NULL,
    days INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    plan_id TEXT REFERENCES public.driver_plans(id),
    start_date DATE DEFAULT CURRENT_DATE,
    next_billing_date DATE,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- =================================================================================
-- 9. SEGURANÇA (RLS) - ATUALIZAÇÃO
-- =================================================================================
ALTER TABLE public.driver_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

BEGIN;
  -- Políticas para driver_plans (Público pode ler, Admin pode tudo)
  DROP POLICY IF EXISTS "Public read access" ON public.driver_plans;
  DROP POLICY IF EXISTS "Admin full access" ON public.driver_plans;
  
  CREATE POLICY "Public read access" ON public.driver_plans FOR SELECT USING (true);
  CREATE POLICY "Admin full access" ON public.driver_plans FOR ALL USING (true) WITH CHECK (true); -- Simplificado para demo

  -- Políticas para subscriptions (Usuário vê/edita as suas)
  DROP POLICY IF EXISTS "subscriptions_select" ON public.subscriptions;
  DROP POLICY IF EXISTS "subscriptions_insert" ON public.subscriptions;
  DROP POLICY IF EXISTS "subscriptions_update_user" ON public.subscriptions;
  DROP POLICY IF EXISTS "subscriptions_delete" ON public.subscriptions;

  CREATE POLICY "subscriptions_select" ON public.subscriptions FOR SELECT USING (auth.uid() = user_id);
  CREATE POLICY "subscriptions_insert" ON public.subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);
  CREATE POLICY "subscriptions_update_user" ON public.subscriptions FOR UPDATE USING (auth.uid() = user_id);
  CREATE POLICY "subscriptions_delete" ON public.subscriptions FOR DELETE USING (auth.uid() = user_id);
COMMIT;

-- =================================================================================
-- 10. REALTIME (ATUALIZAR OUVINTES)
-- =================================================================================
BEGIN;
  DROP PUBLICATION IF EXISTS supabase_realtime;
  CREATE PUBLICATION supabase_realtime FOR TABLE 
    profiles, 
    messages, 
    app_settings, 
    bingo_settings, 
    bingo_cards, 
    broadcasts,
    driver_plans,
    subscriptions;
COMMIT;

`;
