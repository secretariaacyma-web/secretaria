import { sb, q } from '../supabase.js';
import { estado, puedeEscribir, personasBasico, mapaPersonas, nombreCompleto } from '../state.js';
import { TIPOS_REUNION, ESTADOS_REUNION, REUNION_A_ACTA } from '../constantes.js';
import {
  esc, fmtFecha, fmtHora, badge, tablaHTML, encabezado, formModal, confirmar, toast, hoy, errorAmigable, abrirModal,
} from '../ui.js';

export async function render(cont, { query }) {
  const vista = cont.dataset.vista;
  const escribe = puedeEscribir();
  let filas = [];
  let personas = {};
  let actaPorReunion = {};
  let tab = 'proximas';

  async function cargar() {
    const [reu, actas, mapa] = await Promise.all([
      q(sb.from('reuniones').select('*, reunion_participantes(persona_id)').eq('archivado', false).order('fecha', { ascending: false }).order('hora', { ascending: false })),
      q(sb.from('actas').select('id,numero,reunion_id').not('reunion_id', 'is', null)),
      mapaPersonas(),
    ]);
    filas = reu;
    personas = mapa;
    actaPorReunion = Object.fromEntries(actas.map((a) => [a.reunion_id, a]));
  }

  async function campos() {
    const lista = (await personasBasico()).filter((p) => !p.archivado);
    const opts = lista.map((p) => ({ v: p.id, l: nombreCompleto(p) }));
    return [
      { name: 'tipo', label: 'Tipo de reunión', type: 'select', required: true, options: Object.entries(TIPOS_REUNION).map(([v, l]) => ({ v, l })) },
      { name: 'estado', label: 'Estado', type: 'select', required: true, options: Object.entries(ESTADOS_REUNION).map(([v, [l]]) => ({ v, l })) },
      { name: 'fecha', label: 'Fecha', type: 'date', required: true },
      { name: 'hora', label: 'Hora', type: 'time' },
      { name: 'lugar', label: 'Lugar' },
      { name: 'responsable_id', label: 'Responsable', type: 'select', options: opts },
      { name: 'temas', label: 'Temas a tratar', type: 'textarea', rows: 5, hint: 'Un tema por línea. Se usa como orden del día al convertir en acta.' },
      { name: 'participantes', label: 'Participantes', type: 'checks', options: opts },
    ];
  }

  async function guardarParticipantes(reunionId, ids) {
    await q(sb.from('reunion_participantes').delete().eq('reunion_id', reunionId));
    if (ids.length) {
      await q(sb.from('reunion_participantes').insert(ids.map((persona_id) => ({ reunion_id: reunionId, persona_id, iglesia_id: estado.perfil.iglesia_id }))));
    }
  }

  async function nueva() {
    const ok = await formModal({
      titulo: 'Nueva reunión', campos: await campos(), ancho: true,
      valores: { estado: 'programada', fecha: hoy(), tipo: 'comision' },
      guardar: async (v) => {
        const { participantes, ...datos } = v;
        const r = await q(sb.from('reuniones').insert(datos).select().single());
        await guardarParticipantes(r.id, participantes);
      },
    });
    if (ok) { toast('Reunión registrada.', 'ok'); await recargar(); }
  }

  async function editar(r) {
    const ok = await formModal({
      titulo: 'Editar reunión', campos: await campos(), ancho: true,
      valores: { ...r, hora: fmtHora(r.hora), participantes: r.reunion_participantes.map((x) => x.persona_id) },
      guardar: async (v) => {
        const { participantes, ...datos } = v;
        await q(sb.from('reuniones').update(datos).eq('id', r.id));
        await guardarParticipantes(r.id, participantes);
      },
    });
    if (ok) { toast('Cambios guardados.', 'ok'); await recargar(); }
  }

  async function cambiarEstado(r, nuevoEstado) {
    try {
      await q(sb.from('reuniones').update({ estado: nuevoEstado }).eq('id', r.id));
      toast(nuevoEstado === 'realizada' ? 'Reunión marcada como realizada.' : 'Reunión actualizada.', 'ok');
      await recargar();
    } catch (e) { toast(errorAmigable(e), 'error'); }
  }

  async function convertirEnActa(r) {
    const existente = actaPorReunion[r.id];
    if (existente) { location.hash = `#/actas/${existente.id}`; return; }
    const ok = await confirmar(
      'Se creará un borrador de acta con la fecha, el lugar, los temas y los participantes de esta reunión. Después podés completarlo y aprobarlo.',
      { textoOk: 'Crear borrador de acta', titulo: 'Convertir en acta' }
    );
    if (!ok) return;
    try {
      const acta = await q(sb.from('actas').insert({
        fecha: r.fecha, hora_inicio: r.hora, lugar: r.lugar, tipo: REUNION_A_ACTA[r.tipo] || 'otras',
        reunion_id: r.id, orden_del_dia: r.temas,
      }).select().single());
      const asistentes = r.reunion_participantes.map((x) => ({ acta_id: acta.id, persona_id: x.persona_id, iglesia_id: acta.iglesia_id }));
      if (asistentes.length) await q(sb.from('acta_asistentes').insert(asistentes));
      if (r.estado === 'programada') await sb.from('reuniones').update({ estado: 'realizada' }).eq('id', r.id);
      toast(`Borrador del acta N° ${acta.numero} creado.`, 'ok');
      location.hash = `#/actas/${acta.id}?editar=1`;
    } catch (e) { toast(errorAmigable(e), 'error'); }
  }

  async function archivar(r) {
    if (!(await confirmar('¿Archivar esta reunión? No se borra: deja de mostrarse en la agenda.', { textoOk: 'Archivar', peligro: true }))) return;
    try {
      await q(sb.from('reuniones').update({ archivado: true }).eq('id', r.id));
      toast('Reunión archivada.', 'ok');
      await recargar();
    } catch (e) { toast(errorAmigable(e), 'error'); }
  }

  function detalle(r) {
    const part = r.reunion_participantes.map((x) => nombreCompleto(personas[x.persona_id])).sort((a, b) => a.localeCompare(b, 'es'));
    const acta = actaPorReunion[r.id];
    const m = abrirModal({
      titulo: `${TIPOS_REUNION[r.tipo]} — ${fmtFecha(r.fecha)}`,
      cuerpo: `
        <div style="margin-bottom:12px">${badge(ESTADOS_REUNION[r.estado])} ${acta ? `<a href="#/actas/${acta.id}" class="badge verde" style="text-decoration:none">Acta N° ${acta.numero}</a>` : ''}</div>
        <p style="margin:4px 0"><b>Hora:</b> ${esc(fmtHora(r.hora) || '—')} &nbsp; <b>Lugar:</b> ${esc(r.lugar || '—')}</p>
        <p style="margin:4px 0"><b>Responsable:</b> ${esc(r.responsable_id ? nombreCompleto(personas[r.responsable_id]) : '—')}</p>
        <h3 style="font-size:14px;margin:14px 0 4px">Temas a tratar</h3>
        <div style="white-space:pre-wrap">${esc(r.temas || '—')}</div>
        <h3 style="font-size:14px;margin:14px 0 4px">Participantes (${part.length})</h3>
        <div>${part.length ? part.map(esc).join(' · ') : '—'}</div>`,
      pie: escribe ? `
        ${r.estado === 'programada' ? '<button class="btn sec" data-real>Marcar realizada</button>' : ''}
        ${r.estado !== 'cancelada' ? `<button class="btn ${acta ? 'sec' : 'verde'}" data-acta>${acta ? 'Ver acta' : 'Convertir en Acta'}</button>` : ''}
        <button class="btn sec" data-ed>Editar</button>` : '',
    });
    m.el.querySelector('[data-real]')?.addEventListener('click', () => { m.cerrar(); cambiarEstado(r, 'realizada'); });
    m.el.querySelector('[data-acta]')?.addEventListener('click', () => { m.cerrar(); convertirEnActa(r); });
    m.el.querySelector('[data-ed]')?.addEventListener('click', () => { m.cerrar(); editar(r); });
  }

  function pintar() {
    if (cont.dataset.vista !== vista) return; // ya se cambió de sección
    const h = hoy();
    const proximas = filas.filter((r) => r.estado === 'programada' && r.fecha >= h).sort((a, b) => `${a.fecha}${a.hora || ''}`.localeCompare(`${b.fecha}${b.hora || ''}`));
    const resto = filas.filter((r) => !(r.estado === 'programada' && r.fecha >= h));
    const lista = tab === 'proximas' ? proximas : tab === 'anteriores' ? resto : filas;
    document.getElementById('tabs').innerHTML = `
      <button class="${tab === 'proximas' ? 'activo' : ''}" data-t="proximas">Próximas (${proximas.length})</button>
      <button class="${tab === 'anteriores' ? 'activo' : ''}" data-t="anteriores">Anteriores (${resto.length})</button>
      <button class="${tab === 'todas' ? 'activo' : ''}" data-t="todas">Todas (${filas.length})</button>`;
    document.querySelectorAll('#tabs button').forEach((b) => { b.onclick = () => { tab = b.dataset.t; pintar(); }; });

    document.getElementById('tabla').innerHTML = tablaHTML(
      [
        { h: 'Fecha', f: (r) => `<b>${fmtFecha(r.fecha)}</b><div class="s" style="color:var(--texto-2);font-size:12px">${esc(fmtHora(r.hora))}</div>` },
        { h: 'Tipo', f: (r) => esc(TIPOS_REUNION[r.tipo]) },
        { h: 'Lugar', f: (r) => esc(r.lugar || '—') },
        { h: 'Responsable', f: (r) => esc(r.responsable_id ? nombreCompleto(personas[r.responsable_id]) : '—') },
        {
          h: 'Estado',
          f: (r) => badge(ESTADOS_REUNION[r.estado])
            + (r.estado === 'programada' && r.fecha < h ? ' <span class="badge rojo">Para cerrar</span>' : '')
            + (actaPorReunion[r.id] ? ` <span class="badge verde">Acta N° ${actaPorReunion[r.id].numero}</span>` : ''),
        },
        ...(escribe ? [{
          h: '', cls: 'acc',
          f: (r) => `${r.estado !== 'cancelada' && !actaPorReunion[r.id] ? `<button class="btn chico verde" data-acta="${r.id}">Convertir en Acta</button> ` : ''}
                     <button class="btn chico link" data-ar="${r.id}" title="Archivar">🗄</button>`,
        }] : []),
      ],
      lista,
      { clickAttr: true, vacio: tab === 'proximas' ? 'No hay reuniones próximas. Programá una con el botón "Nueva reunión".' : 'No hay reuniones para mostrar.' }
    );
    const buscar = (id) => filas.find((r) => r.id === id);
    document.querySelectorAll('#tabla tr.click').forEach((tr) => { tr.onclick = () => detalle(buscar(tr.dataset.id)); });
    document.querySelectorAll('[data-acta]').forEach((b) => { b.onclick = (ev) => { ev.stopPropagation(); convertirEnActa(buscar(b.dataset.acta)); }; });
    document.querySelectorAll('[data-ar]').forEach((b) => { b.onclick = (ev) => { ev.stopPropagation(); archivar(buscar(b.dataset.ar)); }; });
  }

  async function recargar() { await cargar(); pintar(); }

  cont.innerHTML = `
    ${encabezado('Reuniones', 'Agenda de reuniones. Al terminar una, convertila en acta con un clic.',
      escribe ? '<button class="btn" id="b-nueva">+ Nueva reunión</button>' : '')}
    <div class="tabs" id="tabs"></div>
    <div class="tarjeta"><div class="cuerpo sin-pad" id="tabla"></div></div>`;
  await cargar();
  pintar();
  document.getElementById('b-nueva')?.addEventListener('click', nueva);
  if (query?.nuevo && escribe) nueva();
}
