import { sb, q } from '../supabase.js';
import { estado, puedeEscribir, puede, personasBasico, mapaPersonas, nombreCompleto } from '../state.js';
import { TIPOS_ACTA, ESTADOS_ACTA, ESTADOS_DECISION } from '../constantes.js';
import {
  esc, fmtFecha, fmtFechaLarga, fmtHora, fmtFechaHora, badge, tablaHTML, encabezado, formModal, confirmar, toast,
  hoy, errorAmigable, abrirModal, descargar, normalizar, debounce,
} from '../ui.js';
import { cargosVigentes } from './autoridades.js';
import { generarPDFActa } from '../pdf.js';
import { driveDisponible, subirPDF, precargarDrive } from '../drive.js';
import { abrirFormDecision } from './decisiones.js';

export async function render(cont, ctx) {
  if (ctx.id) return renderDetalle(cont, ctx);
  return renderLista(cont, ctx);
}

// Campos del formulario de acta (crear / editar borrador).
async function camposActa() {
  const lista = (await personasBasico()).filter((p) => !p.archivado);
  const opts = lista.map((p) => ({ v: p.id, l: nombreCompleto(p) }));
  return [
    { name: 'tipo', label: 'Tipo de reunión', type: 'select', required: true, options: Object.entries(TIPOS_ACTA).map(([v, l]) => ({ v, l })) },
    { name: 'fecha', label: 'Fecha', type: 'date', required: true },
    { name: 'hora_inicio', label: 'Hora de inicio', type: 'time' },
    { name: 'hora_fin', label: 'Hora de finalización', type: 'time' },
    { name: 'lugar', label: 'Lugar', full: true },
    { name: 'asistentes', label: 'Asistentes', type: 'checks', options: opts },
    { name: 'orden_del_dia', label: 'Orden del día', type: 'textarea', rows: 4 },
    { name: 'temas_tratados', label: 'Temas tratados', type: 'textarea', rows: 8 },
    { name: 'observaciones', label: 'Observaciones', type: 'textarea', rows: 3 },
    { name: 'firmantes', label: 'Firmas (quiénes firman el acta)', type: 'checks', options: opts },
  ];
}

async function reemplazarHijos(actaId, iglesiaId, asistentes, firmantes) {
  const cargos = await cargosVigentes();
  await q(sb.from('acta_asistentes').delete().eq('acta_id', actaId));
  await q(sb.from('acta_firmas').delete().eq('acta_id', actaId));
  if (asistentes.length) {
    await q(sb.from('acta_asistentes').insert(asistentes.map((persona_id) => ({ acta_id: actaId, persona_id, iglesia_id: iglesiaId }))));
  }
  if (firmantes.length) {
    await q(sb.from('acta_firmas').insert(firmantes.map((persona_id) => ({ acta_id: actaId, persona_id, iglesia_id: iglesiaId, cargo: cargos[persona_id] || null }))));
  }
}

function validarHoras(v) {
  if (v.hora_inicio && v.hora_fin && v.hora_fin < v.hora_inicio) throw new Error('La hora de finalización no puede ser anterior a la de inicio.');
}

// =============================================================== LISTA
async function renderLista(cont, { query }) {
  const vista = cont.dataset.vista;
  const escribe = puedeEscribir();
  let filas = [];

  async function cargar() {
    filas = await q(sb.from('actas').select('*').order('numero', { ascending: false }));
  }

  function filtradas() {
    const txt = normalizar(document.getElementById('f-txt').value);
    const est = document.getElementById('f-estado').value;
    const tipo = document.getElementById('f-tipo').value;
    const anio = document.getElementById('f-anio').value;
    return filas
      .filter((a) => !est || a.estado === est)
      .filter((a) => !tipo || a.tipo === tipo)
      .filter((a) => !anio || a.fecha.startsWith(anio))
      .filter((a) => !txt || normalizar(`${a.numero} ${a.lugar || ''} ${a.orden_del_dia || ''} ${a.temas_tratados || ''} ${a.observaciones || ''}`).includes(txt));
  }

  function pintar() {
    if (cont.dataset.vista !== vista) return; // ya se cambió de sección
    const lista = filtradas();
    document.getElementById('cuenta').textContent = `${lista.length} ${lista.length === 1 ? 'acta' : 'actas'}`;
    document.getElementById('tabla').innerHTML = tablaHTML(
      [
        { h: 'N°', f: (a) => `<b>${a.numero}</b>` },
        { h: 'Fecha', f: (a) => fmtFecha(a.fecha) },
        { h: 'Tipo', f: (a) => esc(TIPOS_ACTA[a.tipo]) },
        { h: 'Lugar', f: (a) => esc(a.lugar || '—') },
        { h: 'Estado', f: (a) => badge(ESTADOS_ACTA[a.estado]) },
      ],
      lista,
      { clickAttr: true, vacio: 'No hay actas que coincidan. Creá la primera con el botón "Nueva acta".' }
    );
    document.querySelectorAll('#tabla tr.click').forEach((tr) => { tr.onclick = () => { location.hash = `#/actas/${tr.dataset.id}`; }; });
  }

  async function nueva() {
    let creada = null;
    const ok = await formModal({
      titulo: 'Nueva acta', ancho: true, textoGuardar: 'Crear borrador',
      aviso: 'El número de acta se asigna automáticamente. Se guarda como borrador hasta que la apruebes.',
      campos: await camposActa(),
      valores: { fecha: hoy(), tipo: 'comision' },
      guardar: async (v) => {
        validarHoras(v);
        const { asistentes, firmantes, ...datos } = v;
        creada = await q(sb.from('actas').insert(datos).select().single());
        await reemplazarHijos(creada.id, creada.iglesia_id, asistentes, firmantes);
      },
    });
    if (ok && creada) { toast(`Acta N° ${creada.numero} creada como borrador.`, 'ok'); location.hash = `#/actas/${creada.id}`; }
  }

  cont.innerHTML = `
    ${encabezado('Actas', 'Libro de actas de la iglesia.', escribe ? '<button class="btn" id="b-nueva">+ Nueva acta</button>' : '')}
    <div class="filtros">
      <input type="search" id="f-txt" placeholder="Buscar por número, lugar o contenido…">
      <select id="f-estado"><option value="">Todos los estados</option>${Object.entries(ESTADOS_ACTA).map(([v, [l]]) => `<option value="${v}">${esc(l)}</option>`).join('')}</select>
      <select id="f-tipo"><option value="">Todos los tipos</option>${Object.entries(TIPOS_ACTA).map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}</select>
      <select id="f-anio"><option value="">Todos los años</option></select>
    </div>
    <div class="tarjeta"><div class="enc"><h2 id="cuenta"></h2></div><div class="cuerpo sin-pad" id="tabla"></div></div>`;
  await cargar();
  const aniosReales = [...new Set(filas.map((a) => a.fecha.slice(0, 4)))].sort().reverse();
  document.getElementById('f-anio').innerHTML += aniosReales.map((y) => `<option value="${y}">${y}</option>`).join('');
  pintar();
  document.getElementById('f-txt').addEventListener('input', debounce(pintar, 150));
  ['f-estado', 'f-tipo', 'f-anio'].forEach((id) => { document.getElementById(id).onchange = pintar; });
  document.getElementById('b-nueva')?.addEventListener('click', nueva);
  if (query?.nuevo && escribe) nueva();
}

// =============================================================== DETALLE
async function renderDetalle(cont, { id, query }) {
  const escribe = puedeEscribir();
  const puedeAprobar = puede('administrador', 'secretario');
  const verHistorial = puede('administrador', 'secretario');

  const acta = await q(sb.from('actas').select('*').eq('id', id).maybeSingle());
  if (!acta) {
    cont.innerHTML = `<div class="tarjeta"><div class="vacio">No se encontró el acta. <a href="#/actas">Volver al libro de actas</a></div></div>`;
    return;
  }

  let tablaDriveOk = true;
  const [asist, firmas, decisiones, personas, aprobador, archivos] = await Promise.all([
    q(sb.from('acta_asistentes').select('persona_id').eq('acta_id', id)),
    q(sb.from('acta_firmas').select('persona_id,cargo').eq('acta_id', id)),
    q(sb.from('decisiones').select('*').eq('acta_id', id).eq('archivado', false).order('creado_en')),
    mapaPersonas(),
    acta.aprobada_por ? sb.from('perfiles').select('nombre,email').eq('id', acta.aprobada_por).maybeSingle().then((r) => r.data) : null,
    sb.from('archivos_drive').select('*').eq('acta_id', id).order('creado_en', { ascending: false })
      .then((r) => { if (r.error) { tablaDriveOk = false; return []; } return r.data; }),
  ]);
  const driveActivo = driveDisponible() && tablaDriveOk;

  const asistentes = asist.map((a) => nombreCompleto(personas[a.persona_id])).sort((a, b) => a.localeCompare(b, 'es'));
  const borrador = acta.estado === 'borrador';

  const metaTexto = () => [
    TIPOS_ACTA[acta.tipo], fmtFechaLarga(acta.fecha),
    acta.hora_inicio ? `de ${fmtHora(acta.hora_inicio)}${acta.hora_fin ? ` a ${fmtHora(acta.hora_fin)}` : ''} hs` : '',
    acta.lugar || '',
  ].filter(Boolean).join(' · ');

  function documentoHTML() {
    const meta = metaTexto();
    const texto = (t) => (t ? `<div class="texto">${esc(t)}</div>` : '<div style="color:#888">—</div>');
    return `
      <div class="iglesia">${esc(estado.iglesia?.nombre || '')}</div>
      <h1>Acta N° ${acta.numero}</h1>
      <div class="meta">${esc(meta)}</div>
      <div class="estado-sello no-imprimir">${badge(ESTADOS_ACTA[acta.estado])}</div>
      <h3>Asistentes (${asistentes.length})</h3>
      ${asistentes.length ? `<ul>${asistentes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : '<div style="color:#888">—</div>'}
      <h3>Orden del día</h3>${texto(acta.orden_del_dia)}
      <h3>Temas tratados</h3>${texto(acta.temas_tratados)}
      <h3>Decisiones tomadas</h3>
      ${decisiones.length ? `<ul>${decisiones.map((d) => `<li>${esc(d.descripcion)}${d.responsable_id ? ` — <i>Responsable: ${esc(nombreCompleto(personas[d.responsable_id]))}</i>` : ''}${d.fecha_limite ? ` <i>(límite: ${fmtFecha(d.fecha_limite)})</i>` : ''}</li>`).join('')}</ul>` : '<div style="color:#888">Sin decisiones registradas.</div>'}
      <h3>Observaciones</h3>${texto(acta.observaciones)}
      ${firmas.length ? `<div class="firmas">${firmas.map((f) => `
        <div class="firma"><div class="linea"></div><b>${esc(nombreCompleto(personas[f.persona_id]))}</b>${f.cargo ? `<br>${esc(f.cargo)}` : ''}</div>`).join('')}</div>` : ''}
      ${acta.aprobada_en ? `<div class="aprobacion">Aprobada el ${fmtFechaHora(acta.aprobada_en)}${aprobador ? ` por ${esc(aprobador.nombre || aprobador.email)}` : ''}.</div>` : ''}`;
  }

  async function editar() {
    const ok = await formModal({
      titulo: `Editar acta N° ${acta.numero}`, ancho: true, campos: await camposActa(),
      valores: {
        ...acta, hora_inicio: fmtHora(acta.hora_inicio), hora_fin: fmtHora(acta.hora_fin),
        asistentes: asist.map((a) => a.persona_id), firmantes: firmas.map((f) => f.persona_id),
      },
      guardar: async (v) => {
        validarHoras(v);
        const { asistentes: as, firmantes, ...datos } = v;
        await q(sb.from('actas').update(datos).eq('id', id));
        await reemplazarHijos(id, acta.iglesia_id, as, firmantes);
      },
    });
    if (ok) { toast('Borrador guardado.', 'ok'); await renderDetalle(cont, { id, query: {} }); }
  }

  async function aprobar() {
    const ok = await confirmar(
      `Al aprobar el acta N° ${acta.numero} queda protegida: no se podrá modificar. Revisá que todo esté correcto antes de continuar.`,
      { textoOk: 'Aprobar acta', titulo: 'Aprobar acta' }
    );
    if (!ok) return;
    try {
      await q(sb.from('actas').update({ estado: 'aprobada' }).eq('id', id));
      toast('Acta aprobada y protegida.', 'ok');
      await renderDetalle(cont, { id, query: driveActivo ? { drive: '1' } : {} });
    } catch (e) { toast(errorAmigable(e), 'error'); }
  }

  async function archivar() {
    const ok = await confirmar(`¿Archivar el acta N° ${acta.numero}? Pasa al archivo histórico y ya no se puede modificar. Nunca se borra.`, { textoOk: 'Archivar', peligro: true });
    if (!ok) return;
    try {
      await q(sb.from('actas').update({ estado: 'archivada' }).eq('id', id));
      toast('Acta archivada.', 'ok');
      await renderDetalle(cont, { id, query: {} });
    } catch (e) { toast(errorAmigable(e), 'error'); }
  }

  async function historial() {
    const { data, error } = await sb.from('audit_log').select('*').eq('registro_id', id).order('fecha', { ascending: false }).limit(100);
    if (error) return toast(errorAmigable(error), 'error');
    const usuarios = [...new Set((data || []).map((a) => a.usuario_id).filter(Boolean))];
    const { data: perf } = usuarios.length ? await sb.from('perfiles').select('id,nombre,email').in('id', usuarios) : { data: [] };
    const nombreU = Object.fromEntries((perf || []).map((p) => [p.id, p.nombre || p.email]));
    const accion = (a) => {
      if (a.accion === 'INSERT') return 'Creación del borrador';
      if (a.accion === 'DELETE') return 'Eliminación';
      if ((a.cambios || []).includes('estado')) return `Cambio de estado: ${ESTADOS_ACTA[a.antes?.estado]?.[0]} → ${ESTADOS_ACTA[a.despues?.estado]?.[0]}`;
      return `Modificación (${(a.cambios || []).join(', ')})`;
    };
    abrirModal({
      titulo: `Historial del acta N° ${acta.numero}`, ancho: true,
      cuerpo: (data || []).length
        ? `<div class="tabla-wrap"><table class="tabla"><thead><tr><th>Fecha</th><th>Usuario</th><th>Acción</th></tr></thead><tbody>
            ${data.map((a) => `<tr><td>${fmtFechaHora(a.fecha)}</td><td>${esc(nombreU[a.usuario_id] || '—')}</td><td>${esc(accion(a))}</td></tr>`).join('')}
          </tbody></table></div>`
        : '<div class="vacio">Sin movimientos registrados.</div>',
    });
  }

  function descargarWord() {
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
      <head><meta charset="utf-8"><title>Acta N° ${acta.numero}</title>
      <style>body{font-family:Georgia,serif;line-height:1.5}h1{text-align:center}.iglesia,.meta{text-align:center}h3{text-transform:uppercase;font-size:12pt;border-bottom:1px solid #999}.texto{white-space:pre-wrap}.firma{display:inline-block;width:30%;text-align:center;margin-top:50px;border-top:1px solid #000}.estado-sello{display:none}</style></head>
      <body>${documentoHTML()}</body></html>`;
    descargar(`acta-${acta.numero}.doc`, html, 'application/msword');
  }

  function datosPDF() {
    return {
      iglesia: estado.iglesia?.nombre || '',
      numero: acta.numero,
      meta: metaTexto(),
      borrador: borrador,
      asistentes,
      ordenDelDia: acta.orden_del_dia,
      temas: acta.temas_tratados,
      decisiones: decisiones.map((d) => `${d.descripcion}${d.responsable_id ? ` - Responsable: ${nombreCompleto(personas[d.responsable_id])}` : ''}${d.fecha_limite ? ` (límite: ${fmtFecha(d.fecha_limite)})` : ''}`),
      observaciones: acta.observaciones,
      firmas: firmas.map((f) => ({ nombre: nombreCompleto(personas[f.persona_id]), cargo: f.cargo })),
      aprobacion: acta.aprobada_en ? `Aprobada el ${fmtFechaHora(acta.aprobada_en)}${aprobador ? ` por ${aprobador.nombre || aprobador.email}` : ''}.` : null,
    };
  }

  function descargarPDF() {
    try {
      descargar(`acta-${acta.numero}-${acta.fecha}.pdf`, generarPDFActa(datosPDF()), 'application/pdf');
    } catch (e) { toast(errorAmigable(e), 'error'); }
  }

  async function guardarDrive() {
    const btn = document.getElementById('b-drive');
    const textoBtn = btn?.textContent;
    if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }
    let subido = null;
    try {
      const nombre = `Acta N° ${acta.numero} - ${acta.fecha}${borrador ? ' (borrador)' : ''}.pdf`;
      subido = await subirPDF(generarPDFActa(datosPDF()), nombre);
      await q(sb.from('archivos_drive').insert({
        acta_id: id, nombre: subido.name, drive_id: subido.id,
        url: subido.webViewLink || `https://drive.google.com/file/d/${subido.id}/view`,
      }));
      toast('Copia guardada en el Drive de la iglesia.', 'ok');
      await renderDetalle(cont, { id, query: {} });
    } catch (e) {
      const extra = subido ? ' El archivo sí se subió a Drive, pero no se pudo registrar acá.' : '';
      toast(errorAmigable(e) + extra, 'error');
      if (btn) { btn.disabled = false; btn.textContent = textoBtn; }
    }
  }

  async function ofrecerDrive() {
    const ok = await confirmar('El acta quedó aprobada. ¿Querés guardar ahora una copia en PDF en el Drive de la iglesia?', { textoOk: 'Guardar en Drive', titulo: 'Copia en Drive' });
    if (ok) await guardarDrive();
  }

  async function nuevaDecision() {
    if (await abrirFormDecision({ acta_id: id })) await renderDetalle(cont, { id, query: {} });
  }

  cont.innerHTML = `
    <div class="no-imprimir" style="margin-bottom:10px"><a href="#/actas">← Libro de actas</a></div>
    ${encabezado(`Acta N° ${acta.numero}`, `${TIPOS_ACTA[acta.tipo]} · ${fmtFecha(acta.fecha)}`, `
      <button class="btn sec" id="b-pdf">⬇ PDF</button>
      ${driveActivo && escribe ? '<button class="btn sec" id="b-drive">☁ Guardar en Drive</button>' : ''}
      <button class="btn sec" id="b-imp">🖨 Imprimir</button>
      <button class="btn sec" id="b-word">⬇ Word</button>
      ${verHistorial ? '<button class="btn sec" id="b-hist">Historial</button>' : ''}
      ${escribe && borrador ? '<button class="btn sec" id="b-edit">✏️ Editar</button>' : ''}
      ${puedeAprobar && borrador ? '<button class="btn verde" id="b-aprob">✔ Aprobar</button>' : ''}
      ${puedeAprobar && acta.estado === 'aprobada' ? '<button class="btn rojo" id="b-arch">Archivar</button>' : ''}`)}
    ${acta.estado === 'aprobada' ? '<div class="aviso ok no-imprimir">🔒 Acta aprobada: está protegida y no se puede modificar. Para ver cambios anteriores usá "Historial".</div>' : ''}
    ${acta.estado === 'archivada' ? '<div class="aviso info no-imprimir">🗄 Acta archivada: forma parte del archivo histórico y no se puede modificar.</div>' : ''}
    ${borrador ? '<div class="aviso warn no-imprimir">Borrador: todavía se puede editar. Cuando esté lista, aprobala para protegerla.</div>' : ''}
    <div class="acta-doc" id="acta-doc">${documentoHTML()}</div>
    <div class="tarjeta mt no-imprimir">
      <div class="enc"><h2>Copias en Drive</h2></div>
      <div class="cuerpo ${archivos.length ? 'sin-pad' : ''}">
        ${archivos.length
          ? `<ul class="lista">${archivos.map((a) => `<li><div><div class="t">${esc(a.nombre)}</div><div class="s">Guardada el ${fmtFechaHora(a.creado_en)}</div></div><a class="btn chico sec" href="${esc(a.url)}" target="_blank" rel="noopener">Abrir en Drive</a></li>`).join('')}</ul>`
          : `<div style="color:var(--texto-2);font-size:14px">${
            !driveDisponible() ? 'Todavía no está conectado Google Drive. Podés descargar el PDF y guardarlo vos; para que se guarde desde acá, seguí la guía "Guardar en Drive" del README.'
              : !tablaDriveOk ? 'Falta ejecutar el archivo supabase/02-archivos-drive.sql en Supabase para registrar las copias.'
              : 'Todavía no hay copias guardadas en Drive.'}</div>`}
      </div>
    </div>
    <div class="tarjeta mt no-imprimir">
      <div class="enc"><h2>Decisiones de esta acta</h2>${escribe ? '<button class="btn chico" id="b-dec">+ Agregar decisión</button>' : ''}</div>
      <div class="cuerpo sin-pad">
        ${decisiones.length ? `<ul class="lista">${decisiones.map((d) => `
          <li><div><div class="t">${esc(d.descripcion)}</div>
          <div class="s">${esc(d.responsable_id ? nombreCompleto(personas[d.responsable_id]) : 'Sin responsable')} · Límite: ${fmtFecha(d.fecha_limite)}</div></div>
          ${badge(ESTADOS_DECISION[d.estado])}</li>`).join('')}</ul>`
          : '<div class="vacio">Esta acta todavía no tiene decisiones registradas.</div>'}
      </div>
    </div>`;

  document.getElementById('b-pdf').onclick = descargarPDF;
  document.getElementById('b-drive')?.addEventListener('click', guardarDrive);
  if (driveActivo) precargarDrive();
  document.getElementById('b-imp').onclick = () => window.print();
  document.getElementById('b-word').onclick = descargarWord;
  document.getElementById('b-hist')?.addEventListener('click', historial);
  document.getElementById('b-edit')?.addEventListener('click', editar);
  document.getElementById('b-aprob')?.addEventListener('click', aprobar);
  document.getElementById('b-arch')?.addEventListener('click', archivar);
  document.getElementById('b-dec')?.addEventListener('click', nuevaDecision);
  if (query?.editar && escribe && borrador) editar();
  if (query?.drive && escribe && driveActivo) ofrecerDrive();
}
