// Notas y certificados: modelos, borrador → emitida (con número por año), PDF y copia en Drive.
import { sb, q } from '../supabase.js';
import { CONFIG } from '../config.js';
import { LOGO } from '../logo.js';
import { estado, puede, puedeEscribir, mapaPersonas } from '../state.js';
import { MODELOS, nombreModelo, fechaLarga, lugarPorDefecto } from '../notas-modelos.js';
import { generarPDFNota } from '../pdf.js';
import { driveDisponible, subirPDF, precargarDrive } from '../drive.js';
import {
  esc, fmtFecha, fmtFechaHora, badge, tablaHTML, encabezado, formModal, confirmar, toast, hoy,
  errorAmigable, abrirModal, descargar, debounce, normalizar,
} from '../ui.js';

const ESTADOS_NOTA = { borrador: ['Borrador', 'naranja'], emitida: ['Emitida', 'verde'], archivada: ['Archivada', ''] };
const numTxt = (n) => (n.numero ? `${n.numero}/${n.anio}` : null);
const faltaMigracion = (e) => /relation|does not exist|schema cache|permission denied/i.test(e?.message || '');
const AVISO_MIGRACION = `<div class="tarjeta"><div class="cuerpo"><div class="aviso warn">Falta activar las notas en la base de datos. Ejecutá el archivo <b>supabase/04-notas.sql</b> en Supabase → SQL Editor y recargá esta página.</div></div></div>`;

const resumen = (n) => {
  const d = n.datos || {};
  if (MODELOS[n.tipo]?.cert) return d.nombre || [d.esposo, d.esposa].filter(Boolean).join(' y ') || '—';
  return n.asunto || '—';
};

// Quién firma: se toma de las autoridades vigentes (Pastor / Secretario).
async function resolverFirmantes(claves) {
  let aut = [];
  try { aut = await q(sb.from('autoridades').select('persona_id,cargo').is('fecha_fin', null).eq('archivado', false)); } catch { /* sin datos */ }
  const mapa = await mapaPersonas();
  const buscar = (res, etiqueta) => {
    let a = null;
    for (const re of res) { a = aut.find((x) => re.test(x.cargo || '')); if (a) break; }
    const p = a && mapa[a.persona_id];
    return { nombre: p ? `${p.nombre} ${p.apellido}` : '', cargo: a?.cargo || etiqueta };
  };
  return (claves || []).map((k) => (k === 'pastor' ? buscar([/^pastor$/i, /^pastor/i], 'Pastor') : buscar([/^secretari/i, /secretari/i], 'Secretario/a')));
}

export async function render(cont, ctx) {
  if (ctx.id) return renderDetalle(cont, ctx);
  return renderLista(cont, ctx);
}

// =============================================================== FORMULARIO
async function abrirForm({ tipo, nota = null, copiaDe = null }) {
  const modelo = MODELOS[tipo];
  const editando = !!nota;
  const base = nota || copiaDe; // datos de partida (edición o copia)
  const conMiembro = modelo.campos.some((c) => c.name === 'nombre') && tipo !== 'presentacion';
  let personas = [];
  if (conMiembro) {
    try { personas = await q(sb.from('personas').select('id,nombre,apellido,dni').eq('archivado', false).order('apellido')); } catch { /* sin acceso */ }
  }
  const campos = [
    ...(conMiembro && personas.length ? [{
      name: 'persona_id', label: 'Miembro de la iglesia (opcional: completa nombre y DNI)', type: 'select', full: true,
      options: personas.map((p) => ({ v: p.id, l: `${p.apellido}, ${p.nombre}` })),
    }] : []),
    ...modelo.campos,
    { name: 'fecha', label: modelo.cert ? 'Fecha de emisión' : 'Fecha de la nota', type: 'date', required: true },
    { name: 'lugar', label: 'Lugar' },
    { name: 'cuerpo', label: 'Texto', type: 'textarea', rows: 9, required: true, full: true, hint: 'Se arma solo con los datos de arriba mientras no lo toques. Después podés corregirlo a mano.' },
    { name: 'firman', label: 'Firman', type: 'checks', options: [{ v: 'secretario', l: 'Secretario/a' }, { v: 'pastor', l: 'Pastor' }] },
  ];

  const contexto = (f) => ({ iglesia: estado.iglesia?.nombre || '', lugar: f.lugar?.value.trim() || '', fecha: f.fecha?.value || hoy() });
  const leerDatos = (f) => Object.fromEntries(modelo.campos.map((c) => [c.name, f.elements[c.name]?.value?.trim() || '']));

  const valores = base
    ? { ...base.datos, persona_id: base.persona_id, fecha: copiaDe ? hoy() : base.fecha, lugar: base.lugar, cuerpo: base.cuerpo, firman: base.datos?._firman || modelo.firman }
    : { fecha: hoy(), lugar: lugarPorDefecto(), firman: modelo.firman, cuerpo: modelo.texto({}, { iglesia: estado.iglesia?.nombre || '', lugar: lugarPorDefecto(), fecha: hoy() }) };

  let guardada = null;
  const ok = await formModal({
    titulo: `${editando ? 'Editar' : copiaDe ? 'Copia de' : 'Nueva'}: ${modelo.nombre}`, ancho: true, campos, valores,
    textoGuardar: editando ? 'Guardar cambios' : 'Guardar borrador',
    alAbrir: (form) => {
      let editadoAMano = !!base;
      const area = form.elements.cuerpo;
      const regenerar = () => { area.value = modelo.texto(leerDatos(form), contexto(form.elements)); };
      const boton = document.createElement('button');
      boton.type = 'button'; boton.className = 'btn chico sec'; boton.style.marginTop = '6px';
      boton.textContent = '↻ Rehacer el texto con los datos';
      boton.onclick = () => { regenerar(); editadoAMano = false; };
      area.insertAdjacentElement('afterend', boton);
      const alCambiar = (ev) => {
        if (ev.target === area) { editadoAMano = true; return; }
        if (ev.target.name === 'persona_id') {
          const p = personas.find((x) => x.id === ev.target.value);
          if (p) {
            if (form.elements.nombre) form.elements.nombre.value = `${p.nombre} ${p.apellido}`;
            if (form.elements.dni) form.elements.dni.value = p.dni || '';
          }
        }
        if (!editadoAMano) regenerar();
      };
      form.addEventListener('input', alCambiar);
      form.addEventListener('change', alCambiar);
    },
    guardar: async (v) => {
      const { persona_id, fecha, lugar, cuerpo, firman, ...especificos } = v;
      const row = {
        tipo, fecha, lugar, cuerpo, persona_id,
        datos: { ...especificos, _firman: firman },
        destinatario: modelo.destinatario ? modelo.destinatario(especificos) : null,
        asunto: modelo.asunto ? modelo.asunto(especificos) : modelo.titulo,
        firmantes: await resolverFirmantes(firman),
      };
      guardada = editando
        ? (await q(sb.from('notas').update(row).eq('id', nota.id).select().single()))
        : (await q(sb.from('notas').insert(row).select().single()));
    },
  });
  return ok ? guardada : null;
}

function elegirModelo() {
  return new Promise((resolve) => {
    const bloque = (titulo, cert) => `
      <h3 style="font-size:13px;color:var(--texto-2);text-transform:uppercase;margin:14px 0 8px">${titulo}</h3>
      <div class="modelos">${Object.entries(MODELOS).filter(([, m]) => m.cert === cert).map(([k, m]) => `
        <button type="button" class="modelo" data-t="${k}"><span class="ico">${m.ico}</span><b>${esc(m.nombre)}</b><span>${esc(m.desc)}</span></button>`).join('')}</div>`;
    const m = abrirModal({ titulo: '¿Qué querés redactar?', ancho: true, cuerpo: `${bloque('Notas', false)}${bloque('Certificados', true)}` });
    m.el.querySelectorAll('[data-t]').forEach((b) => { b.onclick = () => { m.cerrar(); resolve(b.dataset.t); }; });
    m.el.querySelector('[data-cerrar]').addEventListener('click', () => resolve(null));
  });
}

async function nuevaNota() {
  const tipo = await elegirModelo();
  if (!tipo) return;
  const n = await abrirForm({ tipo });
  if (n) { toast('Borrador guardado.', 'ok'); location.hash = `#/notas/${n.id}`; }
}

// =============================================================== LISTA
async function renderLista(cont, { query }) {
  const vista = cont.dataset.vista;
  const escribe = puedeEscribir();
  let filas;
  try {
    filas = await q(sb.from('notas').select('*').order('fecha', { ascending: false }).order('creado_en', { ascending: false }));
  } catch (e) {
    if (faltaMigracion(e)) { cont.innerHTML = encabezado('Notas') + AVISO_MIGRACION; return; }
    throw e;
  }
  const anios = [...new Set(filas.map((n) => n.fecha.slice(0, 4)))].sort().reverse();

  cont.innerHTML = `
    ${encabezado('Notas y certificados', 'Redactá con modelos, emití con número automático y guardá el PDF.',
      escribe ? '<button class="btn" id="b-nueva">+ Nueva</button>' : '')}
    <div class="filtros" style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">
      <input id="f-txt" type="search" placeholder="Buscar por asunto, destinatario o nombre…" style="flex:1;min-width:200px;padding:8px 10px;border:1px solid var(--borde);border-radius:8px">
      <select id="f-tipo" style="padding:8px;border:1px solid var(--borde);border-radius:8px"><option value="">Todos los tipos</option>
        ${Object.entries(MODELOS).map(([k, m]) => `<option value="${k}">${esc(m.nombre)}</option>`).join('')}</select>
      <select id="f-estado" style="padding:8px;border:1px solid var(--borde);border-radius:8px"><option value="">Todos los estados</option>
        ${Object.entries(ESTADOS_NOTA).map(([k, [l]]) => `<option value="${k}">${l}</option>`).join('')}</select>
      <select id="f-anio" style="padding:8px;border:1px solid var(--borde);border-radius:8px"><option value="">Todos los años</option>
        ${anios.map((y) => `<option value="${y}">${y}</option>`).join('')}</select>
    </div>
    <div class="tarjeta"><div class="cuerpo sin-pad" id="tabla"></div></div>`;

  function pintar() {
    if (cont.dataset.vista !== vista) return;
    const txt = normalizar(document.getElementById('f-txt').value);
    const tipo = document.getElementById('f-tipo').value;
    const est = document.getElementById('f-estado').value;
    const anio = document.getElementById('f-anio').value;
    const lista = filas.filter((n) => (!tipo || n.tipo === tipo) && (!est || n.estado === est) && (!anio || n.fecha.startsWith(anio))
      && (!txt || normalizar(`${resumen(n)} ${n.destinatario || ''} ${nombreModelo(n.tipo)}`).includes(txt)));
    document.getElementById('tabla').innerHTML = tablaHTML(
      [
        { h: 'N°', f: (n) => (numTxt(n) ? `<b>${numTxt(n)}</b>` : '<span style="color:var(--texto-2)">—</span>') },
        { h: 'Fecha', f: (n) => fmtFecha(n.fecha) },
        { h: 'Tipo', f: (n) => esc(nombreModelo(n.tipo)) },
        { h: 'Asunto / Nombre', f: (n) => `<b>${esc(resumen(n))}</b>${!MODELOS[n.tipo]?.cert && n.destinatario ? `<div style="color:var(--texto-2);font-size:12px">${esc(n.destinatario.split('\n')[0])}</div>` : ''}` },
        { h: 'Estado', f: (n) => badge(ESTADOS_NOTA[n.estado]) },
      ],
      lista,
      { clickAttr: true, vacio: filas.length ? 'No hay resultados con esos filtros.' : 'Todavía no hay notas. Creá la primera con "+ Nueva".' }
    );
    document.querySelectorAll('#tabla tr.click').forEach((tr) => { tr.onclick = () => { location.hash = `#/notas/${tr.dataset.id}`; }; });
  }
  pintar();
  document.getElementById('f-txt').addEventListener('input', debounce(pintar, 150));
  ['f-tipo', 'f-estado', 'f-anio'].forEach((id) => { document.getElementById(id).onchange = pintar; });
  document.getElementById('b-nueva')?.addEventListener('click', nuevaNota);
  if (query?.nuevo && escribe) nuevaNota();
}

// =============================================================== DETALLE
async function renderDetalle(cont, { id, query }) {
  const escribe = puedeEscribir();
  const puedeEmitir = puede('administrador', 'secretario');
  let nota;
  try {
    nota = await q(sb.from('notas').select('*').eq('id', id).maybeSingle());
  } catch (e) {
    if (faltaMigracion(e)) { cont.innerHTML = encabezado('Notas') + AVISO_MIGRACION; return; }
    throw e;
  }
  if (!nota) {
    cont.innerHTML = '<div class="tarjeta"><div class="vacio">No se encontró el documento. <a href="#/notas">Volver a Notas</a></div></div>';
    return;
  }
  const modelo = MODELOS[nota.tipo];
  const borrador = nota.estado === 'borrador';
  let driveTablaOk = true;
  const archivos = await sb.from('archivos_drive').select('*').eq('nota_id', id).order('creado_en', { ascending: false })
    .then((r) => { if (r.error) { driveTablaOk = false; return []; } return r.data; });
  const driveActivo = driveDisponible() && driveTablaOk;
  const fechaTxt = `${nota.lugar ? `${nota.lugar}, ` : ''}${fechaLarga(nota.fecha)}`;
  const firmas = nota.firmantes || [];

  function vistaPrevia() {
    const logo = `<img src="data:image/jpeg;base64,${LOGO.b64}" alt="Logo" style="height:56px;width:auto">`;
    const enc = `<div class="nota-enc">${logo}<div class="nota-datos">Secretaría<br>${esc(CONFIG.IGLESIA_UBICACION || '')}<br>${esc(CONFIG.IGLESIA_EMAIL || '')}</div></div>`;
    const aviso = borrador ? '<div class="nota-borrador">BORRADOR - sin número ni validez hasta su emisión</div>' : '';
    const firmasHTML = firmas.length ? `<div class="nota-firmas">${firmas.map((f) => `<div class="firma"><div class="linea"></div><b>${esc(f.nombre || ' ')}</b><br><i>${esc(f.cargo || '')}</i></div>`).join('')}</div>` : '';
    if (modelo.cert) {
      return `<div class="nota-doc cert">${enc}
        <h1>${esc(modelo.titulo)}</h1>
        <div class="nota-num">${numTxt(nota) ? `Certificado N° ${numTxt(nota)}` : ''}</div>${aviso}
        <div class="nota-cuerpo centrado">${esc(nota.cuerpo)}</div>
        <div class="nota-fecha">${esc(fechaTxt)}</div>${firmasHTML}</div>`;
    }
    return `<div class="nota-doc">${enc}
      <div class="nota-fecha">${esc(fechaTxt)}</div>
      <div class="nota-num"><b>${numTxt(nota) ? `Nota N° ${numTxt(nota)}` : 'Nota (borrador)'}</b></div>${aviso}
      <div class="nota-dest">${esc(nota.destinatario || '')}</div>
      <div class="nota-asunto"><b>Asunto: ${esc(nota.asunto || '')}</b></div>
      <div class="nota-cuerpo">${esc(nota.cuerpo)}</div>${firmasHTML}</div>`;
  }

  const datosPDF = () => ({
    iglesia: estado.iglesia?.nombre || '', certificado: modelo.cert, titulo: modelo.titulo, numero: numTxt(nota),
    borrador, fechaTxt, destinatario: nota.destinatario || '', asunto: nota.asunto || '', cuerpo: nota.cuerpo, firmas,
  });
  const nombreArchivo = () => {
    const base = `${modelo.cert ? modelo.nombre : 'Nota'} ${numTxt(nota) ? numTxt(nota).replace('/', '-') : '(borrador)'} - ${resumen(nota)}`;
    return `${base.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120)}.pdf`;
  };

  const descargarPDF = () => {
    try { descargar(nombreArchivo(), generarPDFNota(datosPDF()), 'application/pdf'); } catch (e) { toast(errorAmigable(e), 'error'); }
  };

  async function guardarDrive() {
    const btn = document.getElementById('b-drive');
    const textoBtn = btn?.textContent;
    if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }
    let subido = null;
    try {
      subido = await subirPDF(generarPDFNota(datosPDF()), nombreArchivo(), CONFIG.DRIVE_CARPETA_NOTAS || 'Secretaría - Notas');
      await q(sb.from('archivos_drive').insert({
        nota_id: id, nombre: subido.name, drive_id: subido.id,
        url: subido.webViewLink || `https://drive.google.com/file/d/${subido.id}/view`,
      }));
      toast('Copia guardada en el Drive de la iglesia.', 'ok');
      await renderDetalle(cont, { id, query: {} });
    } catch (e) {
      toast(errorAmigable(e) + (subido ? ' El archivo sí se subió a Drive, pero no se pudo registrar acá.' : ''), 'error');
      if (btn) { btn.disabled = false; btn.textContent = textoBtn; }
    }
  }

  async function editar() {
    const n = await abrirForm({ tipo: nota.tipo, nota });
    if (n) { toast('Cambios guardados.', 'ok'); await renderDetalle(cont, { id, query: {} }); }
  }

  async function emitir() {
    const sinCompletar = /\[[^\]\n]+\]/.test(nota.cuerpo);
    const ok = await confirmar(
      `Al emitir se le asigna el número y queda protegida: no se podrá modificar.${sinCompletar ? '  ATENCIÓN: el texto todavía tiene partes entre [corchetes] sin completar.' : ''}`,
      { textoOk: 'Emitir', titulo: modelo.cert ? 'Emitir certificado' : 'Emitir nota' }
    );
    if (!ok) return;
    try {
      const firmantes = await resolverFirmantes(nota.datos?._firman || modelo.firman);
      const emitida = await q(sb.from('notas').update({ estado: 'emitida', firmantes }).eq('id', id).select().single());
      toast(`Emitida con el N° ${numTxt(emitida)}.`, 'ok');
      await renderDetalle(cont, { id, query: driveActivo ? { drive: '1' } : {} });
    } catch (e) { toast(errorAmigable(e), 'error'); }
  }

  async function archivar() {
    const ok = await confirmar(
      borrador ? '¿Descartar este borrador? Se archiva sin número y no se borra. Después podés restaurarlo.' : `¿Archivar el documento N° ${numTxt(nota)}? Dejará de estar activo. Nunca se borra y se puede restaurar.`,
      { textoOk: borrador ? 'Descartar' : 'Archivar', peligro: true }
    );
    if (!ok) return;
    try {
      await q(sb.from('notas').update({ estado: 'archivada' }).eq('id', id));
      toast(borrador ? 'Borrador descartado.' : 'Documento archivado.', 'ok');
      location.hash = '#/notas';
    } catch (e) { toast(errorAmigable(e), 'error'); }
  }

  async function restaurar() {
    const ok = await confirmar(
      nota.numero ? `¿Restaurar la nota N° ${numTxt(nota)}? Vuelve a quedar emitida con el mismo número.` : '¿Restaurar este borrador? Vuelve a la lista de borradores.',
      { textoOk: 'Restaurar', titulo: 'Restaurar' }
    );
    if (!ok) return;
    try {
      await q(sb.from('notas').update({ estado: nota.numero ? 'emitida' : 'borrador' }).eq('id', id));
      toast('Nota restaurada.', 'ok');
      await renderDetalle(cont, { id, query: {} });
    } catch (e) {
      toast(faltaMigracion(e) || /restaurar|archivada/i.test(e?.message || '') ? `${errorAmigable(e)} (¿Ejecutaste supabase/05-notas-restaurar.sql?)` : errorAmigable(e), 'error');
    }
  }

  async function duplicar() {
    const n = await abrirForm({ tipo: nota.tipo, copiaDe: nota });
    if (n) { toast('Copia guardada como borrador.', 'ok'); location.hash = `#/notas/${n.id}`; }
  }

  cont.innerHTML = `
    <div class="no-imprimir" style="margin-bottom:10px"><a href="#/notas">← Notas y certificados</a></div>
    ${encabezado(`${modelo.nombre}${numTxt(nota) ? ` N° ${numTxt(nota)}` : ''}`, `${fmtFecha(nota.fecha)} · ${ESTADOS_NOTA[nota.estado][0]}`, `
      <button class="btn sec" id="b-pdf">⬇ PDF</button>
      ${driveActivo && escribe ? '<button class="btn sec" id="b-drive">☁ Guardar en Drive</button>' : ''}
      ${escribe && borrador ? '<button class="btn sec" id="b-edit">✏️ Editar</button>' : ''}
      ${puedeEmitir && borrador ? '<button class="btn verde" id="b-emitir">✔ Emitir</button>' : ''}
      ${escribe ? '<button class="btn sec" id="b-dup">⧉ Duplicar</button>' : ''}
      ${puedeEmitir && nota.estado === 'archivada' ? '<button class="btn verde" id="b-rest">↩ Restaurar</button>' : ''}
      ${puedeEmitir && nota.estado !== 'archivada' ? `<button class="btn rojo" id="b-arch">${borrador ? 'Descartar' : 'Archivar'}</button>` : ''}`)}
    ${borrador ? '<div class="aviso warn">Borrador: todavía no tiene número. Revisalo y, cuando esté listo, tocá "Emitir".</div>' : ''}
    ${nota.estado === 'emitida' ? '<div class="aviso ok">🔒 Emitida: está protegida y no se puede modificar. Si hay un error, archivala y redactá una nueva.</div>' : ''}
    ${nota.estado === 'archivada' ? `<div class="aviso info">🗄 Archivada: no se puede modificar. ${puedeEmitir ? (nota.numero ? `Si fue un error, tocá "Restaurar": vuelve a quedar emitida con el mismo N° ${numTxt(nota)}.` : 'Si fue un error, tocá "Restaurar": vuelve a ser un borrador.') : ''}</div>` : ''}
    ${vistaPrevia()}
    <div class="tarjeta mt">
      <div class="enc"><h2>Copias en Drive</h2></div>
      <div class="cuerpo ${archivos.length ? 'sin-pad' : ''}">
        ${archivos.length
          ? `<ul class="lista">${archivos.map((a) => `<li><div><div class="t">${esc(a.nombre)}</div><div class="s">Guardada el ${fmtFechaHora(a.creado_en)}</div></div><a class="btn chico sec" href="${esc(a.url)}" target="_blank" rel="noopener">Abrir en Drive</a></li>`).join('')}</ul>`
          : `<div style="color:var(--texto-2);font-size:14px">${!driveDisponible() ? 'Google Drive no está conectado (ver README).' : !driveTablaOk ? 'Falta ejecutar supabase/04-notas.sql.' : 'Todavía no hay copias guardadas en Drive.'}</div>`}
      </div>
    </div>`;

  document.getElementById('b-pdf').onclick = descargarPDF;
  document.getElementById('b-drive')?.addEventListener('click', guardarDrive);
  if (driveActivo) precargarDrive();
  document.getElementById('b-edit')?.addEventListener('click', editar);
  document.getElementById('b-emitir')?.addEventListener('click', emitir);
  document.getElementById('b-arch')?.addEventListener('click', archivar);
  document.getElementById('b-rest')?.addEventListener('click', restaurar);
  document.getElementById('b-dup')?.addEventListener('click', duplicar);
  if (query?.drive && escribe && driveActivo) {
    if (await confirmar('Quedó emitida. ¿Querés guardar ahora una copia en PDF en el Drive de la iglesia?', { textoOk: 'Guardar en Drive', titulo: 'Copia en Drive' })) await guardarDrive();
  }
}
