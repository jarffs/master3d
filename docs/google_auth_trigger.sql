-- SQL Script para Configurar Perfis e Créditos Iniciais no Supabase

-- 1. Garante que a tabela 'profiles' tem a coluna 'credits' com o default correto.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS credits integer DEFAULT 3;

-- 2. Cria a função que será executada automaticamente após o registo de um utilizador.
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS trigger 
LANGUAGE plpgsql 
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, username, email, avatar_url, credits)
  VALUES (
    new.id,
    -- Extrai o nome se estiver disponível no raw_user_meta_data (Google)
    COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email,
    -- Extrai o avatar se estiver disponível (Google)
    new.raw_user_meta_data->>'avatar_url',
    3 -- Oferece 3 créditos grátis (pode ser omitido devido ao DEFAULT da tabela, mas colocamos por segurança)
  )
  -- Se o utilizador já existir (ex: erro de sinc), ignora
  ON CONFLICT (id) DO NOTHING;
  
  RETURN new;
END;
$$;

-- 3. Cria o Trigger que "escuta" a tabela auth.users.
-- Atenção: Se o trigger já existir, é preciso eliminá-lo primeiro.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
