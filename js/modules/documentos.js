// Documentos: archivo digital con categorías, etiquetas, vencimientos y buscador.
// Los archivos se suben al Drive de la iglesia (una subcarpeta por categoría); también se pueden
// registrar solo enlaces (por ejemplo videos en YouTube o en Drive). Nada se borra: se archiva.
import { sb, q } from '../supabase.js';
import { CONFIG } from '../config.js';
import { estado, puedeEscribir, puede } from '../state.js';
import { CATEGORIAS_DOC } from '../constantes.js';
import { driveDisponible, subirArchivo, autorizarDrive, precargarDrive } from '../drive.js';
import { reducirImagen } from '../imagen.js';
import {
  esc, fmtFecha, fmtFechaHora, badge, tablaHTML, encabezado, formModal, confirmar, toast, hoy,
  errorAmigable, debounce, normalizar,
} from '../ui.js';

const faltaMigracion = (e) => /relation|does not exist|schema cache|permission denied|column/i.test(e?.message || '');
const AVISO_MIGRACION = `<div class="tarjeta"><div class="cuerpo"><div class="aviso warn">Falta activar los documentos en la base de datos. Ejecutá el archivo <b>supabase/07-documentos.sql</b> en Supabase → SQL Editor y recargá esta página.</div></div></div>`;

const MAX_MB = 50;
const catNombre = (c) => CATEGORIAS_DOC[c] || c || '—';
const aUTC = (f) => { const [y, m, d] = String(f).slice(0, 10).split('-').map(Number); return Date.UTC(y, m - 1, d); };
const diasEntre = (a, b) => Math.round((aUTC(b) - aUTC(a)) / 86400000);
const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;
const seguro = (t, max = 150) => String(t).replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const tamTxt = (b) => (!b ? '' : b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1048576).toFixed(1)} MB`);
const extension = (nombre) => { const m = /\.([A-Za-z0-9]{1,8})$/.exec(nombre || ''); return m ? m[1].toLowerCase() : ''; };
const etiquetasDe = (txt) => [...new Set(String(txt || '').split(/[,;\n]/).map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 12);

// Vencimiento → [texto, color, clave] (clave: vencido | porvencer | vigente)
function vencimiento(d) {
  if (!d.vence_el) return null;
  const n = diasEntre(hoy(), d.vence_el);
  if (n < 0) return [`Vencido hace ${plural(-n, 'día', 'días')}`, 'rojo', 'vencido'];
  if (n === 0) return ['Vence hoy', 'naranja', 'porvencer'];
  if (n <= 30) return [`Vence en ${plural(n, 'día', 'días')}`, 'naranja', 'porvencer'];
  return [`Vence el ${fmtFecha(d.vence_el)}`, '', 'vigente'];
}

export async function render(cont, ctx) {
  if (ctx.id) return renderDetalle(cont, ctx);
  return renderLista(cont, ctx);
}

// =============================================================== FORMULARIO
async function abrirForm({ doc = null, modo = 'archivo' }) {
  const editando = !!doc;
  const origen = editando ? doc.origen : modo;
  const usaDrive = driveDisponible();
  let archivo = null;
  let guardado = null;
  let avisoDrive = '';

  const campos = [
    { name: 'titulo', label: 'Título', required: true, full: true, placeholder: origen === 'enlace' ? 'Ej.: Video del bautismo - marzo 2026' : 'Ej.: Estatuto vigente' },
    { name: 'categoria', label: 'Categoría', type: 'select', required: true, options: Object.entries(CATEGORIAS_DOC).map(([v, l]) => ({ v, l })) },
    { name: 'fecha_documento', label: 'Fecha del documento', type: 'date', required: true },
    ...(origen === 'enlace' ? [{ name: 'url', label: 'Enlace (YouTube, Drive, etc.)', required: true, full: true, placeholder: 'https://…' }] : []),
    { name: 'descripcion', label: 'Descripción', type: 'textarea', rows: 2, full: true },
    { name: 'etiquetas_txt', label: 'Etiquetas (separadas por coma)', full: true, placeholder: 'Ej.: escritura, seguro, 2026' },
    { name: 'vence_el', label: 'Vence el (opcional)', type: 'date', hint: 'Para seguros, habilitaciones, contratos… En Inicio te avisa 30 días antes.' },
    { name: 'restringido', label: 'Acceso', type: 'checks', options: [{ v: 'si', l: 'Restringido: solo administrador, secretario y pastor' }] },
  ];
  const valores = doc
    ? { ...doc, etiquetas_txt: (doc.etiquetas || []).join(', '), restringido: doc.restringido ? ['si'] : [] }
    : { fecha_documento: hoy(), restringido: [] };

  const ok = await formModal({
    titulo: editando ? 'Editar documento' : origen === 'enlace' ? 'Agregar enlace' : 'Subir documento', ancho: true, campos, valores,
    textoGuardar: editando ? 'Guardar cambios' : origen === 'enlace' ? 'Guardar enlace' : 'Subir y guardar',
    alAbrir: (form) => {
      if (editando || origen !== 'archivo') return;
      const bloque = document.createElement('div');
      bloque.className = 'campo full';
      bloque.innerHTML = `
        <label for="f_archivo">Archivo <span class="req"> *</span></label>
        <input id="f_archivo" type="file">
        <div class="hint">${usaDrive
          ? `PDF, fotos, Word, Excel… (hasta ${MAX_MB} MB). Se guarda en el Drive de la iglesia, carpeta "${esc(CONFIG.DRIVE_CARPETA_DOCUMENTOS || 'Secretaría - Documentos')}", en una subcarpeta según la categoría. Al guardar, Google puede pedirte autorización.`
              : 'Google Drive no está conectado (ver README): por ahora solo se pueden registrar enlaces.'}</div>`;
      form.querySelector('.form-grid').prepend(bloque);
      if (usaDrive) precargarDrive();
      const inp = bloque.querySelector('#f_archivo');
      inp.addEventListener('change', () => {
        archivo = inp.files?.[0] || null;
        if (archivo && archivo.size > MAX_MB * 1048576) {
          toast(`El archivo pesa ${tamTxt(archivo.size)}; el máximo es ${MAX_MB} MB. Subilo a mano al Drive y registralo como enlace.`, 'error');
          inp.value = ''; archivo = null; return;
        }
        const t = form.elements.titulo;
        if (archivo && t && !t.value.trim()) t.value = archivo.name.replace(/\.[^.]+$/, '');
      });
    },
    guardar: async (v) => {
      const base = {
        titulo: v.titulo, categoria: v.categoria, fecha_documento: v.fecha_documento, descripcion: v.descripcion,
        etiquetas: etiquetasDe(v.etiquetas_txt), vence_el: v.vence_el, restringido: v.restringido.includes('si'),
      };
      if (editando) {
        const row = { ...base };
        if (origen === 'enlace') row.url = v.url;
        guardado = await q(sb.from('documentos').update(row).eq('id', doc.id).select().single());
        return;
      }
      if (origen === 'enlace') {
        if (!/^https?:\/\/\S+$/i.test(v.url || '')) throw new Error('El enlace tiene que empezar con http:// o https://');
        guardado = await q(sb.from('documentos').insert({ ...base, origen: 'enlace', url: v.url }).select().single());
        return;
      }
      // ---- archivo → Drive
      if (!archivo) throw new Error('Elegí el archivo que querés subir.');
      if (!usaDrive) throw new Error('Google Drive no está conectado. Registrá el documento como enlace.');
      await autorizarDrive(); // todavía dentro del clic de "Subir y guardar"
      let blob = archivo; let mime = archivo.type || 'application/octet-stream'; let ext = extension(archivo.name);
      if (/^image\/(jpeg|png|webp)$/.test(mime) && archivo.size > 1.5 * 1048576) {
        try { blob = await reducirImagen(archivo); mime = 'image/jpeg'; ext = 'jpg'; } catch { /* se sube la original */ }
      }
      const nombre = `${seguro(`${v.fecha_documento} - ${catNombre(v.categoria)} - ${v.titulo}`)}${ext ? `.${ext}` : ''}`;
      const desc = `Documento ${estado.iglesia?.nombre || ''} · ${catNombre(v.categoria)} · ${v.titulo}${base.etiquetas.length ? ` · ${base.etiquetas.join(', ')}` : ''}`;
      const sub = await subirArchivo(blob, nombre, [CONFIG.DRIVE_CARPETA_DOCUMENTOS || 'Secretaría - Documentos', catNombre(v.categoria)], mime, desc);
      const url = sub.webViewLink || `https://drive.google.com/file/d/${sub.id}/view`;
      try {
        guardado = await q(sb.from('documentos').insert({
          ...base, origen: 'archivo', url, drive_id: sub.id, nombre_archivo: sub.name || nombre, mime, tamano: blob.size,
        }).select().single());
      } catch (e) {
        throw new Error(`${errorAmigable(e)} (El archivo ya quedó en tu Drive, en "${catNombre(v.categoria)}", pero no se registró acá. Volvé a intentar o registralo como enlace.)`);
      }
    },
  });
  if (!ok) return null;
  if (avisoDrive) toast(avisoDrive, 'error');
  return guardado;
}

// =============================================================== LISTA
async function renderLista(cont, { query }) {
  const vista = cont.dataset.vista;
  const escribe = puedeEscribir();
  const verCopias = puede('administrador', 'secretario', 'pastor');
  let docs;
  try {
    docs = await q(sb.from('documentos').select('*').order('fecha_documento', { ascending: false }).order('creado_en', { ascending: false }));
  } catch (e) {
    if (faltaMigracion(e)) { cont.innerHTML = encabezado('Documentos') + AVISO_MIGRACION; return; }
    throw e;
  }
  const anios = [...new Set(docs.map((d) => d.fecha_documento.slice(0, 4)))].sort().reverse();
  let pestana = 'docs';
  const nVenc = docs.filter((d) => !d.archivado && vencimiento(d)?.[2] === 'vencido').length;
  const nPor = docs.filter((d) => !d.archivado && vencimiento(d)?.[2] === 'porvencer').length;

  cont.innerHTML = `
    ${encabezado('Documentos', 'Archivo digital de la iglesia, guardado en el Drive.', escribe ? `
      <button class="btn sec" id="b-enlace">🔗 Agregar enlace</button>
      <button class="btn" id="b-subir">⬆ Subir documento</button>` : '')}
    ${nVenc || nPor ? `<div class="aviso warn">${nVenc ? `${plural(nVenc, 'documento vencido', 'documentos vencidos')}` : ''}${nVenc && nPor ? ' y ' : ''}${nPor ? `${plural(nPor, 'documento vence', 'documentos vencen')} en los próximos 30 días` : ''}.</div>` : ''}
    ${verCopias ? '<div class="tabs" id="tabs"><button data-p="docs" class="activo">Documentos</button><button data-p="copias">Copias automáticas</button></div>' : ''}
    <div id="vista-docs">
      <div class="filtros" style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">
        <input id="f-txt" type="search" placeholder="Buscar por título, descripción o etiqueta…" style="flex:1;min-width:200px;padding:8px 10px;border:1px solid var(--borde);border-radius:8px">
        <select id="f-cat" style="padding:8px;border:1px solid var(--borde);border-radius:8px"><option value="">Todas las categorías</option>
          ${Object.entries(CATEGORIAS_DOC).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select>
        <select id="f-anio" style="padding:8px;border:1px solid var(--borde);border-radius:8px"><option value="">Todos los años</option>
          ${anios.map((y) => `<option value="${y}">${y}</option>`).join('')}</select>
        <select id="f-venc" style="padding:8px;border:1px solid var(--borde);border-radius:8px">
          <option value="">Con o sin vencimiento</option><option value="vencidos">Vencidos</option><option value="porvencer">Vencen en 30 días</option><option value="convenc">Con vencimiento</option></select>
        <label style="display:flex;align-items:center;gap:6px;font-size:14px"><input type="checkbox" id="f-arch"> Ver archivados</label>
      </div>
      <div class="tarjeta"><div class="cuerpo sin-pad" id="tabla"></div></div>
    </div>
    <div id="vista-copias" hidden></div>`;

  function pintar() {
    if (cont.dataset.vista !== vista) return;
    const txt = normalizar(document.getElementById('f-txt').value);
    const cat = document.getElementById('f-cat').value;
    const anio = document.getElementById('f-anio').value;
    const venc = document.getElementById('f-venc').value;
    const arch = document.getElementById('f-arch').checked;
    const lista = docs.filter((d) => (arch || !d.archivado) && (!cat || d.categoria === cat) && (!anio || d.fecha_documento.startsWith(anio))
      && (!venc || (venc === 'convenc' ? !!d.vence_el : venc === 'vencidos' ? vencimiento(d)?.[2] === 'vencido' : vencimiento(d)?.[2] === 'porvencer'))
      && (!txt || normalizar(`${d.titulo} ${d.descripcion || ''} ${(d.etiquetas || []).join(' ')} ${catNombre(d.categoria)}`).includes(txt)));
    document.getElementById('tabla').innerHTML = tablaHTML(
      [
        { h: 'Fecha', f: (d) => fmtFecha(d.fecha_documento) },
        { h: 'Título', f: (d) => `<b>${esc(d.titulo)}</b>${d.restringido ? ' <span title="Restringido">🔒</span>' : ''}${d.origen === 'enlace' ? ' <span class="badge azul">Enlace</span>' : ''}${d.archivado ? ' <span class="badge">Archivado</span>' : ''}
          ${(d.etiquetas || []).length ? `<div style="color:var(--texto-2);font-size:12px">${d.etiquetas.map((t) => `#${esc(t)}`).join(' ')}</div>` : ''}` },
        { h: 'Categoría', f: (d) => esc(catNombre(d.categoria)) },
        { h: 'Vencimiento', f: (d) => { const v = vencimiento(d); return v && !d.archivado ? `<span class="badge ${v[1]}">${esc(v[0])}</span>` : v ? fmtFecha(d.vence_el) : '<span style="color:var(--texto-2)">—</span>'; } },
        { h: '', f: (d) => `<a class="btn chico sec" href="${esc(d.url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">Abrir</a>` },
      ],
      lista,
      { clickAttr: true, vacio: docs.length ? 'No hay documentos con esos filtros.' : 'Todavía no hay documentos. Subí el primero con "Subir documento".' }
    );
    document.querySelectorAll('#tabla tr.click').forEach((tr) => { tr.onclick = () => { location.hash = `#/documentos/${tr.dataset.id}`; }; });
  }
  if (query?.venc) document.getElementById('f-venc').value = query.venc === 'porvencer' ? 'porvencer' : 'vencidos';
  pintar();
  document.getElementById('f-txt').addEventListener('input', debounce(pintar, 150));
  ['f-cat', 'f-anio', 'f-venc', 'f-arch'].forEach((id) => { document.getElementById(id).onchange = pintar; });

  // ---- Copias automáticas (actas, notas y fotos de inventario guardadas en Drive)
  async function pintarCopias() {
    const box = document.getElementById('vista-copias');
    box.innerHTML = '<div class="cargando">Cargando…</div>';
    try {
      const filas = await q(sb.from('archivos_drive').select('*').order('creado_en', { ascending: false }).limit(300));
      const tipo = (a) => (a.acta_id ? 'Acta' : a.nota_id ? 'Nota o certificado' : a.bien_id ? 'Foto de inventario' : 'Otro');
      box.innerHTML = `<div class="aviso info">Acá aparecen las copias que la plataforma guarda sola en el Drive: actas, notas, certificados y fotos del inventario.</div>
        <div class="tarjeta"><div class="cuerpo sin-pad">${tablaHTML([
          { h: 'Guardada', f: (a) => fmtFechaHora(a.creado_en) },
          { h: 'Archivo', f: (a) => `<b>${esc(a.nombre)}</b>` },
          { h: 'Tipo', f: (a) => esc(tipo(a)) },
          { h: '', f: (a) => `<a class="btn chico sec" href="${esc(a.url)}" target="_blank" rel="noopener">Abrir</a>` },
        ], filas, { vacio: 'Todavía no hay copias guardadas en Drive.' })}</div></div>`;
    } catch (e) { box.innerHTML = `<div class="aviso warn">${esc(errorAmigable(e))}</div>`; }
  }
  document.getElementById('tabs')?.addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-p]');
    if (!b) return;
    pestana = b.dataset.p;
    document.querySelectorAll('#tabs button').forEach((x) => x.classList.toggle('activo', x === b));
    document.getElementById('vista-docs').hidden = pestana !== 'docs';
    document.getElementById('vista-copias').hidden = pestana !== 'copias';
    if (pestana === 'copias') pintarCopias();
  });

  const nuevo = async (modo) => {
    const d = await abrirForm({ modo });
    if (d) { toast('Documento guardado.', 'ok'); location.hash = `#/documentos/${d.id}`; }
  };
  document.getElementById('b-subir')?.addEventListener('click', () => nuevo('archivo'));
  document.getElementById('b-enlace')?.addEventListener('click', () => nuevo('enlace'));
  if (query?.nuevo && escribe) nuevo('archivo');
  if (escribe && driveDisponible()) precargarDrive();
}

// =============================================================== DETALLE
async function renderDetalle(cont, { id }) {
  const escribe = puedeEscribir();
  let doc;
  try {
    doc = await q(sb.from('documentos').select('*').eq('id', id).maybeSingle());
  } catch (e) {
    if (faltaMigracion(e)) { cont.innerHTML = encabezado('Documentos') + AVISO_MIGRACION; return; }
    throw e;
  }
  if (!doc) {
    cont.innerHTML = '<div class="tarjeta"><div class="vacio">No se encontró el documento. <a href="#/documentos">Volver a Documentos</a></div></div>';
    return;
  }
  const venc = vencimiento(doc);
  const recargar = () => renderDetalle(cont, { id });
  const datos = [
    ['Categoría', catNombre(doc.categoria)],
    ['Fecha del documento', fmtFecha(doc.fecha_documento)],
    ['Descripción', doc.descripcion],
    ['Etiquetas', (doc.etiquetas || []).map((t) => `#${t}`).join('  ')],
    ['Vencimiento', doc.vence_el ? `${fmtFecha(doc.vence_el)}${venc && !doc.archivado ? ` (${venc[0].toLowerCase()})` : ''}` : ''],
    ['Archivo', doc.origen === 'archivo' ? `${doc.nombre_archivo || ''}${doc.tamano ? ` · ${tamTxt(doc.tamano)}` : ''}` : 'Enlace externo'],
    ['Acceso', doc.restringido ? 'Restringido (administrador, secretario y pastor)' : 'Administrador, secretario, pastor y comisión'],
    ['Registrado', fmtFechaHora(doc.creado_en)],
  ];

  async function editar() {
    const d = await abrirForm({ doc });
    if (d) { toast('Cambios guardados.', 'ok'); await recargar(); }
  }
  async function archivar() {
    if (!(await confirmar('¿Archivar este documento? Deja de verse en la lista (se puede ver con "Ver archivados" y restaurar). El archivo no se borra del Drive.', { textoOk: 'Archivar', peligro: true }))) return;
    try { await q(sb.from('documentos').update({ archivado: true }).eq('id', id)); toast('Documento archivado.', 'ok'); await recargar(); } catch (e) { toast(errorAmigable(e), 'error'); }
  }
  async function restaurar() {
    try { await q(sb.from('documentos').update({ archivado: false }).eq('id', id)); toast('Documento restaurado.', 'ok'); await recargar(); } catch (e) { toast(errorAmigable(e), 'error'); }
  }

  cont.innerHTML = `
    <div class="no-imprimir" style="margin-bottom:10px"><a href="#/documentos">← Documentos</a></div>
    ${encabezado(doc.titulo, `${catNombre(doc.categoria)}${doc.origen === 'enlace' ? ' · Enlace' : ''}`, `
      <a class="btn" href="${esc(doc.url)}" target="_blank" rel="noopener" id="b-abrir">${doc.origen === 'enlace' ? '↗ Abrir enlace' : '↗ Abrir en Drive'}</a>
      ${escribe && !doc.archivado ? '<button class="btn sec" id="b-edit">✏️ Editar</button>' : ''}
      ${escribe && !doc.archivado ? '<button class="btn rojo" id="b-arch">Archivar</button>' : ''}
      ${escribe && doc.archivado ? '<button class="btn verde" id="b-rest">↩ Restaurar</button>' : ''}`)}
    ${doc.archivado ? '<div class="aviso info">🗄 Archivado: forma parte del archivo histórico.</div>' : ''}
    ${venc && !doc.archivado && venc[2] !== 'vigente' ? `<div class="aviso ${venc[2] === 'vencido' ? 'warn' : 'info'}">${esc(venc[0])}.</div>` : ''}
    <div class="tarjeta"><div class="cuerpo"><dl class="inv-datos">${datos.filter(([, v]) => v).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl></div></div>`;

  document.getElementById('b-edit')?.addEventListener('click', editar);
  document.getElementById('b-arch')?.addEventListener('click', archivar);
  document.getElementById('b-rest')?.addEventListener('click', restaurar);
}
