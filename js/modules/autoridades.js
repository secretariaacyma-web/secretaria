import { sb, q } from '../supabase.js';
import { puedeEscribir, personasBasico, mapaPersonas, nombreCompleto } from '../state.js';
import { TIPOS_AUTORIDAD, CARGOS_SUGERIDOS } from '../constantes.js';
import { esc, fmtFecha, tablaHTML, encabezado, formModal, confirmar, toast, hoy, errorAmigable } from '../ui.js';

export async function render(cont, { query }) {
  const vista = cont.dataset.vista;
  const escribe = puedeEscribir();
  let filas = [];
  let personas = {};
  let tab = 'vigentes';

  async function cargar() {
    [filas, personas] = await Promise.all([
      q(sb.from('autoridades').select('*').eq('archivado', false).order('fecha_inicio', { ascending: false })),
      mapaPersonas(),
    ]);
  }

  async function campos() {
    const lista = (await personasBasico()).filter((p) => !p.archivado);
    return [
      { name: 'persona_id', label: 'Persona', type: 'select', required: true, full: true,
        options: lista.map((p) => ({ v: p.id, l: nombreCompleto(p) })),
        hint: 'La persona debe estar cargada antes en Miembros.' },
      { name: 'tipo', label: 'Tipo', type: 'select', required: true,
        options: Object.entries(TIPOS_AUTORIDAD).map(([v, l]) => ({ v, l })) },
      { name: 'cargo', label: 'Cargo', required: true, list: CARGOS_SUGERIDOS },
      { name: 'fecha_inicio', label: 'Fecha de inicio', type: 'date', required: true },
      { name: 'fecha_fin', label: 'Fecha de fin', type: 'date', hint: 'Dejala vacía si el cargo está vigente.' },
      { name: 'observaciones', label: 'Observaciones', type: 'textarea' },
    ];
  }

  async function nuevo() {
    const ok = await formModal({
      titulo: 'Nueva autoridad', campos: await campos(), valores: { fecha_inicio: hoy() },
      guardar: async (v) => {
        if (v.fecha_fin && v.fecha_fin < v.fecha_inicio) throw new Error('La fecha de fin no puede ser anterior a la de inicio.');
        await q(sb.from('autoridades').insert(v));
      },
    });
    if (ok) { toast('Autoridad registrada.', 'ok'); await recargar(); }
  }

  async function editar(a) {
    const ok = await formModal({
      titulo: 'Editar autoridad', campos: await campos(), valores: a,
      guardar: async (v) => {
        if (v.fecha_fin && v.fecha_fin < v.fecha_inicio) throw new Error('La fecha de fin no puede ser anterior a la de inicio.');
        await q(sb.from('autoridades').update(v).eq('id', a.id));
      },
    });
    if (ok) { toast('Cambios guardados.', 'ok'); await recargar(); }
  }

  async function finalizar(a) {
    const ok = await formModal({
      titulo: 'Finalizar cargo',
      aviso: `${nombreCompleto(personas[a.persona_id])} — ${a.cargo}. El cargo pasa al historial de autoridades anteriores.`,
      campos: [{ name: 'fecha_fin', label: 'Fecha de finalización', type: 'date', required: true }],
      valores: { fecha_fin: hoy() },
      textoGuardar: 'Finalizar cargo',
      guardar: async (v) => {
        if (v.fecha_fin < a.fecha_inicio) throw new Error('La fecha de fin no puede ser anterior a la de inicio.');
        await q(sb.from('autoridades').update({ fecha_fin: v.fecha_fin }).eq('id', a.id));
      },
    });
    if (ok) { toast('Cargo finalizado.', 'ok'); await recargar(); }
  }

  async function archivar(a) {
    if (!(await confirmar('¿Archivar este registro? Usalo solo si se cargó por error; no se borra, pero deja de mostrarse.', { textoOk: 'Archivar', peligro: true }))) return;
    try {
      await q(sb.from('autoridades').update({ archivado: true }).eq('id', a.id));
      toast('Registro archivado.', 'ok');
      await recargar();
    } catch (e) { toast(errorAmigable(e), 'error'); }
  }

  function pintar() {
    if (cont.dataset.vista !== vista) return; // ya se cambió de sección
    const vigentes = filas.filter((a) => !a.fecha_fin);
    const anteriores = filas.filter((a) => a.fecha_fin);
    const lista = tab === 'vigentes' ? vigentes : anteriores;
    document.getElementById('tabs').innerHTML = `
      <button class="${tab === 'vigentes' ? 'activo' : ''}" data-t="vigentes">Vigentes (${vigentes.length})</button>
      <button class="${tab === 'anteriores' ? 'activo' : ''}" data-t="anteriores">Historial (${anteriores.length})</button>`;
    document.querySelectorAll('#tabs button').forEach((b) => { b.onclick = () => { tab = b.dataset.t; pintar(); }; });

    const orden = (a, b) => (a.tipo === b.tipo ? 0 : a.tipo === 'pastor' ? -1 : 1);
    document.getElementById('tabla').innerHTML = tablaHTML(
      [
        { h: 'Persona', f: (a) => `<b>${esc(nombreCompleto(personas[a.persona_id]))}</b>` },
        { h: 'Cargo', f: (a) => esc(a.cargo) },
        { h: 'Tipo', f: (a) => `<span class="badge ${a.tipo === 'pastor' ? 'dorado' : 'azul'}">${esc(TIPOS_AUTORIDAD[a.tipo])}</span>` },
        { h: 'Desde', f: (a) => fmtFecha(a.fecha_inicio) },
        ...(tab === 'anteriores' ? [{ h: 'Hasta', f: (a) => fmtFecha(a.fecha_fin) }] : []),
        ...(escribe ? [{
          h: '', cls: 'acc',
          f: (a) => `${tab === 'vigentes' ? `<button class="btn chico sec" data-fin="${a.id}">Finalizar</button> ` : ''}
                     <button class="btn chico sec" data-ed="${a.id}">Editar</button>
                     <button class="btn chico link" data-ar="${a.id}" title="Archivar">🗄</button>`,
        }] : []),
      ],
      [...lista].sort(orden),
      { vacio: tab === 'vigentes' ? 'Todavía no hay autoridades vigentes cargadas.' : 'Todavía no hay autoridades anteriores.' }
    );
    const buscar = (id) => filas.find((a) => a.id === id);
    document.querySelectorAll('[data-fin]').forEach((b) => { b.onclick = () => finalizar(buscar(b.dataset.fin)); });
    document.querySelectorAll('[data-ed]').forEach((b) => { b.onclick = () => editar(buscar(b.dataset.ed)); });
    document.querySelectorAll('[data-ar]').forEach((b) => { b.onclick = () => archivar(buscar(b.dataset.ar)); });
  }

  async function recargar() { await cargar(); pintar(); }

  cont.innerHTML = `
    ${encabezado('Autoridades', 'Pastores y comisión, con historial de cargos anteriores.',
      escribe ? '<button class="btn" id="b-nuevo">+ Nueva autoridad</button>' : '')}
    <div class="tabs" id="tabs"></div>
    <div class="tarjeta"><div class="cuerpo sin-pad" id="tabla"></div></div>`;
  await cargar();
  pintar();
  document.getElementById('b-nuevo')?.addEventListener('click', nuevo);
  if (query?.nuevo && escribe) nuevo();
}

// Utilidad usada por otros módulos: autoridades vigentes por persona (para cargo en firmas).
export async function cargosVigentes() {
  const data = await q(sb.from('autoridades').select('persona_id,cargo').is('fecha_fin', null).eq('archivado', false));
  return Object.fromEntries(data.map((a) => [a.persona_id, a.cargo]));
}
