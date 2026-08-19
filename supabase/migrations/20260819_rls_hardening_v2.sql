-- =================================================================================
-- Endurecimento de RLS (rodada 2) - fecha brechas encontradas em auditoria manual
-- APLICADO EM PRODUÇÃO em 2026-08-19 (projeto qyagfghcnzenvbhbtsvd)
-- =================================================================================
-- Contexto: a rodada anterior (20260801_profiles_hardening.sql / 20260801_admin_auth.sql)
-- fechou escalação de privilégio em `profiles` (ninguém vira admin/aprovado sozinho)
-- e protegeu a RPC de exclusão de usuário. Esta rodada trata problemas achados numa
-- varredura tabela-a-tabela com a chave anon pública:
--
--  1. chegoja.bingo_cards e chegoja.bingo_settings estavam com RLS DESLIGADO na
--     tabela inteira (rowsecurity = false) e com grant total pra `anon`, incluindo
--     TRUNCATE. As policies que já existiam (bingo_cards_read_own etc) nunca
--     valiam nada, porque RLS nem estava ligado.
--
--  2. chegoja.payment_requests tinha uma única policy "ALL / true / true" pra
--     `public` - qualquer um podia aprovar/rejeitar/apagar o saque de qualquer
--     usuário ou trocar a chave PIX de destino de um saque alheio.
--
--  3. chegoja.app_settings e chegoja.coupons tinham UPDATE (e no caso de coupons,
--     também INSERT/DELETE) liberado pra `public` sem checar admin - qualquer
--     cliente com o app aberto podia mudar o preço base da corrida pra todo mundo,
--     ou criar cupons de 100% de desconto pra si mesmo.
--
--  4. chegoja.messages não tinha NENHUMA policy de UPDATE. Resultado prático:
--     markMessagesAsRead() (services/supabaseClient.ts) sempre "tem sucesso" (sem
--     erro) mas nunca muda nenhuma linha - função morta e silenciosa. Sem impacto
--     visível hoje (o contador de não-lidas na UI é todo em memória), mas deixa a
--     função quebrada pra sempre. Corrigido aqui de forma mínima: só a coluna
--     is_read pode ser escrita, sem outras colunas expostas.
--
-- O QUE ESTE SCRIPT *NÃO* RESOLVE (mesma limitação estrutural documentada em
-- 20260801_profiles_hardening.sql: cliente/motorista não têm sessão de auth real,
-- então não existe auth.uid() pra restringir "só o dono vê/edita a própria linha"):
--
--  - chegoja.profiles expõe o hash da senha (coluna `password`) pra leitura pública,
--    porque o login de cliente/motorista hoje busca a linha com a chave anon e
--    compara o hash no JS (services/supabaseClient.ts::loginUser). Corrigir direito
--    exige mover essa comparação pra uma RPC SECURITY DEFINER no banco (usando
--    pgcrypto, que é compatível com hash bcrypt) e só então revogar o SELECT da
--    coluna password - ou seja, precisa de mudança de código junto, não só de
--    policy. Ver proposta em separado.
--
--  - chegoja.rides, chegoja.messages e chegoja.wallet_transactions continuam com
--    SELECT público total (qualquer um lê corrida/conversa/extrato de qualquer
--    usuário) - mesma causa raiz (sem auth.uid() pra filtrar por dono).
-- =================================================================================


-- ---------------------------------------------------------------------------------
-- 1. bingo_cards / bingo_settings: ligar RLS de verdade + policies mínimas
-- ---------------------------------------------------------------------------------
-- Comportamento do app preservado 1:1:
--   - Qualquer um lê a cartela de todo mundo (ranking é público por natureza)
--   - Qualquer um cria a PRÓPRIA cartela (getOrCreateBingoCard, sem auth real)
--   - Só admin sorteia número / edita prêmio / reseta (AdminBingoView, sessão
--     autenticada de verdade via Supabase Auth)
alter table chegoja.bingo_cards enable row level security;
alter table chegoja.bingo_settings enable row level security;

revoke all on chegoja.bingo_cards from anon, authenticated;
revoke all on chegoja.bingo_settings from anon, authenticated;

grant select, insert on chegoja.bingo_cards to anon, authenticated;
grant select on chegoja.bingo_settings to anon, authenticated;
grant insert, update, delete on chegoja.bingo_settings to authenticated;

drop policy if exists bingo_cards_public_read on chegoja.bingo_cards;
create policy bingo_cards_public_read on chegoja.bingo_cards
    for select using (true);

drop policy if exists bingo_cards_public_insert on chegoja.bingo_cards;
create policy bingo_cards_public_insert on chegoja.bingo_cards
    for insert with check (true);

drop policy if exists bingo_settings_public_read on chegoja.bingo_settings;
create policy bingo_settings_public_read on chegoja.bingo_settings
    for select using (true);

drop policy if exists bingo_settings_admin_write on chegoja.bingo_settings;
create policy bingo_settings_admin_write on chegoja.bingo_settings
    for all using (chegoja.is_admin()) with check (chegoja.is_admin());

-- Correção de dados: 5 cartelas antigas tinham 24 números em vez de 25 (bug de
-- versão anterior, já corrigido manualmente em 2026-08-19 durante a auditoria).
-- Nada a fazer aqui, é só o contexto de por que a contagem pode não bater em
-- linhas bem antigas caso apareçam de novo.


-- ---------------------------------------------------------------------------------
-- 2. payment_requests: tirar o "ALL / true" e separar por operação
-- ---------------------------------------------------------------------------------
-- Continua liberado pra qualquer um (sem auth real) CRIAR e VER solicitações de
-- saque - é assim que motorista/cliente pedem saque hoje. Aprovar, rejeitar,
-- corrigir chave PIX ou apagar passa a exigir admin autenticado de verdade.
drop policy if exists "Acesso total payment_requests" on chegoja.payment_requests;

drop policy if exists payment_requests_read on chegoja.payment_requests;
create policy payment_requests_read on chegoja.payment_requests
    for select using (true);

drop policy if exists payment_requests_insert on chegoja.payment_requests;
create policy payment_requests_insert on chegoja.payment_requests
    for insert with check (true);

drop policy if exists payment_requests_admin_update on chegoja.payment_requests;
create policy payment_requests_admin_update on chegoja.payment_requests
    for update using (chegoja.is_admin()) with check (chegoja.is_admin());

drop policy if exists payment_requests_admin_delete on chegoja.payment_requests;
create policy payment_requests_admin_delete on chegoja.payment_requests
    for delete using (chegoja.is_admin());


-- ---------------------------------------------------------------------------------
-- 3. app_settings: UPDATE só admin (SELECT continua público)
-- ---------------------------------------------------------------------------------
drop policy if exists app_settings_update on chegoja.app_settings;
create policy app_settings_update on chegoja.app_settings
    for update using (chegoja.is_admin()) with check (chegoja.is_admin());

-- Não existia policy de INSERT antes (o app só faz insert de fallback quando a
-- tabela está vazia, e isso já rodou uma vez em produção). Adicionamos mesmo
-- assim, restrita a admin, pra cobrir o caso de precisar recriar a linha.
drop policy if exists app_settings_admin_insert on chegoja.app_settings;
create policy app_settings_admin_insert on chegoja.app_settings
    for insert with check (chegoja.is_admin());


-- ---------------------------------------------------------------------------------
-- 4. coupons: escrita só admin (SELECT continua público)
-- ---------------------------------------------------------------------------------
-- useCoupon() no app incrementa used_quantity via RPC increment_coupon_usage,
-- que é SECURITY DEFINER e continua funcionando pra qualquer usuário mesmo com
-- a policy de UPDATE da tabela restrita a admin (a RPC roda com privilégio
-- próprio, não com o do chamador). O fallback direto de useCoupon() pra quando a
-- RPC falha deixa de funcionar - efeito colateral aceito, é só um fallback de um
-- caminho que já existe e funciona.
drop policy if exists coupons_insert on chegoja.coupons;
create policy coupons_insert on chegoja.coupons
    for insert with check (chegoja.is_admin());

drop policy if exists coupons_update on chegoja.coupons;
create policy coupons_update on chegoja.coupons
    for update using (chegoja.is_admin()) with check (chegoja.is_admin());

drop policy if exists coupons_delete on chegoja.coupons;
create policy coupons_delete on chegoja.coupons
    for delete using (chegoja.is_admin());


-- ---------------------------------------------------------------------------------
-- 5. messages: corrigir markMessagesAsRead (só a coluna is_read, sem dono)
-- ---------------------------------------------------------------------------------
-- Não dá pra restringir "só o destinatário marca como lida" sem auth.uid() real.
-- Fica público por coluna só (não dá pra reescrever conteúdo/remetente), igual ao
-- padrão já usado em profiles pra colunas operacionais.
revoke update on chegoja.messages from anon, authenticated;
grant update (is_read) on chegoja.messages to anon, authenticated;

drop policy if exists messages_mark_read on chegoja.messages;
create policy messages_mark_read on chegoja.messages
    for update using (true) with check (true);


-- ---------------------------------------------------------------------------------
-- Verificação (rodar com a chave anon pública, via PostgREST, depois de aplicar)
-- ---------------------------------------------------------------------------------
--   PATCH bingo_settings (anon)                  -> 0 linhas afetadas (bloqueado)
--   PATCH bingo_settings (authenticated + admin)  -> 1 linha afetada  (liberado)
--   PATCH payment_requests status (anon)          -> 0 linhas afetadas (bloqueado)
--   PATCH app_settings car_base_price (anon)      -> 0 linhas afetadas (bloqueado)
--   PATCH coupons discount_value (anon)           -> 0 linhas afetadas (bloqueado)
--   PATCH messages is_read (anon)                 -> 1 linha afetada  (liberado)
--   PATCH messages content (anon)                 -> 42501 permission denied (bloqueado)
