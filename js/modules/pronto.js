import { MENU } from '../constantes.js';
import { encabezado, esc } from '../ui.js';

const DETALLES = {
  notas: ['Notas y comunicaciones', 'Notas oficiales con plantillas, numeración, PDF e impresión, y archivo automático.', 'Etapa 2'],
  calendario: ['Calendario institucional', 'Cultos, reuniones, asambleas, bautismos, Santa Cena y eventos, con vista mensual, semanal y diaria.', 'Etapa 2'],
  documentos: ['Documentación', 'Archivo digital con categorías y buscador. Los archivos se guardan en el Drive de la iglesia y acá queda el registro con su enlace.', 'Etapa 2'],
  informes: ['Informes', 'Informe mensual de Secretaría y exportación a PDF.', 'Etapa 3'],
};

export async function render(cont, { ruta }) {
  const item = MENU.find((m) => m.ruta === ruta);
  const [titulo, texto, etapa] = DETALLES[ruta] || [item?.texto || 'Módulo', 'Disponible en una próxima etapa.', 'Próximamente'];
  cont.innerHTML = `
    ${encabezado(titulo)}
    <div class="tarjeta pronto-card">
      <div class="ico">${item?.ico || '🛠️'}</div>
      <h2>Disponible en la ${esc(etapa)}</h2>
      <p>${esc(texto)}</p>
      <p style="margin-top:14px">La base de datos y la estructura ya están preparadas para sumarlo sin tocar lo que ya cargaste.</p>
    </div>`;
}
