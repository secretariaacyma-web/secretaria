// PDF del libro de caja mensual (para imprimir y archivar en el libro). Sin librerías externas.
// Varias hojas A4: en CADA hoja se repiten el encabezado, los títulos de columnas y las firmas.

import { ANCHOS, codificar, escapar, fmtImporte } from './pdf-planilla.js';

const W = 595.28; const H = 841.89; const M = 40;
const n2 = (n) => String(Math.round(n * 100) / 100);
const ancho = (t, f, size) => {
  let w = 0;
  for (const ch of String(t ?? '').normalize('NFC')) { const c = ch.codePointAt(0); w += ANCHOS[f === 'B' ? 'B' : 'R'][(c >= 32 && c <= 255 ? c : 63) - 32] ?? 556; }
  return (w * size) / 1000;
};
// Parte un texto en renglones que entren en 'max' puntos (máximo 'lineas'; el resto se corta con "…").
function partir(t, f, size, max, lineas = 2) {
  const palabras = String(t ?? '').split(/\s+/).filter(Boolean); const out = []; let act = '';
  for (const p of palabras) {
    const prueba = act ? `${act} ${p}` : p;
    if (ancho(prueba, f, size) <= max) { act = prueba; continue; }
    if (act) out.push(act);
    act = p;
    while (ancho(act, f, size) > max) { let k = act.length - 1; while (k > 1 && ancho(`${act.slice(0, k)}-`, f, size) > max) k--; out.push(`${act.slice(0, k)}-`); act = act.slice(k); }
  }
  if (act) out.push(act);
  if (out.length > lineas) { let u = out[lineas - 1]; while (u.length > 1 && ancho(`${u}…`, f, size) > max) u = u.slice(0, -1); return [...out.slice(0, lineas - 1), `${u}…`]; }
  return out.length ? out : [''];
}

/**
 * d: { iglesia, distrito, mes (texto), saldoAnterior,
 *      filas: [{ fecha 'dd/mm/aaaa', detalle, ingreso, egreso, saldo }],
 *      totales: { ingresos, egresos, saldo },
 *      firmas: { tesorero, pastor, revisor } }
 */
export function generarPDFLibro(d) {
  const size = 8.6; const lh = 10.2; const pad = 4;
  const cols = [{ x: M, w: 56 }, { x: M + 56, w: 0 }, { w: 78 }, { w: 78 }, { w: 84 }];
  cols[2].x = W - M - 78 - 78 - 84; cols[3].x = cols[2].x + 78; cols[4].x = cols[3].x + 78;
  cols[1].w = cols[2].x - cols[1].x;
  const alturaPie = 100;       // espacio reservado para las firmas en cada hoja
  const yTopTabla = 112;       // altura (desde arriba) donde empieza la tabla
  const yMax = H - M - alturaPie;

  const filas = [{ tipo: 'sa', detalle: 'Saldo anterior (arrastre)', saldo: d.saldoAnterior }, ...d.filas];
  const total = { tipo: 'tot', detalle: 'TOTALES DEL MES (saldo en caja al cierre)', ingreso: d.totales.ingresos, egreso: d.totales.egresos, saldo: d.totales.saldo };
  const todas = [...filas, total];

  // Reparto en hojas.
  const hojas = [[]]; let y = yTopTabla + 17;
  for (const f of todas) {
    const lineas = partir(f.detalle, f.tipo === 'tot' ? 'B' : 'R', size, cols[1].w - 2 * pad, 2);
    const alto = Math.max(1, lineas.length) * lh + 5;
    if (y + alto > yMax && hojas[hojas.length - 1].length) { hojas.push([]); y = yTopTabla + 17; }
    hojas[hojas.length - 1].push({ ...f, lineas, alto }); y += alto;
  }

  const paginas = hojas.map((filasHoja, i) => {
    const ops = []; const Y = (t) => n2(H - t);
    const txt = (t, x, base, { f = 'R', s = size, ital = false } = {}) => { if (t === '' || t == null) return; ops.push(`BT 0 0 0 rg /${ital ? 'F3' : f === 'B' ? 'F2' : 'F1'} ${s} Tf 1 0 0 1 ${n2(x)} ${Y(base)} Tm (${escapar(codificar(t))}) Tj ET`); };
    const der = (t, xFin, base, f = 'R') => txt(t, xFin - pad - ancho(t, f, size), base, { f });
    const linea = (x0, t0, x1, t1, g = 0.5) => ops.push(`0 0 0 RG ${g} w ${n2(x0)} ${Y(t0)} m ${n2(x1)} ${Y(t1)} l S`);

    // Encabezado.
    txt(`${d.iglesia ? `Iglesia ${d.iglesia}` : ''}`, M, M + 14, { f: 'B', s: 14 });
    txt('Alianza Cristiana y Misionera Argentina', M, M + 28, { s: 9 });
    txt(`Libro de caja – Movimientos de ${d.mes}${d.distrito ? ` · Distrito ${d.distrito}` : ''}`, M, M + 44, { f: 'B', s: 10.5 });
    const hoja = `Hoja ${i + 1} de ${hojas.length}`;
    txt(hoja, W - M - ancho(hoja, 'R', 9), M + 14, { s: 9 });
    txt('Tesorería', W - M - ancho('Tesorería', 'R', 9), M + 28, { s: 9 });
    linea(M, M + 52, W - M, M + 52, 1.2);

    // Títulos de columnas.
    let top = yTopTabla;
    ops.push(`0.91 0.91 0.91 rg ${n2(M)} ${Y(top + 17)} ${n2(W - 2 * M)} 17 re f`);
    const tit = ['Fecha', 'Detalle', 'Ingresos $', 'Egresos $', 'Saldo $'];
    tit.forEach((t, k) => (k >= 2 ? der(t, cols[k].x + cols[k].w, top + 12, 'B') : txt(t, cols[k].x + pad, top + 12, { f: 'B' })));
    top += 17;
    const inicio = top;
    for (const f of filasHoja) {
      if (f.tipo === 'tot' || f.tipo === 'sa') ops.push(`${f.tipo === 'tot' ? '0.94 0.94 0.94' : '0.97 0.97 0.97'} rg ${n2(M)} ${Y(top + f.alto)} ${n2(W - 2 * M)} ${n2(f.alto)} re f`);
      const bold = f.tipo === 'tot' ? 'B' : 'R'; const base = top + 9.6;
      txt(f.fecha || '', cols[0].x + pad, base);
      f.lineas.forEach((l, k) => txt(l, cols[1].x + pad, base + k * lh, { f: bold, ital: f.tipo === 'sa' }));
      if (f.ingreso) der(fmtImporte(f.ingreso), cols[2].x + cols[2].w, base, bold);
      if (f.egreso) der(fmtImporte(f.egreso), cols[3].x + cols[3].w, base, bold);
      if (f.saldo !== undefined) der(fmtImporte(f.saldo), cols[4].x + cols[4].w, base, bold);
      top += f.alto;
      linea(M, top, W - M, top, 0.3);
    }
    // Bordes de la tabla.
    ops.push(`0 0 0 RG 0.6 w ${n2(M)} ${Y(yTopTabla + 17 + (top - inicio))} ${n2(W - 2 * M)} ${n2(top - yTopTabla)} re S`);
    for (const k of [1, 2, 3, 4]) linea(cols[k].x, yTopTabla, cols[k].x, top, 0.4);

    // Firmas (en todas las hojas).
    const fy = H - M - 38; const f = d.firmas || {}; const ancc = (W - 2 * M - 2 * 24) / 3;
    [[f.tesorero, 'Tesorero/a'], [f.pastor, 'Pastor'], [f.revisor, 'Revisor/a de cuentas']].forEach(([nom, cargo], k) => {
      const x0 = M + k * (ancc + 24); const x1 = x0 + ancc;
      linea(x0, fy, x1, fy, 0.6);
      const c = (t, fo, s, base, it) => { if (!t) return; let sz = s; while (ancho(t, fo, sz) > ancc && sz > 5) sz -= 0.3; txt(t, x0 + (ancc - ancho(t, fo, sz)) / 2, base, { f: fo, s: sz, ital: it }); };
      c(nom, 'B', 9, fy + 11, false); c(cargo, 'R', 8.2, fy + 21, true);
    });
    return ops.join('\n');
  });

  // Armado del archivo PDF.
  const objs = [];
  const nP = paginas.length;
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objs[2] = `<< /Type /Pages /Kids [${paginas.map((_, i) => `${6 + i * 2} 0 R`).join(' ')}] /Count ${nP} >>`;
  objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objs[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  objs[5] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>';
  paginas.forEach((c, i) => {
    objs[6 + i * 2] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${7 + i * 2} 0 R >>`;
    objs[7 + i * 2] = `<< /Length ${c.length} >>\nstream\n${c}\nendstream`;
  });
  const info = objs.length;
  objs[info] = `<< /Title (${escapar(codificar(`Libro de caja ${d.mes}`))}) /Creator (Secretaria) >>`;
  let out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'; const off = [];
  for (let k = 1; k < objs.length; k++) { off[k] = out.length; out += `${k} 0 obj\n${objs[k]}\nendobj\n`; }
  const xr = out.length;
  out += `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
  for (let k = 1; k < objs.length; k++) out += `${String(off[k]).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length} /Root 1 0 R /Info ${info} 0 R >>\nstartxref\n${xr}\n%%EOF`;
  const bytes = new Uint8Array(out.length);
  for (let k = 0; k < out.length; k++) bytes[k] = out.charCodeAt(k) & 0xff;
  return new Blob([bytes], { type: 'application/pdf' });
}
