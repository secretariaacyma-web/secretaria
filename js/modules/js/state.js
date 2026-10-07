import { sb, q } from './supabase.js';

// Estado global de la sesión.
export const estado = { user: null, perfil: null, iglesia: null };

export const rolActual = () => estado.perfil?.rol || null;
export const puede = (...roles) => roles.includes(rolActual());
// Quién puede crear/editar contenido de Secretaría.
export const puedeEscribir = () => puede('administrador', 'secretario');

// Personas (solo nombre y apellido) para listas desplegables. Se guarda en memoria.
let cachePersonas = null;
export async function personasBasico(forzar = false) {
  if (!cachePersonas || forzar) {
    cachePersonas = await q(
      sb.from('personas_basico').select('id,nombre,apellido,archivado').order('apellido').order('nombre')
    );
  }
  return cachePersonas;
}
export const invalidarPersonas = () => { cachePersonas = null; };

export const nombreCompleto = (p) => (p ? `${p.apellido}, ${p.nombre}` : '—');

export async function mapaPersonas() {
  const lista = await personasBasico();
  return Object.fromEntries(lista.map((p) => [p.id, p]));
}
