// Utilidades de interfaz: formato, avisos, ventanas, formularios, tablas, descargas.

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const fmtFecha = (d) => {
  if (!d) return '—';
  const [y, m, dd] = String(d).slice(0, 10).split('-');
  return `${dd}/${m}/${y}`;
};
export const fmtHora = (t) => (t ? String(t).slice(0, 5) : '');
export const fmtFechaHora = (ts) =>
  ts ? new Date(ts).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
export const hoy = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const fmtFechaLarga = (d) => {
  if (!d) return '';
  const [y, m, dd] = String(d).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, dd).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
};

export const badge = (par) => {
  const [texto, tipo] = par || ['—', ''];
  return `<span class="badge ${tipo}">${esc(texto)}</span>`;
};

// Convierte errores técnicos en mensajes entendibles.
export function errorAmigable(e) {
  const msg = e?.message || String(e);
  if (e?.code === '23505') {
    if (/dni/i.test(msg)) return 'Ya existe una persona cargada con ese DNI.';
    return 'Ya existe un registro con esos datos.';
  }
  if (e?.code === '42501' || /row-level security|permission denied/i.test(msg)) {
    return 'Tu usuario no tiene permiso para hacer esto.';
  }
  if (/Failed to fetch|NetworkError/i.test(msg)) return 'No hay conexión con el servidor. Revisá tu internet.';
  return msg;
}

// ---------- Avisos ----------
export function toast(mensaje, tipo = '') {
  let zona = document.getElementById('toasts');
  if (!zona) {
    zona = document.createElement('div');
    zona.id = 'toasts';
    zona.className = 'toast-zona';
    document.body.appendChild(zona);
  }
  while (zona.children.length >= 3) zona.firstChild.remove();
  const t = document.createElement('div');
  t.className = `toast ${tipo}`;
  t.textContent = mensaje;
  zona.appendChild(t);
  setTimeout(() => t.remove(), tipo === 'error' ? 6000 : 3200);
}

// ---------- Ventanas ----------
export function abrirModal({ titulo, cuerpo = '', pie = '', ancho = false, chico = false }) {
  const fondo = document.createElement('div');
  fondo.className = 'modal-fondo';
  fondo.innerHTML = `
    <div class="modal ${ancho ? 'ancho' : ''} ${chico ? 'chico' : ''}" role="dialog" aria-modal="true">
      <div class="modal-enc"><h2>${esc(titulo)}</h2><button type="button" data-cerrar aria-label="Cerrar">×</button></div>
      <div class="modal-cuerpo">${cuerpo}</div>
      ${pie ? `<div class="modal-pie">${pie}</div>` : ''}
    </div>`;
  document.body.appendChild(fondo);
  const cerrar = () => {
    document.removeEventListener('keydown', onKey);
    fondo.remove();
  };
  const onKey = (ev) => { if (ev.key === 'Escape') cerrar(); };
  document.addEventListener('keydown', onKey);
  fondo.querySelector('[data-cerrar]').addEventListener('click', cerrar);
  return { el: fondo, cerrar };
}

export function confirmar(mensaje, { textoOk = 'Aceptar', peligro = false, titulo = 'Confirmar' } = {}) {
  return new Promise((resolve) => {
    const m = abrirModal({
      titulo,
      chico: true,
      cuerpo: `<p style="margin:0">${esc(mensaje)}</p>`,
      pie: `<button class="btn sec" data-no>Cancelar</button><button class="btn ${peligro ? 'rojo' : ''}" data-si>${esc(textoOk)}</button>`,
    });
    m.el.querySelector('[data-no]').onclick = () => { m.cerrar(); resolve(false); };
    m.el.querySelector('[data-cerrar]').onclick = () => { m.cerrar(); resolve(false); };
    m.el.querySelector('[data-si]').onclick = () => { m.cerrar(); resolve(true); };
  });
}

// ---------- Formularios ----------
// campos: [{ name, label, type, required, options:[{v,l}], placeholder, hint, full, list }]
// type: text | email | tel | date | time | number | textarea | select | checks
function campoHTML(c, valor) {
  const id = `f_${c.name}`;
  const req = c.required ? '<span class="req"> *</span>' : '';
  const hint = c.hint ? `<div class="hint">${esc(c.hint)}</div>` : '';
  const cls = `campo ${c.full || c.type === 'textarea' || c.type === 'checks' ? 'full' : ''}`;
  let control = '';
  const v = valor ?? '';
  switch (c.type) {
    case 'textarea':
      control = `<textarea id="${id}" name="${c.name}" placeholder="${esc(c.placeholder || '')}" ${c.rows ? `rows="${c.rows}"` : ''}>${esc(v)}</textarea>`;
      break;
    case 'select':
      control = `<select id="${id}" name="${c.name}">
        <option value="">— Seleccionar —</option>
        ${(c.options || []).map((o) => `<option value="${esc(o.v)}" ${String(o.v) === String(v) ? 'selected' : ''}>${esc(o.l)}</option>`).join('')}
      </select>`;
      break;
    case 'checks': {
      const marcados = new Set(Array.isArray(valor) ? valor : []);
      control = `<div class="checks" id="${id}">
        ${(c.options || []).length
          ? c.options.map((o) => `<label><input type="checkbox" name="${c.name}" value="${esc(o.v)}" ${marcados.has(o.v) ? 'checked' : ''}> ${esc(o.l)}</label>`).join('')
          : '<div class="hint" style="padding:6px 0">No hay opciones cargadas todavía.</div>'}
      </div>`;
      break;
    }
    default:
      control = `<input id="${id}" name="${c.name}" type="${c.type || 'text'}" value="${esc(v)}" placeholder="${esc(c.placeholder || '')}" ${c.list ? `list="dl_${c.name}"` : ''} ${c.type === 'number' ? 'step="any"' : ''} autocomplete="off">
        ${c.list ? `<datalist id="dl_${c.name}">${c.list.map((x) => `<option value="${esc(x)}"></option>`).join('')}</datalist>` : ''}`;
  }
  return `<div class="${cls}"><label for="${id}">${esc(c.label)}${req}</label>${control}${hint}</div>`;
}

function leerValores(form, campos) {
  const out = {};
  for (const c of campos) {
    if (c.type === 'checks') {
      out[c.name] = [...form.querySelectorAll(`input[name="${c.name}"]:checked`)].map((i) => i.value);
    } else {
      const el = form.elements[c.name];
      const val = el ? String(el.value).trim() : '';
      out[c.name] = val === '' ? null : c.type === 'number' ? Number(val) : val;
    }
  }
  return out;
}

export function formModal({ titulo, campos, valores = {}, guardar, textoGuardar = 'Guardar', ancho = false, aviso = '', alAbrir = null }) {
  return new Promise((resolve) => {
    const cuerpo = `
      <form id="form-modal" novalidate>
        <div class="form-error" hidden></div>
        ${aviso ? `<div class="aviso info">${esc(aviso)}</div>` : ''}
        <div class="form-grid">${campos.map((c) => campoHTML(c, valores[c.name])).join('')}</div>
      </form>`;
    const m = abrirModal({
      titulo, cuerpo, ancho,
      pie: `<button type="button" class="btn sec" data-cancelar>Cancelar</button><button type="submit" form="form-modal" class="btn" data-guardar>${esc(textoGuardar)}</button>`,
    });
    const form = m.el.querySelector('form');
    const errBox = m.el.querySelector('.form-error');
    const btn = m.el.querySelector('[data-guardar]');
    if (alAbrir) alAbrir(form, m);
    m.el.querySelector('[data-cancelar]').onclick = () => { m.cerrar(); resolve(null); };
    m.el.querySelector('[data-cerrar]').onclick = () => { m.cerrar(); resolve(null); };
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      errBox.hidden = true;
      const vals = leerValores(form, campos);
      const falta = campos.find((c) => c.required && (c.type === 'checks' ? !vals[c.name].length : vals[c.name] === null));
      if (falta) {
        errBox.textContent = `Completá el campo: ${falta.label}.`;
        errBox.hidden = false;
        return;
      }
      btn.disabled = true;
      const textoOriginal = btn.textContent;
      btn.textContent = 'Guardando…';
      try {
        await guardar(vals);
        m.cerrar();
        resolve(vals);
      } catch (e) {
        errBox.textContent = errorAmigable(e);
        errBox.hidden = false;
        btn.disabled = false;
        btn.textContent = textoOriginal;
        m.el.querySelector('.modal-cuerpo').scrollTop = 0;
        errBox.scrollIntoView({ block: 'nearest' });
      }
    });
    setTimeout(() => form.querySelector('input:not([type=checkbox]),select,textarea')?.focus(), 50);
  });
}

// ---------- Tablas ----------
// cols: [{ h, f:(fila)=>html, cls }]
export function tablaHTML(cols, filas, { vacio = 'No hay registros para mostrar.', clickAttr = null, clsFila = null } = {}) {
  if (!filas.length) return `<div class="vacio">${esc(vacio)}</div>`;
  return `<div class="tabla-wrap"><table class="tabla">
    <thead><tr>${cols.map((c) => `<th>${esc(c.h)}</th>`).join('')}</tr></thead>
    <tbody>${filas.map((f) => `
      <tr class="${clickAttr ? 'click' : ''} ${clsFila ? clsFila(f) : ''}" ${clickAttr ? `data-id="${esc(f.id)}"` : ''}>
        ${cols.map((c) => `<td class="${c.cls || ''}">${c.f(f)}</td>`).join('')}
      </tr>`).join('')}
    </tbody></table></div>`;
}

// ---------- Descargas ----------
export function descargar(nombre, contenido, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([contenido], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// CSV que Excel abre bien (BOM + separador ;).
export function descargarCSV(nombre, encabezados, filas) {
  const celda = (v) => `"${String(v ?? '').replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
  const texto = [encabezados, ...filas].map((f) => f.map(celda).join(';')).join('\r\n');
  descargar(nombre, '﻿' + texto, 'text/csv;charset=utf-8');
}

export const debounce = (fn, ms = 200) => {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
};

export const normalizar = (s) =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function encabezado(titulo, sub = '', acciones = '') {
  return `<div class="pagina-enc">
    <div><h1>${esc(titulo)}</h1>${sub ? `<div class="sub">${esc(sub)}</div>` : ''}</div>
    ${acciones ? `<div class="acciones">${acciones}</div>` : ''}
  </div>`;
}
