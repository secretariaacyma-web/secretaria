import { CONFIG } from './config.js';

// Versión de demostración (demo.html): datos inventados, solo lectura, sin tocar la base real.
export const DEMO = typeof window !== 'undefined' && window.__DEMO__ === true;
if (DEMO) CONFIG.GOOGLE_CLIENT_ID = ''; // sin Drive en la demostración

const { createClient } = DEMO
  ? await import('./demo/stub.js')
  : await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');

export const sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

// Ejecuta una consulta de Supabase y lanza el error si lo hay.
export async function q(promesa) {
  const { data, error } = await promesa;
  if (error) throw error;
  return data;
}
