
# ChegoJá - Mobilidade Urbana

O **ChegoJá** é uma plataforma de mobilidade urbana moderna, focada na comunicação ágil entre passageiros e motoristas (Carros e Motos). O app oferece chat em tempo real, chamadas de voz e localização.

## 🚀 Funcionalidades Principais

*   **Identificação de Veículo**: Ícones e cores distintas para Carros (Azul) e Motos (Laranja).
*   **Chat em Tempo Real**: Mensagens de texto, voz e imagem.
*   **Chamadas VoIP**: Chamadas de áudio integradas via WebRTC.
*   **Geolocalização**: Envio de localização atual no chat.
*   **IA Assistente**: Sugestões de respostas rápidas para motoristas usando Google Gemini.
*   **Painel Administrativo**: Gestão completa de motoristas e frotas.

## 🌐 Como colocar seu site no ar (Deploy)

### ⚠️ Passo Obrigatório na Vercel (Configuração de Ambiente)
Para evitar a **Tela Preta** e garantir que a Inteligência Artificial funcione, você deve configurar a chave da API:

1.  Vá no Dashboard do seu projeto na **Vercel**.
2.  Clique na aba **Settings** e depois em **Environment Variables**.
3.  Adicione uma nova variável:
    *   **Key**: `VITE_API_KEY`
    *   **Value**: Sua chave da API do Google Gemini (pegue em aistudio.google.com).
4.  Faça um **Redeploy** (ou um novo push no GitHub) para que a alteração tenha efeito.

---

### Opção 1: Vercel (Recomendado - Mais Fácil)
A Vercel é excelente para projetos React.

**Via GitHub:**
1.  Suba seu código para um repositório no GitHub.
2.  Crie uma conta na [Vercel](https://vercel.com).
3.  Clique em **"Add New Project"** e importe seu repositório.
4.  A Vercel detectará o projeto e fará o deploy automaticamente.

**Configurar Domínio na Vercel:**
1.  Vá no Dashboard do seu projeto na Vercel.
2.  Clique em **Settings** > **Domains**.
3.  Digite seu domínio (ex: `www.chegoja.com.br`) e siga as instruções de DNS que aparecerão.

### Opção 2: Firebase Hosting
Se você prefere continuar no ecossistema Google.

1.  Instale as ferramentas: `npm install -g firebase-tools`
2.  Faça login: `firebase login`
3.  Inicialize: `firebase init` (Escolha Hosting)
4.  Gere a versão final: `npm run build`
5.  Envie: `firebase deploy`

## 🛠️ Configuração do Backend (Obrigatório)

Para que o aplicativo funcione, você precisa configurar o banco de dados no **Supabase**.

1.  Crie um projeto no [Supabase](https://supabase.com).
2.  Acesse o menu **SQL Editor** no painel do Supabase.
3.  Copie o código SQL abaixo (ou o conteúdo do arquivo `supa.ts`):

```sql
-- RESET E CRIAÇÃO DAS TABELAS
DROP TABLE IF EXISTS public.messages CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

-- Tabela de Perfis
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
    vehicle_type TEXT CHECK (vehicle_type IN ('car', 'motorcycle')),
    lat FLOAT,
    lng FLOAT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Tabela de Mensagens
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

-- Storage (Bucket de Mídia)
INSERT INTO storage.buckets (id, name, public) VALUES ('chat-media', 'chat-media', true) ON CONFLICT (id) DO NOTHING;
CREATE POLICY "Public Upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'chat-media');
CREATE POLICY "Public Read" ON storage.objects FOR SELECT USING (bucket_id = 'chat-media');

-- Segurança e Realtime
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Profiles" ON public.profiles FOR ALL USING (true);
CREATE POLICY "Public Messages" ON public.messages FOR ALL USING (true);
DROP PUBLICATION IF EXISTS supabase_realtime;
CREATE PUBLICATION supabase_realtime FOR TABLE messages, profiles;
```

4.  Execute a query.
5.  Vá em `constants.ts` e atualize `SUPABASE_URL` e `SUPABASE_ANON_KEY` com as chaves do seu projeto (Menu: Project Settings > API).

## 📱 Instalação (PWA)

Este aplicativo pode ser instalado nativamente em Android e iOS:
*   **Android**: "Adicionar à tela inicial" via Chrome.
*   **iOS**: "Adicionar à Tela de Início" via Safari (botão Compartilhar).
