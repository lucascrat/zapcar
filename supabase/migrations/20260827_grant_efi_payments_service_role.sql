-- =================================================================================
-- PAGAMENTO DE PLANO NAO LIBERA SOZINHO (fica esperando pra sempre mesmo apos pagar)
--
-- Causa raiz confirmada direto no banco: chegoja.efi_payments (tabela que
-- registra cada cobranca Pix/cartao criada) tem ZERO linhas - nunca, desde
-- que a tabela existe. A Edge Function efi-payment roda com
-- SUPABASE_SERVICE_ROLE_KEY (role 'service_role'), mas esse role nunca
-- recebeu GRANT nenhum em chegoja.efi_payments (confirmado: SELECT/INSERT/
-- UPDATE/DELETE ausentes - só 'postgres' tinha acesso). RLS nem chega a
-- entrar em jogo aqui (esta desabilitada nessa tabela) - e' pura falta de
-- GRANT, mesmo padrao ja visto em driver_plans/vehicle_categories nesta
-- sessao. 'service_role' tem bypassrls=true mas isso so pula RLS, GRANT de
-- tabela e' uma camada completamente separada que ele tambem precisa.
--
-- Efeito pratico: supabase.functions/efi-payment/index.ts:actionCreatePix()
-- faz "await supabase.from('efi_payments').insert(...)" sem checar o erro
-- retornado - o insert falha em silencio (permission denied), a funcao
-- segue em frente e devolve o QR Code Pix normalmente pro motorista (por
-- isso GERAR o pix sempre funcionou). So que sem a linha na tabela,
-- actionCheck()/actionCheckReference() (chamadas tanto pelo polling
-- automatico a cada 5s quanto pelo botao "JA PAGUEI" em
-- DriverSubscription.tsx) nunca encontram o pagamento pra consultar o status
-- real na Efi - sempre devolvem "unknown"/"not_found", pra sempre, mesmo
-- horas depois do pagamento realmente aprovado. O app nunca chama
-- activatePlan() porque nunca detecta a aprovacao.
--
-- Aplicar no Supabase Dashboard → SQL Editor → Execute
-- =================================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON chegoja.efi_payments TO service_role;

-- Mesmo problema, oversight desta propria sessao: a tabela vehicle_categories
-- (categorias de veiculo) tambem ficou sem GRANT pro service_role - nenhuma
-- Edge Function usa essa tabela hoje, mas corrige de qualquer forma pra nao
-- deixar a mesma pegadinha esperando por uma futura integracao.
GRANT SELECT, INSERT, UPDATE, DELETE ON chegoja.vehicle_categories TO service_role;
