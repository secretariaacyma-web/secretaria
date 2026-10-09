// PDF genérico de listados y cuadros (A4, varias hojas, sin librerías). Repite el encabezado y los títulos de columnas en cada hoja.
import { ANCHOS, codificar, escapar } from './pdf-planilla.js';

const W = 595.28; const H = 841.89; const M = 40;
const n2 = (n) => String(Math.round(n * 100) / 100);
const ancho = (t, f, size) => {
  let w = 0;
  for (const ch of String(t ?? '').normalize('NFC')) { const c = ch.codePointAt(0); w += ANCHOS[f === 'B' ? 'B' : 'R'][(c >= 32 && c <= 255 ? c : 63) - 32] ?? 556; }
  return (w * size) / 1000;
};
function recortar(t, f, size, max) {
  let s = String(t ?? ''); if (ancho(s, f, size) <= max) return s;
  while (s.length > 1 && ancho(`${s}…`, f, size) > max) s = s.slice(0, -1);
  return `${s}…`;
}

/**
 * d: { iglesia, titulo, subtitulo, pie (texto chico al final),
 *      secciones: [{ titulo?, columnas: [{ h, w (puntos o 0 = el resto), align: 'l'|'r'|'c' }], filas: [[...]], total?: [...] }] }
 */
export function generarPDFListado(d) {
  const size = 9; const rh = 15; const topIni = 118; const yMax = H - M - 22;
  const hojas = [[]]; let y = topIni;
  const nueva = () => { hojas.push([]); y = topIni; };
  const poner = (item, alto) => { if (y + alto > yMax && hojas[hojas.length - 1].length) nueva(); hojas[hojas.length - 1].push({ ...item, y }); y += alto; };

  for (const sec of d.secciones) {
    const fijo = sec.columnas.reduce((a, c) => a + (c.w || 0), 0);
    const cols = []; let x = M;
    for (const c of sec.columnas) { const w = c.w || (W - 2 * M - fijo); cols.push({ ...c, x, w }); x += w; }
    const cab = () => poner({ t: 'cab', sec, cols }, rh + 2);
    if (sec.titulo) { if (y + 30 + rh * 3 > yMax) nueva(); poner({ t: 'tit', texto: sec.titulo }, 20); }
    cab();
    sec.filas.forEach((f, i) => {
      if (y + rh > yMax) { nueva(); cab(); }
      poner({ t: 'fila', cols, f, par: i % 2 === 1 }, rh);
    });
    if (sec.total) { if (y + rh > yMax) { nueva(); cab(); } poner({ t: 'tot', cols, f: sec.total }, rh); }
    y += 10;
  }

  const paginas = hojas.map((items, i) => {
    const ops = []; const Y = (t) => n2(H - t);
    const txt = (t, x, base, { f = 'R', s = size } = {}) => { if (t === '' || t == null) return; ops.push(`BT 0 0 0 rg /${f === 'B' ? 'F2' : 'F1'} ${s} Tf 1 0 0 1 ${n2(x)} ${Y(base)} Tm (${escapar(codificar(t))}) Tj ET`); };
    const linea = (x0, t0, x1, t1, g = 0.5) => ops.push(`0 0 0 RG ${g} w ${n2(x0)} ${Y(t0)} m ${n2(x1)} ${Y(t1)} l S`);
    txt(d.iglesia || '', M, M + 14, { f: 'B', s: 14 });
    txt('Alianza Cristiana y Misionera Argentina', M, M + 28, { s: 9 });
    txt(d.titulo, M, M + 44, { f: 'B', s: 11 });
    if (d.subtitulo) txt(d.subtitulo, M, M + 57, { s: 8.6 });
    const hoja = `Hoja ${i + 1} de ${hojas.length}`;
    txt(hoja, W - M - ancho(hoja, 'R', 9), M + 14, { s: 9 });
    linea(M, M + 64, W - M, M + 64, 1.2);

    const celda = (c, v, base, f) => {
      const s = recortar(v, f, size, c.w - 8);
      const w = ancho(s, f, size);
      const x = c.align === 'r' ? c.x + c.w - 4 - w : c.align === 'c' ? c.x + (c.w - w) / 2 : c.x + 4;
      txt(s, x, base, { f });
    };
    for (const it of items) {
      if (it.t === 'tit') { txt(it.texto, M, it.y + 13, { f: 'B', s: 10.5 }); continue; }
      const total = it.cols.reduce((a, c) => a + c.w, 0);
      if (it.t === 'cab') {
        ops.push(`0.9 0.9 0.9 rg ${n2(M)} ${Y(it.y + rh + 2)} ${n2(total)} ${rh + 2} re f`);
        it.cols.forEach((c) => celda(c, c.h, it.y + 11.5, 'B'));
        ops.push(`0 0 0 RG 0.6 w ${n2(M)} ${Y(it.y + rh + 2)} ${n2(total)} ${rh + 2} re S`);
        continue;
      }
      if (it.t === 'tot') ops.push(`0.94 0.94 0.94 rg ${n2(M)} ${Y(it.y + rh)} ${n2(total)} ${rh} re f`);
      else if (it.par) ops.push(`0.975 0.975 0.975 rg ${n2(M)} ${Y(it.y + rh)} ${n2(total)} ${rh} re f`);
      it.cols.forEach((c, k) => celda(c, it.f[k], it.y + 10.6, it.t === 'tot' ? 'B' : 'R'));
      linea(M, it.y + rh, M + total, it.y + rh, 0.3);
      linea(M, it.y, M, it.y + rh, 0.5); linea(M + total, it.y, M + total, it.y + rh, 0.5);
    }
    if (i === hojas.length - 1 && d.pie) txt(d.pie, M, H - M - 6, { s: 8 });
    return ops.join('\n');
  });

  const objs = []; const nP = paginas.length;
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objs[2] = `<< /Type /Pages /Kids [${paginas.map((_, i) => `${5 + i * 2} 0 R`).join(' ')}] /Count ${nP} >>`;
  objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objs[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  paginas.forEach((c, i) => {
    objs[5 + i * 2] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + i * 2} 0 R >>`;
    objs[6 + i * 2] = `<< /Length ${c.length} >>\nstream\n${c}\nendstream`;
  });
  const info = objs.length;
  objs[info] = `<< /Title (${escapar(codificar(d.titulo))}) /Creator (Secretaria) >>`;
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
