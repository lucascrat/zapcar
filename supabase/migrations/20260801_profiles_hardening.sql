-- =================================================================================
-- Blindagem da tabela profiles contra escalação de privilégio
-- APLICADO EM PRODUÇÃO em 2026-08-01 (projeto qyagfghcnzenvbhbtsvd)
-- =================================================================================
-- Premissa do produto: cliente e motorista continuam entrando SEM autenticação
-- (só nome + telefone). Logo, todos eles chegam ao banco como a role `anon`, cuja
-- chave é pública. Não dá para provar "sou o usuário X" no nível do banco.
--
-- O que dá para impedir, mesmo assim, é ESCALAÇÃO DE PRIVILÉGIO: ninguém deve
-- conseguir se tornar admin nem se auto-aprovar como motorista.
--
-- DUAS DESCOBERTAS QUE MOTIVARAM ESTE SCRIPT:
--
--  1. O RLS estava DESLIGADO em chegoja.profiles. As três policies existentes
--     (profiles_public_read, profiles_insert, profiles_self_update) nunca foram
--     aplicadas - davam aparência de proteção sem proteger nada.
--
--  2. O grant de UPDATE do `anon` era em NÍVEL DE TABELA. Nesse caso, revogar
--     coluna a coluna não surte efeito nenhum: é preciso revogar a tabela inteira
--     e devolver apenas as colunas desejadas.
-- =================================================================================


-- ---------------------------------------------------------------------------------
-- 1. UPDATE: anon só escreve nas colunas operacionais
-- ---------------------------------------------------------------------------------
revoke update on chegoja.profiles from anon;

grant update (
    username, phone, password, status, avatar_url,
    vehicle_model, vehicle_plate, vehicle_color, vehicle_type,
    lat, lng, pix_key, whatsapp, cpf,
    address_street, address_number, address_neighborhood, address_city, address_zip,
    email, is_pip_active, unread_count, updated_at,
    -- Dinheiro/assinatura seguem liberados por necessidade: a ativação de plano e
    -- as compras da loja são disparadas pelo cliente. Fechar aqui quebraria o
    -- fluxo de pagamento. Ver "PENDENTE" no rodapé.
    subscription_expires_at, wallet_coins, financial_balance
) on chegoja.profiles to anon;

-- Fora da lista (anon não escreve): id, created_at, role, is_approved
-- `authenticated` mantém o UPDATE amplo: é por ali que o admin aprova motorista
-- e que o perfil do bot do WhatsApp é mantido.


-- ---------------------------------------------------------------------------------
-- 2. Ligar o RLS (as policies eram inertes)
-- ---------------------------------------------------------------------------------
alter table chegoja.profiles enable row level security;


-- ---------------------------------------------------------------------------------
-- 3. INSERT: cadastro segue aberto, mas não nasce admin nem aprovado
-- ---------------------------------------------------------------------------------
drop policy if exists profiles_insert on chegoja.profiles;
create policy profiles_insert on chegoja.profiles
    for insert
    with check (
        chegoja.is_admin()
        or (role in ('client','driver') and coalesce(is_approved, false) = false)
    );


-- ---------------------------------------------------------------------------------
-- 4. DELETE: só admin
-- ---------------------------------------------------------------------------------
-- A limpeza de perfis duplicados (services/supabaseClient.ts) apaga direto na
-- tabela e roda pelo painel, já autenticado como admin.
drop policy if exists profiles_admin_delete on chegoja.profiles;
create policy profiles_admin_delete on chegoja.profiles
    for delete using (chegoja.is_admin());


-- ---------------------------------------------------------------------------------
-- Verificado com a chave anon pública (PostgREST)
-- ---------------------------------------------------------------------------------
--   PATCH role='admin'                 -> 42501 permission denied     (bloqueado)
--   PATCH is_approved=true             -> 42501 permission denied     (bloqueado)
--   POST  role=admin,is_approved=true  -> 42501 violates RLS policy   (bloqueado)
--   POST  cadastro de cliente          -> 201                         (liberado)
--   POST  cadastro de motorista        -> 201, nasce is_approved=false
--   PATCH lat/lng/status               -> 204                         (liberado)
--   Admin autenticado aprova motorista -> 1 linha afetada             (liberado)


-- =================================================================================
-- PENDENTE (exige mudança de arquitetura, não só de policy)
-- =================================================================================
-- subscription_expires_at, wallet_coins e financial_balance continuam graváveis
-- pelo cliente, porque hoje é o próprio navegador que ativa o plano após o
-- pagamento (services/paymentService.ts -> activatePlan) e que debita moedas na
-- loja. Um motorista com o devtools aberto consegue se dar assinatura ou saldo.
--
-- Correção adequada: mover a ativação para uma Edge Function que confirme o
-- pagamento junto ao gateway antes de gravar, e trocar os débitos/créditos por
-- RPCs SECURITY DEFINER que validem a operação. Depois disso, remover essas três
-- colunas do grant acima.
