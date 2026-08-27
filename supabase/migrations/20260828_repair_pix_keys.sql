-- =================================================================================
-- CONSERTA CHAVES PIX DE CELULAR SALVAS SEM O +55
-- APLICAR NO: Supabase Dashboard → SQL Editor → Execute
--
-- O campo de chave PIX era texto livre. Motorista com chave de CELULAR digitava
-- "85981201088" e era salvo assim - mas o Pix Envio da Efí exige E.164
-- ("+5585981201088"). O saque automático era recusado pela Efí DEPOIS de já ter
-- debitado o saldo. A partir de agora o app normaliza no cadastro
-- (utils/pixKey.ts) e a Edge Function normaliza de novo antes de enviar, mas as
-- linhas antigas continuam no formato errado - é o que este script arruma.
--
-- SÓ MEXE no que é inequivocamente celular: 11 dígitos, DDD que existe, terceiro
-- dígito 9 (celular brasileiro) e que NÃO passa no dígito verificador de CPF.
-- Uma chave que valida como CPF fica intocada, mesmo parecendo telefone.
-- =================================================================================

-- Dígito verificador de CPF, pra não confundir CPF com celular.
create or replace function chegoja.is_valid_cpf(p text)
returns boolean language plpgsql immutable as $fn$
declare d text; s int; r int; i int;
begin
  d := regexp_replace(coalesce(p, ''), '\D', '', 'g');
  if length(d) <> 11 or d ~ '^(.)\1{10}$' then return false; end if;
  s := 0;
  for i in 1..9 loop s := s + substr(d, i, 1)::int * (11 - i); end loop;
  r := (s * 10) % 11; if r = 10 then r := 0; end if;
  if r <> substr(d, 10, 1)::int then return false; end if;
  s := 0;
  for i in 1..10 loop s := s + substr(d, i, 1)::int * (12 - i); end loop;
  r := (s * 10) % 11; if r = 10 then r := 0; end if;
  return r = substr(d, 11, 1)::int;
end;
$fn$;

-- Reconhece "isto é um celular brasileiro cru, sem o +55".
create or replace function chegoja.is_bare_br_mobile(p text)
returns boolean language sql immutable as $fn$
  select p is not null
     and regexp_replace(p, '\D', '', 'g') ~ '^[1-9][0-9]9[0-9]{8}$'
     and substr(regexp_replace(p, '\D', '', 'g'), 1, 2)::int in (
           11,12,13,14,15,16,17,18,19,21,22,24,27,28,
           31,32,33,34,35,37,38,41,42,43,44,45,46,47,48,49,
           51,53,54,55,61,62,63,64,65,66,67,68,69,
           71,73,74,75,77,79,81,82,83,84,85,86,87,88,89,
           91,92,93,94,95,96,97,98,99)
     and not chegoja.is_valid_cpf(p);
$fn$;

-- ── Confira ANTES o que vai mudar ───────────────────────────────────────────
select id, username, pix_key as antes,
       '+55' || regexp_replace(pix_key, '\D', '', 'g') as depois
  from chegoja.profiles
 where chegoja.is_bare_br_mobile(pix_key);

-- ── Aplica ──────────────────────────────────────────────────────────────────
update chegoja.profiles
   set pix_key = '+55' || regexp_replace(pix_key, '\D', '', 'g')
 where chegoja.is_bare_br_mobile(pix_key);

-- Saques ainda na fila levam a chave copiada no momento do pedido - corrige
-- também, senão o botão "Pagar via PIX agora" usaria a chave velha.
update chegoja.payment_requests
   set pix_key = '+55' || regexp_replace(pix_key, '\D', '', 'g')
 where status = 'pending'
   and chegoja.is_bare_br_mobile(pix_key);

-- ── Verificação ─────────────────────────────────────────────────────────────
-- Deve voltar 0 linhas nas duas:
select count(*) as perfis_pendentes    from chegoja.profiles         where chegoja.is_bare_br_mobile(pix_key);
select count(*) as saques_pendentes    from chegoja.payment_requests where status = 'pending' and chegoja.is_bare_br_mobile(pix_key);
