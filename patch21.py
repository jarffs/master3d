import sys

sql_script = '''-- SQL Script para Configurar Perfis e Créditos Iniciais no Supabase

-- 1. Garante que a tabela 'profiles' tem as colunas necessárias
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS credits integer DEFAULT 3;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url text;

-- 2. Cria a função que será executada automaticamente após o registo
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS trigger 
LANGUAGE plpgsql 
SECURITY DEFINER SET search_path = public
AS \$\$
DECLARE
  _username TEXT;
  _avatar_url TEXT;
BEGIN
  -- Trata dados meta que podem ser nulos de forma segura
  IF new.raw_user_meta_data IS NOT NULL THEN
    _username := new.raw_user_meta_data->>'full_name';
    _avatar_url := new.raw_user_meta_data->>'avatar_url';
  END IF;

  -- Fallback para o nome de utilizador usando o email se não vier nome do Google
  IF _username IS NULL OR _username = '' THEN
    _username := split_part(new.email, '@', 1);
  END IF;

  INSERT INTO public.profiles (id, username, email, avatar_url, credits)
  VALUES (
    new.id,
    _username,
    new.email,
    _avatar_url,
    3
  )
  ON CONFLICT (id) DO NOTHING;
  
  RETURN new;
EXCEPTION WHEN OTHERS THEN
  -- Em caso de erro extremo (ex: conflito de tipos), garante pelo menos o ID
  INSERT INTO public.profiles (id, credits)
  VALUES (new.id, 3)
  ON CONFLICT (id) DO NOTHING;
  
  RETURN new;
END;
\$\$;

-- 3. Associa a função ao Trigger na tabela auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
'''

with open('docs/google_auth_trigger.sql', 'w', encoding='utf-8') as f:
    f.write(sql_script)
print('docs/google_auth_trigger.sql updated')
