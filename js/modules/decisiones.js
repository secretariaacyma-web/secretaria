import { sb, q } from '../supabase.js';
import { puedeEscribir, puede, personasBasico, mapaPersonas, nombreCompleto } from '../state.js';
import { ESTADOS_DECISION } from '../constantes.js';
import {
  esc, fmtFecha, badge, tablaHTML, encabezado, formModal, confirmar, toast, hoy, errorAmigable, normalizar, debounce,
} from '../ui.js';

const ABIERTAS = ['pendiente', 'en_proceso'];

export const vencida = (d) => ABIERTAS.includes(d.estado) && d.fecha_limite && d.fecha_limite < hoy();

// Formulario compartido (también se usa desde el acta). Devuelve true si guardó.
export async function abrirFormDecision({ decision = null, acta_id = null, actas = null } = {}) {
  const lista = (await personasBasico()).filter((p) => !p.archivado);
  const listaActas = actas || await q(sb.from('actas').select('id,numero,fecha').order('numero', { ascending: false }));
  const campos = [
    { name: 'descripcion', label: 'Decisión', type: 'textarea', required: true, rows: 3, hint: 'Por ejemplo: "Realizar copias de las llaves de la puerta principal."' },
    { name: 'fecha', label: 'Fecha de la decisión', type: 'date', required: true },
    { name: 'acta_id', label: 'Acta relacionada', type: 'select', options: listaActas.map((a) => ({ v: a.id, l: `N° ${a.numero} — ${fmtFecha(a.fecha)}` })) },
    { name: 'responsable_id', label: 'Responsable', type: 'select', options: lista.map((p) => ({ v: p.id, l: nombreCompleto(p) })) },
    { name: 'fecha_limite', label: 'Fecha límite', type: 'date' },
    { name: 'estado', label: 'Estado', type: 'select', required: true, options: Object.entries(ESTADOS_DECISION).map(([v, [l]]) => ({ v, l })) },
    { name: 'observaciones', label: 'Observaciones', type: 'textarea', rows: 2 },
  ];
  const ok = await formModal({
    titulo: decision ? 'Editar decisión' : 'Nueva decisión',
    campos,
    valores: decision || { fecha: hoy(), estado: 'pendiente', acta_id },
    guardar: async (v) => {
      if (decision) await q(sb.from('decisiones').update(v).eq('id', decision.id));
      else await q(sb.from('decisiones').insert(v));
    },
  });
  if (ok) toast('Decisión guardada.', 'ok');
  return !!ok;
}

export async function render(cont, { query }) {
  const vista = cont.dataset.vista;
  const escribe = puedeEscribir();
  const cambiaEstado = escribe || puede('comision');
  let filas = [];
  let personas = {};
  let actas = [];
  let verArchivadas = false;

  async function cargar() {
    [filas, personas, actas] = await Promise.all([
      q(sb.from('decisiones').select('*').order('fecha_limite', { ascending: true, nullsFirst: false }).order('fecha', { ascending: false })),
      mapaPersonas(),
      q(sb.from('actas').select('id,numero,fecha').order('numero', { ascending: false })),
    ]);
  }

  const actaNum = (id) => actas.find((a) => a.id === id)?.numero;

  function filtradas() {
    const txt = normalizar(document.getElementById('f-txt').value);
    const est = document.getElementById('f-estado').value;
    const resp = document.getElementById('f-resp').value;
    return filas
      .filter((d) => verArchivadas || !d.archivado)
      .filter((d) => {
        if (!est) return true;
        if (est === 'abiertas') return ABIERTAS.includes(d.estado);
        if (est === 'vencidas') return vencida(d);
        return d.estado === est;
      })
      .filter((d) => !resp || d.responsable_id === resp)
      .filter((d) => !txt || normalizar(`${d.descripcion} ${d.observaciones || ''}`).includes(txt));
  }

  function pintar() {
    if (cont.dataset.vista !== vista) return; // ya se cambió de sección
    const lista = filtradas();
    document.getElementById('cuenta').textContent = `${lista.length} ${lista.length === 1 ? 'decisión' : 'decisiones'}`;
    document.getElementById('tabla').innerHTML = tablaHTML(
      [
        { h: 'Decisión', f: (d) => `<div style="max-width:380px"><b>${esc(d.descripcion)}</b>${d.observaciones ? `<div style="color:var(--texto-2);font-size:13px">${esc(d.observaciones)}</div>` : ''}</div>` },
        { h: 'Responsable', f: (d) => esc(d.responsable_id ? nombreCompleto(personas[d.responsable_id]) : '—') },
        { h: 'Fecha límite', f: (d) => `${fmtFecha(d.fecha_limite)}${vencida(d) ? ' <span class="badge rojo">Vencida</span>' : ''}` },
        { h: 'Acta', f: (d) => (d.acta_id && actaNum(d.acta_id) ? `<a href="#/actas/${d.acta_id}">N° ${actaNum(d.acta_id)}</a>` : '—') },
        {
          h: 'Estado',
          f: (d) => (cambiaestadoPermitido(d)
            ? `<select data-est="${d.id}" style="padding:5px 8px;border:1px solid var(--borde);border-radius:6px">
                ${Object.entries(ESTADOS_DECISION).map(([v, [l]]) => `<option value="${v}" ${v === d.estado ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`
            : badge(ESTADOS_DECISION[d.estado])),
        },
        ...(escribe ? [{
          h: '', cls: 'acc',
          f: (d) => `<button class="btn chico sec" data-ed="${d.id}">Editar</button>
                     <button class="btn chico link" data-ar="${d.id}" title="${d.archivado ? 'Restaurar' : 'Archivar'}">${d.archivado ? '↩' : '🗄'}</button>`,
        }] : []),
      ],
      lista,
      { clsFila: (d) => (d.archivado ? 'archivado' : ''), vacio: 'No hay decisiones que coincidan con los filtros.' }
    );
    const buscar = (id) => filas.find((d) => d.id === id);
    document.querySelectorAll('[data-est]').forEach((s) => {
      s.onchange = async () => {
        try {
          await q(sb.from('decisiones').update({ estado: s.value }).eq('id', s.dataset.est));
          toast('Estado actualizado.', 'ok');
          await recargar();
        } catch (e) { toast(errorAmigable(e), 'error'); await recargar(); }
      };
    });
    document.querySelectorAll('[data-ed]').forEach((b) => { b.onclick = async () => { if (await abrirFormDecision({ decision: buscar(b.dataset.ed), actas })) await recargar(); }; });
    document.querySelectorAll('[data-ar]').forEach((b) => {
      b.onclick = async () => {
        const d = buscar(b.dataset.ar);
        if (!(await confirmar(d.archivado ? '¿Restaurar esta decisión?' : '¿Archivar esta decisión? No se borra: deja de mostrarse en el listado.', { textoOk: d.archivado ? 'Restaurar' : 'Archivar', peligro: !d.archivado }))) return;
        try { await q(sb.from('decisiones').update({ archivado: !d.archivado }).eq('id', d.id)); await recargar(); } catch (e) { toast(errorAmigable(e), 'error'); }
      };
    });
  }
  // La comisión puede cambiar el estado; consulta y pastor solo leen.
  const cambiaestadoPermitido = () => cambiaEstado;

  async function recargar() { await cargar(); pintar(); }

  cont.innerHTML = `
    ${encabezado('Decisiones y seguimiento', 'Cada decisión tomada, con responsable, fecha límite y estado.',
      escribe ? '<button class="btn" id="b-nueva">+ Nueva decisión</button>' : '')}
    <div class="filtros">
      <input type="search" id="f-txt" placeholder="Buscar en las decisiones…">
      <select id="f-estado">
        <option value="abiertas">Pendientes y en proceso</option>
        <option value="vencidas">Vencidas</option>
        <option value="">Todas</option>
        ${Object.entries(ESTADOS_DECISION).map(([v, [l]]) => `<option value="${v}">${esc(l)}</option>`).join('')}
      </select>
      <select id="f-resp"><option value="">Todos los responsables</option></select>
      <label style="display:flex;align-items:center;gap:6px;font-size:14px"><input type="checkbox" id="f-arch"> Ver archivadas</label>
    </div>
    <div class="tarjeta">
      <div class="enc"><h2 id="cuenta"></h2></div>
      <div class="cuerpo sin-pad" id="tabla"></div>
    </div>`;
  await cargar();
  const usados = [...new Set(filas.map((d) => d.responsable_id).filter(Boolean))]
    .sort((a, b) => nombreCompleto(personas[a]).localeCompare(nombreCompleto(personas[b]), 'es'));
  document.getElementById('f-resp').innerHTML += usados.map((id) => `<option value="${id}">${esc(nombreCompleto(personas[id]))}</option>`).join('');
  const sel = document.getElementById('f-estado');
  if (query?.estado) sel.value = query.estado;
  if (query?.q) { document.getElementById('f-txt').value = query.q; document.getElementById('f-arch').checked = verArchivadas = true; }
  pintar();
  document.getElementById('f-txt').addEventListener('input', debounce(pintar, 150));
  sel.onchange = pintar;
  document.getElementById('f-resp').onchange = pintar;
  document.getElementById('f-arch').onchange = (e) => { verArchivadas = e.target.checked; pintar(); };
  const nueva = async () => { if (await abrirFormDecision({ actas })) await recargar(); };
  document.getElementById('b-nueva')?.addEventListener('click', nueva);
  if (query?.nuevo && escribe) nueva();
}
