// Calendario: eventos, actividades fijas semanales (cultos, jóvenes, oración) y reuniones.
import { sb, q } from '../supabase.js';
import { puedeEscribir } from '../state.js';
import { CATEGORIAS_EVENTO, DIAS_SEMANA, TIPOS_REUNION } from '../constantes.js';
import {
  esc, fmtHora, fmtFechaLarga, encabezado, formModal, confirmar, toast, hoy, errorAmigable, abrirModal,
} from '../ui.js';

// ------------------------------------------------------------ Fechas
const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const aFecha = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const sumarDias = (s, n) => { const d = aFecha(s); d.setDate(d.getDate() + n); return ymd(d); };
const CAB_DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

const colorDe = (cat) => (CATEGORIAS_EVENTO[cat] || CATEGORIAS_EVENTO.otro)[1];
const nombreCat = (cat) => (CATEGORIAS_EVENTO[cat] || CATEGORIAS_EVENTO.otro)[0];

// ------------------------------------------------------------ Datos
const deEvento = (e) => ({
  origen: 'evento', fecha: e.fecha, hora: fmtHora(e.hora), hora_fin: fmtHora(e.hora_fin), titulo: e.titulo,
  categoria: e.categoria, lugar: e.lugar, descripcion: e.descripcion, privado: e.privado,
  cancelado: e.estado === 'cancelado', fila: e,
});
const deFija = (f, fecha) => ({
  origen: 'fija', fecha, hora: fmtHora(f.hora), hora_fin: fmtHora(f.hora_fin), titulo: f.titulo,
  categoria: f.categoria, lugar: f.lugar, descripcion: null, privado: false, cancelado: false, fija: f,
});
const deReunion = (r) => ({
  origen: 'reunion', fecha: r.fecha, hora: fmtHora(r.hora), hora_fin: '', titulo: `Reunión ${TIPOS_REUNION[r.tipo] ? TIPOS_REUNION[r.tipo].toLowerCase() : ''}`.trim(),
  categoria: 'comision', lugar: r.lugar, descripcion: r.temas, privado: false, cancelado: false, fila: r,
});

// Todos los eventos entre dos fechas (inclusive): eventos cargados + actividades fijas
// (salvo que una fecha tenga reemplazo) + reuniones programadas.
export async function eventosEntre(desde, hasta) {
  const [fijas, evs, reus] = await Promise.all([
    q(sb.from('actividades_fijas').select('*').eq('archivado', false).eq('activa', true)),
    q(sb.from('eventos').select('*').eq('archivado', false).gte('fecha', desde).lte('fecha', hasta)),
    q(sb.from('reuniones').select('id,tipo,fecha,hora,lugar,estado,temas').eq('archivado', false).neq('estado', 'cancelada').gte('fecha', desde).lte('fecha', hasta)),
  ]);
  const reemplazos = new Set(evs.filter((e) => e.fija_id).map((e) => `${e.fija_id}|${e.fecha}`));
  const out = evs.map(deEvento);
  for (let f = desde; f <= hasta; f = sumarDias(f, 1)) {
    const dow = aFecha(f).getDay();
    for (const fj of fijas) {
      if (fj.dia_semana === dow && !reemplazos.has(`${fj.id}|${f}`)) out.push(deFija(fj, f));
    }
  }
  out.push(...reus.map(deReunion));
  return out.sort((a, b) => `${a.fecha} ${a.hora || '99:99'}`.localeCompare(`${b.fecha} ${b.hora || '99:99'}`));
}

// ------------------------------------------------------------ Pantalla
export async function render(cont, { query }) {
  const vistaId = cont.dataset.vista;
  const escribe = puedeEscribir();
  const h = hoy();
  let vista = 'mes';
  let mes = aFecha(h); mes.setDate(1);
  let filtro = '';
  let eventos = [];

  const rangoMes = () => {
    const offset = (mes.getDay() + 6) % 7; // lunes primero
    const ini = new Date(mes.getFullYear(), mes.getMonth(), 1 - offset);
    const desde = ymd(ini);
    return { desde, hasta: sumarDias(desde, 41) };
  };

  async function cargar() {
    const r = vista === 'mes' ? rangoMes() : { desde: h, hasta: sumarDias(h, 60) };
    eventos = await eventosEntre(r.desde, r.hasta);
  }
  async function recargar() {
    await cargar();
    if (cont.dataset.vista === vistaId) pintar();
  }

  // -------------------------------------------------- Formularios
  const optsCat = Object.entries(CATEGORIAS_EVENTO).map(([v, [l]]) => ({ v, l }));

  function camposEvento() {
    return [
      { name: 'titulo', label: 'Título', required: true, full: true, placeholder: 'Ej.: Charla pastoral, Bautismos, Limpieza del templo' },
      { name: 'categoria', label: 'Categoría', type: 'select', required: true, options: optsCat },
      { name: 'fecha', label: 'Fecha', type: 'date', required: true },
      { name: 'hora', label: 'Hora', type: 'time' },
      { name: 'hora_fin', label: 'Hora de fin', type: 'time' },
      { name: 'lugar', label: 'Lugar', full: true },
      { name: 'descripcion', label: 'Detalle', type: 'textarea', rows: 3 },
      { name: 'privado', label: 'Privacidad', type: 'checks', options: [{ v: '1', l: 'Privado: solo lo ven administrador, secretario y pastor' }] },
    ];
  }
  const aFila = (v) => {
    const { privado, ...resto } = v;
    return { ...resto, privado: (privado || []).includes('1') };
  };

  async function nuevoEvento(fecha = h) {
    const ok = await formModal({
      titulo: 'Nuevo evento', campos: camposEvento(), ancho: true,
      valores: { categoria: 'otro', fecha },
      guardar: async (v) => { await q(sb.from('eventos').insert(aFila(v))); },
    });
    if (ok) { toast('Evento guardado.', 'ok'); await recargar(); }
  }

  async function editarEvento(ev) {
    const e = ev.fila;
    const ok = await formModal({
      titulo: 'Editar evento', campos: camposEvento(), ancho: true,
      valores: { ...e, hora: fmtHora(e.hora), hora_fin: fmtHora(e.hora_fin), privado: e.privado ? ['1'] : [] },
      guardar: async (v) => { await q(sb.from('eventos').update(aFila(v)).eq('id', e.id)); },
    });
    if (ok) { toast('Cambios guardados.', 'ok'); await recargar(); }
  }

  // Edita solo la fecha de una actividad fija (crea un reemplazo para ese día).
  async function editarSoloEstaFecha(ev) {
    const f = ev.fija;
    const ok = await formModal({
      titulo: `${f.titulo} — solo el ${ev.fecha.split('-').reverse().join('/')}`,
      aviso: 'El cambio vale únicamente para esta fecha. Las demás semanas siguen igual.',
      campos: [
        { name: 'titulo', label: 'Título', required: true, full: true },
        { name: 'hora', label: 'Hora' , type: 'time' },
        { name: 'hora_fin', label: 'Hora de fin', type: 'time' },
        { name: 'lugar', label: 'Lugar', full: true },
        { name: 'descripcion', label: 'Detalle', type: 'textarea', rows: 3 },
      ],
      valores: { titulo: f.titulo, hora: fmtHora(f.hora), hora_fin: fmtHora(f.hora_fin), lugar: f.lugar },
      guardar: async (v) => {
        await q(sb.from('eventos').insert({ ...v, categoria: f.categoria, fecha: ev.fecha, fija_id: f.id }));
      },
    });
    if (ok) { toast('Cambio guardado para esa fecha.', 'ok'); await recargar(); }
  }

  async function crearReemplazo(ev, datos, mensaje) {
    const f = ev.fija;
    try {
      await q(sb.from('eventos').insert({
        titulo: f.titulo, categoria: f.categoria, hora: f.hora, hora_fin: f.hora_fin, lugar: f.lugar,
        ...datos, fecha: ev.fecha, fija_id: f.id,
      }));
      toast(mensaje, 'ok');
      await recargar();
    } catch (e) { toast(errorAmigable(e), 'error'); }
  }

  const marcarVariante = (ev) => crearReemplazo(
    ev,
    { titulo: ev.fija.variante_titulo, hora: ev.fija.variante_hora || ev.fija.hora },
    `Ese día quedó como ${ev.fija.variante_titulo}.`
  );

  async function cancelarFecha(ev) {
    if (!(await confirmar('Esta fecha quedará marcada como cancelada. Las demás semanas no cambian.', { textoOk: 'Cancelar esta fecha', peligro: true, titulo: 'Cancelar actividad' }))) return;
    if (ev.origen === 'fija') return crearReemplazo(ev, { estado: 'cancelado' }, 'Fecha cancelada.');
    try {
      await q(sb.from('eventos').update({ estado: 'cancelado' }).eq('id', ev.fila.id));
      toast('Evento cancelado.', 'ok');
      await recargar();
    } catch (e) { toast(errorAmigable(e), 'error'); }
  }

  async function reactivar(ev) {
    try {
      await q(sb.from('eventos').update({ estado: 'programado' }).eq('id', ev.fila.id));
      toast('Evento reactivado.', 'ok');
      await recargar();
    } catch (e) { toast(errorAmigable(e), 'error'); }
  }

  async function archivarEvento(ev, volverNormal = false) {
    const msg = volverNormal
      ? 'Esta fecha vuelve al horario normal de la actividad.'
      : '¿Archivar este evento? No se borra: deja de mostrarse en el calendario.';
    if (!(await confirmar(msg, { textoOk: volverNormal ? 'Volver al normal' : 'Archivar', peligro: !volverNormal }))) return;
    try {
      await q(sb.from('eventos').update({ archivado: true }).eq('id', ev.fila.id));
      toast(volverNormal ? 'Vuelve al horario normal.' : 'Evento archivado.', 'ok');
      await recargar();
    } catch (e) { toast(errorAmigable(e), 'error'); }
  }

  // -------------------------------------------------- Detalle de un evento
  function detalle(ev) {
    const color = colorDe(ev.categoria);
    const esReemplazo = ev.origen === 'evento' && ev.fila.fija_id;
    const horario = ev.hora ? `${ev.hora}${ev.hora_fin ? ' a ' + ev.hora_fin : ''} hs` : 'Sin hora';
    const botones = [];
    if (ev.origen === 'reunion') {
      botones.push('<a class="btn" href="#/reuniones">Abrir en Reuniones</a>');
    } else if (escribe) {
      if (ev.origen === 'fija') {
        if (ev.fija.variante_titulo) botones.push(`<button class="btn verde" data-var>Marcar como ${esc(ev.fija.variante_titulo)}</button>`);
        botones.push('<button class="btn sec" data-solo>Cambiar solo esta fecha</button>');
        botones.push('<button class="btn rojo" data-canc>Cancelar esta fecha</button>');
      } else {
        botones.push('<button class="btn sec" data-ed>Editar</button>');
        botones.push(ev.cancelado ? '<button class="btn sec" data-reac>Reactivar</button>' : '<button class="btn rojo" data-canc>Cancelar</button>');
        botones.push(esReemplazo ? '<button class="btn sec" data-normal>Volver al horario normal</button>' : '<button class="btn rojo" data-arch>Archivar</button>');
      }
    }
    const m = abrirModal({
      titulo: ev.titulo,
      cuerpo: `
        <div style="margin-bottom:12px">
          <span class="badge" style="background:${color}1f;color:${color}">${esc(nombreCat(ev.categoria))}</span>
          ${ev.cancelado ? '<span class="badge rojo">Cancelado</span>' : ''}
          ${ev.privado ? '<span class="badge">🔒 Privado</span>' : ''}
          ${ev.origen === 'fija' || esReemplazo ? '<span class="badge azul">Actividad semanal</span>' : ''}
          ${ev.origen === 'reunion' ? '<span class="badge dorado">Reunión</span>' : ''}
        </div>
        <p style="margin:4px 0;text-transform:capitalize"><b style="text-transform:none">Fecha:</b> ${esc(fmtFechaLarga(ev.fecha))}</p>
        <p style="margin:4px 0"><b>Horario:</b> ${esc(horario)}</p>
        <p style="margin:4px 0"><b>Lugar:</b> ${esc(ev.lugar || '—')}</p>
        ${ev.descripcion ? `<h3 style="font-size:14px;margin:14px 0 4px">${ev.origen === 'reunion' ? 'Temas a tratar' : 'Detalle'}</h3><div style="white-space:pre-wrap">${esc(ev.descripcion)}</div>` : ''}`,
      pie: botones.join(''),
    });
    const on = (sel, fn) => m.el.querySelector(sel)?.addEventListener('click', () => { m.cerrar(); fn(); });
    on('[data-var]', () => marcarVariante(ev));
    on('[data-solo]', () => editarSoloEstaFecha(ev));
    on('[data-canc]', () => cancelarFecha(ev));
    on('[data-ed]', () => editarEvento(ev));
    on('[data-reac]', () => reactivar(ev));
    on('[data-arch]', () => archivarEvento(ev));
    on('[data-normal]', () => archivarEvento(ev, true));
    m.el.querySelector('a.btn')?.addEventListener('click', () => m.cerrar());
  }

  // -------------------------------------------------- Día (modal)
  function abrirDia(fecha) {
    const del = visibles().filter((e) => e.fecha === fecha);
    const m = abrirModal({
      titulo: fmtFechaLarga(fecha),
      cuerpo: del.length
        ? `<ul class="lista" style="margin:-4px -18px">${del.map((e, i) => itemLista(e, i)).join('')}</ul>`
        : '<div class="vacio">No hay nada programado ese día.</div>',
      pie: escribe ? '<button class="btn" data-nuevo>+ Agregar evento ese día</button>' : '',
    });
    m.el.querySelectorAll('[data-i]').forEach((li) => { li.onclick = () => { m.cerrar(); detalle(del[Number(li.dataset.i)]); }; });
    m.el.querySelector('[data-nuevo]')?.addEventListener('click', () => { m.cerrar(); nuevoEvento(fecha); });
  }

  // -------------------------------------------------- Pintado
  const visibles = () => (filtro ? eventos.filter((e) => e.categoria === filtro) : eventos);

  function itemLista(e, i) {
    const c = colorDe(e.categoria);
    return `<li class="click cal-item ${e.cancelado ? 'canc' : ''}" data-i="${i}" style="--c:${c};cursor:pointer">
      <div class="cal-hora">${esc(e.hora || '—')}</div>
      <div style="flex:1;min-width:0">
        <div class="t">${esc(e.titulo)} ${e.privado ? '🔒' : ''} ${e.cancelado ? '<span class="badge rojo">Cancelado</span>' : ''}</div>
        <div class="s">${esc(nombreCat(e.categoria))}${e.lugar ? ' · ' + esc(e.lugar) : ''}</div>
      </div>
    </li>`;
  }

  function pintarMes() {
    const { desde } = rangoMes();
    const porDia = {};
    visibles().forEach((e) => { (porDia[e.fecha] ||= []).push(e); });
    let celdas = '';
    for (let i = 0; i < 42; i++) {
      const f = sumarDias(desde, i);
      const d = aFecha(f);
      const evs = porDia[f] || [];
      celdas += `<div class="cal-dia ${d.getMonth() !== mes.getMonth() ? 'fuera' : ''} ${f === h ? 'hoy' : ''}" data-f="${f}">
        <div class="cal-n">${d.getDate()}</div>
        <div class="cal-chips">
          ${evs.slice(0, 3).map((e) => `<div class="cal-chip ${e.cancelado ? 'canc' : ''}" style="--c:${colorDe(e.categoria)}" title="${esc(e.titulo)}">${e.hora ? `<b>${esc(e.hora)}</b> ` : ''}${esc(e.titulo)}</div>`).join('')}
          ${evs.length > 3 ? `<div class="cal-mas">+${evs.length - 3} más</div>` : ''}
        </div>
        <div class="cal-puntos">${evs.slice(0, 6).map((e) => `<span class="cal-punto" style="--c:${colorDe(e.categoria)}"></span>`).join('')}</div>
      </div>`;
    }
    const titulo = mes.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
    document.getElementById('cal-cuerpo').innerHTML = `
      <div class="cal-barra">
        <button class="btn sec chico" id="c-ant" aria-label="Mes anterior">‹</button>
        <h2>${esc(titulo)}</h2>
        <button class="btn sec chico" id="c-sig" aria-label="Mes siguiente">›</button>
        <button class="btn sec chico" id="c-hoy">Hoy</button>
      </div>
      <div class="cal-grid">${CAB_DIAS.map((x) => `<div class="cal-cab">${x}</div>`).join('')}${celdas}</div>`;
    document.getElementById('c-ant').onclick = () => { mes = new Date(mes.getFullYear(), mes.getMonth() - 1, 1); recargar(); };
    document.getElementById('c-sig').onclick = () => { mes = new Date(mes.getFullYear(), mes.getMonth() + 1, 1); recargar(); };
    document.getElementById('c-hoy').onclick = () => { mes = aFecha(h); mes.setDate(1); recargar(); };
    document.querySelectorAll('.cal-dia').forEach((el) => { el.onclick = () => abrirDia(el.dataset.f); });
  }

  function pintarLista() {
    const lista = visibles();
    const grupos = [];
    lista.forEach((e, i) => {
      const ult = grupos[grupos.length - 1];
      if (ult && ult.fecha === e.fecha) ult.items.push([e, i]); else grupos.push({ fecha: e.fecha, items: [[e, i]] });
    });
    document.getElementById('cal-cuerpo').innerHTML = grupos.length
      ? grupos.map((g) => `
        <div class="tarjeta" style="margin-bottom:12px">
          <div class="enc"><h2 style="text-transform:capitalize">${esc(fmtFechaLarga(g.fecha))}${g.fecha === h ? ' · <span style="color:var(--dorado)">hoy</span>' : ''}</h2></div>
          <ul class="lista">${g.items.map(([e, i]) => itemLista(e, i)).join('')}</ul>
        </div>`).join('')
      : '<div class="tarjeta"><div class="vacio">No hay eventos en los próximos 60 días.</div></div>';
    document.querySelectorAll('#cal-cuerpo [data-i]').forEach((li) => { li.onclick = () => detalle(lista[Number(li.dataset.i)]); });
  }

  function pintar() {
    if (cont.dataset.vista !== vistaId) return;
    document.getElementById('tabs').innerHTML = `
      <button class="${vista === 'mes' ? 'activo' : ''}" data-v="mes">Mes</button>
      <button class="${vista === 'lista' ? 'activo' : ''}" data-v="lista">Próximos 60 días</button>`;
    document.querySelectorAll('#tabs button').forEach((b) => {
      b.onclick = async () => { vista = b.dataset.v; await recargar(); };
    });
    if (vista === 'mes') pintarMes(); else pintarLista();
  }

  // -------------------------------------------------- Actividades fijas
  async function gestionarFijas() {
    const fijas = await q(sb.from('actividades_fijas').select('*').eq('archivado', false).order('dia_semana').order('hora'));
    const m = abrirModal({
      titulo: 'Actividades fijas de la semana', ancho: true,
      cuerpo: `<p style="margin:0 0 10px;color:var(--texto-2);font-size:14px">Se repiten todas las semanas y aparecen solas en el calendario. En una fecha puntual podés cambiarlas o cancelarlas desde el calendario.</p>
        ${fijas.length ? `<ul class="lista" style="margin:0 -18px">${fijas.map((f) => `
          <li style="align-items:center">
            <div style="flex:1;min-width:0"><div class="t">${esc(f.titulo)} ${f.activa ? '' : '<span class="badge">Pausada</span>'}</div>
              <div class="s">${esc(DIAS_SEMANA[f.dia_semana])}s ${esc(fmtHora(f.hora))} hs · ${esc(nombreCat(f.categoria))}${f.variante_titulo ? ` · alternativa: ${esc(f.variante_titulo)} ${esc(fmtHora(f.variante_hora))}` : ''}</div></div>
            <button class="btn chico sec" data-ed="${f.id}">Editar</button>
            <button class="btn chico link" data-pa="${f.id}">${f.activa ? 'Pausar' : 'Activar'}</button>
            <button class="btn chico link" data-ar="${f.id}" title="Quitar">🗄</button>
          </li>`).join('')}</ul>` : '<div class="vacio">Todavía no hay actividades fijas.</div>'}`,
      pie: '<button class="btn" data-nueva>+ Nueva actividad fija</button>',
    });
    const reabrir = async () => { m.cerrar(); await recargar(); gestionarFijas(); };
    const buscar = (id) => fijas.find((f) => f.id === id);
    m.el.querySelector('[data-nueva]').onclick = () => { m.cerrar(); formFija(null); };
    m.el.querySelectorAll('[data-ed]').forEach((b) => { b.onclick = () => { m.cerrar(); formFija(buscar(b.dataset.ed)); }; });
    m.el.querySelectorAll('[data-pa]').forEach((b) => {
      b.onclick = async () => {
        const f = buscar(b.dataset.pa);
        try { await q(sb.from('actividades_fijas').update({ activa: !f.activa }).eq('id', f.id)); await reabrir(); } catch (e) { toast(errorAmigable(e), 'error'); }
      };
    });
    m.el.querySelectorAll('[data-ar]').forEach((b) => {
      b.onclick = async () => {
        const f = buscar(b.dataset.ar);
        if (!(await confirmar(`¿Quitar "${f.titulo}" de las actividades semanales? Los eventos ya cargados no se tocan.`, { textoOk: 'Quitar', peligro: true }))) return;
        try { await q(sb.from('actividades_fijas').update({ archivado: true }).eq('id', f.id)); await reabrir(); } catch (e) { toast(errorAmigable(e), 'error'); }
      };
    });
  }

  async function formFija(f) {
    const ok = await formModal({
      titulo: f ? 'Editar actividad fija' : 'Nueva actividad fija', ancho: true,
      campos: [
        { name: 'titulo', label: 'Nombre', required: true, full: true, placeholder: 'Ej.: Culto general' },
        { name: 'categoria', label: 'Categoría', type: 'select', required: true, options: optsCat },
        { name: 'dia_semana', label: 'Día de la semana', type: 'select', required: true, options: DIAS_SEMANA.map((l, v) => ({ v, l })) },
        { name: 'hora', label: 'Hora', type: 'time', required: true },
        { name: 'hora_fin', label: 'Hora de fin', type: 'time' },
        { name: 'lugar', label: 'Lugar', full: true },
        { name: 'variante_titulo', label: 'Alternativa (opcional)', placeholder: 'Ej.: Santa Cena', hint: 'Otra versión de la actividad que se elige en una fecha puntual.' },
        { name: 'variante_hora', label: 'Hora de la alternativa', type: 'time' },
      ],
      valores: f ? { ...f, hora: fmtHora(f.hora), hora_fin: fmtHora(f.hora_fin), variante_hora: fmtHora(f.variante_hora) } : { categoria: 'culto' },
      guardar: async (v) => {
        const datos = { ...v, dia_semana: Number(v.dia_semana) };
        if (f) await q(sb.from('actividades_fijas').update(datos).eq('id', f.id));
        else await q(sb.from('actividades_fijas').insert(datos));
      },
    });
    if (ok) toast('Actividad guardada.', 'ok');
    await recargar();
    gestionarFijas();
  }

  // -------------------------------------------------- Estructura de la página
  cont.innerHTML = `
    ${encabezado('Calendario', 'Cultos, reuniones y agenda. Las reuniones y las actividades semanales aparecen solas.',
      `${escribe ? '<button class="btn" id="b-nuevo">+ Nuevo evento</button><button class="btn sec" id="b-fijas">Actividades fijas</button>' : ''}`)}
    <div class="filtros" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:12px">
      <select id="c-cat" style="padding:7px 10px;border:1px solid var(--borde);border-radius:8px">
        <option value="">Todas las categorías</option>
        ${optsCat.map((o) => `<option value="${o.v}">${esc(o.l)}</option>`).join('')}
      </select>
      <div class="cal-leyenda">${optsCat.map((o) => `<span><i style="background:${colorDe(o.v)}"></i>${esc(o.l)}</span>`).join('')}</div>
    </div>
    <div class="tabs" id="tabs"></div>
    <div id="cal-cuerpo"></div>`;
  document.getElementById('c-cat').onchange = (ev) => { filtro = ev.target.value; pintar(); };
  document.getElementById('b-nuevo')?.addEventListener('click', () => nuevoEvento());
  document.getElementById('b-fijas')?.addEventListener('click', gestionarFijas);

  try {
    await cargar();
  } catch (e) {
    if (/relation|does not exist|schema cache|permission denied/i.test(e?.message || '')) {
      document.getElementById('cal-cuerpo').innerHTML = `<div class="tarjeta"><div class="cuerpo">
        <div class="aviso warn">Falta activar el calendario en la base de datos. Ejecutá el archivo <b>supabase/03-calendario.sql</b> en Supabase → SQL Editor y recargá esta página.</div></div></div>`;
      return;
    }
    throw e;
  }
  pintar();
  if (query?.nuevo && escribe) nuevoEvento(query.fecha || h);
  if (query?.dia && /^\d{4}-\d{2}-\d{2}$/.test(query.dia)) {
    mes = aFecha(query.dia); mes.setDate(1);
    await recargar();
    abrirDia(query.dia);
  }
}
