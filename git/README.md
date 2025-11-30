
# ChegoJá - Mobilidade Urbana

O **ChegoJá** é uma plataforma de mobilidade urbana moderna, focada na comunicação ágil entre passageiros e motoristas (Carros e Motos). O app oferece chat em tempo real, chamadas de voz, localização e taxímetro integrado.

---

## 🚀 DEPLOY RÁPIDO (VERCEL)

A maneira mais fácil de colocar este projeto no ar é usando a Vercel.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fseu-usuario%2Fchegoja&env=VITE_API_KEY)

### ⚠️ Passo a Passo Obrigatório:

1.  **Suba este código para o GitHub.**
2.  Clique no botão acima **"Deploy with Vercel"** ou importe o repositório no painel da Vercel.
3.  **Configuração de Variável de Ambiente (Essencial):**
    *   Durante a importação (ou em Settings > Environment Variables), adicione:
    *   **Key:** `VITE_API_KEY`
    *   **Value:** `Sua_Chave_Google_Gemini_Aqui`
    *   *(Sem isso, a tela ficará preta ou a IA não funcionará)*

---

## 🛠️ Configuração do Banco de Dados (Supabase)

Para que o login, chat e taxímetro funcionem, você precisa de um banco de dados.

1.  Crie uma conta gratuita em [Supabase.com](https://supabase.com).
2.  Crie um novo projeto.
3.  Vá no menu **SQL Editor**.
4.  Copie o conteúdo do arquivo `supa.ts` (ou o bloco SQL abaixo) e execute:

```sql
-- COPIE ESTE SQL PARA O EDITOR DO SUPABASE
DROP TABLE IF EXISTS public.messages CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.app_settings CASCADE;

-- 1. Perfis
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT NOT NULL,
    phone TEXT, 
    password TEXT,
    role TEXT NOT NULL CHECK (role IN ('client', 'driver', 'admin')),
    status TEXT NOT NULL DEFAULT 'available',
    is_approved BOOLEAN DEFAULT TRUE,
    avatar_url TEXT,
    vehicle_model TEXT,
    vehicle_plate TEXT,
    vehicle_color TEXT,
    vehicle_type TEXT CHECK (vehicle_type IN ('car', 'motorcycle')),
    lat FLOAT,
    lng FLOAT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Admin Padrão (Login: Holanda2025 / Senha: 01Deus02@@@@)
INSERT INTO public.profiles (username, password, role, is_approved, avatar_url)
VALUES ('Holanda2025', '01Deus02@@@@', 'admin', true, 'https://ui-avatars.com/api/?name=Admin&background=0D8ABC&color=fff');

-- 2. Mensagens
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

-- 3. Configurações (Taxímetro)
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
INSERT INTO public.app_settings DEFAULT VALUES;

-- 4. Storage (Mídia)
INSERT INTO storage.buckets (id, name, public) VALUES ('chat-media', 'chat-media', true) ON CONFLICT (id) DO NOTHING;
CREATE POLICY "Public Upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'chat-media');
CREATE POLICY "Public Read" ON storage.objects FOR SELECT USING (bucket_id = 'chat-media');

-- 5. Segurança
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Access" ON public.profiles FOR ALL USING (true);
CREATE POLICY "Public Access Msg" ON public.messages FOR ALL USING (true);
CREATE POLICY "Public Access Settings" ON public.app_settings FOR ALL USING (true);

-- 6. Realtime
DROP PUBLICATION IF EXISTS supabase_realtime;
CREATE PUBLICATION supabase_realtime FOR TABLE messages, profiles, app_settings;
```

5.  Após criar, vá em **Project Settings > API**.
6.  Copie a `URL` e a `anon public key`.
7.  Atualize o arquivo `constants.ts` no seu código ou configure as variáveis de ambiente na Vercel:
    *   `VITE_SUPABASE_URL`
    *   `VITE_SUPABASE_ANON_KEY`

---

## 📱 Funcionalidades

*   **App Nativo (Android):** Código Java incluído para gerar APK com permissão de sobreposição.
*   **PWA Instalável:** Funciona em iOS e Android diretamente pelo navegador.
*   **Taxímetro GPS:** Cálculo de tarifa por KM e Tempo.
*   **Chamadas VoIP:** Ligações estilo WhatsApp.
*   **Prioridade de Alerta:** Toca som alto mesmo em segundo plano (requer app nativo para funcionamento perfeito de "tela desligada").
