// Búsqueda global: busca en todos los módulos a los que el usuario tiene acceso.
import { sb } from '../supabase.js';
import { puede, mapaPersonas, nombreCompleto } from '../state.js';
import { TIPOS_REUNION, TIPOS_ACTA } from '../constantes.js';
import { nombreModelo } from '../notas-modelos.js';
import { esc, fmtFecha, encabezado, normalizar, debounce } from '../ui.js';

const POR_GRUPO = 8;
const LIMITE = 3000;
const TODOS = ['administrador', 'secretario', 'pastor', 'comision', 'consulta'];
const GESTION = ['administrador', 'secretario', 'pastor'];
const INV = ['administrador', 'secretario', 'pastor', 'comision'];

async function traer(tabla, columnas) {
  const { data, error } = await sb.from(tabla).select(columnas).limit(LIMITE);
  if (error) return []; // sin permiso o falta una migración: se omite esa sección
  return data || [];
}

const unir = (...p) => p.filter((x) => x !== null && x !== undefined && x !== '').join(' ');
const puntos = (...p) => p.filter(Boolean).join(' · ');

// Definición de cada sección: cómo traer los datos y cómo mostrarlos.
const GRUPOS = [
  {
    clave: 'actas', titulo: 'Actas', ico: '📜', roles: TODOS,
    traer: () => traer('actas', 'id,numero,tipo,fecha,lugar,orden_del_dia,temas_tratados,observaciones,archivado'),
    mapear: (a) => ({
      id: a.id, titulo: `Acta N° ${a.numero}`, sub: `${TIPOS_ACTA[a.tipo] || a.tipo} · ${fmtFecha(a.fecha)}`,
      fecha: a.fecha, link: `#/actas/${a.id}`, arch: a.archivado,
      campos: [['Orden del día', a.orden_del_dia], ['Temas tratados', a.temas_tratados], ['Observaciones', a.observaciones], ['Lugar', a.lugar]],
      extra: unir(a.numero, `acta ${a.numero}`, TIPOS_ACTA[a.tipo]),
    }),
  },
  {
    clave: 'reuniones', titulo: 'Reuniones', ico: '🗓️', roles: TODOS,
    traer: () => traer('reuniones', 'id,tipo,fecha,lugar,temas,estado,archivado'),
    mapear: (r) => ({
      id: r.id, titulo: `${TIPOS_REUNION[r.tipo] || r.tipo} — ${fmtFecha(r.fecha)}`, sub: r.lugar || '',
      fecha: r.fecha, link: `#/reuniones?ver=${r.id}`, arch: r.archivado,
      campos: [['Temas', r.temas], ['Lugar', r.lugar]], extra: unir(TIPOS_REUNION[r.tipo]),
    }),
  },
  {
    clave: 'decisiones', titulo: 'Decisiones', ico: '✅', roles: TODOS,
    traer: () => traer('decisiones', 'id,descripcion,observaciones,fecha,estado,archivado'),
    mapear: (d) => ({
      id: d.id, titulo: (d.descripcion || '').slice(0, 90), sub: fmtFecha(d.fecha),
      fecha: d.fecha, link: `#/decisiones`, arch: d.archivado,
      campos: [['Decisión', d.descripcion], ['Observaciones', d.observaciones]], extra: '',
    }),
  },
  {
    clave: 'notas', titulo: 'Notas y certificados', ico: '✉️', roles: GESTION,
    traer: () => traer('notas', 'id,tipo,anio,numero,fecha,destinatario,asunto,cuerpo,datos,estado,archivado'),
    mapear: (n) => ({
      id: n.id, titulo: n.asunto || nombreModelo(n.tipo),
      sub: puntos(nombreModelo(n.tipo), n.numero ? `N° ${n.numero}/${n.anio}` : 'borrador', fmtFecha(n.fecha)),
      fecha: n.fecha, link: `#/notas/${n.id}`, arch: n.archivado || n.estado === 'archivada',
      campos: [['Destinatario', n.destinatario], ['Texto', n.cuerpo], ['Datos', n.datos && typeof n.datos === 'object' ? Object.values(n.datos).filter((v) => typeof v === 'string').join(' · ') : '']],
      extra: unir(nombreModelo(n.tipo), n.numero),
    }),
  },
  {
    clave: 'miembros', titulo: 'Miembros y personas', ico: '👥', roles: GESTION,
    traer: async () => {
      const [m, p] = await Promise.all([
        traer('miembros', 'id,persona_id,estado,archivado'),
        traer('personas', 'id,nombre,apellido,dni,telefono,email,direccion,observaciones,archivado'),
      ]);
      const per = Object.fromEntries(p.map((x) => [x.id, x]));
      return m.filter((x) => per[x.persona_id]).map((x) => ({ ...x, persona: per[x.persona_id] }));
    },
    mapear: (m) => ({
      id: m.id, titulo: `${m.persona.apellido}, ${m.persona.nombre}`, sub: puntos(m.persona.dni && `DNI ${m.persona.dni}`, m.persona.telefono),
      fecha: '', link: `#/miembros?ver=${m.id}`, arch: m.archivado,
      campos: [['DNI', m.persona.dni], ['Teléfono', m.persona.telefono], ['Email', m.persona.email], ['Dirección', m.persona.direccion], ['Observaciones', m.persona.observaciones]],
      extra: unir(m.persona.nombre, m.persona.apellido, m.persona.apellido, m.persona.nombre),
    }),
  },
  {
    clave: 'autoridades', titulo: 'Autoridades', ico: '🏛️', roles: TODOS,
    traer: async () => {
      const [a, mapa] = await Promise.all([traer('autoridades', 'id,persona_id,cargo,tipo,fecha_inicio,fecha_fin,observaciones,archivado'), mapaPersonas().catch(() => ({}))]);
      return a.map((x) => ({ ...x, _n: nombreCompleto(mapa[x.persona_id]) }));
    },
    mapear: (a) => ({
      id: a.id, titulo: `${a.cargo} — ${a._n}`, sub: a.fecha_fin ? `${fmtFecha(a.fecha_inicio)} a ${fmtFecha(a.fecha_fin)}` : `Vigente desde ${fmtFecha(a.fecha_inicio)}`,
      fecha: a.fecha_inicio, link: `#/autoridades`, arch: a.archivado,
      campos: [['Observaciones', a.observaciones]], extra: unir(a.cargo, a._n),
    }),
  },
  {
    clave: 'calendario', titulo: 'Calendario', ico: '📅', roles: TODOS,
    traer: () => traer('eventos', 'id,titulo,fecha,lugar,descripcion,archivado'),
    mapear: (e) => ({
      id: e.id, titulo: e.titulo, sub: puntos(fmtFecha(e.fecha), e.lugar),
      fecha: e.fecha, link: `#/calendario?dia=${e.fecha}`, arch: e.archivado,
      campos: [['Descripción', e.descripcion], ['Lugar', e.lugar]], extra: '',
    }),
  },
  {
    clave: 'inventario', titulo: 'Inventario', ico: '📦', roles: INV,
    traer: () => traer('inventario_bienes', 'id,codigo,nombre,descripcion,categoria,ubicacion,observaciones,estado,archivado'),
    mapear: (b) => ({
      id: b.id, titulo: `${b.codigo} — ${b.nombre}`, sub: puntos(b.categoria, b.ubicacion),
      fecha: '', link: `#/inventario/${b.id}`, arch: b.archivado,
      campos: [['Descripción', b.descripcion], ['Observaciones', b.observaciones], ['Categoría', b.categoria], ['Ubicación', b.ubicacion]], extra: unir(b.codigo, b.nombre),
    }),
  },
  {
    clave: 'documentos', titulo: 'Documentos', ico: '🗂️', roles: INV,
    traer: () => traer('documentos', 'id,titulo,categoria,fecha_documento,descripcion,etiquetas,nombre_archivo,archivado'),
    mapear: (d) => ({
      id: d.id, titulo: d.titulo, sub: puntos(d.categoria, fmtFecha(d.fecha_documento)),
      fecha: d.fecha_documento, link: `#/documentos/${d.id}`, arch: d.archivado,
      campos: [['Descripción', d.descripcion], ['Etiquetas', (d.etiquetas || []).join(' ')], ['Archivo', d.nombre_archivo]], extra: unir(d.titulo, d.categoria),
    }),
  },
];

// Fragmento de texto alrededor de la primera coincidencia.
function fragmento(texto, terminos) {
  const t = String(texto || '');
  const n = normalizar(t);
  let pos = -1;
  for (const w of terminos) { const i = n.indexOf(w); if (i >= 0 && (pos < 0 || i < pos)) pos = i; }
  if (pos < 0) return '';
  const ini = Math.max(0, pos - 45);
  const fin = Math.min(t.length, pos + 90);
  return (ini > 0 ? '…' : '') + t.slice(ini, fin).replace(/\s+/g, ' ') + (fin < t.length ? '…' : '');
}

// Resalta (sin distinguir tildes ni mayúsculas). normalizar() conserva el largo del texto.
function resaltar(texto, terminos) {
  const t = String(texto || '');
  const n = normalizar(t);
  if (n.length !== t.length) return esc(t);
  const marcas = new Array(t.length).fill(false);
  for (const w of terminos) {
    let i = n.indexOf(w);
    while (i >= 0) { for (let k = i; k < i + w.length; k++) marcas[k] = true; i = n.indexOf(w, i + w.length); }
  }
  let out = ''; let abierto = false;
  for (let i = 0; i < t.length; i++) {
    if (marcas[i] && !abierto) { out += '<mark>'; abierto = true; }
    if (!marcas[i] && abierto) { out += '</mark>'; abierto = false; }
    out += esc(t[i]);
  }
  return out + (abierto ? '</mark>' : '');
}

export async function render(cont, { query }) {
  const vista = cont.dataset.vista;
  const grupos = GRUPOS.filter((g) => puede(...g.roles));
  let datos = null; // { clave: [items] }

  cont.innerHTML = `
    ${encabezado('Búsqueda', 'Busca en actas, reuniones, decisiones, notas, miembros, autoridades, calendario, inventario y documentos.')}
    <div class="tarjeta"><div class="cuerpo">
      <input type="search" id="b-txt" class="busq-grande" placeholder="Escribí lo que buscás: un nombre, un tema, un número…" autocomplete="off" value="${esc(query?.q || '')}">
      <div class="sub" style="margin-top:6px">Se buscan todas las palabras, sin importar mayúsculas ni tildes. Incluye lo archivado.</div>
    </div></div>
    <div id="b-res"><div class="cargando">Cargando…</div></div>`;

  const tareas = grupos.map(async (g) => {
    const filas = await g.traer();
    return [g.clave, filas.map((f) => {
      const it = g.mapear(f);
      it.todo = normalizar(unir(it.titulo, it.sub, it.extra, ...it.campos.map((c) => c[1])));
      it.tit = normalizar(unir(it.titulo, it.extra));
      return it;
    })];
  });
  datos = Object.fromEntries(await Promise.all(tareas));
  if (cont.dataset.vista !== vista) return;

  function pintar() {
    const txt = document.getElementById('b-txt').value.trim();
    const res = document.getElementById('b-res');
    const terminos = normalizar(txt).split(/\s+/).filter((w) => w.length > 0);
    history.replaceState(null, '', `#/buscar${txt ? `?q=${encodeURIComponent(txt)}` : ''}`);
    document.querySelectorAll('.buscador-lateral input').forEach((i) => { if (i !== document.activeElement) i.value = txt; });
    if (!terminos.length) { res.innerHTML = '<div class="tarjeta"><div class="cuerpo"><div class="vacio">Escribí algo para buscar.</div></div></div>'; return; }

    let total = 0; let html = '';
    for (const g of grupos) {
      const lista = (datos[g.clave] || []).filter((it) => terminos.every((w) => it.todo.includes(w)));
      if (!lista.length) continue;
      total += lista.length;
      lista.sort((a, b) => (Number(terminos.every((w) => b.tit.includes(w))) - Number(terminos.every((w) => a.tit.includes(w))))
        || Number(a.arch) - Number(b.arch) || String(b.fecha).localeCompare(String(a.fecha)));
      const mostrar = lista.slice(0, POR_GRUPO);
      html += `<div class="tarjeta busq-grupo"><div class="enc"><h2>${g.ico} ${esc(g.titulo)} <span class="badge">${lista.length}</span></h2></div>
        <div class="cuerpo sin-pad">${mostrar.map((it) => {
          const campo = it.campos.find(([, v]) => v && terminos.some((w) => normalizar(v).includes(w)));
          const frag = campo ? fragmento(campo[1], terminos) : '';
          return `<a class="busq-item" href="${esc(it.link)}">
            <div class="t">${resaltar(it.titulo, terminos)}${it.arch ? ' <span class="badge">Archivado</span>' : ''}</div>
            ${it.sub ? `<div class="s">${resaltar(it.sub, terminos)}</div>` : ''}
            ${frag ? `<div class="f"><i>${esc(campo[0])}:</i> ${resaltar(frag, terminos)}</div>` : ''}</a>`;
        }).join('')}
        ${lista.length > POR_GRUPO ? `<a class="busq-mas" href="#/${g.clave}">Hay ${lista.length - POR_GRUPO} más. Abrí ${esc(g.titulo)} para verlos todos →</a>` : ''}
        </div></div>`;
    }
    res.innerHTML = total
      ? `<div class="sub" style="margin:0 2px 8px">${total} ${total === 1 ? 'resultado' : 'resultados'}</div>${html}`
      : '<div class="tarjeta"><div class="cuerpo"><div class="vacio">No se encontró nada. Probá con menos palabras o con otra forma de escribirlo.</div></div></div>';
  }

  pintar();
  const inp = document.getElementById('b-txt');
  inp.addEventListener('input', debounce(pintar, 150));
  inp.focus();
}
