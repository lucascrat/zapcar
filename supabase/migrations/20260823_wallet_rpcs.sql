-- =================================================================================
-- RPCs ATÔMICAS DE CARTEIRA (wallet_coins e financial_balance)
-- Aplicar no Supabase Dashboard → SQL Editor → Execute
--
-- Estas funções são chamadas por createPaymentRequest e updatePaymentRequestStatus
-- em services/supabaseClient.ts. Sem elas, saques falham silenciosamente.
-- =================================================================================

-- ── Dropar versões antigas (podem ter tipo de retorno diferente) ──────────────
DROP FUNCTION IF EXISTS chegoja.increment_coins(uuid, int);
DROP FUNCTION IF EXISTS chegoja.increment_coins(uuid, integer);
DROP FUNCTION IF EXISTS chegoja.increment_financial_balance(uuid, numeric);
DROP FUNCTION IF EXISTS chegoja.decrement_financial_balance_if_available(uuid, numeric);

-- ── 1. increment_coins ────────────────────────────────────────────────────────
-- Soma (ou subtrai, se negativo) moedas de forma atômica.
-- Retorna o novo saldo de wallet_coins.
CREATE FUNCTION chegoja.increment_coins(
  user_id_param uuid,
  amount_param  int
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = chegoja, public
AS $$
DECLARE
  new_coins int;
BEGIN
  UPDATE chegoja.profiles
  SET    wallet_coins = COALESCE(wallet_coins, 0) + amount_param
  WHERE  id = user_id_param
  RETURNING wallet_coins INTO new_coins;

  RETURN new_coins;
END;
$$;

GRANT EXECUTE ON FUNCTION chegoja.increment_coins TO authenticated;

-- ── 2. increment_financial_balance ───────────────────────────────────────────
-- Soma (ou subtrai) saldo financeiro em R$ de forma atômica.
-- Retorna o novo saldo.
CREATE FUNCTION chegoja.increment_financial_balance(
  user_id_param uuid,
  amount_param  numeric
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = chegoja, public
AS $$
DECLARE
  new_balance numeric;
BEGIN
  UPDATE chegoja.profiles
  SET    financial_balance = COALESCE(financial_balance, 0) + amount_param
  WHERE  id = user_id_param
  RETURNING financial_balance INTO new_balance;

  RETURN new_balance;
END;
$$;

GRANT EXECUTE ON FUNCTION chegoja.increment_financial_balance TO authenticated;

-- ── 3. decrement_financial_balance_if_available ───────────────────────────────
-- Debita amount_param do saldo financeiro SOMENTE se houver saldo suficiente.
-- Retorna TRUE se debitou, FALSE se saldo insuficiente.
-- Atômica via FOR UPDATE — evita duplo-gasto em requisições simultâneas.
CREATE FUNCTION chegoja.decrement_financial_balance_if_available(
  user_id_param uuid,
  amount_param  numeric
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = chegoja, public
AS $$
DECLARE
  current_balance numeric;
BEGIN
  -- Bloqueia a linha para evitar race condition
  SELECT financial_balance
  INTO   current_balance
  FROM   chegoja.profiles
  WHERE  id = user_id_param
  FOR UPDATE;

  IF current_balance IS NULL OR current_balance < amount_param THEN
    RETURN false;
  END IF;

  UPDATE chegoja.profiles
  SET    financial_balance = financial_balance - amount_param
  WHERE  id = user_id_param;

  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION chegoja.decrement_financial_balance_if_available TO authenticated;

-- ── Verificação ───────────────────────────────────────────────────────────────
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'chegoja'
  AND routine_name IN (
    'increment_coins',
    'increment_financial_balance',
    'decrement_financial_balance_if_available'
  )
ORDER BY routine_name;
