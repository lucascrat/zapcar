-- =================================================================================
-- Login por RPC (senha nunca mais sai do banco) + corrige contas travadas
-- APLICADO EM PRODUÇÃO em 2026-08-19 (projeto qyagfghcnzenvbhbtsvd)
-- =================================================================================
-- Problema 1 (segurança): loginUser() em services/supabaseClient.ts buscava a
-- linha inteira de `profiles` (incluindo o hash da senha) com a chave anon
-- pública e comparava a senha NO NAVEGADOR. Qualquer um com a chave anon (embutida
-- no app) conseguia ler o hash de senha de qualquer usuário via SELECT direto.
--
-- Problema 2 (bug real, achado ao investigar o problema 1): 12 contas têm senha
-- salva em formato bcrypt ($2a$/$2b$/$2y$) de um sistema anterior a este. A
-- função verifyPassword() (utils/passwordHash.ts) só reconhece o formato próprio
-- do app (sha256$salt$hash) como "hasheado" - qualquer outra coisa, incluindo
-- bcrypt, cai no caminho de "senha antiga em texto puro" e compara a string
-- inteira do hash bcrypt com a senha digitada. Isso NUNCA bate. Resultado: essas
-- 12 contas não conseguem logar de jeito nenhum, silenciosamente.
--
-- Solução: mover a verificação de senha inteira para dentro do banco, numa RPC
-- SECURITY DEFINER que:
--   - aceita os 3 formatos hoje existentes (sha256$ novo, bcrypt legado via
--     pgcrypto, texto puro legado);
--   - devolve o perfil já SEM a coluna password;
--   - se a senha bateu num formato legado (bcrypt ou texto puro), faz o upgrade
--     transparente para sha256$ na hora, igual ao app já fazia no lado do
--     cliente (só que agora sem nunca expor o hash).
-- Depois disso, a coluna password é revogada de SELECT para anon/authenticated -
-- só a própria RPC (que roda como o dono da função) consegue lê-la.
-- =================================================================================


-- ---------------------------------------------------------------------------------
-- 1. RPC de login
-- ---------------------------------------------------------------------------------
create or replace function chegoja.verify_login(
    p_identifier text,
    p_password text default null,
    p_role text default null
)
returns jsonb
language plpgsql
security definer
set search_path = chegoja, public, extensions
as $fn$
declare
    v_profile chegoja.profiles;
    v_valid boolean := false;
    v_salt text;
    v_hash text;
    v_candidate text;
    v_new_salt text;
    v_new_hash text;
begin
    select * into v_profile
    from chegoja.profiles p
    where (p.username = p_identifier or p.phone = p_identifier)
      and (p_role is null or p.role = p_role)
    limit 1;

    if not found then
        return null;
    end if;

    if p_password is null or p_password = '' then
        -- Login sem senha (cliente, cadastro só com telefone): só passa se a
        -- conta realmente não tem senha cadastrada.
        v_valid := (v_profile.password is null);

    elsif v_profile.password is null then
        v_valid := false;

    elsif v_profile.password like 'sha256$%' then
        -- Formato atual do app: sha256$<salt-hex>$<hash-hex>
        v_salt := split_part(v_profile.password, '$', 2);
        v_hash := split_part(v_profile.password, '$', 3);
        v_candidate := encode(extensions.digest(v_salt || p_password, 'sha256'), 'hex');
        v_valid := (v_candidate = v_hash);

    elsif v_profile.password like '$2a$%' or v_profile.password like '$2b$%' or v_profile.password like '$2y$%' then
        -- Bcrypt de um sistema anterior - pgcrypto.crypt() é compatível.
        v_valid := (extensions.crypt(p_password, v_profile.password) = v_profile.password);

    else
        -- Texto puro (contas bem antigas, nunca migradas).
        v_valid := (v_profile.password = p_password);
    end if;

    if not v_valid then
        return null;
    end if;

    -- Upgrade transparente pro formato atual, se a senha validou num formato
    -- legado (bcrypt ou texto puro). Mesmo formato que o app já gerava no JS.
    if p_password is not null and p_password <> ''
       and v_profile.password not like 'sha256$%' then
        v_new_salt := encode(extensions.gen_random_bytes(16), 'hex');
        v_new_hash := encode(extensions.digest(v_new_salt || p_password, 'sha256'), 'hex');

        update chegoja.profiles
        set password = 'sha256$' || v_new_salt || '$' || v_new_hash
        where id = v_profile.id;

        v_profile.password := 'sha256$' || v_new_salt || '$' || v_new_hash;
    end if;

    -- Nunca devolve o hash pro chamador, seja qual for.
    return to_jsonb(v_profile) - 'password';
end;
$fn$;

revoke all on function chegoja.verify_login(text, text, text) from public;
grant execute on function chegoja.verify_login(text, text, text) to anon, authenticated;


-- ---------------------------------------------------------------------------------
-- 2. Tirar a coluna password de circulação pro SELECT público
-- ---------------------------------------------------------------------------------
-- Mesma técnica já usada em 20260801_profiles_hardening.sql pro UPDATE: revogar a
-- tabela inteira e devolver só as colunas que devem ficar visíveis.
revoke select on chegoja.profiles from anon, authenticated;

grant select (
    id, username, phone, role, status, is_approved, subscription_expires_at,
    avatar_url, vehicle_model, vehicle_plate, vehicle_color, vehicle_type,
    lat, lng, wallet_coins, financial_balance, pix_key, whatsapp, cpf,
    address_street, address_number, address_neighborhood, address_city, address_zip,
    email, is_pip_active, unread_count, created_at, updated_at
) on chegoja.profiles to anon, authenticated;

-- `password` fora da lista de propósito: só chegoja.verify_login() (SECURITY
-- DEFINER) consegue ler essa coluna agora.


-- ---------------------------------------------------------------------------------
-- Verificação (rodar com a chave anon pública, via PostgREST, depois de aplicar)
-- ---------------------------------------------------------------------------------
--   GET profiles?select=password                       -> 42501 (bloqueado)
--   GET profiles?select=id,username                     -> 200   (liberado)
--   POST rpc/verify_login (senha certa, conta sha256)    -> perfil sem `password`
--   POST rpc/verify_login (senha certa, conta bcrypt)    -> perfil sem `password`,
--                                                            e a senha já sobe
--                                                            pro formato sha256$
--   POST rpc/verify_login (senha errada)                 -> null
