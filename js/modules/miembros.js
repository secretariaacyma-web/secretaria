import { sb, q } from '../supabase.js';
import { puedeEscribir } from '../state.js';
import { invalidarPersonas } from '../state.js';
import { ESTADOS_MIEMBRO } from '../constantes.js';
import {
  esc, fmtFecha, fmtFechaHora, badge, tablaHTML, encabezado, formModal, confirmar, toast, abrirModal,
  descargarCSV, normalizar, debounce, hoy, errorAmigable,
} from '../ui.js';

const CAMPOS = (miembro) => [
  { name: 'nombre', label: 'Nombre', required: true },
  { name: 'apellido', label: 'Apellido', required: true },
  { name: 'dni', label: 'DNI', hint: 'Solo números, sin puntos.' },
  { name: 'fecha_nacimiento', label: 'Fecha de nacimiento', type: 'date' },
  { name: 'telefono', label: 'Teléfono', type: 'tel' },
  { name: 'email', label: 'Email', type: 'email' },
  { name: 'direccion', label: 'Dirección', full: true },
  { name: 'fecha_ingreso', label: 'Fecha de ingreso', type: 'date' },
  { name: 'forma_ingreso', label: 'Forma de ingreso', list: ['Bautismo', 'Profesión de fe', 'Traslado', 'Restitución'], hint: 'Por ejemplo: bautismo, traslado…' },
  {
    name: 'estado', label: 'Estado', type: 'select', required: true,
    options: Object.entries(ESTADOS_MIEMBRO).map(([v, [l]]) => ({ v, l })),
  },
  { name: 'observaciones', label: 'Observaciones', type: 'textarea' },
];

export async function render(cont, { query }) {
  const vista = cont.dataset.vista;
  const escribe = puedeEscribir();
  let filas = [];
  let verArchivados = false;

  async function cargar() {
    filas = await q(
      sb.from('miembros').select('*, persona:personas(*)').order('creado_en', { ascending: false })
    );
  }

  function filtradas() {
    const txt = normalizar(document.getElementById('f-txt').value);
    const est = document.getElementById('f-estado').value;
    return filas
      .filter((m) => verArchivados || !m.archivado)
      .filter((m) => !est || m.estado === est)
      .filter((m) => {
        if (!txt) return true;
        const p = m.persona;
        return normalizar(`${p.nombre} ${p.apellido} ${p.apellido} ${p.nombre} ${p.dni || ''}`).includes(txt);
      })
      .sort((a, b) => `${a.persona.apellido} ${a.persona.nombre}`.localeCompare(`${b.persona.apellido} ${b.persona.nombre}`, 'es'));
  }

  function pintarTabla() {
    if (cont.dataset.vista !== vista) return; // ya se cambió de sección
    const lista = filtradas();
    document.getElementById('cuenta').textContent = `${lista.length} ${lista.length === 1 ? 'persona' : 'personas'}`;
    document.getElementById('tabla').innerHTML = tablaHTML(
      [
        { h: 'Apellido y nombre', f: (m) => `<b>${esc(m.persona.apellido)}</b>, ${esc(m.persona.nombre)}` },
        { h: 'DNI', f: (m) => esc(m.persona.dni || '—') },
        { h: 'Teléfono', f: (m) => esc(m.persona.telefono || '—') },
        { h: 'Estado', f: (m) => badge(ESTADOS_MIEMBRO[m.estado]) + (m.archivado ? ' <span class="badge">Archivado</span>' : '') },
        { h: 'Ingreso', f: (m) => fmtFecha(m.fecha_ingreso) },
      ],
      lista,
      { clickAttr: true, clsFila: (m) => (m.archivado ? 'archivado' : ''), vacio: 'No hay miembros que coincidan con la búsqueda.' }
    );
    document.querySelectorAll('#tabla tr.click').forEach((tr) => {
      tr.onclick = () => abrirFicha(filas.find((m) => m.id === tr.dataset.id));
    });
  }

  function valoresDe(m) {
    return { ...m.persona, ...{ estado: m.estado, fecha_ingreso: m.fecha_ingreso, forma_ingreso: m.forma_ingreso }, observaciones: m.persona.observaciones };
  }

  async function nuevo() {
    const ok = await formModal({
      titulo: 'Nuevo miembro',
      campos: CAMPOS(),
      valores: { estado: 'activo', fecha_ingreso: hoy() },
      guardar: async (v) => {
        const persona = await q(
          sb.from('personas').insert({
            nombre: v.nombre, apellido: v.apellido, dni: v.dni, fecha_nacimiento: v.fecha_nacimiento,
            telefono: v.telefono, email: v.email, direccion: v.direccion, observaciones: v.observaciones,
          }).select().single()
        );
        try {
          await q(sb.from('miembros').insert({
            persona_id: persona.id, estado: v.estado, fecha_ingreso: v.fecha_ingreso, forma_ingreso: v.forma_ingreso,
          }));
        } catch (e) {
          // Si falla el alta como miembro, la persona queda archivada para no dejar datos sueltos.
          await sb.from('personas').update({ archivado: true }).eq('id', persona.id);
          throw e;
        }
      },
    });
    if (ok) { invalidarPersonas(); toast('Miembro registrado.', 'ok'); await recargar(); }
  }

  async function editar(m) {
    const ok = await formModal({
      titulo: 'Editar miembro',
      campos: CAMPOS(),
      valores: valoresDe(m),
      guardar: async (v) => {
        await q(sb.from('personas').update({
          nombre: v.nombre, apellido: v.apellido, dni: v.dni, fecha_nacimiento: v.fecha_nacimiento,
          telefono: v.telefono, email: v.email, direccion: v.direccion, observaciones: v.observaciones,
        }).eq('id', m.persona_id));
        await q(sb.from('miembros').update({
          estado: v.estado, fecha_ingreso: v.fecha_ingreso, forma_ingreso: v.forma_ingreso,
        }).eq('id', m.id));
      },
    });
    if (ok) { invalidarPersonas(); toast('Datos actualizados.', 'ok'); await recargar(); }
  }

  async function archivar(m, valor) {
    const ok = await confirmar(
      valor ? `¿Archivar a ${m.persona.nombre} ${m.persona.apellido}? No se borra: deja de aparecer en el listado y podés restaurarlo.` : `¿Restaurar a ${m.persona.nombre} ${m.persona.apellido}?`,
      { textoOk: valor ? 'Archivar' : 'Restaurar', peligro: valor }
    );
    if (!ok) return;
    try {
      await q(sb.from('miembros').update({ archivado: valor }).eq('id', m.id));
      await q(sb.from('personas').update({ archivado: valor }).eq('id', m.persona_id));
      invalidarPersonas();
      toast(valor ? 'Miembro archivado.' : 'Miembro restaurado.', 'ok');
      await recargar();
    } catch (e) { toast(errorAmigable(e), 'error'); }
  }

  async function historial(m) {
    const ids = [m.id, m.persona_id];
    const { data, error } = await sb.from('audit_log').select('*').in('registro_id', ids).order('fecha', { ascending: false }).limit(100);
    if (error) return toast(errorAmigable(error), 'error');
    const filasH = (data || []).map((a) => `
      <tr><td>${fmtFechaHora(a.fecha)}</td><td>${esc(a.tabla === 'miembros' ? 'Miembro' : 'Datos personales')}</td>
      <td>${a.accion === 'INSERT' ? 'Alta' : a.accion === 'UPDATE' ? 'Modificación' : 'Baja'}</td>
      <td>${esc((a.cambios || []).join(', ') || '—')}</td></tr>`).join('');
    abrirModal({
      titulo: `Historial — ${m.persona.apellido}, ${m.persona.nombre}`, ancho: true,
      cuerpo: filasH
        ? `<div class="tabla-wrap"><table class="tabla"><thead><tr><th>Fecha</th><th>Registro</th><th>Acción</th><th>Campos modificados</th></tr></thead><tbody>${filasH}</tbody></table></div>`
        : '<div class="vacio">Todavía no hay movimientos registrados.</div>',
    });
  }

  function abrirFicha(m) {
    const p = m.persona;
    const fila = (l, v) => `<tr><td style="color:var(--texto-2);width:40%">${l}</td><td>${v ? esc(v) : '—'}</td></tr>`;
    const modal = abrirModal({
      titulo: `${p.nombre} ${p.apellido}`,
      cuerpo: `
        <div style="margin-bottom:10px">${badge(ESTADOS_MIEMBRO[m.estado])} ${m.archivado ? '<span class="badge">Archivado</span>' : ''}</div>
        <table class="tabla"><tbody>
          ${fila('DNI', p.dni)}${fila('Fecha de nacimiento', p.fecha_nacimiento ? fmtFecha(p.fecha_nacimiento) : '')}
          ${fila('Teléfono', p.telefono)}${fila('Email', p.email)}${fila('Dirección', p.direccion)}
          ${fila('Fecha de ingreso', m.fecha_ingreso ? fmtFecha(m.fecha_ingreso) : '')}${fila('Forma de ingreso', m.forma_ingreso)}
          ${fila('Observaciones', p.observaciones)}
        </tbody></table>`,
      pie: `
        <button class="btn sec" data-h>Ver historial</button>
        ${escribe ? `<button class="btn rojo" data-a>${m.archivado ? 'Restaurar' : 'Archivar'}</button><button class="btn" data-e>Editar</button>` : ''}`,
    });
    modal.el.querySelector('[data-h]').onclick = () => historial(m);
    modal.el.querySelector('[data-e]')?.addEventListener('click', () => { modal.cerrar(); editar(m); });
    modal.el.querySelector('[data-a]')?.addEventListener('click', () => { modal.cerrar(); archivar(m, !m.archivado); });
  }

  function exportar() {
    const lista = filtradas();
    descargarCSV(
      `miembros-${hoy()}.csv`,
      ['Apellido', 'Nombre', 'DNI', 'Fecha de nacimiento', 'Teléfono', 'Email', 'Dirección', 'Estado', 'Fecha de ingreso', 'Forma de ingreso', 'Observaciones'],
      lista.map((m) => [
        m.persona.apellido, m.persona.nombre, m.persona.dni, fmtFecha(m.persona.fecha_nacimiento), m.persona.telefono,
        m.persona.email, m.persona.direccion, ESTADOS_MIEMBRO[m.estado][0], fmtFecha(m.fecha_ingreso), m.forma_ingreso, m.persona.observaciones,
      ])
    );
  }

  async function recargar() { await cargar(); pintarTabla(); }

  cont.innerHTML = `
    ${encabezado('Miembros', 'Registro de miembros de la iglesia. Información privada.',
      `<button class="btn sec" id="b-exp">⬇ Exportar listado</button>${escribe ? '<button class="btn" id="b-nuevo">+ Nuevo miembro</button>' : ''}`)}
    <div class="filtros">
      <input type="search" id="f-txt" placeholder="Buscar por nombre, apellido o DNI…">
      <select id="f-estado"><option value="">Todos los estados</option>
        ${Object.entries(ESTADOS_MIEMBRO).map(([v, [l]]) => `<option value="${v}">${esc(l)}</option>`).join('')}</select>
      <label style="display:flex;align-items:center;gap:6px;font-size:14px"><input type="checkbox" id="f-arch"> Ver archivados</label>
    </div>
    <div class="tarjeta">
      <div class="enc"><h2 id="cuenta"></h2></div>
      <div class="cuerpo sin-pad" id="tabla"></div>
    </div>`;

  await cargar();
  pintarTabla();
  document.getElementById('f-txt').addEventListener('input', debounce(pintarTabla, 150));
  document.getElementById('f-estado').onchange = pintarTabla;
  document.getElementById('f-arch').onchange = (e) => { verArchivados = e.target.checked; pintarTabla(); };
  document.getElementById('b-exp').onclick = exportar;
  document.getElementById('b-nuevo')?.addEventListener('click', nuevo);
  if (query?.nuevo && escribe) nuevo();
}
