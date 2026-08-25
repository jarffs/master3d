-- RPC: deduct_credit
-- Decrements the user's credits by 1 if they have at least 1 credit.
-- Returns true on success, false if not enough credits.
CREATE OR REPLACE FUNCTION deduct_credit()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS 
DECLARE
  current_credits integer;
BEGIN
  -- Lança erro se não estiver logado
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  -- Seleciona e bloqueia a linha para evitar race conditions
  SELECT credits INTO current_credits
  FROM public.profiles
  WHERE id = auth.uid()
  FOR UPDATE;

  -- Verifica se tem créditos
  IF current_credits > 0 THEN
    UPDATE public.profiles
    SET credits = credits - 1
    WHERE id = auth.uid();
    
    RETURN true;
  ELSE
    RETURN false;
  END IF;
END;
;
