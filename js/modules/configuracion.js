import { sb, q } from '../supabase.js';
import { estado, puede } from '../state.js';
import { ROLES } from '../constantes.js';
import { esc, fmtFechaHora, encabezado, formModal, toast, errorAmigable, descargar, hoy, tablaHTML } from '../ui.js';

const TABLAS_RESPALDO = [
  'iglesias', 'perfiles', 'personas', 'miembros', 'autoridades', 'reuniones', 'reunion_participantes',
  'actas', 'acta_asistentes', 'acta_firmas', 'decisiones', 'archivos_drive', 'actividades_fijas', 'eventos', 'notas', 'inventario_bienes', 'inventario_prestamos', 'inventario_movimientos', 'audit_log',
];
const OPCIONALES = ['archivos_drive', 'actividades_fijas', 'eventos', 'notas', 'inventario_bienes', 'inventario_prestamos', 'inventario_movimientos']; // tablas de migraciones: si todavía no existen, se omiten
const CLAVE_RESPALDO = 'secretaria_ultimo_respaldo';

async function leerTodo(tabla) {
  const filas = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await sb.from(tabla).select('*').range(desde, desde + 999);
    if (error) throw error;
    filas.push(...data);
    if (data.length < 1000) break;
  }
  return filas;
}

export async function render(cont) {
  const esAdmin = puede('administrador');
  const verRespaldo = puede('administrador', 'secretario');
  let ultimoRespaldo = null;
  try { ultimoRespaldo = localStorage.getItem(CLAVE_RESPALDO); } catch { /* sin almacenamiento */ }
  const diasDesde = ultimoRespaldo ? Math.floor((Date.now() - new Date(ultimoRespaldo).getTime()) / 86400000) : null;

  cont.innerHTML = `
    ${encabezado('Configuración')}

    <div class="tarjeta">
      <div class="enc"><h2>Mi cuenta</h2></div>
      <div class="cuerpo">
        <p style="margin:0 0 4px"><b>${esc(estado.perfil.nombre || '')}</b></p>
        <p style="margin:0 0 12px;color:var(--texto-2)">${esc(estado.perfil.email || estado.user?.email || '')} · ${esc(ROLES[estado.perfil.rol])}</p>
        <button class="btn sec" id="b-pass">Cambiar contraseña</button>
      </div>
    </div>

    ${esAdmin ? `
    <div class="tarjeta mt">
      <div class="enc"><h2>Datos de la iglesia</h2></div>
      <div class="cuerpo"><p style="margin:0 0 10px">${esc(estado.iglesia?.nombre || '')}</p><button class="btn sec" id="b-iglesia">Cambiar nombre</button></div>
    </div>
    <div class="tarjeta mt">
      <div class="enc"><h2>Usuarios y permisos</h2></div>
      <div class="cuerpo sin-pad" id="usuarios"><div class="cargando">Cargando…</div></div>
    </div>` : ''}

    ${verRespaldo ? `
    <div class="tarjeta mt">
      <div class="enc"><h2>Copia de seguridad</h2></div>
      <div class="cuerpo">
        ${diasDesde === null || diasDesde > 30
          ? `<div class="aviso warn">${diasDesde === null ? 'Todavía no hiciste ninguna copia desde este dispositivo.' : `Tu última copia desde este dispositivo fue hace ${diasDesde} días.`} Te recomendamos hacer una cada mes.</div>`
          : `<div class="aviso ok">Última copia desde este dispositivo: ${fmtFechaHora(ultimoRespaldo)}.</div>`}
        <p style="margin:0 0 12px;color:var(--texto-2)">Descarga un archivo con todos los datos del sistema. Guardalo en el Drive de la iglesia, en una carpeta de copias de seguridad.</p>
        <button class="btn" id="b-resp">⬇ Exportar todo (copia completa)</button>
      </div>
    </div>
    <div class="tarjeta mt">
      <div class="enc"><h2>Actividad reciente</h2></div>
      <div class="cuerpo sin-pad" id="actividad"><div class="cargando">Cargando…</div></div>
    </div>` : ''}`;

  document.getElementById('b-pass').onclick = () => formModal({
    titulo: 'Cambiar contraseña', textoGuardar: 'Guardar contraseña',
    campos: [
      { name: 'password', label: 'Contraseña nueva (mínimo 8 caracteres)', type: 'password', required: true, full: true },
      { name: 'repetir', label: 'Repetir contraseña', type: 'password', required: true, full: true },
    ],
    guardar: async (v) => {
      if (v.password.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres.');
      if (v.password !== v.repetir) throw new Error('Las contraseñas no coinciden.');
      const { error } = await sb.auth.updateUser({ password: v.password });
      if (error) throw error;
      toast('Contraseña actualizada.', 'ok');
    },
  });

  if (esAdmin) {
    document.getElementById('b-iglesia').onclick = async () => {
      const ok = await formModal({
        titulo: 'Nombre de la iglesia', campos: [{ name: 'nombre', label: 'Nombre', required: true, full: true }],
        valores: { nombre: estado.iglesia.nombre },
        guardar: async (v) => { await q(sb.from('iglesias').update({ nombre: v.nombre }).eq('id', estado.iglesia.id)); estado.iglesia.nombre = v.nombre; },
      });
      if (ok) { toast('Nombre actualizado. Se verá en todo el sistema al recargar.', 'ok'); await render(cont); }
    };
    await pintarUsuarios();
  }

  if (verRespaldo) {
    document.getElementById('b-resp').onclick = exportarTodo;
    await pintarActividad();
  }

  async function pintarUsuarios() {
    const box = document.getElementById('usuarios');
    if (!box) return;
    try {
      const usuarios = await q(sb.from('perfiles').select('*').order('creado_en'));
      box.innerHTML = tablaHTML(
        [
          { h: 'Usuario', f: (u) => `<b>${esc(u.nombre || '—')}</b><div style="color:var(--texto-2);font-size:12px">${esc(u.email || '')}</div>` },
          {
            h: 'Rol',
            f: (u) => `<select data-rol="${u.id}" ${u.id === estado.user.id ? 'disabled' : ''} style="padding:5px 8px;border:1px solid var(--borde);border-radius:6px">
              ${Object.entries(ROLES).map(([v, l]) => `<option value="${v}" ${v === u.rol ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`,
          },
          {
            h: 'Acceso',
            f: (u) => `<label style="display:flex;gap:6px;align-items:center"><input type="checkbox" data-act="${u.id}" ${u.activo ? 'checked' : ''} ${u.id === estado.user.id ? 'disabled' : ''}> ${u.activo ? 'Activo' : '<span class="badge naranja">Pendiente</span>'}</label>`,
          },
        ],
        usuarios
      );
      box.querySelectorAll('[data-rol]').forEach((s) => { s.onchange = () => actualizar(s.dataset.rol, { rol: s.value }); });
      box.querySelectorAll('[data-act]').forEach((c) => { c.onchange = () => actualizar(c.dataset.act, { activo: c.checked }); });
    } catch (e) { box.innerHTML = `<div class="form-error" style="margin:14px">${esc(errorAmigable(e))}</div>`; }
  }

  async function actualizar(id, cambios) {
    try {
      await q(sb.from('perfiles').update(cambios).eq('id', id));
      toast('Usuario actualizado.', 'ok');
    } catch (e) { toast(errorAmigable(e), 'error'); }
    await pintarUsuarios();
  }

  async function pintarActividad() {
    const box = document.getElementById('actividad');
    if (!box) return;
    try {
      const data = await q(sb.from('audit_log').select('*').order('fecha', { ascending: false }).limit(40));
      const ids = [...new Set(data.map((a) => a.usuario_id).filter(Boolean))];
      const perf = ids.length ? await q(sb.from('perfiles').select('id,nombre,email').in('id', ids)) : [];
      const nom = Object.fromEntries(perf.map((p) => [p.id, p.nombre || p.email]));
      const tablaNom = { personas: 'Persona', miembros: 'Miembro', autoridades: 'Autoridad', reuniones: 'Reunión', actas: 'Acta', decisiones: 'Decisión', eventos: 'Evento', actividades_fijas: 'Actividad fija', notas: 'Nota', inventario_bienes: 'Bien de inventario', inventario_prestamos: 'Préstamo de inventario' };
      const accion = { INSERT: 'Alta', UPDATE: 'Modificación', DELETE: 'Baja' };
      box.innerHTML = tablaHTML(
        [
          { h: 'Fecha', f: (a) => fmtFechaHora(a.fecha) },
          { h: 'Usuario', f: (a) => esc(nom[a.usuario_id] || '—') },
          { h: 'Qué', f: (a) => `${esc(tablaNom[a.tabla] || a.tabla)} — ${accion[a.accion]}${a.cambios?.length ? ` <span style="color:var(--texto-2)">(${esc(a.cambios.join(', '))})</span>` : ''}` },
        ],
        data,
        { vacio: 'Todavía no hay actividad registrada.' }
      );
    } catch (e) { box.innerHTML = `<div class="form-error" style="margin:14px">${esc(errorAmigable(e))}</div>`; }
  }

  async function exportarTodo() {
    const btn = document.getElementById('b-resp');
    btn.disabled = true;
    btn.textContent = 'Preparando copia…';
    try {
      const datos = {};
      for (const t of TABLAS_RESPALDO) {
        try { datos[t] = await leerTodo(t); } catch (e) { if (!OPCIONALES.includes(t)) throw e; }
      }
      const paquete = {
        sistema: 'Secretaría de iglesia', version_esquema: 1, generado: new Date().toISOString(),
        generado_por: estado.perfil.email, tablas: datos,
      };
      descargar(`secretaria-respaldo-${hoy()}.json`, JSON.stringify(paquete, null, 2), 'application/json');
      try { localStorage.setItem(CLAVE_RESPALDO, new Date().toISOString()); } catch { /* sin almacenamiento */ }
      toast('Copia descargada. Guardala en el Drive de la iglesia.', 'ok');
      await render(cont);
    } catch (e) {
      toast(errorAmigable(e), 'error');
      btn.disabled = false;
      btn.textContent = '⬇ Exportar todo (copia completa)';
    }
  }
}
