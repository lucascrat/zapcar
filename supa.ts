
export const SUPABASE_SETUP_SQL = `
-- =================================================================================
-- CONFIGURAÇÃO DO BANCO DE DADOS - CHEGOJÁ (ATUALIZADO PARA PLANOS & BINGO)
-- COPIE ESTE CONTEÚDO E COLE NO SQL EDITOR DO SUPABASE
-- =================================================================================

-- 1. Criação das Tabelas Principais (Se não existirem)

-- Adicionar coluna de assinatura na tabela profiles se não existir
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'subscription_expires_at') THEN
        ALTER TABLE public.profiles ADD COLUMN subscription_expires_at TIMESTAMP WITH TIME ZONE;
    END IF;
END $$;

-- Tabela de Notificações em Massa (Broadcasts)
CREATE TABLE IF NOT EXISTS public.broadcasts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    target_role TEXT NOT NULL CHECK (target_role IN ('client', 'driver', 'all')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Tabela de Configurações do BINGO
CREATE TABLE IF NOT EXISTS public.bingo_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prize_image TEXT,
    prize_description TEXT,
    youtube_link TEXT,
    drawn_numbers JSONB DEFAULT '[]'::jsonb,
    is_active BOOLEAN DEFAULT TRUE
);

-- Tabela de Cartelas do BINGO
CREATE TABLE IF NOT EXISTS public.bingo_cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    numbers JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(user_id)
);

-- Inserir configuração padrão do Bingo se não existir
INSERT INTO public.bingo_settings (prize_image, prize_description, youtube_link, drawn_numbers)
SELECT 'https://placehold.co/600x400/png?text=Pr%C3%AAmio', 'Prêmio Surpresa', '', '[]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.bingo_settings);


-- =================================================================================
-- 2. Configurar Segurança (RLS) para as tabelas

ALTER TABLE public.broadcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bingo_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bingo_cards ENABLE ROW LEVEL SECURITY;

-- Remover políticas antigas para recriar
DROP POLICY IF EXISTS "Acesso total broadcasts" ON public.broadcasts;
DROP POLICY IF EXISTS "Acesso total bingo_settings" ON public.bingo_settings;
DROP POLICY IF EXISTS "Acesso total bingo_cards" ON public.bingo_cards;

-- Criar Políticas
CREATE POLICY "Acesso total broadcasts" ON public.broadcasts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso total bingo_settings" ON public.bingo_settings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Acesso total bingo_cards" ON public.bingo_cards FOR ALL USING (true) WITH CHECK (true);


-- =================================================================================
-- 3. Configurar Realtime

-- Adiciona as tabelas à publicação realtime existente
ALTER PUBLICATION supabase_realtime ADD TABLE broadcasts;
ALTER PUBLICATION supabase_realtime ADD TABLE bingo_settings;
ALTER PUBLICATION supabase_realtime ADD TABLE bingo_cards;

`;