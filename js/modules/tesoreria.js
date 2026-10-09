// Tesorería: libro de caja mensual, aportes automáticos y planilla oficial ACMA lista para descargar en PDF.
// Nada se borra: un movimiento equivocado se anula (queda el motivo y el historial).
import { sb, q } from '../supabase.js';
import { estado, mapaPersonas, nombreCompleto } from '../state.js';
import { generarPDFPlanilla, fmtImporte } from '../pdf-planilla.js';
import {
  RUBROS, CATEGORIAS_INGRESO, resumenMes, aportesDe, porcentajesDe, mapearFirebase, nombreMes, mesDe, r2, PORC_DEFECTO,
} from '../tesoreria-calculo.js';
import {
  esc, fmtFecha, badge, tablaHTML, encabezado, formModal, confirmar, toast, hoy, errorAmigable, descargar, abrirModal,
} from '../ui.js';

const faltaMigracion = (e) => /relation|does not exist|schema cache|permission denied|column/i.test(e?.message || '');
const AVISO_MIGRACION = `<div class="tarjeta"><div class="cuerpo"><div class="aviso warn">Falta activar Tesorería en la base de datos. Ejecutá el archivo <b>supabase/08-tesoreria.sql</b> en Supabase → SQL Editor y recargá esta página.</div></div></div>`;

const $ = (n) => `$ ${fmtImporte(n)}`;
const sumaMes = (mes, d) => { const [y, m] = mes.split('-').map(Number); const f = new Date(y, m - 1 + d, 1); return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}`; };

// Lee todas las filas aunque pasen de las 1000 que devuelve Supabase por consulta.
async function leerTodo(tabla, orden = 'creado_en') {
  const filas = []; const paso = 1000;
  for (let desde = 0; ; desde += paso) {
    const parte = await q(sb.from(tabla).select('*').order(orden, { ascending: true }).range(desde, desde + paso - 1));
    filas.push(...parte);
    if (parte.length < paso) break;
  }
  return filas;
}

export async function render(cont, { query }) {
  const vista = cont.dataset.vista;
  let movs = []; let pcts = []; let planillas = []; let config = null; let autoridades = [];
  let tab = ['movimientos', 'planilla', 'config'].includes(query?.tab) ? query.tab : 'movimientos';
  let mes = /^\d{4}-\d{2}$/.test(query?.mes || '') ? query.mes : hoy().slice(0, 7);
  let verAnulados = false;
  const esAdmin = estado.perfil.rol === 'administrador';

  async function cargar() {
    [movs, pcts, planillas, config] = await Promise.all([
      leerTodo('tesoreria_movimientos'),
      leerTodo('tesoreria_porcentajes', 'vigente_desde'),
      leerTodo('tesoreria_planillas', 'mes'),
      q(sb.from('tesoreria_config').select('*').maybeSingle()),
    ]);
    // Autoridades vigentes: sirven para completar solos los nombres de la planilla.
    try {
      const [aut, pers] = await Promise.all([
        q(sb.from('autoridades').select('persona_id,cargo').is('fecha_fin', null).eq('archivado', false)),
        mapaPersonas(),
      ]);
      autoridades = aut.map((a) => ({ cargo: a.cargo, nombre: pers[a.persona_id] ? `${pers[a.persona_id].nombre} ${pers[a.persona_id].apellido}` : '' })).filter((a) => a.nombre);
    } catch { autoridades = []; }
  }
  const resumen = () => resumenMes(movs, pcts, planillas, mes);

  // Nombres para la planilla: lo cargado en Configuración, o si falta, la autoridad vigente con ese cargo.
  function nombreAuto(campo, patron, excluir) {
    if (config?.[campo]) return config[campo];
    return autoridades.find((a) => patron.test(a.cargo) && !(excluir && excluir.test(a.cargo)))?.nombre || '';
  }
  const datosFirmas = () => ({
    tesorero: nombreAuto('tesorero_nombre', /tesorer/i, /pro/i),
    pastor: nombreAuto('pastor_nombre', /^pastor$/i) || autoridades.find((a) => /pastor/i.test(a.cargo))?.nombre || config?.pastor_nombre || '',
    revisor: nombreAuto('revisor_nombre', /revisor/i),
    tesoreroTel: config?.tesorero_tel || '', tesoreroEmail: config?.tesorero_email || '',
  });

  // ------------------------------------------------------------------ Movimientos
  async function formMovimiento(tipo, mov = null) {
    const ing = tipo === 'ingreso';
    const campos = [
      { name: 'fecha', label: 'Fecha', type: 'date', required: true },
      { name: 'monto', label: 'Monto ($)', type: 'number', required: true, placeholder: '0,00' },
      ing
        ? { name: 'categoria', label: 'Tipo de ingreso', type: 'select', required: true, options: Object.entries(CATEGORIAS_INGRESO).map(([v, l]) => ({ v, l })), hint: 'Solo "Culto General" genera los aportes al pastor, distrito y central.' }
        : { name: 'rubro', label: 'Rubro (de la planilla)', type: 'select', required: true, options: RUBROS.map((l, i) => ({ v: String(i + 1), l: `${i + 1} - ${l}` })) },
      { name: 'descripcion', label: 'Descripción', full: true, placeholder: ing ? 'Ej.: Ofrenda de la reunión del domingo' : 'Ej.: Factura de luz' },
    ];
    if (ing) campos.push({ name: 'sin_pastor', label: '¿Sin aporte al pastor? (solo Culto General)', type: 'select', options: [{ v: 'no', l: 'No: se calcula el aporte al pastor' }, { v: 'si', l: 'Sí: este ingreso no genera aporte al pastor' }], hint: 'Por ejemplo, cuando el pastor no estuvo ese día.' });
    else campos.push({ name: 'comprobante', label: 'N° de comprobante (opcional)' });
    const valores = mov
      ? { ...mov, monto: mov.monto, rubro: mov.rubro ? String(mov.rubro) : '', sin_pastor: mov.sin_pastor ? 'si' : 'no' }
      : { fecha: mes === hoy().slice(0, 7) ? hoy() : `${mes}-01`, categoria: ing ? 'culto_general' : '', sin_pastor: 'no' };
    const ok = await formModal({
      titulo: `${mov ? 'Editar' : 'Nuevo'} ${ing ? 'ingreso' : 'egreso'}`, campos, valores,
      guardar: async (v) => {
        if (!(v.monto > 0)) throw new Error('El monto tiene que ser mayor a cero.');
        const fila = { fecha: v.fecha, tipo, monto: r2(v.monto), descripcion: v.descripcion };
        if (ing) {
          fila.categoria = v.categoria; fila.rubro = null;
          fila.sin_pastor = v.categoria === 'culto_general' && v.sin_pastor === 'si';
        } else { fila.rubro = Number(v.rubro); fila.categoria = null; fila.comprobante = v.comprobante; fila.sin_pastor = false; }
        if (mov) await q(sb.from('tesoreria_movimientos').update(fila).eq('id', mov.id));
        else await q(sb.from('tesoreria_movimientos').insert(fila));
      },
    });
    if (ok) { toast('Movimiento guardado.', 'ok'); mes = mesDe(ok.fecha); await recargar(); }
  }

  async function anular(m) {
    const ok = await formModal({
      titulo: 'Anular movimiento', textoGuardar: 'Anular',
      aviso: 'El movimiento no se borra: queda registrado como anulado y no cuenta en los totales.',
      campos: [{ name: 'motivo', label: 'Motivo', required: true, full: true, placeholder: 'Ej.: Se cargó dos veces' }],
      guardar: async ({ motivo }) => { await q(sb.from('tesoreria_movimientos').update({ anulado: true, motivo_anulacion: motivo }).eq('id', m.id)); },
    });
    if (ok) { toast('Movimiento anulado.', 'ok'); await recargar(); }
  }
  async function restaurar(m) {
    if (!(await confirmar('¿Restaurar este movimiento? Volverá a contar en los totales.', { textoOk: 'Restaurar' }))) return;
    try { await q(sb.from('tesoreria_movimientos').update({ anulado: false }).eq('id', m.id)); toast('Movimiento restaurado.', 'ok'); await recargar(); } catch (e) { toast(errorAmigable(e), 'error'); }
  }

  function pintarMovimientos(box) {
    const r = resumen();
    const items = movs.filter((m) => mesDe(m.fecha) === mes && (verAnulados || !m.anulado))
      .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)) || String(b.creado_en).localeCompare(String(a.creado_en)));
    const caja = (t, v, extra = '') => `<div class="tarjeta cifra"><div class="n" style="font-size:19px;white-space:nowrap">${$(v)}</div><div class="l">${esc(t)}</div>${extra}</div>`;
    box.innerHTML = `
      <div class="grilla c4">
        ${caja('Saldo del mes anterior', r.A)}
        ${caja('Ingresos del mes', r.B)}
        ${caja('Egresos y aportes del mes', r.C)}
        ${caja('Saldo en caja (ya pagado todo)', r.D)}
      </div>
      <div class="grilla c4 mt">
        ${caja(`Pastor (${r.pc.pastor}%)`, r.pastor)}
        ${caja(`Distrito (${r.pc.distrito}%)`, r.distrito)}
        ${caja(`Central (${r.pc.central}%)`, r.central)}
        ${caja('Egresos del mes (sin aportes)', r.egresos)}
      </div>
      <div class="tarjeta mt"><div class="enc"><h2>Movimientos de ${esc(nombreMes(mes))}</h2>
        <label style="font-size:13px;display:flex;gap:6px;align-items:center"><input type="checkbox" id="t-anul" ${verAnulados ? 'checked' : ''}> Ver anulados</label></div>
      <div class="cuerpo sin-pad" id="t-lista"></div></div>`;
    box.querySelector('#t-anul').onchange = (e) => { verAnulados = e.target.checked; pintarMovimientos(box); };
    box.querySelector('#t-lista').innerHTML = tablaHTML([
      { h: 'Fecha', f: (m) => fmtFecha(m.fecha) },
      { h: 'Tipo', f: (m) => badge(m.tipo === 'ingreso' ? ['Ingreso', 'verde'] : ['Egreso', 'naranja']) + (m.anulado ? ' <span class="badge rojo">Anulado</span>' : '') },
      {
        h: 'Categoría / rubro', f: (m) => {
          const a = aportesDe(m, r.pc);
          return `${esc(m.tipo === 'ingreso' ? CATEGORIAS_INGRESO[m.categoria] : `${m.rubro} - ${RUBROS[m.rubro - 1]}`)}`
            + (a ? `<div style="font-size:11px;color:var(--texto-2)">${m.sin_pastor ? '<b>Sin aporte al pastor</b> · ' : `Pastor ${$(a.pastor)} · `}Dist. ${$(a.distrito)} · Central ${$(a.central)}</div>` : '');
        },
      },
      { h: 'Descripción', f: (m) => esc(m.descripcion || '') + (m.anulado && m.motivo_anulacion ? `<div style="font-size:11px;color:var(--rojo)">Motivo: ${esc(m.motivo_anulacion)}</div>` : '') },
      { h: 'Monto', f: (m) => `<b style="${m.anulado ? 'text-decoration:line-through;opacity:.6' : ''}">${$(m.monto)}</b>` },
      {
        h: '', f: (m) => (m.anulado
          ? `<button class="btn chico link" data-rest="${m.id}" title="Restaurar">↩</button>`
          : `<button class="btn chico link" data-ed="${m.id}" title="Editar">✏️</button><button class="btn chico link" data-anu="${m.id}" title="Anular">🚫</button>`),
      },
    ], items, { vacio: 'No hay movimientos en este mes. Usá los botones de arriba para cargar un ingreso o un egreso.', clsFila: (m) => (m.anulado ? 'archivado' : '') });
    const buscar = (id) => movs.find((m) => m.id === id);
    box.querySelectorAll('[data-ed]').forEach((b) => { b.onclick = () => { const m = buscar(b.dataset.ed); formMovimiento(m.tipo, m); }; });
    box.querySelectorAll('[data-anu]').forEach((b) => { b.onclick = () => anular(buscar(b.dataset.anu)); });
    box.querySelectorAll('[data-rest]').forEach((b) => { b.onclick = () => restaurar(buscar(b.dataset.rest)); });
  }

  // ------------------------------------------------------------------ Planilla ACMA
  function datosPDF(r) {
    const f = datosFirmas();
    return {
      iglesia: config?.nombre_planilla || 'Villa Jardín', mes: nombreMes(mes), distrito: config?.distrito || 'SUR',
      valores: { A: r.A, B: r.B, C: r.C, D: r.D, E: r.E, F: r.F, G: r.G, H: r.H, rubros: r.rubrosPlanilla, tcomp: r.tcomp, cant: r.cant, I: r.I, II: r.II, III: r.III, IV: r.IV, V: r.V },
      remito: {
        fecha: r.plan?.rem_fecha, efectivo: r.efectivo, deposito: r.deposito, depositoFecha: r.plan?.rem_deposito_fecha,
        cheque: r.cheque, chequeBanco: r.plan?.rem_cheque_banco, chequeNro: r.plan?.rem_cheque_nro,
        giro: r.giro, giroNro: r.plan?.rem_giro_nro, giroFecha: r.plan?.rem_giro_fecha, total: r.remitido,
      },
      firmas: f,
    };
  }

  async function datosDelMes() {
    const p = resumen().plan || {};
    const num = (n, label, hint) => ({ name: n, label, type: 'number', hint });
    const ok = await formModal({
      titulo: `Datos de la planilla — ${nombreMes(mes)}`, ancho: true,
      aviso: 'Lo demás (ingresos, egresos por rubro, aportes y saldo) se completa solo con los movimientos. Acá cargás solo lo que no sale del libro de caja.',
      valores: p,
      campos: [
        num('f_ministerios', 'F - Aporte a ministerios nacionales ($)', 'Si no hubo, dejalo vacío.'),
        num('g_otros', 'G - Otros aportes, además del distrito ($)'),
        num('ret_jubilados', 'I - Pago de subsidios a pastores jubilados ($)'),
        num('ret_alquileres', 'II - Alquileres bancarizados ($)'),
        num('ret_otros', 'III - Otros pagos ($)'),
        { name: 'rem_fecha', label: 'Fecha de envío a Tesorería Central', type: 'date' },
        num('rem_efectivo', 'a - Efectivo ($)'),
        num('rem_deposito', 'b - Depósito / transferencia ($)'),
        { name: 'rem_deposito_fecha', label: 'Fecha del depósito / transferencia', type: 'date' },
        num('rem_cheque', 'c - Cheque ($)'),
        { name: 'rem_cheque_banco', label: 'Banco del cheque' },
        { name: 'rem_cheque_nro', label: 'N° de cheque' },
        num('rem_giro', 'd - Giro ($)'),
        { name: 'rem_giro_nro', label: 'N° de giro' },
        { name: 'rem_giro_fecha', label: 'Fecha del giro', type: 'date' },
      ],
      guardar: async (v) => {
        for (const k of Object.keys(v)) if (typeof v[k] === 'number' && v[k] < 0) throw new Error('Los importes no pueden ser negativos.');
        const fila = { ...v };
        for (const k of ['f_ministerios', 'g_otros', 'ret_jubilados', 'ret_alquileres', 'ret_otros', 'rem_efectivo', 'rem_deposito', 'rem_cheque', 'rem_giro']) fila[k] = fila[k] || 0;
        if (p.id) await q(sb.from('tesoreria_planillas').update(fila).eq('id', p.id));
        else await q(sb.from('tesoreria_planillas').insert({ ...fila, mes: `${mes}-01` }));
      },
    });
    if (ok) { toast('Datos guardados.', 'ok'); await recargar(); }
  }

  function pintarPlanilla(box) {
    const r = resumen(); const f = datosFirmas();
    const faltan = [];
        if (!f.tesorero) faltan.push('tesorero/a'); if (!f.pastor) faltan.push('pastor');
    const fila = (a, b, c = '') => `<tr><td style="padding:5px 10px;color:var(--texto-2)">${a}</td><td style="padding:5px 10px">${b}</td><td style="padding:5px 10px;text-align:right"><b>${c}</b></td></tr>`;
    box.innerHTML = `
      ${faltan.length ? `<div class="aviso warn">Falta completar en la pestaña <b>Configuración</b>: ${esc(faltan.join(', '))}. Sin eso salen en blanco en la planilla.</div>` : ''}
      <div class="tarjeta"><div class="enc"><h2>Planilla ACMA — ${esc(nombreMes(mes))}</h2>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn sec" id="p-datos">✏️ Datos del mes</button><button class="btn" id="p-pdf">⬇ Descargar PDF</button></div></div>
        <div class="cuerpo sin-pad"><div class="tabla-wrap"><table class="tabla" style="width:100%"><tbody>
          ${fila('A', 'Saldo de caja del mes anterior', $(r.A))}
          ${fila('B', 'Total de ingresos del mes', $(r.B))}
          ${fila('C', 'Total de egresos del mes (egresos + aportes)', $(r.C))}
          ${fila('<b>D</b>', '<b>Saldo final de caja (A + B - C)</b>', $(r.D))}
          ${fila('E', `Contribución societaria mensual (central ${r.pc.central}%)`, $(r.E))}
          ${fila('F', 'Aporte a ministerios nacionales', $(r.F))}
          ${fila('G', `Otros aportes (distrito ${r.pc.distrito}%${r.plan?.g_otros ? ' + otros' : ''})`, $(r.G))}
          ${fila('<b>H</b>', '<b>Total de aportes</b>', $(r.H))}
          ${r.rubrosPlanilla.map((v, i) => (v ? fila(String(i + 1), RUBROS[i] + (i === 7 && r.pastor ? ` (incluye el ${r.pc.pastor}% del pastor)` : ''), $(v)) : '')).join('')}
          ${fila('', '<b>Total de comprobantes</b>', $(r.tcomp))}
          ${fila('', 'Cantidad de comprobantes', String(r.cant))}
          ${fila('IV', 'Total a retener', $(r.IV))}
          ${fila('V', '<b>Total a transferir a Tesorería Central (H - IV)</b>', $(r.V))}
          ${fila('', 'Total remitido', $(r.remitido))}
        </tbody></table></div></div></div>
      <div class="sub" style="margin:8px 2px">El PDF reproduce la planilla oficial de ACMA con estos datos. Firmantes: Tesorero/a ${esc(f.tesorero || '—')}, Pastor ${esc(f.pastor || '—')}${f.revisor ? `, Revisor/a de cuentas ${esc(f.revisor)}` : ''}.</div>`;
    box.querySelector('#p-datos').onclick = datosDelMes;
    box.querySelector('#p-pdf').onclick = () => {
      try {
        const blob = generarPDFPlanilla(datosPDF(r));
        const nombre = `Planilla ACMA - ${nombreMes(mes)}.pdf`;
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nombre; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        toast('Planilla descargada.', 'ok');
      } catch (e) { toast(errorAmigable(e), 'error'); }
    };
  }

  // ------------------------------------------------------------------ Configuración
  async function editarConfig() {
    const f = datosFirmas();
    const ok = await formModal({
      titulo: 'Datos para la planilla', ancho: true,
      aviso: 'Los nombres se completan solos con las Autoridades vigentes (cargos Tesorero/a, Pastor y Revisor/a de cuentas). Si escribís uno acá, se usa ese.',
      valores: {
        nombre_planilla: config?.nombre_planilla || 'Villa Jardín', distrito: config?.distrito || 'SUR',
        tesorero_nombre: f.tesorero, tesorero_tel: config?.tesorero_tel || '', tesorero_email: config?.tesorero_email || '',
        pastor_nombre: f.pastor, revisor_nombre: f.revisor,
      },
      campos: [
        { name: 'nombre_planilla', label: 'Iglesia de (como va en la planilla)', required: true, full: true, placeholder: 'Ej.: Villa Jardín' },
        { name: 'distrito', label: 'Distrito', full: true },
        { name: 'tesorero_nombre', label: 'Tesorero/a' },
        { name: 'pastor_nombre', label: 'Pastor' },
        { name: 'tesorero_tel', label: 'Teléfono del tesorero/a' },
        { name: 'tesorero_email', label: 'E-mail del tesorero/a', type: 'email' },
        { name: 'revisor_nombre', label: 'Revisor/a de cuentas', full: true },
      ],
      guardar: async (v) => {
        if (config?.id) await q(sb.from('tesoreria_config').update(v).eq('id', config.id));
        else await q(sb.from('tesoreria_config').insert(v));
      },
    });
    if (ok) { toast('Datos guardados.', 'ok'); await recargar(); }
  }

  async function cambiarPorcentajes() {
    const act = porcentajesDe(pcts, mes);
    const ok = await formModal({
      titulo: 'Cambiar porcentajes',
      aviso: 'El cambio vale desde el mes que elijas en adelante. Los meses anteriores no se modifican.',
      valores: { desde: mes, ...act },
      campos: [
        { name: 'desde', label: 'Vale desde el mes', type: 'month', required: true, full: true },
        { name: 'pastor', label: 'Pastor (%)', type: 'number', required: true },
        { name: 'distrito', label: 'Distrito (%)', type: 'number', required: true },
        { name: 'central', label: 'Central (%)', type: 'number', required: true },
      ],
      guardar: async (v) => {
        for (const k of ['pastor', 'distrito', 'central']) if (v[k] < 0 || v[k] > 100) throw new Error('Cada porcentaje tiene que estar entre 0 y 100.');
        if (v.pastor + v.distrito + v.central > 100) throw new Error('La suma de los tres porcentajes no puede superar 100.');
        const fila = { vigente_desde: `${v.desde}-01`, pastor: v.pastor, distrito: v.distrito, central: v.central };
        const existente = pcts.find((p) => String(p.vigente_desde).slice(0, 10) === fila.vigente_desde);
        if (existente) await q(sb.from('tesoreria_porcentajes').update(fila).eq('id', existente.id));
        else await q(sb.from('tesoreria_porcentajes').insert(fila));
      },
    });
    if (ok) { toast('Porcentajes guardados.', 'ok'); await recargar(); }
  }

  async function importar(archivo) {
    const out = document.getElementById('imp-res');
    try {
      const json = JSON.parse(await archivo.text());
      if (!Array.isArray(json.movimientos)) throw new Error('Este archivo no es una copia de Tesorería.');
      const { filas, notas } = mapearFirebase(json.movimientos);
      const ya = new Set(movs.map((m) => m.origen_id).filter(Boolean));
      const nuevas = filas.filter((f) => !ya.has(f.origen_id));
      out.innerHTML = `<div class="aviso info">Se encontraron <b>${filas.length}</b> movimientos; <b>${nuevas.length}</b> son nuevos${filas.length - nuevas.length ? ` (${filas.length - nuevas.length} ya estaban importados)` : ''}.
        ${notas.length ? `<ul style="margin:8px 0 0 18px">${notas.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}</div>
        ${nuevas.length ? `<button class="btn" id="imp-go">Importar ${nuevas.length} movimientos</button>` : ''}`;
      document.getElementById('imp-go')?.addEventListener('click', async (ev) => {
        ev.target.disabled = true; ev.target.textContent = 'Importando…';
        try {
          for (let i = 0; i < nuevas.length; i += 100) await q(sb.from('tesoreria_movimientos').insert(nuevas.slice(i, i + 100)));
          toast(`Se importaron ${nuevas.length} movimientos.`, 'ok');
          await recargar();
        } catch (e) { toast(errorAmigable(e), 'error'); ev.target.disabled = false; ev.target.textContent = 'Reintentar'; }
      });
    } catch (e) { out.innerHTML = `<div class="form-error">${esc(errorAmigable(e))}</div>`; }
  }

  function pintarConfig(box) {
    const f = datosFirmas();
    const hist = [...pcts].sort((a, b) => String(b.vigente_desde).localeCompare(String(a.vigente_desde)));
    box.innerHTML = `
      <div class="tarjeta"><div class="enc"><h2>Datos para la planilla</h2><button class="btn sec" id="c-datos">✏️ Editar</button></div>
        <div class="cuerpo"><div class="form-grid" style="font-size:14px">
          <div><span style="color:var(--texto-2)">Iglesia de:</span> <b>${esc(config?.nombre_planilla || 'Villa Jardín')}</b></div>
          <div><span style="color:var(--texto-2)">Distrito:</span> <b>${esc(config?.distrito || 'SUR')}</b></div>
          <div><span style="color:var(--texto-2)">Tesorero/a:</span> <b>${esc(f.tesorero || '—')}</b></div>
          <div><span style="color:var(--texto-2)">Pastor:</span> <b>${esc(f.pastor || '—')}</b></div>
          <div><span style="color:var(--texto-2)">Revisor/a de cuentas:</span> <b>${esc(f.revisor || '—')}</b></div>
          <div><span style="color:var(--texto-2)">Contacto:</span> <b>${esc([config?.tesorero_tel, config?.tesorero_email].filter(Boolean).join(' · ') || '—')}</b></div>
        </div></div></div>
      <div class="tarjeta mt"><div class="enc"><h2>Porcentajes de los ingresos de Culto General</h2><button class="btn sec" id="c-pct">Cambiar porcentajes</button></div>
        <div class="cuerpo sin-pad" id="c-hist"></div></div>
      ${esAdmin ? `<div class="tarjeta mt"><div class="enc"><h2>Importar del sistema anterior</h2></div><div class="cuerpo">
        <p style="margin:0 0 10px;color:var(--texto-2);font-size:14px">Elegí el archivo <b>tesoreria-movimientos.json</b> que bajaste del sistema anterior. Los movimientos que ya se importaron no se repiten.</p>
        <input type="file" id="imp-file" accept=".json,application/json"><div id="imp-res" style="margin-top:12px"></div></div></div>` : ''}`;
    box.querySelector('#c-hist').innerHTML = tablaHTML([
      { h: 'Vale desde', f: (p) => esc(String(p.vigente_desde).slice(0, 10) === '2000-01-01' ? 'El inicio' : nombreMes(mesDe(p.vigente_desde))) },
      { h: 'Pastor', f: (p) => `${Number(p.pastor)}%` }, { h: 'Distrito', f: (p) => `${Number(p.distrito)}%` }, { h: 'Central', f: (p) => `${Number(p.central)}%` },
    ], hist.length ? hist : [{ vigente_desde: '2000-01-01', ...PORC_DEFECTO }]);
    box.querySelector('#c-datos').onclick = editarConfig;
    box.querySelector('#c-pct').onclick = cambiarPorcentajes;
    box.querySelector('#imp-file')?.addEventListener('change', (e) => { if (e.target.files[0]) importar(e.target.files[0]); });
  }

  // ------------------------------------------------------------------ Armado
  function pintar() {
    if (cont.dataset.vista !== vista) return;
    const body = document.getElementById('t-cont');
    document.querySelectorAll('#t-tabs button').forEach((b) => b.classList.toggle('activo', b.dataset.t === tab));
    document.getElementById('t-mes').value = mes;
    document.getElementById('t-mesbar').hidden = tab === 'config';
    document.getElementById('t-acc').hidden = tab !== 'movimientos';
    if (tab === 'movimientos') pintarMovimientos(body);
    else if (tab === 'planilla') pintarPlanilla(body);
    else pintarConfig(body);
  }
  async function recargar() { await cargar(); pintar(); }

  try { await cargar(); } catch (e) {
    if (faltaMigracion(e)) { cont.innerHTML = encabezado('Tesorería') + AVISO_MIGRACION; return; }
    throw e;
  }
  if (cont.dataset.vista !== vista) return;

  cont.innerHTML = `
    ${encabezado('Tesorería', 'Libro de caja, aportes automáticos y planilla mensual de ACMA.',
      '<span id="t-acc" style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn verde" id="b-ing">+ Ingreso</button><button class="btn" id="b-egr">+ Egreso</button></span>')}
    <div class="tabs" id="t-tabs">
      <button data-t="movimientos">Movimientos</button><button data-t="planilla">Planilla ACMA</button><button data-t="config">Configuración</button>
    </div>
    <div id="t-mesbar" class="filtros" style="align-items:center">
      <button class="btn sec" id="t-prev" aria-label="Mes anterior">◀</button>
      <input type="month" id="t-mes" aria-label="Mes">
      <button class="btn sec" id="t-next" aria-label="Mes siguiente">▶</button>
    </div>
    <div id="t-cont"></div>`;
  document.querySelectorAll('#t-tabs button').forEach((b) => { b.onclick = () => { tab = b.dataset.t; pintar(); }; });
  document.getElementById('t-mes').onchange = (e) => { if (/^\d{4}-\d{2}$/.test(e.target.value)) { mes = e.target.value; pintar(); } };
  document.getElementById('t-prev').onclick = () => { mes = sumaMes(mes, -1); pintar(); };
  document.getElementById('t-next').onclick = () => { mes = sumaMes(mes, 1); pintar(); };
  document.getElementById('b-ing').onclick = () => formMovimiento('ingreso');
  document.getElementById('b-egr').onclick = () => formMovimiento('egreso');
  pintar();
  if (query?.nuevo === 'ingreso') formMovimiento('ingreso');
  if (query?.nuevo === 'egreso') formMovimiento('egreso');
}
