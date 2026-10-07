// Modelos de notas y certificados. Cada modelo define:
//  - campos: datos específicos que se piden
//  - destinatario(d) / asunto(d): encabezado de la nota (los certificados no los usan)
//  - texto(d, ctx): redacción inicial a partir de los datos (se puede editar a mano)
//  - firman: quién firma por defecto ('secretario', 'pastor')
import { CONFIG } from './config.js';

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// "2026-10-07" → "7 de octubre de 2026"
export function fechaLarga(f) {
  if (!f) return '';
  const [y, m, d] = String(f).slice(0, 10).split('-').map(Number);
  return `${d} de ${MESES[m - 1]} de ${y}`;
}
const v = (x, ph) => (x && String(x).trim() ? String(x).trim() : ph);
const fl = (f, ph) => (f ? fechaLarga(f) : ph);
const sinIglesia = (n) => String(n || '').replace(/^iglesia\s+/i, '');
const dniTxt = (d) => (d.dni ? `, DNI ${d.dni}` : '');

export const MODELOS = {
  general: {
    nombre: 'Nota general', ico: '✉️', cert: false, firman: ['secretario'],
    desc: 'Nota libre: destinatario, asunto y texto a gusto.',
    campos: [
      { name: 'destinatario', label: 'Destinatario', type: 'textarea', rows: 3, required: true, full: true, hint: 'Un renglón por línea: nombre, cargo, institución.' },
      { name: 'asunto', label: 'Asunto', required: true, full: true },
    ],
    destinatario: (d) => d.destinatario,
    asunto: (d) => d.asunto,
    texto: () => 'De mi mayor consideración:\n\n[Escribí acá el texto de la nota.]\n\nSin otro particular, saludo a usted atentamente.',
  },

  recomendacion: {
    nombre: 'Carta de recomendación', ico: '🤝', cert: false, firman: ['secretario', 'pastor'],
    desc: 'Recomienda a un miembro ante otra iglesia o institución.',
    campos: [
      { name: 'nombre', label: 'Nombre y apellido', required: true },
      { name: 'dni', label: 'DNI' },
      { name: 'desde', label: 'Miembro desde (año o fecha)', placeholder: 'Ej.: 2015' },
      { name: 'actividades', label: 'Participó en (ministerios o actividades)', full: true, placeholder: 'Ej.: grupo de jóvenes y escuela dominical' },
      { name: 'proposito', label: 'Se recomienda para', full: true, placeholder: 'Ej.: su congregación en Córdoba' },
    ],
    destinatario: () => 'A quien corresponda',
    asunto: () => 'Carta de recomendación',
    texto: (d, c) => `Por la presente, la Iglesia ${sinIglesia(c.iglesia)} recomienda al/la hermano/a ${v(d.nombre, '[Nombre y apellido]')}${dniTxt(d)}, quien es miembro de esta congregación desde ${v(d.desde, '[año]')} y ha participado activamente en ${v(d.actividades, '[ministerio o actividades]')}.\n\nDurante este tiempo ha demostrado compromiso, responsabilidad y un testimonio acorde a los principios cristianos. Por ello lo/la recomendamos para ${v(d.proposito, '[propósito]')}.\n\nSe extiende la presente a pedido del interesado/a, para los fines que estime corresponder.`,
  },

  constancia: {
    nombre: 'Constancia de membresía', ico: '📄', cert: false, firman: ['secretario', 'pastor'],
    desc: 'Deja constancia de que una persona es miembro de la iglesia.',
    campos: [
      { name: 'nombre', label: 'Nombre y apellido', required: true },
      { name: 'dni', label: 'DNI' },
      { name: 'ingreso', label: 'Miembro desde', type: 'date' },
    ],
    destinatario: () => 'A quien corresponda',
    asunto: () => 'Constancia de membresía',
    texto: (d, c) => `Se deja constancia de que ${v(d.nombre, '[Nombre y apellido]')}${dniTxt(d)}, es miembro activo de la Iglesia ${sinIglesia(c.iglesia)} desde el ${fl(d.ingreso, '[fecha de ingreso]')}, encontrándose en plena comunión.\n\nSe extiende la presente constancia a pedido del interesado/a, en ${c.lugar || '[lugar]'}, el ${fechaLarga(c.fecha)}.`,
  },

  convocatoria: {
    nombre: 'Convocatoria a reunión o asamblea', ico: '📣', cert: false, firman: ['secretario', 'pastor'],
    desc: 'Convoca a los miembros con fecha, hora, lugar y orden del día.',
    campos: [
      { name: 'reunion', label: 'Tipo de reunión', required: true, list: ['Asamblea ordinaria', 'Asamblea extraordinaria', 'Reunión de miembros', 'Reunión de comisión directiva'], placeholder: 'Ej.: Asamblea ordinaria' },
      { name: 'fecha_reu', label: 'Fecha de la reunión', type: 'date', required: true },
      { name: 'hora_reu', label: 'Hora', type: 'time', required: true },
      { name: 'lugar_reu', label: 'Lugar', required: true, full: true },
      { name: 'orden', label: 'Orden del día', type: 'textarea', rows: 4, full: true, hint: 'Un tema por línea.' },
    ],
    destinatario: () => 'A los miembros de la congregación',
    asunto: (d) => `Convocatoria a ${v(d.reunion, 'reunión')}`,
    texto: (d) => {
      const temas = String(d.orden || '').split('\n').map((t) => t.trim()).filter(Boolean);
      const orden = temas.length ? temas.map((t, i) => `${i + 1}) ${t}`).join('\n') : '1) [Tema 1]\n2) [Tema 2]';
      return `La Comisión Directiva convoca a los miembros a la ${v(d.reunion, '[reunión o asamblea]').toLowerCase()} que se realizará el día ${fl(d.fecha_reu, '[fecha]')}, a las ${v(d.hora_reu && d.hora_reu.slice(0, 5), '[hora]')} hs., en ${v(d.lugar_reu, '[lugar]')}.\n\nOrden del día:\n${orden}\n\nSe solicita puntual asistencia. Que el Señor nos guíe en todo.`;
    },
  },

  bautismo: {
    nombre: 'Certificado de bautismo', ico: '💧', cert: true, firman: ['secretario', 'pastor'],
    titulo: 'Certificado de bautismo',
    desc: 'Certifica el bautismo de un hermano o hermana.',
    campos: [
      { name: 'nombre', label: 'Nombre y apellido', required: true },
      { name: 'dni', label: 'DNI' },
      { name: 'fecha_bautismo', label: 'Fecha del bautismo', type: 'date', required: true },
      { name: 'lugar_bautismo', label: 'Lugar del bautismo', required: true },
      { name: 'oficiante', label: 'Oficiante', required: true, full: true, placeholder: 'Ej.: Pastor Juan Pérez' },
    ],
    texto: (d) => `Se certifica que ${v(d.nombre, '[Nombre y apellido]')}${dniTxt(d)}, habiendo confesado a Jesucristo como su Señor y Salvador, fue bautizado/a por inmersión en agua, en el nombre del Padre, del Hijo y del Espíritu Santo, el día ${fl(d.fecha_bautismo, '[fecha]')} en ${v(d.lugar_bautismo, '[lugar]')}, siendo oficiante ${v(d.oficiante, '[oficiante]')}.\n\nSe extiende el presente certificado para constancia.`,
  },

  casamiento: {
    nombre: 'Certificado de matrimonio', ico: '💍', cert: true, firman: ['secretario', 'pastor'],
    titulo: 'Certificado de matrimonio',
    desc: 'Certifica la celebración religiosa del matrimonio.',
    campos: [
      { name: 'esposo', label: 'Nombre y apellido del esposo', required: true },
      { name: 'esposa', label: 'Nombre y apellido de la esposa', required: true },
      { name: 'fecha_casamiento', label: 'Fecha de la ceremonia', type: 'date', required: true },
      { name: 'lugar_casamiento', label: 'Lugar', required: true },
      { name: 'oficiante', label: 'Oficiante', required: true, full: true, placeholder: 'Ej.: Pastor Juan Pérez' },
      { name: 'testigos', label: 'Testigos (opcional)', full: true },
    ],
    texto: (d) => `Se certifica que ${v(d.esposo, '[esposo]')} y ${v(d.esposa, '[esposa]')} contrajeron matrimonio, recibiendo la bendición nupcial ante Dios y la congregación, el día ${fl(d.fecha_casamiento, '[fecha]')} en ${v(d.lugar_casamiento, '[lugar]')}, siendo oficiante ${v(d.oficiante, '[oficiante]')}.${d.testigos ? `\n\nTestigos: ${d.testigos}.` : ''}\n\nEste certificado tiene carácter religioso y no reemplaza la inscripción del matrimonio civil.`,
  },

  presentacion: {
    nombre: 'Certificado de presentación de niños', ico: '👶', cert: true, firman: ['secretario', 'pastor'],
    titulo: 'Certificado de presentación de niños',
    desc: 'Certifica la presentación de un niño o niña al Señor.',
    campos: [
      { name: 'nombre', label: 'Nombre y apellido del niño/a', required: true },
      { name: 'nacimiento', label: 'Fecha de nacimiento', type: 'date', required: true },
      { name: 'padres', label: 'Nombre de los padres', required: true, full: true },
      { name: 'fecha_presentacion', label: 'Fecha de la presentación', type: 'date', required: true },
      { name: 'lugar_presentacion', label: 'Lugar', required: true },
      { name: 'oficiante', label: 'Oficiante', required: true, full: true, placeholder: 'Ej.: Pastor Juan Pérez' },
    ],
    texto: (d) => `Se certifica que ${v(d.nombre, '[Nombre y apellido]')}, nacido/a el ${fl(d.nacimiento, '[fecha de nacimiento]')}, hijo/a de ${v(d.padres, '[padres]')}, fue presentado/a al Señor ante la congregación el día ${fl(d.fecha_presentacion, '[fecha]')} en ${v(d.lugar_presentacion, '[lugar]')}, siendo oficiante ${v(d.oficiante, '[oficiante]')}.\n\nSe extiende el presente certificado para constancia.`,
  },
};

export const nombreModelo = (tipo) => MODELOS[tipo]?.nombre || tipo;
export const lugarPorDefecto = () => CONFIG.IGLESIA_LUGAR || '';
