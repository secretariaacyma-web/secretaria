// PDF de la planilla oficial ACMA "Movimiento financiero mensual": réplica de la planilla original
// con los importes completados automáticamente. Sin librerías externas.
// El tipo de letra original (Arial Narrow) se imita con Helvetica comprimida al 80 %.

import { PLANILLA, LOGO_ACMA } from './planilla-acma-layout.js';

// Anchos de letra (por 1000) de Helvetica, códigos 32..255 (WinAnsi).
const ANCHOS = { R: [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584, 761, 556, 556, 222, 556, 333, 1000, 556, 556, 333, 1000, 667, 333, 1000, 556, 611, 556, 556, 222, 222, 333, 333, 350, 556, 1000, 333, 1000, 500, 333, 944, 556, 500, 667, 278, 333, 556, 556, 556, 556, 260, 556, 333, 737, 370, 556, 584, 333, 737, 333, 400, 584, 333, 333, 333, 556, 537, 278, 333, 333, 365, 556, 834, 834, 834, 611, 667, 667, 667, 667, 667, 667, 1000, 722, 667, 667, 667, 667, 278, 278, 278, 278, 722, 722, 778, 778, 778, 778, 778, 584, 778, 722, 722, 722, 722, 667, 667, 611, 556, 556, 556, 556, 556, 556, 889, 500, 556, 556, 556, 556, 278, 278, 278, 278, 556, 556, 556, 556, 556, 556, 556, 584, 611, 556, 556, 556, 556, 500, 556, 500], B: [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584, 761, 556, 611, 278, 556, 500, 1000, 556, 556, 333, 1000, 667, 333, 1000, 611, 611, 611, 611, 278, 278, 500, 500, 350, 556, 1000, 333, 1000, 556, 333, 944, 611, 500, 667, 278, 333, 556, 556, 556, 556, 280, 556, 333, 737, 370, 556, 584, 333, 737, 333, 400, 584, 333, 333, 333, 611, 556, 278, 333, 333, 365, 556, 834, 834, 834, 611, 722, 722, 722, 722, 722, 722, 1000, 722, 667, 667, 667, 667, 278, 278, 278, 278, 722, 722, 778, 778, 778, 778, 778, 584, 778, 722, 722, 722, 722, 667, 667, 611, 556, 556, 556, 556, 556, 556, 889, 556, 556, 556, 556, 556, 278, 278, 278, 278, 611, 611, 611, 611, 611, 611, 611, 584, 611, 611, 611, 611, 611, 556, 611, 556] };
const ESTRECHO = 0.80;
const H = PLANILLA.alto;

const EXTRA = { '€': 0x80, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97 };
function codigo(ch) {
  const c = ch.codePointAt(0);
  if (c >= 32 && c <= 126) return c;
  if (c >= 160 && c <= 255) return c;
  if (EXTRA[ch] !== undefined) return EXTRA[ch];
  return 63;
}
const codificar = (t) => {
  let s = '';
  for (const ch of String(t ?? '').normalize('NFC')) if (ch !== '\n' && ch !== '\r') s += String.fromCharCode(codigo(ch));
  return s;
};
const escapar = (s) => s.replace(/[\\()]/g, (m) => '\\' + m);
const n2 = (n) => String(Math.round(n * 100) / 100);

// Ancho en puntos de un texto con la fuente f ('R'|'B'), tamaño y compresión horizontal.
function ancho(texto, f, size, tz = ESTRECHO) {
  if (f === 'I') f = 'R';
  let w = 0;
  for (const ch of String(texto ?? '').normalize('NFC')) w += ANCHOS[f][codigo(ch) - 32] ?? 556;
  return (w * size * tz) / 1000;
}

export { ANCHOS, codificar, escapar };

export function fmtImporte(n) {
  const v = Math.round(Number(n || 0) * 100) / 100;
  return v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const hex = (c) => `${c[0]} ${c[1]} ${c[2]}`;

/**
 * d: { iglesia, mes, distrito,
 *      valores: { A..H, rubros:[10], tcomp, cant, I, II, III, IV, V },
 *      remito: { fecha, efectivo, deposito, depositoFecha, cheque, chequeBanco, chequeNro, giro, giroNro, giroFecha, total },
 *      firmas: { tesorero, tesoreroTel, tesoreroEmail, pastor, revisor } }
 */
export function generarPDFPlanilla(d) {
  const P = PLANILLA;
  const ops = [];
  const y = (top) => n2(H - top);
  const texto = (t, x, baseTop, { f = 'R', size = 8, tz = ESTRECHO, color = '0 0 0' } = {}) => {
    if (t === '' || t == null) return;
    ops.push(`BT ${color} rg /${f === 'B' ? 'F2' : f === 'I' ? 'F3' : 'F1'} ${size} Tf ${Math.round(tz * 100)} Tz 1 0 0 1 ${n2(x)} ${y(baseTop)} Tm (${escapar(codificar(t))}) Tj ET`);
  };

  // 1) Fondos y bordes de la planilla original.
  for (const [x0, t, x1, b, c] of P.rects) ops.push(`${hex(P.palette[c])} rg ${n2(x0)} ${y(b)} ${n2(x1 - x0)} ${n2(b - t)} re f`);
  const [[ax, ay], [bx, by], [cx, cy]] = P.arrow;
  ops.push(`0 0 0 rg ${n2(ax)} ${y(ay)} m ${n2(bx)} ${y(by)} l ${n2(cx)} ${y(cy)} l f`);
  ops.push(`q ${n2(P.logo.w)} 0 0 ${n2(P.logo.h)} ${n2(P.logo.x)} ${y(P.logo.top + P.logo.h)} cm /Im1 Do Q`);

  // 2) Textos fijos.
  for (const [x, base, size, bold, col, t] of P.words) if (!(base > 565 && base < 620)) texto(t, x, base, { f: bold ? 'B' : 'R', size, color: hex(P.palette[col]) });

  // 3) Importes y datos.
  const celda = (k) => P.celdas[k];
  const importe = (k, v, { ceroComo = '', signo = false, negrita = false, size = 8.4 } = {}) => {
    const [x0, t, x1, b] = celda(k);
    const base = t + (b - t) / 2 + size * 0.34;
    if (signo) texto('$', x0 + 3.5, base, { f: 'B', size, tz: 1 });
    const num = Number(v || 0);
    const s = num === 0 ? ceroComo : fmtImporte(num);
    if (s === '') return;
    const f = negrita ? 'B' : 'R';
    let tz = ESTRECHO; let w = ancho(s, f, size, tz);
    const libre = (x1 - x0) - (signo ? 14 : 9);
    if (w > libre) { tz = Math.max(0.5, (ESTRECHO * libre) / w); w = ancho(s, f, size, tz); }
    texto(s, x1 - 4.5 - w, base, { f, size, tz });
  };
  const entero = (k, v) => {
    if (!v) return;
    const [, t, x1, b] = celda(k); const s = String(v); const size = 8.4;
    texto(s, x1 - 4.5 - ancho(s, 'R', size), t + (b - t) / 2 + size * 0.34, { size });
  };
  const rotulo = (k, s) => {
    if (!s) return;
    const [x0, t, x1, b] = celda(k); const size = 9;
    let tz = ESTRECHO; const w = ancho(s, 'B', size, tz); const libre = x1 - x0 - 8;
    if (w > libre) tz = Math.max(0.5, (ESTRECHO * libre) / w);
    texto(s, x0 + 4, t + (b - t) / 2 + size * 0.34, { f: 'B', size, tz });
  };

  rotulo('iglesia', d.iglesia); rotulo('mes', d.mes); rotulo('distrito', d.distrito);
  const v = d.valores || {};
  importe('A', v.A, { ceroComo: '-' }); importe('B', v.B, { ceroComo: '-' }); importe('C', v.C, { ceroComo: '-' });
  importe('D', v.D, { ceroComo: '-', signo: true, negrita: true, size: 9 });
  importe('E', v.E, { ceroComo: '-' }); importe('F', v.F, { ceroComo: '-' }); importe('G', v.G, { ceroComo: '-' });
  importe('H', v.H, { ceroComo: '-', signo: true, negrita: true, size: 9 });
  for (let i = 1; i <= 10; i++) importe('r' + i, v.rubros?.[i - 1]);
  importe('tcomp', v.tcomp, { ceroComo: '-', signo: true, negrita: true, size: 9 });
  entero('cant', v.cant);
  importe('I', v.I); importe('II', v.II); importe('III', v.III);
  importe('IV', v.IV, { ceroComo: '-', signo: true, negrita: true, size: 9 });
  importe('V', v.V, { ceroComo: '-', signo: true, negrita: true, size: 9.5 });

  // Envío de valores: fechas y detalle.
  const r = d.remito || {};
  const A = P.anclas;
  const fecha = (ancla, iso, size) => {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return;
    const [yy, mm, dd] = iso.split('-');
    texto(dd, ancla.s1 - 2 - ancho(dd, 'R', size), ancla.base - 0.5, { size });
    texto(mm, (ancla.s1 + ancla.s2) / 2 + 0.6 - ancho(mm, 'R', size) / 2, ancla.base - 0.5, { size });
    texto(yy, ancla.s2 + 3, ancla.base - 0.5, { size });
  };
  fecha(A.remFecha, r.fecha, 7);
  importe('a', r.efectivo); importe('b', r.deposito); importe('c', r.cheque); importe('d', r.giro);
  fecha(A.depFecha, r.depositoFecha, 6.6);
  const libre = (ancla, s) => {
    if (!s) return;
    let tz = ESTRECHO; const w = ancho(s, 'R', ancla.sz, tz); const L = ancla.x1 - ancla.x0;
    if (w > L) tz = Math.max(0.5, (ESTRECHO * L) / w);
    texto(s, ancla.x0, ancla.base - 0.5, { size: ancla.sz, tz });
  };
  libre(A.chequeBanco, r.chequeBanco); libre(A.chequeNro, r.chequeNro); libre(A.giroNro, r.giroNro);
  fecha(A.giroFecha, r.giroFecha, 6.6);
  importe('rem', r.total, { ceroComo: '-', signo: true, negrita: true, size: 9 });

  // Firmas y datos de contacto.
  const f = d.firmas || {};
  const tras = (fijo, x, size) => x + ancho(fijo, 'R', size);
  // Firmas: línea, nombre en negrita y cargo en cursiva (tres columnas).
  const firma = (x0, x1, nombre, cargo) => {
    ops.push(`0 0 0 RG 0.6 w ${n2(x0)} ${y(596)} m ${n2(x1)} ${y(596)} l S`);
    const c = (t, f, size, base) => {
      if (!t) return;
      const L = x1 - x0; let tz = 1; const w = ancho(t, f, size, 1);
      if (w > L) tz = L / w;
      texto(t, x0 + (L - w * tz) / 2, base, { f, size, tz });
    };
    c(nombre, 'B', 8.2, 606.5); c(cargo, 'I', 7.6, 616);
  };
  firma(92.38, 209, f.tesorero, 'Tesorero/a');
  firma(227, 344, f.pastor, 'Pastor');
  firma(362, 479.25, f.revisor, 'Revisor/a de cuentas');
  texto(f.tesoreroTel, tras('Te:', 92.38, 6.82) + 2, 635.6, { size: 7 });
  texto(f.tesoreroEmail, tras('E-mail:', 166.77, 6.82) + 2, 635.6, { size: 7 });
  // Armado del archivo PDF.
  const flujo = ops.join('\n');
  const jpg = atob(LOGO_ACMA);
  const objs = [];
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objs[2] = '<< /Type /Pages /Kids [3 0 R] /Count 1 >>';
  objs[3] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /Font << /F1 5 0 R /F2 6 0 R /F3 9 0 R >> /XObject << /Im1 7 0 R >> >> /Contents 4 0 R >>';
  objs[4] = `<< /Length ${flujo.length} >>\nstream\n${flujo}\nendstream`;
  objs[5] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objs[6] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  objs[7] = `<< /Type /XObject /Subtype /Image /Width ${P.logo.px[0]} /Height ${P.logo.px[1]} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n${jpg}\nendstream`;
  const d0 = new Date(); const p2 = (n) => String(n).padStart(2, '0');
  const fechaPdf = `D:${d0.getFullYear()}${p2(d0.getMonth() + 1)}${p2(d0.getDate())}${p2(d0.getHours())}${p2(d0.getMinutes())}${p2(d0.getSeconds())}`;
  objs[9] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>';
  objs[8] = `<< /Title (${escapar(codificar('Planilla ACMA ' + (d.mes || '')))}) /Author (${escapar(codificar(d.iglesia || 'Tesorería'))}) /Creator (Secretaria) /CreationDate (${fechaPdf}) >>`;
  let out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const off = [];
  for (let k = 1; k < objs.length; k++) { off[k] = out.length; out += `${k} 0 obj\n${objs[k]}\nendobj\n`; }
  const xr = out.length;
  out += `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
  for (let k = 1; k < objs.length; k++) out += `${String(off[k]).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length} /Root 1 0 R /Info 8 0 R >>\nstartxref\n${xr}\n%%EOF`;
  const bytes = new Uint8Array(out.length);
  for (let k = 0; k < out.length; k++) bytes[k] = out.charCodeAt(k) & 0xff;
  return new Blob([bytes], { type: 'application/pdf' });
}
