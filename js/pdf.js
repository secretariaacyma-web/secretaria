// Generador de PDF sin librerías externas: texto, líneas y paginación automática.
// Usa las fuentes estándar Times (vienen incluidas en cualquier lector de PDF),
// así que el archivo es liviano y el texto se puede seleccionar y buscar.

import { CONFIG } from './config.js';
import { LOGO } from './logo.js';

const A4 = [595.28, 841.89];
const MARGEN_X = 62;      // ~2,2 cm
const MARGEN_SUP = 64;
const MARGEN_INF = 70;
const ANCHO_UTIL = A4[0] - MARGEN_X * 2;

// Anchos de letra (por 1000) de las fuentes Times, para los códigos 32..255 (WinAnsi).
const ANCHOS = { R: [250, 333, 408, 500, 500, 833, 778, 180, 333, 333, 500, 564, 250, 333, 250, 278, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 278, 278, 564, 564, 564, 444, 921, 722, 667, 667, 722, 611, 556, 722, 722, 333, 389, 722, 611, 889, 722, 722, 556, 722, 667, 556, 611, 722, 722, 944, 722, 722, 611, 333, 278, 333, 469, 500, 333, 444, 500, 444, 500, 444, 333, 500, 500, 278, 278, 500, 278, 778, 500, 500, 500, 500, 333, 389, 278, 500, 500, 722, 500, 500, 444, 480, 200, 480, 541, 761, 500, 500, 333, 500, 444, 1000, 500, 500, 333, 1000, 556, 333, 889, 500, 611, 500, 500, 333, 333, 444, 444, 350, 500, 1000, 333, 980, 389, 333, 722, 500, 444, 722, 250, 333, 500, 500, 500, 500, 200, 500, 333, 760, 276, 500, 564, 333, 760, 333, 400, 564, 300, 300, 333, 500, 453, 250, 333, 300, 310, 500, 750, 750, 750, 444, 722, 722, 722, 722, 722, 722, 889, 667, 611, 611, 611, 611, 333, 333, 333, 333, 722, 722, 722, 722, 722, 722, 722, 564, 722, 722, 722, 722, 722, 722, 556, 500, 444, 444, 444, 444, 444, 444, 667, 444, 444, 444, 444, 444, 278, 278, 278, 278, 500, 500, 500, 500, 500, 500, 500, 564, 500, 500, 500, 500, 500, 500, 500, 500], B: [250, 333, 555, 500, 500, 1000, 833, 278, 333, 333, 500, 570, 250, 333, 250, 278, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 333, 333, 570, 570, 570, 500, 930, 722, 667, 722, 722, 667, 611, 778, 778, 389, 500, 778, 667, 944, 722, 778, 611, 778, 722, 556, 667, 722, 722, 1000, 722, 722, 667, 333, 278, 333, 581, 500, 333, 500, 556, 444, 556, 444, 333, 500, 556, 278, 333, 556, 278, 833, 556, 500, 556, 556, 444, 389, 333, 556, 500, 722, 500, 500, 444, 394, 220, 394, 520, 761, 500, 500, 333, 500, 500, 1000, 500, 500, 333, 1000, 556, 333, 1000, 500, 667, 500, 500, 333, 333, 500, 500, 350, 500, 1000, 333, 1000, 389, 333, 722, 500, 444, 722, 250, 333, 500, 500, 500, 500, 220, 500, 333, 747, 300, 500, 570, 333, 747, 333, 400, 570, 300, 300, 333, 556, 540, 250, 333, 300, 330, 500, 750, 750, 750, 500, 722, 722, 722, 722, 722, 722, 1000, 722, 667, 667, 667, 667, 389, 389, 389, 389, 722, 722, 778, 778, 778, 778, 778, 570, 778, 722, 722, 722, 722, 722, 611, 556, 500, 500, 500, 500, 500, 500, 722, 444, 444, 444, 444, 444, 278, 278, 278, 278, 500, 556, 500, 500, 500, 500, 500, 570, 500, 556, 556, 556, 556, 500, 556, 500], I: [250, 333, 420, 500, 500, 833, 778, 214, 333, 333, 500, 675, 250, 333, 250, 278, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 333, 333, 675, 675, 675, 500, 920, 611, 611, 667, 722, 611, 611, 722, 722, 333, 444, 667, 556, 833, 667, 722, 611, 722, 611, 500, 556, 722, 611, 833, 611, 556, 556, 389, 278, 389, 422, 500, 333, 500, 500, 444, 500, 444, 278, 500, 500, 278, 278, 444, 278, 722, 500, 500, 500, 500, 389, 389, 278, 500, 444, 667, 444, 444, 389, 400, 275, 400, 541, 761, 500, 500, 333, 500, 556, 889, 500, 500, 333, 1000, 500, 333, 944, 500, 556, 500, 500, 333, 333, 556, 556, 350, 500, 889, 333, 980, 389, 333, 667, 500, 389, 556, 250, 389, 500, 500, 500, 500, 275, 500, 333, 760, 276, 500, 675, 333, 760, 333, 400, 675, 300, 300, 333, 500, 523, 250, 333, 300, 310, 500, 750, 750, 750, 500, 611, 611, 611, 611, 611, 611, 889, 667, 611, 611, 611, 611, 333, 333, 333, 333, 722, 667, 722, 722, 722, 722, 722, 675, 722, 722, 722, 722, 722, 556, 611, 500, 500, 500, 500, 500, 500, 500, 667, 444, 444, 444, 444, 444, 278, 278, 278, 278, 500, 500, 500, 500, 500, 500, 500, 675, 500, 500, 500, 500, 500, 444, 500, 444] };
const FUENTE = { R: 'F1', B: 'F2', I: 'F3' };

const EXTRA_CP1252 = {
  '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89,
  'Š': 0x8a, '‹': 0x8b, 'Œ': 0x8c, 'Ž': 0x8e, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95,
  '–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99, 'š': 0x9a, '›': 0x9b, 'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f,
};

function codigo(ch) {
  const c = ch.codePointAt(0);
  if (c >= 32 && c <= 126) return c;
  if (c >= 160 && c <= 255) return c;
  if (EXTRA_CP1252[ch] !== undefined) return EXTRA_CP1252[ch];
  if (ch === '\t') return 32;
  return 63; // "?"
}

// Texto → cadena de bytes (WinAnsi) lista para escribir dentro del PDF.
function codificar(texto) {
  let s = '';
  for (const ch of String(texto ?? '')) {
    if (ch === '\n' || ch === '\r') continue;
    s += String.fromCharCode(codigo(ch));
  }
  return s;
}
const escapar = (bytes) => bytes.replace(/[\\()]/g, (m) => '\\' + m);

function ancho(texto, f, size) {
  let w = 0;
  for (const ch of String(texto ?? '')) w += ANCHOS[f][codigo(ch) - 32] ?? 500;
  return (w * size) / 1000;
}

// Parte el texto en líneas que entran en "maxW". Respeta los saltos de línea.
function envolver(texto, f, size, maxW) {
  const lineas = [];
  for (const parrafo of String(texto ?? '').replace(/\r/g, '').split('\n')) {
    if (!parrafo.trim()) { lineas.push(''); continue; }
    let actual = '';
    for (const palabra of parrafo.split(/\s+/).filter(Boolean)) {
      let p = palabra;
      while (ancho(p, f, size) > maxW) { // palabra más larga que la línea: se corta
        let n = p.length;
        while (n > 1 && ancho(p.slice(0, n), f, size) > maxW) n--;
        if (actual) { lineas.push(actual); actual = ''; }
        lineas.push(p.slice(0, n));
        p = p.slice(n);
      }
      const prueba = actual ? `${actual} ${p}` : p;
      if (ancho(prueba, f, size) <= maxW) actual = prueba;
      else { lineas.push(actual); actual = p; }
    }
    if (actual) lineas.push(actual);
  }
  return lineas;
}

const num = (n) => n.toFixed(2);

class Documento {
  constructor() {
    this.paginas = [[]];
    this.y = MARGEN_SUP; // distancia desde el borde superior
  }
  get ops() { return this.paginas[this.paginas.length - 1]; }
  nuevaPagina() { this.paginas.push([]); this.y = MARGEN_SUP; }
  asegurar(alto) { if (this.y + alto > A4[1] - MARGEN_INF) this.nuevaPagina(); }
  espacio(n) { this.y += n; }

  linea(x1, x2, grosor = 0.6, gris = 0.3) {
    const y = A4[1] - this.y;
    this.ops.push(`${gris} G ${grosor} w ${num(x1)} ${num(y)} m ${num(x2)} ${num(y)} l S`);
  }

  // Dibuja una línea de texto con su base en la posición actual y baja el cursor.
  textoLinea(texto, x, f, size, gris = 0) {
    const base = A4[1] - (this.y + size);
    if (texto) this.ops.push(`BT ${gris} g /${FUENTE[f]} ${size} Tf 1 0 0 1 ${num(x)} ${num(base)} Tm (${escapar(codificar(texto))}) Tj ET`);
    this.y += size * 1.4;
  }

  parrafo(texto, { f = 'R', size = 11, align = 'left', despues = 6, x0 = MARGEN_X, w = ANCHO_UTIL, gris = 0 } = {}) {
    const lineas = envolver(texto, f, size, w);
    for (const l of lineas) {
      this.asegurar(size * 1.4);
      let x = x0;
      if (align === 'center') x = x0 + (w - ancho(l, f, size)) / 2;
      else if (align === 'right') x = x0 + w - ancho(l, f, size);
      this.textoLinea(l, x, f, size, gris);
      if (!l) this.y -= size * 0.7; // línea en blanco más corta
    }
    this.y += despues;
  }

  lista(items, { size = 11 } = {}) {
    for (const item of items) {
      const lineas = envolver(item, 'R', size, ANCHO_UTIL - 20);
      lineas.forEach((l, i) => {
        this.asegurar(size * 1.4);
        if (i === 0) this.ops.push(`BT 0 g /F1 ${size} Tf 1 0 0 1 ${num(MARGEN_X + 6)} ${num(A4[1] - (this.y + size))} Tm (${escapar(codificar('•'))}) Tj ET`);
        this.textoLinea(l, MARGEN_X + 20, 'R', size);
      });
      this.y += 1.5;
    }
    this.y += 4;
  }

  // Membrete: logo a la izquierda, datos de Secretaría a la derecha y línea azul.
  encabezado() {
    const top = 34;
    const h = 50;
    const w = (h * LOGO.w) / LOGO.h;
    this.ops.push(`q ${num(w)} 0 0 ${num(h)} ${num(MARGEN_X)} ${num(A4[1] - top - h)} cm /Im1 Do Q`);
    const lineas = ['Secretaría', CONFIG.IGLESIA_UBICACION, CONFIG.IGLESIA_EMAIL].filter(Boolean);
    lineas.forEach((t, i) => {
      const x = MARGEN_X + ANCHO_UTIL - ancho(t, 'R', 8.5);
      this.ops.push(`BT 0.35 g /F1 8.5 Tf 1 0 0 1 ${num(x)} ${num(A4[1] - (top + 12 + i * 11))} Tm (${escapar(codificar(t))}) Tj ET`);
    });
    const yl = A4[1] - (top + h + 8);
    this.ops.push(`0.12 0.23 0.37 RG 0.9 w ${num(MARGEN_X)} ${num(yl)} m ${num(MARGEN_X + ANCHO_UTIL)} ${num(yl)} l S`);
    this.y = top + h + 8 + 26;
  }

  // Marco doble para certificados (solo en la página actual).
  marco() {
    const g = (m, w, anchoLinea) => this.ops.push(`0.12 0.23 0.37 RG ${anchoLinea} w ${num(m)} ${num(m)} ${num(A4[0] - 2 * m)} ${num(A4[1] - 2 * m)} re S`);
    g(24, 0, 1.6);
    g(29, 0, 0.5);
  }

  seccion(titulo) {
    this.asegurar(70); // el título nunca queda solo al final de la página
    this.y += 10;
    this.textoLinea(titulo.toUpperCase(), MARGEN_X, 'B', 10.5, 0.1);
    this.y -= 1;
    this.linea(MARGEN_X, MARGEN_X + ANCHO_UTIL, 0.5, 0.6);
    this.y += 6;
  }
}

function aBytes(cadena) {
  const out = new Uint8Array(cadena.length);
  for (let i = 0; i < cadena.length; i++) out[i] = cadena.charCodeAt(i) & 0xff;
  return out;
}
const rellenar = (n, largo) => String(n).padStart(largo, '0');

function ensamblar(paginas, { titulo, autor }) {
  const total = paginas.length;
  const objs = [];
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objs[2] = `<< /Type /Pages /Kids [${paginas.map((_, i) => `${7 + 2 * i} 0 R`).join(' ')}] /Count ${total} >>`;
  objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman /Encoding /WinAnsiEncoding >>';
  objs[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold /Encoding /WinAnsiEncoding >>';
  objs[5] = '<< /Type /Font /Subtype /Type1 /BaseFont /Times-Italic /Encoding /WinAnsiEncoding >>';
  const d = new Date();
  const fecha = `D:${d.getFullYear()}${rellenar(d.getMonth() + 1, 2)}${rellenar(d.getDate(), 2)}${rellenar(d.getHours(), 2)}${rellenar(d.getMinutes(), 2)}${rellenar(d.getSeconds(), 2)}`;
  objs[6] = `<< /Title (${escapar(codificar(titulo))}) /Author (${escapar(codificar(autor))}) /Creator (Secretaria) /CreationDate (${fecha}) >>`;
  paginas.forEach((ops, i) => {
    const flujo = ops.join('\n');
    objs[7 + 2 * i] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4[0]} ${A4[1]}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> /XObject << /Im1 ${7 + 2 * total} 0 R >> >> /Contents ${8 + 2 * i} 0 R >>`;
    objs[8 + 2 * i] = `<< /Length ${flujo.length} >>\nstream\n${flujo}\nendstream`;
  });

  // Logo: JPEG incrustado tal cual (DCTDecode).
  const jpg = atob(LOGO.b64);
  objs[7 + 2 * total] = `<< /Type /XObject /Subtype /Image /Width ${LOGO.w} /Height ${LOGO.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n${jpg}\nendstream`;

  let out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const offsets = [];
  for (let n = 1; n < objs.length; n++) {
    offsets[n] = out.length;
    out += `${n} 0 obj\n${objs[n]}\nendobj\n`;
  }
  const inicioXref = out.length;
  out += `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
  for (let n = 1; n < objs.length; n++) out += `${rellenar(offsets[n], 10)} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length} /Root 1 0 R /Info 6 0 R >>\nstartxref\n${inicioXref}\n%%EOF`;
  return new Blob([aBytes(out)], { type: 'application/pdf' });
}

function dibujarFirmas(doc, firmas, porFila = 3, centrar = false) {
  const colW = ANCHO_UTIL / (centrar ? Math.max(porFila, 2) : porFila);
  const inicio = MARGEN_X + (centrar ? (ANCHO_UTIL - colW * porFila) / 2 : 0);
  for (let i = 0; i < firmas.length; i += porFila) {
    doc.asegurar(110);
    doc.espacio(i === 0 ? 46 : 38);
    const fila = firmas.slice(i, i + porFila);
    const yLinea = doc.y;
    fila.forEach((f, k) => {
      const x = inicio + k * colW;
      doc.y = yLinea;
      doc.linea(x + 12, x + colW - 12, 0.7, 0);
      doc.y += 3;
      doc.parrafo(f.nombre || ' ', { f: 'B', size: 10, align: 'center', despues: 0, x0: x, w: colW });
      if (f.cargo) doc.parrafo(f.cargo, { f: 'I', size: 9.5, align: 'center', despues: 0, x0: x, w: colW });
    });
    // Baja el cursor hasta debajo del bloque más alto.
    doc.y = Math.max(doc.y, yLinea + 40);
  }
}

/**
 * Genera el PDF de un acta.
 * datos: { iglesia, numero, meta, borrador, asistentes[], ordenDelDia, temas, decisiones[],
 *          observaciones, firmas:[{nombre,cargo}], aprobacion }
 */
export function generarPDFActa(datos) {
  const doc = new Documento();
  const centro = (t, f, size, despues = 4, gris = 0) => doc.parrafo(t, { f, size, align: 'center', despues, gris });

  doc.encabezado();
  centro(`ACTA N° ${datos.numero}`, 'B', 21, 2);
  centro(datos.meta, 'R', 11, 4);
  if (datos.borrador) centro('BORRADOR - sin validez hasta su aprobación', 'I', 10, 4, 0.4);

  doc.seccion(`Asistentes (${datos.asistentes.length})`);
  if (datos.asistentes.length) doc.lista(datos.asistentes);
  else doc.parrafo('—', { gris: 0.5 });

  doc.seccion('Orden del día');
  doc.parrafo(datos.ordenDelDia || '—');

  doc.seccion('Temas tratados');
  doc.parrafo(datos.temas || '—');

  doc.seccion('Decisiones tomadas');
  if (datos.decisiones.length) doc.lista(datos.decisiones);
  else doc.parrafo('Sin decisiones registradas.', { gris: 0.5 });

  doc.seccion('Observaciones');
  doc.parrafo(datos.observaciones || '—');

  dibujarFirmas(doc, datos.firmas);

  if (datos.aprobacion) {
    doc.espacio(24);
    doc.parrafo(datos.aprobacion, { f: 'I', size: 9, align: 'center', gris: 0.4 });
  }

  // Pie de página con numeración.
  const total = doc.paginas.length;
  doc.paginas.forEach((ops, i) => {
    const texto = `Acta N° ${datos.numero}  -  Página ${i + 1} de ${total}`;
    const x = (A4[0] - ancho(texto, 'I', 9)) / 2;
    ops.push(`0.6 G 0.4 w ${MARGEN_X} 52 m ${MARGEN_X + ANCHO_UTIL} 52 l S`);
    ops.push(`BT 0.4 g /F3 9 Tf 1 0 0 1 ${num(x)} 38 Tm (${escapar(codificar(texto))}) Tj ET`);
  });

  return ensamblar(doc.paginas, { titulo: `Acta N° ${datos.numero}`, autor: datos.iglesia || 'Secretaría' });
}

/**
 * Genera el PDF de una nota o certificado.
 * datos: { iglesia, certificado, titulo, numero (texto "1/2026" o null), borrador, fechaTxt,
 *          destinatario, asunto, cuerpo, firmas:[{nombre,cargo}] }
 */
export function generarPDFNota(datos) {
  const doc = new Documento();
  doc.encabezado();
  const aviso = 'BORRADOR - sin número ni validez hasta su emisión';

  if (datos.certificado) {
    doc.marco();
    doc.espacio(34);
    doc.parrafo(datos.titulo.toUpperCase(), { f: 'B', size: 21, align: 'center', despues: 4 });
    doc.parrafo(datos.numero ? `Certificado N° ${datos.numero}` : aviso, { f: 'I', size: 10.5, align: 'center', gris: 0.4, despues: 40 });
    doc.parrafo(datos.cuerpo, { size: 14.5, align: 'center', despues: 10, x0: MARGEN_X + 16, w: ANCHO_UTIL - 32 });
    doc.espacio(26);
    doc.parrafo(datos.fechaTxt, { size: 12.5, align: 'center', despues: 0 });
    doc.espacio(40);
  } else {
    doc.parrafo(datos.fechaTxt, { size: 11.5, align: 'right', despues: 14 });
    doc.parrafo(datos.numero ? `Nota N° ${datos.numero}` : 'Nota (borrador)', { f: 'B', size: 11.5, despues: datos.numero ? 14 : 2 });
    if (!datos.numero) doc.parrafo(aviso, { f: 'I', size: 9.5, gris: 0.4, despues: 12 });
    doc.parrafo(datos.destinatario, { size: 11.5, despues: 12 });
    doc.parrafo(`Asunto: ${datos.asunto}`, { f: 'B', size: 11.5, despues: 16 });
    doc.parrafo(datos.cuerpo, { size: 11.5, despues: 6 });
  }

  dibujarFirmas(doc, datos.firmas, Math.min(Math.max(datos.firmas.length, 1), 3), true);

  const total = doc.paginas.length;
  doc.paginas.forEach((ops, i) => {
    const texto = `Secretaría - ${datos.iglesia || ''}${total > 1 ? `  -  Página ${i + 1} de ${total}` : ''}`;
    const x = (A4[0] - ancho(texto, 'I', 9)) / 2;
    ops.push(`0.6 G 0.4 w ${MARGEN_X} 52 m ${MARGEN_X + ANCHO_UTIL} 52 l S`);
    ops.push(`BT 0.4 g /F3 9 Tf 1 0 0 1 ${num(x)} 38 Tm (${escapar(codificar(texto))}) Tj ET`);
  });

  const t = datos.certificado ? datos.titulo : `Nota ${datos.numero || '(borrador)'}`;
  return ensamblar(doc.paginas, { titulo: t, autor: datos.iglesia || 'Secretaría' });
}
