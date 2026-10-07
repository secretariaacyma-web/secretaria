import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { CONFIG } from './config.js';

export const sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

// Ejecuta una consulta de Supabase y lanza el error si lo hay.
export async function q(promesa) {
  const { data, error } = await promesa;
  if (error) throw error;
  return data;
}
