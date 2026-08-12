import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Atenção: Supabase URL ou Anon Key não encontradas nas variáveis de ambiente.');
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '');
