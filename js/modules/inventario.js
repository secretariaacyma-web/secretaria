// Inventario de bienes: lista con filtros, ficha con foto (guardada en Drive), préstamos con fecha de
// devolución, historial automático e informes (PDF y Excel). Los bienes nunca se borran: se dan de baja.
import { sb, q } from '../supabase.js';
import { CONFIG } from '../config.js';
import { estado, puedeEscribir, personasBasico } from '../state.js';
import { CATEGORIAS_INV, UBICACIONES_INV, ESTADOS_BIEN, FORMAS_ADQUISICION, TIPOS_MOV_INV } from '../constantes.js';
import { generarPDFInventario, generarPDFFichaBien } from '../pdf.js';
import { fechaLarga } from '../notas-modelos.js';
import { driveDisponible, subirArchivo, autorizarDrive, precargarDrive } from '../drive.js';
import { procesarFoto } from '../imagen.js';
import {
  esc, fmtFecha, badge, tablaHTML, encabezado, formModal, toast, hoy,
  errorAmigable, descargar, descargarCSV, debounce, normalizar,
} from '../ui.js';

const faltaMigracion = (e) => /relation|does not exist|schema cache|permission denied|column/i.test(e?.message || '');
const AVISO_MIGRACION = `<div class="tarjeta"><div class="cuerpo"><div class="aviso warn">Falta activar el inventario en la base de datos. Ejecutá el archivo <b>supabase/06-inventario.sql</b> en Supabase → SQL Editor y recargá esta página.</div></div></div>`;

const catNombre = (c) => CATEGORIAS_INV[c] || c || '—';
const estNombre = (e) => ESTADOS_BIEN[e]?.[0] || e;

// ------------------------------------------------------------------ fechas
const aUTC = (f) => { const [y, m, d] = String(f).slice(0, 10).split('-').map(Number); return Date.UTC(y, m - 1, d); };
const diasEntre = (desde, hasta) => Math.round((aUTC(hasta) - aUTC(desde)) / 86400000);
const sumarDiasISO = (f, n) => {
  const d = new Date(aUTC(f) + n * 86400000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
};
const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;

// Situación de un préstamo → [texto, color, vencido?]
function situacion(p) {
  if (p.devuelto_en) return [`Devuelto el ${fmtFecha(p.devuelto_en)}`, 'verde', false];
  const d = diasEntre(hoy(), p.fecha_devolucion_prevista);
  if (d < 0) return [`Vencido hace ${plural(-d, 'día', 'días')}`, 'rojo', true];
  if (d === 0) return ['Vence hoy', 'naranja', false];
  return [`Vence en ${plural(d, 'día', 'días')}`, 'azul', false];
}

const nombreArchivoSeguro = (t, max = 120) => String(t).replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

export async function render(cont, ctx) {
  if (ctx.id) return renderDetalle(cont, ctx);
  return renderLista(cont, ctx);
}

// =============================================================== FORMULARIO DEL BIEN
async function abrirFormBien({ bien = null }) {
  const editando = !!bien;
  let personas = [];
  try { personas = (await personasBasico()).filter((p) => !p.archivado); } catch { /* sin acceso */ }
  const usaDrive = driveDisponible();
  let foto = null;          // foto nueva ya preparada { grande, miniatura }
  let quitar = false;       // quitar la foto actual
  let avisoDrive = '';
  let guardado = null;

  const campos = [
    { name: 'nombre', label: 'Nombre del bien', required: true, full: true, placeholder: 'Ej.: Parlante JBL 15"' },
    { name: 'descripcion', label: 'Descripción (marca, modelo, características)', type: 'textarea', rows: 2, full: true },
    { name: 'categoria', label: 'Categoría', type: 'select', required: true, options: Object.entries(CATEGORIAS_INV).map(([v, l]) => ({ v, l })) },
    { name: 'cantidad', label: 'Cantidad', type: 'number', required: true },
    { name: 'ubicacion', label: 'Ubicación', required: true, list: UBICACIONES_INV },
    { name: 'ubicacion_detalle', label: 'Detalle de ubicación (opcional)', placeholder: 'Ej.: armario de la izquierda' },
    { name: 'estado', label: 'Estado', type: 'select', required: true, options: Object.entries(ESTADOS_BIEN).filter(([k]) => k !== 'baja').map(([v, [l]]) => ({ v, l })) },
    { name: 'responsable_id', label: 'Responsable', type: 'select', options: personas.map((p) => ({ v: p.id, l: `${p.apellido}, ${p.nombre}` })) },
    { name: 'fecha_adquisicion', label: 'Fecha de adquisición', type: 'date' },
    { name: 'forma_adquisicion', label: 'Forma de adquisición', type: 'select', options: Object.entries(FORMAS_ADQUISICION).map(([v, l]) => ({ v, l })) },
    { name: 'observaciones', label: 'Observaciones', type: 'textarea', rows: 2, full: true },
  ];
  const valores = bien ? { ...bien } : { categoria: '', cantidad: 1, ubicacion: UBICACIONES_INV[0], estado: 'bueno' };

  const ok = await formModal({
    titulo: editando ? `Editar ${bien.codigo}` : 'Nuevo bien', ancho: true, campos, valores,
    textoGuardar: editando ? 'Guardar cambios' : 'Guardar bien',
    alAbrir: (form) => {
      const bloque = document.createElement('div');
      bloque.className = 'campo full foto-campo';
      bloque.innerHTML = `
        <label for="f_foto">Foto (opcional)</label>
        <div class="foto-fila">
          <div class="foto-prev" id="foto-prev">${bien?.foto_miniatura ? `<img src="${esc(bien.foto_miniatura)}" alt="Foto actual">` : '<span>Sin foto</span>'}</div>
          <div class="foto-ctl">
            <input id="f_foto" type="file" accept="image/*">
            <button type="button" class="btn chico sec" id="foto-quitar" ${bien?.foto_miniatura ? '' : 'hidden'}>Quitar foto</button>
            <div class="hint">${usaDrive
              ? `La foto se achica y se guarda en el Drive de la iglesia (carpeta "${esc(CONFIG.DRIVE_CARPETA_INVENTARIO || 'Secretaría - Inventario')}") con el código y el nombre del bien, para poder buscarla. Al guardar, Google puede pedirte autorización.`
              : 'Google Drive no está conectado: la foto se guarda solo dentro de la aplicación.'}</div>
          </div>
        </div>`;
      form.querySelector('.form-grid').appendChild(bloque);
      const prev = bloque.querySelector('#foto-prev');
      const btnQuitar = bloque.querySelector('#foto-quitar');
      if (usaDrive) precargarDrive();
      bloque.querySelector('#f_foto').addEventListener('change', async (ev) => {
        const archivo = ev.target.files?.[0];
        if (!archivo) return;
        prev.innerHTML = '<span>Preparando…</span>';
        try {
          foto = await procesarFoto(archivo);
          quitar = false;
          prev.innerHTML = `<img src="${foto.miniatura}" alt="Foto nueva">`;
          btnQuitar.hidden = false;
        } catch (e) {
          foto = null;
          prev.innerHTML = '<span>Sin foto</span>';
          ev.target.value = '';
          toast(errorAmigable(e), 'error');
        }
      });
      btnQuitar.onclick = () => {
        foto = null; quitar = true;
        bloque.querySelector('#f_foto').value = '';
        prev.innerHTML = '<span>Sin foto</span>';
        btnQuitar.hidden = true;
      };
    },
    guardar: async (v) => {
      if (!Number.isInteger(v.cantidad) || v.cantidad < 1) throw new Error('La cantidad debe ser un número entero de 1 o más.');
      const row = {
        nombre: v.nombre, descripcion: v.descripcion, categoria: v.categoria, cantidad: v.cantidad,
        ubicacion: v.ubicacion, ubicacion_detalle: v.ubicacion_detalle, estado: v.estado,
        responsable_id: v.responsable_id, fecha_adquisicion: v.fecha_adquisicion,
        forma_adquisicion: v.forma_adquisicion, observaciones: v.observaciones,
      };
      if (foto) {
        row.foto_miniatura = foto.miniatura;
        row.foto_drive_id = null; row.foto_url = null; row.foto_nombre = null;   // se completan al subir a Drive
      } else if (quitar) {
        row.foto_miniatura = null; row.foto_drive_id = null; row.foto_url = null; row.foto_nombre = null;
      }
      // La autorización de Google se pide ahora (todavía dentro del clic de "Guardar").
      let subirAhora = false;
      if (foto && usaDrive) {
        try { await autorizarDrive(); subirAhora = true; } catch (e) { avisoDrive = errorAmigable(e); }
      }
      guardado = editando
        ? await q(sb.from('inventario_bienes').update(row).eq('id', bien.id).select().single())
        : await q(sb.from('inventario_bienes').insert(row).select().single());

      if (foto && subirAhora) {
        try {
          const nombre = `${nombreArchivoSeguro(`${guardado.codigo} - ${guardado.nombre} (${catNombre(guardado.categoria)}) - ${guardado.ubicacion}`)}.jpg`;
          const desc = `Inventario ${estado.iglesia?.nombre || ''} · ${guardado.codigo} · ${guardado.nombre} · ${catNombre(guardado.categoria)} · ${guardado.ubicacion}`;
          const sub = await subirArchivo(foto.grande, nombre, CONFIG.DRIVE_CARPETA_INVENTARIO || 'Secretaría - Inventario', 'image/jpeg', desc);
          const url = sub.webViewLink || `https://drive.google.com/file/d/${sub.id}/view`;
          guardado = await q(sb.from('inventario_bienes').update({ foto_drive_id: sub.id, foto_url: url, foto_nombre: sub.name }).eq('id', guardado.id).select().single());
          try { await q(sb.from('archivos_drive').insert({ bien_id: guardado.id, nombre: sub.name, drive_id: sub.id, url })); } catch { /* el registro es secundario */ }
        } catch (e) { avisoDrive = errorAmigable(e); }
      }
    },
  });
  if (!ok) return null;
  if (avisoDrive) toast(`El bien se guardó, pero la foto no llegó al Drive: ${avisoDrive} Podés volver a elegir la foto desde "Editar".`, 'error');
  return guardado;
}

// =============================================================== LISTA
async function renderLista(cont, { query }) {
  const vista = cont.dataset.vista;
  const escribe = puedeEscribir();
  let bienes; let abiertos;
  try {
    [bienes, abiertos] = await Promise.all([
      q(sb.from('inventario_bienes').select('*').order('codigo')),
      q(sb.from('inventario_prestamos').select('*').is('devuelto_en', null)),
    ]);
  } catch (e) {
    if (faltaMigracion(e)) { cont.innerHTML = encabezado('Inventario') + AVISO_MIGRACION; return; }
    throw e;
  }
  const personas = Object.fromEntries((await personasBasico().catch(() => [])).map((p) => [p.id, p]));
  const resp = (b) => (b.responsable_id && personas[b.responsable_id] ? `${personas[b.responsable_id].apellido}, ${personas[b.responsable_id].nombre}` : '');
  const prestadas = {}; const venc = {};
  for (const p of abiertos) {
    prestadas[p.bien_id] = (prestadas[p.bien_id] || 0) + p.cantidad;
    if (situacion(p)[2]) venc[p.bien_id] = true;
  }
  const activos = bienes.filter((b) => b.estado !== 'baja');
  const unidades = activos.reduce((a, b) => a + b.cantidad, 0);
  const aRevisar = activos.filter((b) => b.estado === 'malo' || b.estado === 'en_reparacion').length;
  const nVenc = abiertos.filter((p) => situacion(p)[2]).length;
  const ubicaciones = [...new Set([...UBICACIONES_INV, ...bienes.map((b) => b.ubicacion)])];

  cont.innerHTML = `
    ${encabezado('Inventario', 'Bienes de la iglesia: dónde están, en qué estado y quién los tiene.', `
      <button class="btn sec" id="b-pdf">⬇ Informe PDF</button>
      <button class="btn sec" id="b-csv">⬇ Excel</button>
      ${escribe ? '<button class="btn" id="b-nuevo">+ Nuevo bien</button>' : ''}`)}
    <div class="grilla c4" style="margin-bottom:14px">
      <div class="tarjeta cifra"><div class="n">${activos.length}</div><div class="l">Bienes registrados</div></div>
      <div class="tarjeta cifra"><div class="n">${unidades}</div><div class="l">Unidades en total</div></div>
      <div class="tarjeta cifra"><div class="n">${aRevisar}</div><div class="l">Malos o en reparación</div></div>
      <div class="tarjeta cifra"><div class="n" style="${nVenc ? 'color:var(--rojo,#b3382c)' : ''}">${abiertos.length}</div><div class="l">Préstamos vigentes${nVenc ? ` (${nVenc} vencido${nVenc === 1 ? '' : 's'})` : ''}</div></div>
    </div>
    <div class="filtros" style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">
      <input id="f-txt" type="search" placeholder="Buscar por código, nombre, responsable…" style="flex:1;min-width:200px;padding:8px 10px;border:1px solid var(--borde);border-radius:8px">
      <select id="f-cat" style="padding:8px;border:1px solid var(--borde);border-radius:8px"><option value="">Todas las categorías</option>
        ${Object.entries(CATEGORIAS_INV).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select>
      <select id="f-ubi" style="padding:8px;border:1px solid var(--borde);border-radius:8px"><option value="">Todas las ubicaciones</option>
        ${ubicaciones.map((u) => `<option value="${esc(u)}">${esc(u)}</option>`).join('')}</select>
      <select id="f-est" style="padding:8px;border:1px solid var(--borde);border-radius:8px"><option value="">Todos los estados</option>
        ${Object.entries(ESTADOS_BIEN).map(([k, [l]]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select>
      <select id="f-pre" style="padding:8px;border:1px solid var(--borde);border-radius:8px">
        <option value="">Con o sin préstamo</option><option value="prestado">Prestados ahora</option><option value="vencido">Préstamo vencido</option></select>
    </div>
    <div class="tarjeta"><div class="cuerpo sin-pad" id="tabla"></div></div>
    <div style="color:var(--texto-2);font-size:12.5px;margin-top:6px">Los bienes dados de baja solo se ven al elegir el estado "Baja".</div>`;

  let visibles = [];
  function filtrar() {
    const txt = normalizar(document.getElementById('f-txt').value);
    const cat = document.getElementById('f-cat').value;
    const ubi = document.getElementById('f-ubi').value;
    const est = document.getElementById('f-est').value;
    const pre = document.getElementById('f-pre').value;
    return bienes.filter((b) => (est ? b.estado === est : b.estado !== 'baja')
      && (!cat || b.categoria === cat) && (!ubi || b.ubicacion === ubi)
      && (!pre || (pre === 'prestado' ? !!prestadas[b.id] : !!venc[b.id]))
      && (!txt || normalizar(`${b.codigo} ${b.nombre} ${b.descripcion || ''} ${catNombre(b.categoria)} ${b.ubicacion} ${resp(b)}`).includes(txt)));
  }
  function pintar() {
    if (cont.dataset.vista !== vista) return;
    visibles = filtrar();
    document.getElementById('tabla').innerHTML = tablaHTML(
      [
        { h: '', f: (b) => (b.foto_miniatura ? `<img class="inv-mini" src="${esc(b.foto_miniatura)}" alt="">` : '<span class="inv-mini vacia">📦</span>') },
        { h: 'Código', f: (b) => `<b>${esc(b.codigo)}</b>` },
        { h: 'Bien', f: (b) => `<b>${esc(b.nombre)}</b>${resp(b) ? `<div style="color:var(--texto-2);font-size:12px">${esc(resp(b))}</div>` : ''}` },
        { h: 'Categoría', f: (b) => esc(catNombre(b.categoria)) },
        { h: 'Ubicación', f: (b) => esc(b.ubicacion) },
        { h: 'Cant.', f: (b) => `${b.cantidad}${prestadas[b.id] ? `<div style="color:var(--texto-2);font-size:12px">${prestadas[b.id]} prestada${prestadas[b.id] === 1 ? '' : 's'}</div>` : ''}` },
        { h: 'Estado', f: (b) => `${badge(ESTADOS_BIEN[b.estado])}${venc[b.id] ? ' <span class="badge rojo">Préstamo vencido</span>' : prestadas[b.id] ? ' <span class="badge azul">Prestado</span>' : ''}` },
      ],
      visibles,
      { clickAttr: true, vacio: bienes.length ? 'No hay bienes con esos filtros.' : 'Todavía no hay bienes cargados. Agregá el primero con "+ Nuevo bien".' }
    );
    document.querySelectorAll('#tabla tr.click').forEach((tr) => { tr.onclick = () => { location.hash = `#/inventario/${tr.dataset.id}`; }; });
  }
  if (query?.prestamo === 'vencido' || query?.prestamo === 'prestado') document.getElementById('f-pre').value = query.prestamo;
  pintar();
  document.getElementById('f-txt').addEventListener('input', debounce(pintar, 150));
  ['f-cat', 'f-ubi', 'f-est', 'f-pre'].forEach((id) => { document.getElementById(id).onchange = pintar; });

  const filtrosTxt = () => {
    const partes = [];
    const val = (id) => document.getElementById(id);
    if (val('f-txt').value.trim()) partes.push(`Búsqueda: "${val('f-txt').value.trim()}"`);
    if (val('f-cat').value) partes.push(`Categoría: ${catNombre(val('f-cat').value)}`);
    if (val('f-ubi').value) partes.push(`Ubicación: ${val('f-ubi').value}`);
    if (val('f-est').value) partes.push(`Estado: ${estNombre(val('f-est').value)}`);
    if (val('f-pre').value) partes.push(val('f-pre').value === 'prestado' ? 'Prestados ahora' : 'Préstamo vencido');
    return partes.join(' · ');
  };

  // ---- Excel (CSV)
  document.getElementById('b-csv').onclick = () => {
    descargarCSV(`Inventario ${hoy()}.csv`,
      ['Código', 'Bien', 'Descripción', 'Categoría', 'Ubicación', 'Detalle de ubicación', 'Cantidad', 'Prestadas', 'Estado', 'Responsable', 'Adquisición', 'Fecha de adquisición', 'Observaciones', 'Foto en Drive'],
      visibles.map((b) => [b.codigo, b.nombre, b.descripcion, catNombre(b.categoria), b.ubicacion, b.ubicacion_detalle, b.cantidad, prestadas[b.id] || 0,
        estNombre(b.estado), resp(b), FORMAS_ADQUISICION[b.forma_adquisicion] || '', b.fecha_adquisicion ? fmtFecha(b.fecha_adquisicion) : '', b.observaciones, b.foto_url]));
  };

  // ---- Informe PDF
  document.getElementById('b-pdf').onclick = async () => {
    if (!visibles.length) { toast('No hay bienes para el informe con esos filtros.', 'error'); return; }
    await formModal({
      titulo: 'Informe de inventario', textoGuardar: 'Descargar PDF',
      aviso: `Se incluyen los ${visibles.length} bienes que ves en la lista${filtrosTxt() ? ` (${filtrosTxt()})` : ''}.`,
      campos: [{ name: 'agrupar', label: 'Ordenar el informe por', type: 'select', required: true, full: true, options: [
        { v: 'ubicacion', l: 'Ubicación' }, { v: 'categoria', l: 'Categoría' }, { v: 'ninguno', l: 'Sin agrupar (todo junto)' }] }],
      valores: { agrupar: 'ubicacion' },
      guardar: async ({ agrupar }) => {
        const fila = (b) => [b.codigo, `${b.nombre}${resp(b) ? ` (${resp(b)})` : ''}`, catNombre(b.categoria), b.ubicacion + (b.ubicacion_detalle ? ` - ${b.ubicacion_detalle}` : ''),
          `${b.cantidad}${prestadas[b.id] ? ` (${prestadas[b.id]} prest.)` : ''}`, estNombre(b.estado)];
        const clave = agrupar === 'categoria' ? (b) => catNombre(b.categoria) : agrupar === 'ubicacion' ? (b) => b.ubicacion : () => 'Todos los bienes';
        const mapa = new Map();
        for (const b of visibles) { const k = clave(b); if (!mapa.has(k)) mapa.set(k, []); mapa.get(k).push(b); }
        const grupos = [...mapa.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es')).map(([titulo, lista]) => ({ titulo, filas: lista.map(fila) }));
        const ids = new Set(visibles.map((b) => b.id));
        const porId = Object.fromEntries(bienes.map((b) => [b.id, b]));
        const prestamos = abiertos.filter((p) => ids.has(p.bien_id)).sort((a, b) => a.fecha_devolucion_prevista.localeCompare(b.fecha_devolucion_prevista))
          .map((p) => [`${porId[p.bien_id].codigo} ${porId[p.bien_id].nombre}${p.cantidad > 1 ? ` (${p.cantidad} u.)` : ''}`, p.prestado_a, fmtFecha(p.fecha_prestamo), fmtFecha(p.fecha_devolucion_prevista), situacion(p)[0]]);
        const porEstado = Object.entries(ESTADOS_BIEN).map(([k, [l]]) => [`Estado ${l}`, visibles.filter((b) => b.estado === k).length]).filter(([, n]) => n);
        const blob = generarPDFInventario({
          iglesia: estado.iglesia?.nombre || '', titulo: 'Inventario de bienes',
          fechaTxt: `${CONFIG.IGLESIA_LUGAR ? `${CONFIG.IGLESIA_LUGAR}, ` : ''}${fechaLarga(hoy())}`, filtros: filtrosTxt(),
          resumen: [['Bienes distintos', String(visibles.length)], ['Unidades en total', String(visibles.reduce((a, b) => a + b.cantidad, 0))], ...porEstado.map(([a, n]) => [a, String(n)]),
            ['Unidades prestadas ahora', String(abiertos.filter((p) => ids.has(p.bien_id)).reduce((a, p) => a + p.cantidad, 0))]],
          grupos, prestamos,
        });
        descargar(`Inventario ${hoy()}.pdf`, blob, 'application/pdf');
      },
    });
  };

  const nuevo = async () => {
    const b = await abrirFormBien({});
    if (b) { toast(`Bien ${b.codigo} guardado.`, 'ok'); location.hash = `#/inventario/${b.id}`; }
  };
  document.getElementById('b-nuevo')?.addEventListener('click', nuevo);
  if (query?.nuevo && escribe) nuevo();
}

// =============================================================== DETALLE
async function renderDetalle(cont, { id }) {
  const escribe = puedeEscribir();
  let bien; let prestamos; let movs;
  try {
    bien = await q(sb.from('inventario_bienes').select('*').eq('id', id).maybeSingle());
    if (bien) {
      [prestamos, movs] = await Promise.all([
        q(sb.from('inventario_prestamos').select('*').eq('bien_id', id).order('fecha_prestamo', { ascending: false }).order('creado_en', { ascending: false })),
        q(sb.from('inventario_movimientos').select('*').eq('bien_id', id).order('creado_en', { ascending: false })),
      ]);
    }
  } catch (e) {
    if (faltaMigracion(e)) { cont.innerHTML = encabezado('Inventario') + AVISO_MIGRACION; return; }
    throw e;
  }
  if (!bien) {
    cont.innerHTML = '<div class="tarjeta"><div class="vacio">No se encontró el bien. <a href="#/inventario">Volver al Inventario</a></div></div>';
    return;
  }
  const personas = Object.fromEntries((await personasBasico().catch(() => [])).map((p) => [p.id, p]));
  const responsable = bien.responsable_id && personas[bien.responsable_id] ? `${personas[bien.responsable_id].apellido}, ${personas[bien.responsable_id].nombre}` : '';
  const baja = bien.estado === 'baja';
  const abiertos = prestamos.filter((p) => !p.devuelto_en);
  const prestadas = abiertos.reduce((a, p) => a + p.cantidad, 0);
  const disponibles = bien.cantidad - prestadas;
  const recargar = () => renderDetalle(cont, { id });

  const ficha = [
    ['Categoría', catNombre(bien.categoria)],
    ['Ubicación', bien.ubicacion + (bien.ubicacion_detalle ? ` - ${bien.ubicacion_detalle}` : '')],
    ['Cantidad', `${bien.cantidad}${prestadas ? ` (${prestadas} prestada${prestadas === 1 ? '' : 's'}, ${disponibles} en la iglesia)` : ''}`],
    ['Estado', estNombre(bien.estado)],
    ['Responsable', responsable],
    ['Adquisición', [FORMAS_ADQUISICION[bien.forma_adquisicion], bien.fecha_adquisicion ? fmtFecha(bien.fecha_adquisicion) : ''].filter(Boolean).join(' - ')],
    ['Descripción', bien.descripcion],
    ['Observaciones', bien.observaciones],
  ];

  const fichaPDF = () => {
    try {
      const blob = generarPDFFichaBien({
        iglesia: estado.iglesia?.nombre || '', codigo: bien.codigo, nombre: bien.nombre, foto: bien.foto_miniatura,
        fechaTxt: `${CONFIG.IGLESIA_LUGAR ? `${CONFIG.IGLESIA_LUGAR}, ` : ''}${fechaLarga(hoy())}`,
        campos: ficha.filter(([, v]) => v),
        historial: movs.map((m) => [fmtFecha(m.fecha), `${TIPOS_MOV_INV[m.tipo] || m.tipo}: ${m.detalle}`]),
        prestamos: prestamos.map((p) => [p.prestado_a, String(p.cantidad), fmtFecha(p.fecha_prestamo), fmtFecha(p.fecha_devolucion_prevista), p.devuelto_en ? fmtFecha(p.devuelto_en) : '—', situacion(p)[0]]),
      });
      descargar(`${nombreArchivoSeguro(`Ficha ${bien.codigo} - ${bien.nombre}`)}.pdf`, blob, 'application/pdf');
    } catch (e) { toast(errorAmigable(e), 'error'); }
  };

  async function editar() {
    const b = await abrirFormBien({ bien });
    if (b) { toast('Cambios guardados.', 'ok'); await recargar(); }
  }

  async function prestar() {
    if (disponibles < 1) { toast('No quedan unidades disponibles para prestar.', 'error'); return; }
    const ok = await formModal({
      titulo: `Prestar ${bien.codigo}`, textoGuardar: 'Registrar préstamo', ancho: true,
      campos: [
        { name: 'prestado_a', label: 'Prestado a (persona o institución)', required: true, full: true },
        { name: 'contacto', label: 'Teléfono o contacto', full: true },
        { name: 'cantidad', label: `Cantidad (disponibles: ${disponibles})`, type: 'number', required: true },
        { name: 'fecha_prestamo', label: 'Fecha del préstamo', type: 'date', required: true },
        { name: 'fecha_devolucion_prevista', label: 'Fecha de devolución prevista', type: 'date', required: true },
        { name: 'observaciones', label: 'Observaciones (estado en que sale, condiciones)', type: 'textarea', rows: 2, full: true },
      ],
      valores: { cantidad: 1, fecha_prestamo: hoy(), fecha_devolucion_prevista: sumarDiasISO(hoy(), 7) },
      guardar: async (v) => {
        if (!Number.isInteger(v.cantidad) || v.cantidad < 1 || v.cantidad > disponibles) throw new Error(`La cantidad debe estar entre 1 y ${disponibles}.`);
        if (v.fecha_devolucion_prevista < v.fecha_prestamo) throw new Error('La devolución prevista no puede ser anterior a la fecha del préstamo.');
        await q(sb.from('inventario_prestamos').insert({ bien_id: bien.id, ...v }));
      },
    });
    if (ok) { toast('Préstamo registrado.', 'ok'); await recargar(); }
  }

  async function devolver(p) {
    const ok = await formModal({
      titulo: `Devolución: ${p.prestado_a}`, textoGuardar: 'Registrar devolución',
      aviso: `Préstamo de ${p.cantidad} unidad(es) desde el ${fmtFecha(p.fecha_prestamo)}.`,
      campos: [
        { name: 'devuelto_en', label: 'Fecha de devolución', type: 'date', required: true },
        { name: 'obs_devolucion', label: 'Observaciones (en qué estado volvió)', type: 'textarea', rows: 2, full: true },
      ],
      valores: { devuelto_en: hoy() },
      guardar: async (v) => {
        if (v.devuelto_en < p.fecha_prestamo) throw new Error('La devolución no puede ser anterior al préstamo.');
        await q(sb.from('inventario_prestamos').update(v).eq('id', p.id));
      },
    });
    if (ok) { toast('Devolución registrada.', 'ok'); await recargar(); }
  }

  async function anotar() {
    const ok = await formModal({
      titulo: 'Registrar en el historial', textoGuardar: 'Guardar',
      campos: [
        { name: 'tipo', label: 'Tipo', type: 'select', required: true, options: [{ v: 'reparacion', l: 'Reparación o mantenimiento' }, { v: 'nota', l: 'Nota u observación' }] },
        { name: 'fecha', label: 'Fecha', type: 'date', required: true },
        { name: 'detalle', label: 'Detalle', type: 'textarea', rows: 3, required: true, full: true, hint: 'Si el bien está en el taller, cambiá también su estado a "En reparación" desde Editar.' },
      ],
      valores: { tipo: 'reparacion', fecha: hoy() },
      guardar: async (v) => { await q(sb.from('inventario_movimientos').insert({ bien_id: bien.id, ...v })); },
    });
    if (ok) { toast('Registrado en el historial.', 'ok'); await recargar(); }
  }

  async function darBaja() {
    if (abiertos.length) { toast('Antes de dar de baja registrá la devolución de los préstamos pendientes.', 'error'); return; }
    const ok = await formModal({
      titulo: `Dar de baja ${bien.codigo}`, textoGuardar: 'Dar de baja',
      aviso: 'El bien no se borra: queda en el archivo con su historial y se puede reactivar.',
      campos: [
        { name: 'baja_motivo', label: 'Motivo de la baja', type: 'textarea', rows: 2, required: true, full: true, placeholder: 'Ej.: roto sin reparación, donado, perdido' },
        { name: 'baja_fecha', label: 'Fecha de la baja', type: 'date', required: true },
      ],
      valores: { baja_fecha: hoy() },
      guardar: async (v) => { await q(sb.from('inventario_bienes').update({ estado: 'baja', ...v }).eq('id', bien.id)); },
    });
    if (ok) { toast('Bien dado de baja.', 'ok'); await recargar(); }
  }

  async function reactivar() {
    const ok = await formModal({
      titulo: `Reactivar ${bien.codigo}`, textoGuardar: 'Reactivar',
      campos: [{ name: 'estado', label: 'Estado con el que vuelve', type: 'select', required: true, full: true,
        options: Object.entries(ESTADOS_BIEN).filter(([k]) => k !== 'baja').map(([v, [l]]) => ({ v, l })) }],
      valores: { estado: 'bueno' },
      guardar: async (v) => { await q(sb.from('inventario_bienes').update({ estado: v.estado }).eq('id', bien.id)); },
    });
    if (ok) { toast('Bien reactivado.', 'ok'); await recargar(); }
  }

  const filaPrestamo = (p) => {
    const [txt, color] = situacion(p);
    return `<tr>
      <td><b>${esc(p.prestado_a)}</b>${p.contacto ? `<div style="color:var(--texto-2);font-size:12px">${esc(p.contacto)}</div>` : ''}${p.observaciones ? `<div style="color:var(--texto-2);font-size:12px">${esc(p.observaciones)}</div>` : ''}</td>
      <td>${p.cantidad}</td><td>${fmtFecha(p.fecha_prestamo)}</td><td>${fmtFecha(p.fecha_devolucion_prevista)}</td>
      <td><span class="badge ${color}">${esc(txt)}</span>${p.obs_devolucion ? `<div style="color:var(--texto-2);font-size:12px">${esc(p.obs_devolucion)}</div>` : ''}</td>
      <td>${!p.devuelto_en && escribe ? `<button class="btn chico sec" data-dev="${p.id}">Registrar devolución</button>` : ''}</td></tr>`;
  };

  cont.innerHTML = `
    <div class="no-imprimir" style="margin-bottom:10px"><a href="#/inventario">← Inventario</a></div>
    ${encabezado(`${bien.codigo} · ${bien.nombre}`, `${catNombre(bien.categoria)} · ${bien.ubicacion}`, `
      <button class="btn sec" id="b-pdf">⬇ Ficha PDF</button>
      ${escribe && !baja ? '<button class="btn sec" id="b-edit">✏️ Editar</button>' : ''}
      ${escribe && !baja ? '<button class="btn" id="b-prestar">↗ Prestar</button>' : ''}
      ${escribe && !baja ? '<button class="btn sec" id="b-anotar">🔧 Reparación / nota</button>' : ''}
      ${escribe && !baja ? '<button class="btn rojo" id="b-baja">Dar de baja</button>' : ''}
      ${escribe && baja ? '<button class="btn verde" id="b-react">↩ Reactivar</button>' : ''}`)}
    ${baja ? `<div class="aviso info">🗄 Dado de baja el ${fmtFecha(bien.baja_fecha)}. Motivo: ${esc(bien.baja_motivo || '—')}</div>` : ''}
    ${abiertos.some((p) => situacion(p)[2]) ? '<div class="aviso warn">Hay un préstamo vencido: revisá la devolución más abajo.</div>' : ''}
    <div class="tarjeta"><div class="cuerpo">
      <div class="inv-ficha">
        <div class="inv-foto">${bien.foto_miniatura
          ? (bien.foto_url ? `<a href="${esc(bien.foto_url)}" target="_blank" rel="noopener" title="Abrir la foto original en Drive"><img src="${esc(bien.foto_miniatura)}" alt="Foto de ${esc(bien.nombre)}"></a>` : `<img src="${esc(bien.foto_miniatura)}" alt="Foto de ${esc(bien.nombre)}">`)
          : '<div class="sinfoto">📦<br>Sin foto</div>'}
          ${bien.foto_url ? `<div class="hint"><a href="${esc(bien.foto_url)}" target="_blank" rel="noopener">Ver original en Drive</a></div>` : bien.foto_miniatura && driveDisponible() ? '<div class="hint">Esta foto no tiene copia en Drive. Si querés, volvé a elegirla desde Editar.</div>' : ''}
        </div>
        <dl class="inv-datos">${ficha.filter(([, v]) => v).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
      </div>
    </div></div>
    <div class="tarjeta mt">
      <div class="enc"><h2>Préstamos</h2></div>
      <div class="cuerpo ${prestamos.length ? 'sin-pad' : ''}">${prestamos.length
        ? `<div class="tabla-wrap"><table class="tabla"><thead><tr><th>Prestado a</th><th>Cant.</th><th>Desde</th><th>Devolver el</th><th>Situación</th><th></th></tr></thead><tbody>${prestamos.map(filaPrestamo).join('')}</tbody></table></div>`
        : '<div style="color:var(--texto-2);font-size:14px">Este bien nunca se prestó.</div>'}</div>
    </div>
    <div class="tarjeta mt">
      <div class="enc"><h2>Historial</h2></div>
      <div class="cuerpo sin-pad"><ul class="lista">${movs.map((m) => `<li><div><div class="t">${esc(m.detalle)}</div><div class="s">${esc(TIPOS_MOV_INV[m.tipo] || m.tipo)}</div></div><div class="s" style="white-space:nowrap">${fmtFecha(m.fecha)}</div></li>`).join('') || '<li><div class="s">Sin movimientos.</div></li>'}</ul></div>
    </div>`;

  document.getElementById('b-pdf').onclick = fichaPDF;
  document.getElementById('b-edit')?.addEventListener('click', editar);
  document.getElementById('b-prestar')?.addEventListener('click', prestar);
  document.getElementById('b-anotar')?.addEventListener('click', anotar);
  document.getElementById('b-baja')?.addEventListener('click', darBaja);
  document.getElementById('b-react')?.addEventListener('click', reactivar);
  cont.querySelectorAll('[data-dev]').forEach((b) => { b.onclick = () => devolver(prestamos.find((p) => p.id === b.dataset.dev)); });
  if (driveDisponible() && escribe) precargarDrive();
}
