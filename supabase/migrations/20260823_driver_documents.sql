-- =================================================================================
-- CADASTRO COMPLETO DE MOTORISTA: documentos para análise (foto do rosto, CNH,
-- comprovante de endereço, cidade de trabalho) + corrige bug onde a foto de
-- perfil escolhida no cadastro nunca era salva.
-- Aplicar no Supabase Dashboard → SQL Editor → Execute
-- =================================================================================

ALTER TABLE chegoja.profiles ADD COLUMN IF NOT EXISTS doc_cnh_url text;
ALTER TABLE chegoja.profiles ADD COLUMN IF NOT EXISTS doc_address_proof_url text;
ALTER TABLE chegoja.profiles ADD COLUMN IF NOT EXISTS work_city text;

-- register_driver nunca recebia a foto de perfil escolhida no cadastro (o avatar
-- só era salvo no fallback de inserção direta, que só roda quando essa RPC
-- falha) - por isso motoristas ficavam sem foto mesmo tendo escolhido uma.
-- Adiciona os novos parâmetros no fim, todos com DEFAULT, então não quebra
-- nenhuma chamada existente.
CREATE OR REPLACE FUNCTION chegoja.register_driver(
  p_username text,
  p_phone text,
  p_password text,
  p_vehicle_type text DEFAULT 'car'::text,
  p_vehicle_model text DEFAULT NULL::text,
  p_vehicle_plate text DEFAULT NULL::text,
  p_vehicle_color text DEFAULT NULL::text,
  p_avatar_url text DEFAULT NULL::text,
  p_doc_cnh_url text DEFAULT NULL::text,
  p_doc_address_proof_url text DEFAULT NULL::text,
  p_work_city text DEFAULT NULL::text
)
RETURNS chegoja.profiles
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  new_profile chegoja.profiles;
BEGIN
  -- Verificar se username já existe
  IF EXISTS (SELECT 1 FROM chegoja.profiles WHERE username = p_username) THEN
    RAISE EXCEPTION 'Username already exists';
  END IF;

  INSERT INTO chegoja.profiles (
    username,
    phone,
    password,
    role,
    status,
    is_approved,
    vehicle_type,
    vehicle_model,
    vehicle_plate,
    vehicle_color,
    avatar_url,
    doc_cnh_url,
    doc_address_proof_url,
    work_city
  ) VALUES (
    p_username,
    p_phone,
    crypt(p_password, gen_salt('bf', 10)),
    'driver',
    'offline',
    false,
    p_vehicle_type,
    p_vehicle_model,
    p_vehicle_plate,
    p_vehicle_color,
    p_avatar_url,
    p_doc_cnh_url,
    p_doc_address_proof_url,
    p_work_city
  )
  RETURNING * INTO new_profile;

  RETURN new_profile;
END;
$function$;

-- Adicionar parâmetros muda a assinatura da função para o Postgres, então
-- CREATE OR REPLACE criou uma segunda função (overload) em vez de substituir -
-- remove a assinatura antiga de 7 parâmetros pra não ficarem duas.
DROP FUNCTION IF EXISTS chegoja.register_driver(text, text, text, text, text, text, text);

GRANT EXECUTE ON FUNCTION chegoja.register_driver(text, text, text, text, text, text, text, text, text, text, text) TO anon, authenticated;
