// Tesorería: cálculos del libro de caja y de la planilla mensual ACMA (sin pantalla, fáciles de probar).
//
// Reglas:
//  * De cada ingreso de "Culto General" se calculan: aporte al pastor (se paga como egreso del rubro 8),
//    aporte al distrito y aporte a la central. Los porcentajes dependen del mes (ver porcentajesDe).
//  * Un ingreso marcado "sin aporte al pastor" no genera el aporte del pastor (los otros dos sí).
//  * Los movimientos anulados no cuentan.
//  * Saldo final = saldo anterior + ingresos - (egresos + aportes pastor/distrito/central + F + G adicionales).

export const RUBROS = [
  'Servicios', 'Impuestos', 'Gastos de mantenimiento', 'Construcción y refacción', 'Compra de bienes',
  'Gastos administrativos', 'Honorarios', 'Servicios pastorales', 'Pago de alquileres', 'Otros egresos',
];
export const CATEGORIAS_INGRESO = { culto_general: 'Culto General', otros: 'Otros ingresos' };
export const PORC_DEFECTO = { pastor: 40, distrito: 2, central: 10 };
export const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export const r2 = (n) => Math.round((Number(n || 0) + Number.EPSILON) * 100) / 100;
export const mesDe = (fecha) => String(fecha).slice(0, 7);
export const nombreMes = (mes) => `${MESES[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}`;

// Porcentajes vigentes en un mes ('YYYY-MM'): el último registro cuya vigencia es anterior o igual.
export function porcentajesDe(lista, mes) {
  const tope = `${mes}-01`;
  const v = (lista || []).filter((p) => String(p.vigente_desde).slice(0, 10) <= tope)
    .sort((a, b) => String(a.vigente_desde).localeCompare(String(b.vigente_desde))).pop();
  return v ? { pastor: Number(v.pastor), distrito: Number(v.distrito), central: Number(v.central) } : { ...PORC_DEFECTO };
}

// Cifras de un solo mes. items: movimientos del mes (sin anulados). plan: datos manuales de la planilla (o null).
export function cifrasMes(items, pc, plan) {
  let ingresos = 0; let baseCulto = 0; let basePastor = 0;
  const rubros = new Array(10).fill(0); let cant = 0;
  for (const m of items) {
    const monto = Number(m.monto);
    if (m.tipo === 'ingreso') {
      ingresos += monto;
      if (m.categoria === 'culto_general') { baseCulto += monto; if (!m.sin_pastor) basePastor += monto; }
    } else {
      rubros[m.rubro - 1] += monto; cant += 1;
    }
  }
  const pastor = r2(basePastor * pc.pastor / 100);
  const distrito = r2(baseCulto * pc.distrito / 100);
  const central = r2(baseCulto * pc.central / 100);
  const F = r2(plan?.f_ministerios); const Gextra = r2(plan?.g_otros);
  const egresos = r2(rubros.reduce((a, b) => a + b, 0));
  return { ingresos: r2(ingresos), rubros: rubros.map(r2), cant, egresos, pastor, distrito, central, F, Gextra,
    neto: r2(ingresos - egresos - pastor - distrito - central - F - Gextra) };
}

/**
 * Resumen de un mes con la estructura de la planilla ACMA.
 * movs: todos los movimientos; pcts: lista de porcentajes; planillas: lista de tesoreria_planillas; mes: 'YYYY-MM'.
 */
export function resumenMes(movs, pcts, planillas, mes) {
  const vivos = (movs || []).filter((m) => !m.anulado);
  const porMes = new Map();
  for (const m of vivos) { const k = mesDe(m.fecha); if (!porMes.has(k)) porMes.set(k, []); porMes.get(k).push(m); }
  const planDe = (k) => (planillas || []).find((p) => mesDe(p.mes) === k) || null;
  const meses = new Set([...porMes.keys(), ...(planillas || []).map((p) => mesDe(p.mes))]);
  let anterior = 0;
  for (const k of [...meses].sort()) {
    if (k >= mes) break;
    anterior += cifrasMes(porMes.get(k) || [], porcentajesDe(pcts, k), planDe(k)).neto;
  }
  anterior = r2(anterior);
  const plan = planDe(mes);
  const pc = porcentajesDe(pcts, mes);
  const c = cifrasMes(porMes.get(mes) || [], pc, plan);

  const A = anterior; const B = c.ingresos;
  const C = r2(c.egresos + c.pastor + c.distrito + c.central + c.F + c.Gextra);
  const D = r2(A + B - C);
  const E = c.central; const F = c.F; const G = r2(c.distrito + c.Gextra); const Hh = r2(E + F + G);
  const rubrosPlanilla = c.rubros.slice(); rubrosPlanilla[7] = r2(rubrosPlanilla[7] + c.pastor);
  const tcomp = r2(rubrosPlanilla.reduce((a, b) => a + b, 0));
  const I = r2(plan?.ret_jubilados); const II = r2(plan?.ret_alquileres); const III = r2(plan?.ret_otros);
  const IV = r2(I + II + III); const V = r2(Hh - IV);
  const efectivo = r2(plan?.rem_efectivo); const deposito = r2(plan?.rem_deposito); const cheque = r2(plan?.rem_cheque); const giro = r2(plan?.rem_giro);
  return {
    mes, pc, plan, ...c,
    A, B, C, D, E, F, G, H: Hh, rubrosPlanilla, tcomp, cant: c.cant, I, II, III, IV, V,
    remitido: r2(efectivo + deposito + cheque + giro), efectivo, deposito, cheque, giro,
    pagarAportes: r2(c.pastor + c.distrito + c.central),
  };
}

// Aportes calculados de un ingreso suelto (para mostrarlos en la lista).
export function aportesDe(m, pc) {
  if (m.tipo !== 'ingreso' || m.categoria !== 'culto_general') return null;
  const monto = Number(m.monto);
  return { pastor: m.sin_pastor ? 0 : r2(monto * pc.pastor / 100), distrito: r2(monto * pc.distrito / 100), central: r2(monto * pc.central / 100) };
}

// ---------------------------------------------------------------------------
// Importación desde el sistema anterior (Firebase): categorías viejas → rubros y reglas nuevas.
// Devuelve { filas, notas }. Cada fila lista para insertar en tesoreria_movimientos.
export function mapearFirebase(movimientos) {
  const filas = []; const notas = [];
  for (const x of movimientos || []) {
    const monto = Number(x.monto);
    const desc = String(x.descripcion || '').trim();
    if (!x.fecha || !(monto > 0) || !['ingreso', 'egreso'].includes(x.tipo)) { notas.push(`Se omitió un movimiento sin fecha, tipo o monto válido (${x.id || '?'}).`); continue; }
    const base = { fecha: x.fecha, tipo: x.tipo, descripcion: desc || null, monto, origen_id: x.id, anulado: false, sin_pastor: false };
    if (x.tipo === 'ingreso') {
      if (x.categoria === 'Culto General') {
        filas.push({ ...base, categoria: 'culto_general', rubro: null, sin_pastor: /^no\s*pastor/i.test(desc) });
        if (/^no\s*pastor/i.test(desc)) notas.push(`${x.fecha}: "${desc}" ($ ${monto}) se importó como culto "sin aporte al pastor".`);
      } else if (/^\+\s*pastor/i.test(desc)) {
        filas.push({ ...base, categoria: 'otros', rubro: null, anulado: true, motivo_anulacion: 'Ya no hace falta: el ingreso de culto del mismo día se marca "sin aporte al pastor".' });
        notas.push(`${x.fecha}: el ingreso "${desc}" ($ ${monto}) quedó anulado porque compensaba el 40% del pastor.`);
      } else filas.push({ ...base, categoria: 'otros', rubro: null });
    } else {
      let rubro = 10;
      if (x.categoria === 'Servicios') rubro = 1;
      else if (x.categoria === 'Mantenimiento') rubro = 3;
      else if (/pilas/i.test(desc)) rubro = 5;
      else if (/pastor/i.test(desc)) rubro = 8;
      if (x.categoria === 'Culto General' && /^distrito$/i.test(desc)) {
        filas.push({ ...base, categoria: null, rubro: 10, anulado: true, motivo_anulacion: 'Duplicaba el 2% del distrito, que el sistema calcula solo.' });
        notas.push(`${x.fecha}: el egreso "Distrito" ($ ${monto}) quedó anulado porque duplicaba el 2% automático.`);
      } else filas.push({ ...base, categoria: null, rubro });
    }
  }
  return { filas, notas };
}
