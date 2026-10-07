// Informes de Secretaría (mensual, trimestral, anual o por fechas) con vista previa, PDF y copia en Drive.
// Solo lee datos de los demás módulos: no crea tablas nuevas.
import { sb, q } from '../supabase.js';
import { CONFIG } from '../config.js';
import { estado, puede } from '../state.js';
import {
  TIPOS_ACTA, ESTADOS_ACTA, TIPOS_REUNION, ESTADOS_BIEN, ESTADOS_MIEMBRO, CATEGORIAS_DOC, CATEGORIAS_EVENTO,
} from '../constantes.js';
import { MODELOS, nombreModelo, fechaLarga } from '../notas-modelos.js';
import { generarPDFInforme } from '../pdf.js';
import { driveDisponible, subirPDF, precargarDrive } from '../drive.js';
import { resolverFirmantes } from './notas.js';
import { esc, fmtFecha, encabezado, toast, hoy, errorAmigable, descargar } from '../ui.js';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const p2 = (n) => String(n).padStart(2, '0');
const iso = (y, m, d) => `${y}-${p2(m)}-${p2(d)}`;
const ultimoDia = (y, m) => new Date(y, m, 0).getDate();
const aUTC = (f) => { const [y, m, d] = String(f).slice(0, 10).split('-').map(Number); return Date.UTC(y, m - 1, d); };
const diasEntre = (a, b) => Math.round((aUTC(b) - aUTC(a)) / 86400000);
const sumarDias = (f, n) => { const d = new Date(aUTC(f) + n * 86400000); return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()); };
const corto = (t, n = 110) => { const s = String(t || '').replace(/\s+/g, ' ').trim(); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };
const MAX_FILAS = 40;

const APARTADOS = [
  ['actas', 'Actas'], ['reuniones', 'Reuniones'], ['decisiones', 'Decisiones y seguimiento'], ['notas', 'Notas y certificados'],
  ['miembros', 'Miembros'], ['inventario', 'Inventario'], ['documentos', 'Documentos'], ['eventos', 'Eventos y actividades especiales'],
];

// ------------------------------------------------------------------ período
function periodo({ tipo, anio, mes, trim, desde, hasta }) {
  if (tipo === 'mensual') return { desde: iso(anio, mes, 1), hasta: iso(anio, mes, ultimoDia(anio, mes)), texto: `${cap(MESES[mes - 1])} de ${anio}`, corto: `${cap(MESES[mes - 1])} ${anio}` };
  if (tipo === 'trimestral') {
    const m1 = (trim - 1) * 3 + 1; const m3 = m1 + 2;
    return { desde: iso(anio, m1, 1), hasta: iso(anio, m3, ultimoDia(anio, m3)), texto: `${trim}.º trimestre de ${anio} (${MESES[m1 - 1]} a ${MESES[m3 - 1]})`, corto: `${trim}º trimestre ${anio}` };
  }
  if (tipo === 'anual') return { desde: iso(anio, 1, 1), hasta: iso(anio, 12, 31), texto: `Año ${anio}`, corto: `Año ${anio}` };
  return { desde, hasta, texto: `Del ${fmtFecha(desde)} al ${fmtFecha(hasta)}`, corto: `${fmtFecha(desde).replace(/\//g, '-')} a ${fmtFecha(hasta).replace(/\//g, '-')}` };
}

const faltaTabla = (e) => /relation|does not exist|schema cache|permission denied|column/i.test(e?.message || '');
const resumenNota = (n) => {
  const d = n.datos || {};
  if (MODELOS[n.tipo]?.cert) return d.nombre || [d.esposo, d.esposa].filter(Boolean).join(' y ') || '—';
  return n.asunto || '—';
};
const cuenta = (lista, f) => lista.filter(f).length;
const masNota = (total) => (total > MAX_FILAS ? `Se muestran los primeros ${MAX_FILAS} de ${total} registros.` : '');

// ------------------------------------------------------------------ datos
async function cargarApartados(sel, per) {
  const { desde, hasta } = per;
  const h = hoy();
  const ts0 = new Date(`${desde}T00:00:00`).toISOString();
  const ts1 = new Date(`${sumarDias(hasta, 1)}T00:00:00`).toISOString();
  const nombres = Object.fromEntries((await q(sb.from('personas_basico').select('id,nombre,apellido')).catch(() => [])).map((p) => [p.id, `${p.apellido}, ${p.nombre}`]));
  const secciones = []; const claves = []; const avisos = [];

  const cargar = async (clave, titulo, fn) => {
    if (!sel.includes(clave)) return;
    try { const s = await fn(); if (s) { s.titulo = titulo; secciones.push(s); } } catch (e) {
      avisos.push(`${titulo}: ${faltaTabla(e) ? 'todavía no está instalado en la base de datos' : errorAmigable(e)}`);
    }
  };

  await cargar('actas', 'Actas', async () => {
    const f = await q(sb.from('actas').select('numero,fecha,tipo,estado').gte('fecha', desde).lte('fecha', hasta).order('numero'));
    claves.push(['Actas del período', String(f.length)]);
    return {
      cifras: [['Actas del período', String(f.length)], ['Aprobadas', String(cuenta(f, (a) => a.estado === 'aprobada'))],
        ['Archivadas', String(cuenta(f, (a) => a.estado === 'archivada'))], ['En borrador (sin aprobar)', String(cuenta(f, (a) => a.estado === 'borrador'))]],
      tablas: [{ cols: [{ h: 'N°', w: 50 }, { h: 'Fecha', w: 80 }, { h: 'Tipo', w: 230 }, { h: 'Estado', w: 111 }],
        filas: f.slice(0, MAX_FILAS).map((a) => [String(a.numero), fmtFecha(a.fecha), TIPOS_ACTA[a.tipo] || a.tipo, ESTADOS_ACTA[a.estado]?.[0] || a.estado]), nota: masNota(f.length) }],
    };
  });

  await cargar('reuniones', 'Reuniones', async () => {
    const f = await q(sb.from('reuniones').select('fecha,tipo,estado').eq('archivado', false).gte('fecha', desde).lte('fecha', hasta));
    const real = f.filter((r) => r.estado === 'realizada');
    claves.push(['Reuniones realizadas', String(real.length)]);
    const porTipo = Object.entries(TIPOS_REUNION).map(([k, l]) => [`Realizadas - ${l}`, String(cuenta(real, (r) => r.tipo === k))]).filter(([, n]) => n !== '0');
    return { cifras: [['Reuniones en el período', String(f.length)], ['Realizadas', String(real.length)], ['Canceladas', String(cuenta(f, (r) => r.estado === 'cancelada'))],
      ['Programadas (sin realizar)', String(cuenta(f, (r) => r.estado === 'programada'))], ...porTipo] };
  });

  await cargar('decisiones', 'Decisiones y seguimiento', async () => {
    const todas = await q(sb.from('decisiones').select('descripcion,fecha,responsable_id,fecha_limite,estado,completada_en').eq('archivado', false));
    const delPer = todas.filter((d) => d.fecha >= desde && d.fecha <= hasta);
    const compl = todas.filter((d) => d.completada_en && d.completada_en >= ts0 && d.completada_en < ts1);
    const abiertas = todas.filter((d) => d.estado === 'pendiente' || d.estado === 'en_proceso');
    const venc = abiertas.filter((d) => d.fecha_limite && d.fecha_limite < h).sort((a, b) => a.fecha_limite.localeCompare(b.fecha_limite));
    claves.push(['Decisiones tomadas en el período', String(delPer.length)], ['Decisiones vencidas (a hoy)', String(venc.length)]);
    const fila = (d) => [corto(d.descripcion), d.responsable_id ? nombres[d.responsable_id] || '—' : '—', d.fecha_limite ? fmtFecha(d.fecha_limite) : '—'];
    return {
      cifras: [['Decisiones tomadas en el período', String(delPer.length)], ['Completadas en el período', String(compl.length)],
        ['Abiertas a hoy (pendientes o en proceso)', String(abiertas.length)], ['Vencidas a hoy', String(venc.length)]],
      tablas: [
        { titulo: 'Decisiones vencidas a hoy', cols: [{ h: 'Decisión', w: 255 }, { h: 'Responsable', w: 130 }, { h: 'Límite', w: 86 }], filas: venc.slice(0, MAX_FILAS).map(fila), nota: masNota(venc.length) },
        { titulo: 'Decisiones tomadas en el período', cols: [{ h: 'Decisión', w: 255 }, { h: 'Responsable', w: 130 }, { h: 'Límite', w: 86 }], filas: delPer.slice(0, MAX_FILAS).map(fila), nota: masNota(delPer.length) },
      ],
    };
  });

  await cargar('notas', 'Notas y certificados', async () => {
    const f = await q(sb.from('notas').select('tipo,numero,anio,fecha,asunto,datos,estado').gte('fecha', desde).lte('fecha', hasta).order('fecha'));
    const emit = f.filter((n) => n.numero);
    claves.push(['Notas y certificados emitidos', String(emit.length)]);
    const porTipo = Object.keys(MODELOS).map((k) => [nombreModelo(k), String(cuenta(emit, (n) => n.tipo === k))]).filter(([, n]) => n !== '0');
    return {
      cifras: [['Emitidos en el período', String(emit.length)], ...porTipo, ['Borradores sin emitir', String(cuenta(f, (n) => n.estado === 'borrador'))]],
      tablas: [{ titulo: 'Emitidos', cols: [{ h: 'N°', w: 55 }, { h: 'Fecha', w: 75 }, { h: 'Tipo', w: 140 }, { h: 'Asunto / nombre', w: 201 }],
        filas: emit.slice(0, MAX_FILAS).map((n) => [`${n.numero}/${n.anio}`, fmtFecha(n.fecha), nombreModelo(n.tipo), corto(resumenNota(n), 70)]), nota: masNota(emit.length) }],
    };
  });

  await cargar('miembros', 'Miembros', async () => {
    const f = await q(sb.from('miembros').select('estado,fecha_ingreso,persona:personas(nombre,apellido)').eq('archivado', false));
    const altas = f.filter((m) => m.fecha_ingreso && m.fecha_ingreso >= desde && m.fecha_ingreso <= hasta);
    claves.push(['Altas de miembros', String(altas.length)], ['Miembros activos (a hoy)', String(cuenta(f, (m) => m.estado === 'activo'))]);
    return {
      cifras: [['Altas en el período (por fecha de ingreso)', String(altas.length)],
        ...Object.entries(ESTADOS_MIEMBRO).map(([k, [l]]) => [`${l} (situación a hoy)`, String(cuenta(f, (m) => m.estado === k))])],
      tablas: [{ titulo: 'Altas del período', cols: [{ h: 'Miembro', w: 300 }, { h: 'Ingreso', w: 171 }],
        filas: altas.slice(0, MAX_FILAS).map((m) => [m.persona ? `${m.persona.apellido}, ${m.persona.nombre}` : '—', fmtFecha(m.fecha_ingreso)]), nota: masNota(altas.length) }],
    };
  });

  await cargar('inventario', 'Inventario', async () => {
    const bienes = await q(sb.from('inventario_bienes').select('id,codigo,nombre,ubicacion,estado,cantidad,baja_fecha,baja_motivo,creado_en'));
    const prest = await q(sb.from('inventario_prestamos').select('bien_id,prestado_a,fecha_prestamo,fecha_devolucion_prevista,devuelto_en'));
    const movs = await q(sb.from('inventario_movimientos').select('bien_id,tipo,fecha,detalle').eq('tipo', 'reparacion').gte('fecha', desde).lte('fecha', hasta).order('fecha'));
    const porId = Object.fromEntries(bienes.map((b) => [b.id, b]));
    const activos = bienes.filter((b) => b.estado !== 'baja');
    const altas = bienes.filter((b) => b.creado_en >= ts0 && b.creado_en < ts1);
    const bajas = bienes.filter((b) => b.estado === 'baja' && b.baja_fecha >= desde && b.baja_fecha <= hasta);
    const malos = activos.filter((b) => b.estado === 'malo' || b.estado === 'en_reparacion');
    const vig = prest.filter((p) => !p.devuelto_en);
    const vencidos = vig.filter((p) => p.fecha_devolucion_prevista < h);
    claves.push(['Bienes en el inventario (a hoy)', String(activos.length)], ['Préstamos de inventario vencidos', String(vencidos.length)]);
    const sit = (p) => { const n = diasEntre(h, p.fecha_devolucion_prevista); return n < 0 ? `Vencido hace ${-n} día${n === -1 ? '' : 's'}` : n === 0 ? 'Vence hoy' : `Vence en ${n} día${n === 1 ? '' : 's'}`; };
    return {
      cifras: [['Bienes registrados a hoy', String(activos.length)], ['Unidades en total', String(activos.reduce((a, b) => a + b.cantidad, 0))],
        ['Bienes nuevos en el período', String(altas.length)], ['Bajas en el período', String(bajas.length)],
        ['Malos o en reparación a hoy', String(malos.length)], ['Préstamos iniciados en el período', String(cuenta(prest, (p) => p.fecha_prestamo >= desde && p.fecha_prestamo <= hasta))],
        ['Devoluciones en el período', String(cuenta(prest, (p) => p.devuelto_en && p.devuelto_en >= desde && p.devuelto_en <= hasta))],
        ['Préstamos vigentes a hoy', String(vig.length)], ['Préstamos vencidos a hoy', String(vencidos.length)]],
      tablas: [
        { titulo: 'Bienes dados de baja en el período', cols: [{ h: 'Código', w: 55 }, { h: 'Bien', w: 150 }, { h: 'Fecha', w: 70 }, { h: 'Motivo', w: 196 }],
          filas: bajas.slice(0, MAX_FILAS).map((b) => [b.codigo, b.nombre, fmtFecha(b.baja_fecha), corto(b.baja_motivo, 80)]) },
        { titulo: 'Bienes en mal estado o en reparación (a hoy)', cols: [{ h: 'Código', w: 55 }, { h: 'Bien', w: 190 }, { h: 'Ubicación', w: 120 }, { h: 'Estado', w: 106 }],
          filas: malos.slice(0, MAX_FILAS).map((b) => [b.codigo, b.nombre, b.ubicacion, ESTADOS_BIEN[b.estado]?.[0] || b.estado]), nota: masNota(malos.length) },
        { titulo: 'Préstamos vigentes (a hoy)', cols: [{ h: 'Bien', w: 150 }, { h: 'Prestado a', w: 110 }, { h: 'Devolver', w: 70 }, { h: 'Situación', w: 141 }],
          filas: vig.sort((a, b) => a.fecha_devolucion_prevista.localeCompare(b.fecha_devolucion_prevista)).slice(0, MAX_FILAS)
            .map((p) => [`${porId[p.bien_id]?.codigo || ''} ${porId[p.bien_id]?.nombre || ''}`.trim(), p.prestado_a, fmtFecha(p.fecha_devolucion_prevista), sit(p)]) },
        { titulo: 'Reparaciones y mantenimiento registrados en el período', cols: [{ h: 'Fecha', w: 70 }, { h: 'Bien', w: 150 }, { h: 'Detalle', w: 251 }],
          filas: movs.slice(0, MAX_FILAS).map((m) => [fmtFecha(m.fecha), `${porId[m.bien_id]?.codigo || ''} ${porId[m.bien_id]?.nombre || ''}`.trim(), corto(m.detalle, 90)]) },
      ],
    };
  });

  await cargar('documentos', 'Documentos', async () => {
    const f = await q(sb.from('documentos').select('titulo,categoria,fecha_documento,vence_el,creado_en,archivado').eq('archivado', false));
    const nuevos = f.filter((d) => d.creado_en >= ts0 && d.creado_en < ts1);
    const lim = sumarDias(h, 30);
    const venc = f.filter((d) => d.vence_el && d.vence_el < h);
    const por = f.filter((d) => d.vence_el && d.vence_el >= h && d.vence_el <= lim);
    claves.push(['Documentos vencidos (a hoy)', String(venc.length)]);
    const sit = (d) => { const n = diasEntre(h, d.vence_el); return n < 0 ? `Vencido hace ${-n} día${n === -1 ? '' : 's'}` : n === 0 ? 'Vence hoy' : `Vence en ${n} día${n === 1 ? '' : 's'}`; };
    return {
      cifras: [['Documentos registrados en el período', String(nuevos.length)], ['Documentos vigentes (a hoy)', String(f.length)],
        ['Vencidos a hoy', String(venc.length)], ['Vencen en los próximos 30 días', String(por.length)]],
      tablas: [
        { titulo: 'Vencidos y por vencer', cols: [{ h: 'Documento', w: 215 }, { h: 'Categoría', w: 110 }, { h: 'Vence', w: 66 }, { h: 'Situación', w: 80 }],
          filas: [...venc, ...por].sort((a, b) => a.vence_el.localeCompare(b.vence_el)).slice(0, MAX_FILAS).map((d) => [d.titulo, CATEGORIAS_DOC[d.categoria] || d.categoria, fmtFecha(d.vence_el), sit(d)]) },
        { titulo: 'Registrados en el período', cols: [{ h: 'Fecha', w: 70 }, { h: 'Documento', w: 250 }, { h: 'Categoría', w: 151 }],
          filas: nuevos.slice(0, MAX_FILAS).map((d) => [fmtFecha(d.fecha_documento), d.titulo, CATEGORIAS_DOC[d.categoria] || d.categoria]), nota: masNota(nuevos.length) },
      ],
    };
  });

  await cargar('eventos', 'Eventos y actividades especiales', async () => {
    const f = await q(sb.from('eventos').select('titulo,categoria,fecha,estado,privado').eq('archivado', false).eq('privado', false).gte('fecha', desde).lte('fecha', hasta).order('fecha'));
    return {
      cifras: [['Eventos cargados en el período', String(f.length)], ['Cancelados', String(cuenta(f, (e) => e.estado === 'cancelado'))]],
      tablas: [{ cols: [{ h: 'Fecha', w: 75 }, { h: 'Evento', w: 245 }, { h: 'Categoría', w: 95 }, { h: 'Estado', w: 56 }],
        filas: f.slice(0, MAX_FILAS).map((e) => [fmtFecha(e.fecha), e.titulo, CATEGORIAS_EVENTO[e.categoria]?.[0] || e.categoria, e.estado === 'cancelado' ? 'Cancelado' : '']), nota: masNota(f.length) }],
    };
  });

  const orden = Object.fromEntries(APARTADOS.map(([k], i) => [k, i]));
  secciones.sort((a, b) => orden[APARTADOS.find(([, t]) => t === a.titulo)?.[0]] - orden[APARTADOS.find(([, t]) => t === b.titulo)?.[0]]);
  return { secciones, claves, avisos };
}

// ------------------------------------------------------------------ pantalla
export async function render(cont) {
  if (!puede('administrador', 'secretario', 'pastor')) {
    cont.innerHTML = `${encabezado('Informes')}<div class="tarjeta"><div class="vacio">Tu rol no tiene acceso a los informes.</div></div>`;
    return;
  }
  const d = new Date();
  const anioActual = d.getFullYear();
  const anios = Array.from({ length: 8 }, (_, i) => anioActual - i);
  const mesIni = d.getMonth() === 0 ? 12 : d.getMonth();              // por defecto, el mes anterior
  const anioIni = d.getMonth() === 0 ? anioActual - 1 : anioActual;
  let ultimo = null; // { per, datos, observaciones, firmas }

  cont.innerHTML = `
    ${encabezado('Informes', 'Informe de Secretaría para reuniones y asambleas: elegí el período y los apartados.')}
    <div class="tarjeta"><div class="cuerpo">
      <div class="form-grid">
        <div class="campo"><label for="i-tipo">Período</label>
          <select id="i-tipo"><option value="mensual">Mensual</option><option value="trimestral">Trimestral</option><option value="anual">Anual</option><option value="personalizado">Entre fechas</option></select></div>
        <div class="campo" id="c-anio"><label for="i-anio">Año</label>
          <select id="i-anio">${anios.map((a) => `<option value="${a}" ${a === anioIni ? 'selected' : ''}>${a}</option>`).join('')}</select></div>
        <div class="campo" id="c-mes"><label for="i-mes">Mes</label>
          <select id="i-mes">${MESES.map((m, i) => `<option value="${i + 1}" ${i + 1 === mesIni ? 'selected' : ''}>${cap(m)}</option>`).join('')}</select></div>
        <div class="campo" id="c-trim" hidden><label for="i-trim">Trimestre</label>
          <select id="i-trim"><option value="1">1.º (enero a marzo)</option><option value="2">2.º (abril a junio)</option><option value="3">3.º (julio a septiembre)</option><option value="4">4.º (octubre a diciembre)</option></select></div>
        <div class="campo" id="c-desde" hidden><label for="i-desde">Desde</label><input id="i-desde" type="date" value="${iso(anioActual, 1, 1)}"></div>
        <div class="campo" id="c-hasta" hidden><label for="i-hasta">Hasta</label><input id="i-hasta" type="date" value="${hoy()}"></div>
        <div class="campo full"><label>Apartados que lleva el informe</label>
          <div class="checks">${APARTADOS.map(([k, l]) => `<label><input type="checkbox" name="apartado" value="${k}" checked> ${esc(l)}</label>`).join('')}</div></div>
        <div class="campo full"><label for="i-obs">Observaciones del secretario/a (opcional)</label>
          <textarea id="i-obs" rows="4" placeholder="Texto libre que aparece al final del informe."></textarea></div>
        <div class="campo full"><div class="checks"><label><input type="checkbox" id="i-firmas" checked> Incluir líneas de firma (Secretario/a y Pastor, según Autoridades)</label></div></div>
      </div>
      <div style="margin-top:14px"><button class="btn" id="b-gen">Generar informe</button></div>
    </div></div>
    <div id="resultado"></div>`;

  const val = (id) => document.getElementById(id).value;
  function ajustar() {
    const t = val('i-tipo');
    document.getElementById('c-anio').hidden = t === 'personalizado';
    document.getElementById('c-mes').hidden = t !== 'mensual';
    document.getElementById('c-trim').hidden = t !== 'trimestral';
    document.getElementById('c-desde').hidden = t !== 'personalizado';
    document.getElementById('c-hasta').hidden = t !== 'personalizado';
  }
  document.getElementById('i-tipo').onchange = ajustar;
  ajustar();

  const tablaHTML2 = (cols, filas) => `<div class="tabla-wrap"><table class="tabla"><thead><tr>${cols.map((c) => `<th>${esc(c.h)}</th>`).join('')}</tr></thead>
    <tbody>${filas.map((f) => `<tr>${f.map((c, i) => `<td style="${cols[i].align === 'right' ? 'text-align:right' : ''}">${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;

  function vistaPrevia(u) {
    const { per, datos } = u;
    const sec = (s) => `<div class="tarjeta mt"><div class="enc"><h2>${esc(s.titulo)}</h2></div><div class="cuerpo">
      ${(s.cifras || []).length ? tablaHTML2([{ h: 'Concepto' }, { h: 'Cantidad', align: 'right' }], s.cifras) : ''}
      ${(s.tablas || []).map((t) => `${t.titulo ? `<h3 style="margin:14px 0 6px;font-size:14px">${esc(t.titulo)}</h3>` : ''}${t.filas.length ? tablaHTML2(t.cols, t.filas) : '<div style="color:var(--texto-2);font-size:13px">Sin registros en el período.</div>'}${t.nota ? `<div style="color:var(--texto-2);font-size:12px;margin-top:4px">${esc(t.nota)}</div>` : ''}`).join('')}
    </div></div>`;
    return `
      <div class="pagina-enc" style="margin-top:18px"><div><h1 style="font-size:20px">Informe de Secretaría</h1><div class="sub">${esc(per.texto)}</div></div>
        <div class="acciones"><button class="btn sec" id="b-pdf">⬇ Descargar PDF</button>${driveDisponible() ? '<button class="btn sec" id="b-drive">☁ Guardar en Drive</button>' : ''}</div></div>
      ${datos.avisos.length ? `<div class="aviso warn">${datos.avisos.map(esc).join('<br>')}</div>` : ''}
      ${datos.claves.length ? `<div class="tarjeta"><div class="enc"><h2>Resumen general</h2></div><div class="cuerpo">${tablaHTML2([{ h: 'Concepto' }, { h: 'Cantidad', align: 'right' }], datos.claves)}</div></div>` : ''}
      ${datos.secciones.map(sec).join('')}
      ${u.observaciones ? `<div class="tarjeta mt"><div class="enc"><h2>Observaciones</h2></div><div class="cuerpo" style="white-space:pre-wrap">${esc(u.observaciones)}</div></div>` : ''}
      ${u.firmas.length ? `<div class="tarjeta mt"><div class="cuerpo"><div style="display:flex;gap:30px;justify-content:center;flex-wrap:wrap;padding:20px 0">${u.firmas.map((f) => `<div style="text-align:center;min-width:180px"><div style="border-top:1px solid #333;margin-bottom:4px"></div><b>${esc(f.nombre || ' ')}</b><br><i>${esc(f.cargo || '')}</i></div>`).join('')}</div></div></div>` : ''}`;
  }

  const datosPDF = (u) => ({
    iglesia: estado.iglesia?.nombre || '', titulo: 'Informe de Secretaría', periodoTxt: u.per.texto,
    fechaTxt: `${CONFIG.IGLESIA_LUGAR ? `${CONFIG.IGLESIA_LUGAR}, ` : ''}${fechaLarga(hoy())}`,
    claves: u.datos.claves, secciones: u.datos.secciones, observaciones: u.observaciones, firmas: u.firmas,
  });
  const nombrePDF = (u) => `Informe de Secretaría - ${u.per.corto}.pdf`.replace(/[\\/:*?"<>|]+/g, ' ');

  document.getElementById('b-gen').onclick = async () => {
    const btn = document.getElementById('b-gen');
    const t = val('i-tipo');
    const per = periodo({ tipo: t, anio: Number(val('i-anio')), mes: Number(val('i-mes')), trim: Number(val('i-trim')), desde: val('i-desde'), hasta: val('i-hasta') });
    if (!per.desde || !per.hasta || per.desde > per.hasta) { toast('Revisá las fechas: la de inicio no puede ser posterior a la final.', 'error'); return; }
    const sel = [...document.querySelectorAll('input[name=apartado]:checked')].map((i) => i.value);
    if (!sel.length) { toast('Elegí al menos un apartado.', 'error'); return; }
    btn.disabled = true; btn.textContent = 'Generando…';
    const out = document.getElementById('resultado');
    out.innerHTML = '<div class="cargando">Reuniendo los datos…</div>';
    try {
      const datos = await cargarApartados(sel, per);
      const firmas = document.getElementById('i-firmas').checked ? await resolverFirmantes(['secretario', 'pastor']) : [];
      ultimo = { per, datos, observaciones: val('i-obs').trim(), firmas };
      out.innerHTML = vistaPrevia(ultimo);
      document.getElementById('b-pdf').onclick = () => {
        try { descargar(nombrePDF(ultimo), generarPDFInforme(datosPDF(ultimo)), 'application/pdf'); } catch (e) { toast(errorAmigable(e), 'error'); }
      };
      document.getElementById('b-drive')?.addEventListener('click', async () => {
        const b = document.getElementById('b-drive'); const txt = b.textContent;
        b.disabled = true; b.textContent = 'Guardando…';
        let sub = null;
        try {
          sub = await subirPDF(generarPDFInforme(datosPDF(ultimo)), nombrePDF(ultimo), CONFIG.DRIVE_CARPETA_INFORMES || 'Secretaría - Informes');
          await q(sb.from('archivos_drive').insert({ nombre: sub.name || nombrePDF(ultimo), drive_id: sub.id, url: sub.webViewLink || `https://drive.google.com/file/d/${sub.id}/view` }));
          toast('Copia guardada en el Drive de la iglesia.', 'ok');
        } catch (e) { toast(errorAmigable(e) + (sub ? ' El archivo sí se subió a Drive, pero no se pudo registrar acá.' : ''), 'error'); }
        b.disabled = false; b.textContent = txt;
      });
      if (driveDisponible()) precargarDrive();
      out.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (e) {
      out.innerHTML = `<div class="aviso warn">${esc(errorAmigable(e))}</div>`;
    }
    btn.disabled = false; btn.textContent = 'Generar informe';
  };
}
