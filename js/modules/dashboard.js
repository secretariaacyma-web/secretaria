import { sb, q } from '../supabase.js';
import { estado, puede, puedeEscribir, mapaPersonas, nombreCompleto } from '../state.js';
import { TIPOS_REUNION, TIPOS_ACTA, ESTADOS_ACTA, ESTADOS_DECISION, TIPOS_AUTORIDAD } from '../constantes.js';
import { esc, fmtFecha, fmtHora, badge, encabezado, hoy, fmtFechaLarga } from '../ui.js';
import { CATEGORIAS_EVENTO } from '../constantes.js';

export async function render(cont) {
  const h = hoy();
  const escribe = puedeEscribir();
  const verMiembros = puede('administrador', 'secretario', 'pastor');

  const [reuniones, actas, decisiones, autoridades, borradores, realizadas, actasConReunion, vencidasReu, personas, miembros] = await Promise.all([
    q(sb.from('reuniones').select('*').eq('archivado', false).eq('estado', 'programada').gte('fecha', h).order('fecha').order('hora').limit(5)),
    q(sb.from('actas').select('id,numero,fecha,tipo,estado').order('numero', { ascending: false }).limit(5)),
    q(sb.from('decisiones').select('*').eq('archivado', false).in('estado', ['pendiente', 'en_proceso']).order('fecha_limite', { ascending: true, nullsFirst: false }).limit(100)),
    q(sb.from('autoridades').select('*').is('fecha_fin', null).eq('archivado', false)),
    q(sb.from('actas').select('id,numero').eq('estado', 'borrador').order('numero')),
    q(sb.from('reuniones').select('id,fecha,tipo').eq('archivado', false).eq('estado', 'realizada').order('fecha', { ascending: false }).limit(100)),
    q(sb.from('actas').select('reunion_id').not('reunion_id', 'is', null)),
    q(sb.from('reuniones').select('id', { count: 'exact', head: false }).eq('archivado', false).eq('estado', 'programada').lt('fecha', h)),
    mapaPersonas(),
    verMiembros
      ? sb.from('miembros').select('id', { count: 'exact', head: true }).eq('estado', 'activo').eq('archivado', false).then((r) => r.count)
      : null,
  ]);

  // Agenda de los próximos 7 días (si el calendario todavía no está instalado, se omite).
  let agenda = null;
  try {
    const { eventosEntre, sumarDias } = await import('./calendario.js');
    agenda = (await eventosEntre(h, sumarDias(h, 6))).filter((e) => !e.cancelado);
  } catch { /* calendario no instalado */ }

  // Préstamos de inventario con la devolución vencida (si el inventario no está instalado, se omite).
  let prestVenc = 0;
  try {
    const r = await sb.from('inventario_prestamos').select('id', { count: 'exact', head: true }).is('devuelto_en', null).lt('fecha_devolucion_prevista', h);
    if (!r.error) prestVenc = r.count || 0;
  } catch { /* inventario no instalado */ }

  // Documentos vencidos o por vencer en 30 días (si Documentos no está instalado, se omite).
  let docsVenc = 0; let docsPorVencer = 0;
  try {
    const lim = new Date(); lim.setDate(lim.getDate() + 30);
    const limite = `${lim.getFullYear()}-${String(lim.getMonth() + 1).padStart(2, '0')}-${String(lim.getDate()).padStart(2, '0')}`;
    const r = await sb.from('documentos').select('vence_el').eq('archivado', false).not('vence_el', 'is', null).lte('vence_el', limite);
    if (!r.error) { docsVenc = r.data.filter((d) => d.vence_el < h).length; docsPorVencer = r.data.length - docsVenc; }
  } catch { /* documentos no instalado */ }

  const conActa = new Set(actasConReunion.map((a) => a.reunion_id));
  const sinActa = realizadas.filter((r) => !conActa.has(r.id));
  const vencidas = decisiones.filter((d) => d.fecha_limite && d.fecha_limite < h);

  const tareas = [];
  if (vencidas.length) tareas.push({ n: vencidas.length, txt: vencidas.length === 1 ? 'decisión vencida' : 'decisiones vencidas', href: '#/decisiones?estado=vencidas', tipo: 'rojo' });
  if (sinActa.length) tareas.push({ n: sinActa.length, txt: sinActa.length === 1 ? 'reunión realizada sin acta' : 'reuniones realizadas sin acta', href: '#/reuniones', tipo: 'naranja' });
  if (vencidasReu.length) tareas.push({ n: vencidasReu.length, txt: vencidasReu.length === 1 ? 'reunión programada con fecha pasada (para cerrar)' : 'reuniones programadas con fecha pasada (para cerrar)', href: '#/reuniones', tipo: 'naranja' });
  if (prestVenc) tareas.push({ n: prestVenc, txt: prestVenc === 1 ? 'préstamo de inventario sin devolver (vencido)' : 'préstamos de inventario sin devolver (vencidos)', href: '#/inventario?prestamo=vencido', tipo: 'rojo' });
  if (docsVenc) tareas.push({ n: docsVenc, txt: docsVenc === 1 ? 'documento vencido' : 'documentos vencidos', href: '#/documentos?venc=vencidos', tipo: 'rojo' });
  if (docsPorVencer) tareas.push({ n: docsPorVencer, txt: docsPorVencer === 1 ? 'documento vence en los próximos 30 días' : 'documentos vencen en los próximos 30 días', href: '#/documentos?venc=porvencer', tipo: 'naranja' });
  if (borradores.length) tareas.push({ n: borradores.length, txt: borradores.length === 1 ? 'acta en borrador para aprobar' : 'actas en borrador para aprobar', href: '#/actas', tipo: 'azul' });

  const listaVacia = (t) => `<div class="vacio">${esc(t)}</div>`;

  const autoridadesOrd = [...autoridades].sort((a, b) => (a.tipo === b.tipo ? 0 : a.tipo === 'pastor' ? -1 : 1));

  cont.innerHTML = `
    ${encabezado(`Hola, ${(estado.perfil.nombre || '').split(' ')[0] || 'bienvenido/a'}`, estado.iglesia?.nombre || '')}

    ${escribe ? `<div class="rapidos" style="margin-bottom:16px">
      <a href="#/actas?nuevo=1">＋ Nueva acta</a>
      <a href="#/miembros?nuevo=1">＋ Nuevo miembro</a>
      <a href="#/reuniones?nuevo=1">＋ Nueva reunión</a>
      <a href="#/decisiones?nuevo=1">＋ Nueva decisión</a>
      ${agenda ? '<a href="#/calendario?nuevo=1">＋ Nuevo evento</a>' : ''}
      ${puede('administrador', 'secretario') ? '<a href="#/notas?nuevo=1">＋ Nueva nota</a>' : ''}
    </div>` : ''}

    <div class="grilla c4">
      ${verMiembros ? `<div class="tarjeta cifra"><div class="n">${miembros ?? 0}</div><div class="l">Miembros activos</div></div>` : ''}
      <div class="tarjeta cifra"><div class="n">${decisiones.length}</div><div class="l">Decisiones abiertas</div></div>
      <div class="tarjeta cifra"><div class="n">${borradores.length}</div><div class="l">Actas en borrador</div></div>
      <div class="tarjeta cifra"><div class="n">${reuniones.length}</div><div class="l">Próximas reuniones</div></div>
    </div>

    <div class="tarjeta mt">
      <div class="enc"><h2>Tareas y alertas de Secretaría</h2></div>
      ${tareas.length
        ? `<ul class="lista">${tareas.map((t) => `<li><a class="fila" href="${t.href}"><span class="badge ${t.tipo}">${t.n}</span> &nbsp;${esc(t.txt)}</a></li>`).join('')}</ul>`
        : '<div class="vacio">✔ Todo al día. No hay tareas pendientes.</div>'}
    </div>

    ${agenda ? `<div class="tarjeta mt">
      <div class="enc"><h2>Agenda de los próximos 7 días</h2><a href="#/calendario">Ver calendario</a></div>
      ${agenda.length ? `<ul class="lista">${agenda.slice(0, 10).map((e) => `
        <li><a class="fila" href="#/calendario"><div class="t">${esc(e.titulo)} ${e.privado ? '🔒' : ''}</div>
        <div class="s" style="text-transform:capitalize">${esc(fmtFechaLarga(e.fecha).split(' de ').slice(0, 2).join(' de '))}${e.hora ? ' · ' + esc(e.hora) + ' hs' : ''}${e.lugar ? ' · ' + esc(e.lugar) : ''}</div></a>
        <span class="badge" style="background:${(CATEGORIAS_EVENTO[e.categoria] || CATEGORIAS_EVENTO.otro)[1]}1f;color:${(CATEGORIAS_EVENTO[e.categoria] || CATEGORIAS_EVENTO.otro)[1]}">${esc((CATEGORIAS_EVENTO[e.categoria] || CATEGORIAS_EVENTO.otro)[0])}</span></li>`).join('')}</ul>`
        : listaVacia('No hay actividades en los próximos 7 días.')}
    </div>` : ''}

    <div class="grilla c2 mt">
      <div class="tarjeta">
        <div class="enc"><h2>Próximas reuniones</h2><a href="#/reuniones">Ver todas</a></div>
        ${reuniones.length ? `<ul class="lista">${reuniones.map((r) => `
          <li><a class="fila" href="#/reuniones"><div class="t">${esc(TIPOS_REUNION[r.tipo])}</div>
          <div class="s">${fmtFecha(r.fecha)} ${esc(fmtHora(r.hora))} ${r.lugar ? '· ' + esc(r.lugar) : ''}</div></a></li>`).join('')}</ul>`
          : listaVacia('No hay reuniones programadas.')}
      </div>

      <div class="tarjeta">
        <div class="enc"><h2>Decisiones pendientes</h2><a href="#/decisiones">Ver todas</a></div>
        ${decisiones.length ? `<ul class="lista">${decisiones.slice(0, 6).map((d) => `
          <li><a class="fila" href="#/decisiones"><div class="t">${esc(d.descripcion)}</div>
          <div class="s">${esc(d.responsable_id ? nombreCompleto(personas[d.responsable_id]) : 'Sin responsable')} · Límite: ${fmtFecha(d.fecha_limite)}</div></a>
          ${d.fecha_limite && d.fecha_limite < h ? '<span class="badge rojo">Vencida</span>' : badge(ESTADOS_DECISION[d.estado])}</li>`).join('')}</ul>`
          : listaVacia('No hay decisiones pendientes.')}
      </div>

      <div class="tarjeta">
        <div class="enc"><h2>Últimas actas</h2><a href="#/actas">Ver todas</a></div>
        ${actas.length ? `<ul class="lista">${actas.map((a) => `
          <li><a class="fila" href="#/actas/${a.id}"><div class="t">Acta N° ${a.numero}</div>
          <div class="s">${esc(TIPOS_ACTA[a.tipo])} · ${fmtFecha(a.fecha)}</div></a>${badge(ESTADOS_ACTA[a.estado])}</li>`).join('')}</ul>`
          : listaVacia('Todavía no hay actas.')}
      </div>

      <div class="tarjeta">
        <div class="enc"><h2>Autoridades actuales</h2><a href="#/autoridades">Ver todas</a></div>
        ${autoridadesOrd.length ? `<ul class="lista">${autoridadesOrd.slice(0, 8).map((a) => `
          <li><div><div class="t">${esc(nombreCompleto(personas[a.persona_id]))}</div><div class="s">${esc(a.cargo)}</div></div>
          <span class="badge ${a.tipo === 'pastor' ? 'dorado' : 'azul'}">${esc(TIPOS_AUTORIDAD[a.tipo])}</span></li>`).join('')}</ul>`
          : listaVacia('Todavía no hay autoridades cargadas.')}
      </div>
    </div>`;
}
