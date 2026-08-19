-- =================================================================================
-- banners: adiciona INSERT/UPDATE/DELETE (so tinha SELECT) restrito a admin
-- APLICADO EM PRODUÇÃO em 2026-08-19 (projeto qyagfghcnzenvbhbtsvd)
-- =================================================================================
-- Achado ao reativar a exibicao de banners pro cliente (ClientDashboard.tsx): a
-- tabela chegoja.banners tem RLS ligado mas SÓ existia a policy "banners_read"
-- (SELECT). Sem nenhuma policy de INSERT, o botao "Adicionar Banner" do painel
-- admin (AdminBannersView.tsx / addBanner()) sempre falhava silenciosamente -
-- RLS nega por padrao quando nao ha policy pra a operacao. Provavelmente nunca
-- funcionou desde que essa tabela foi criada.
--
-- addBanner/deleteBanner/updateBannerOrder rodam a partir do painel admin, que
-- desde 20260801_admin_auth.sql autentica de verdade via Supabase Auth - por
-- isso da pra restringir a chegoja.is_admin(), igual ja foi feito pra
-- driver_plans, coupons, app_settings e payment_requests.
-- =================================================================================

drop policy if exists banners_admin_insert on chegoja.banners;
create policy banners_admin_insert on chegoja.banners
    for insert with check (chegoja.is_admin());

drop policy if exists banners_admin_update on chegoja.banners;
create policy banners_admin_update on chegoja.banners
    for update using (chegoja.is_admin()) with check (chegoja.is_admin());

drop policy if exists banners_admin_delete on chegoja.banners;
create policy banners_admin_delete on chegoja.banners
    for delete using (chegoja.is_admin());

-- Verificação (chave anon pública, via PostgREST):
--   POST banners (anon, sem sessao)     -> 0 linhas / negado  (bloqueado)
--   POST banners (authenticated+admin)  -> 201                (liberado)
