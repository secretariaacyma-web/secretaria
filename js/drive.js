// Guardado de copias PDF en el Google Drive de la iglesia.
// Usa "Iniciar sesión con Google" (Google Identity Services) con el permiso mínimo
// "drive.file": la aplicación SOLO puede ver y modificar los archivos y la carpeta
// que ella misma crea. No puede leer el resto del Drive.
import { CONFIG } from './config.js';

const ALCANCE = 'https://www.googleapis.com/auth/drive.file';
const API = 'https://www.googleapis.com/drive/v3';
const SUBIDA = 'https://www.googleapis.com/upload/drive/v3/files';

let token = null;
let expira = 0;
let scriptGIS = null;
const carpetas = {}; // nombre de carpeta → id

export const driveDisponible = () => !!CONFIG.GOOGLE_CLIENT_ID;

// Descarga el script de Google por adelantado para que la ventana de acceso salga al instante.
export function precargarDrive() { cargarGIS().catch(() => {}); }

function cargarGIS() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (!scriptGIS) {
    scriptGIS = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => { scriptGIS = null; reject(new Error('No se pudo cargar el acceso a Google. Revisá tu conexión a internet.')); };
      document.head.appendChild(s);
    });
  }
  return scriptGIS;
}

// Pide permiso a Google (abre una ventana la primera vez). Debe llamarse desde un clic.
async function obtenerToken() {
  if (token && Date.now() < expira - 60000) return token;
  await cargarGIS();
  return new Promise((resolve, reject) => {
    const cliente = window.google.accounts.oauth2.initTokenClient({
      client_id: CONFIG.GOOGLE_CLIENT_ID,
      scope: ALCANCE,
      hint: CONFIG.GOOGLE_CUENTA || undefined,
      callback: (r) => {
        if (r.error) return reject(new Error(`Google no autorizó el acceso (${r.error}).`));
        token = r.access_token;
        expira = Date.now() + (Number(r.expires_in) || 3600) * 1000;
        resolve(token);
      },
      error_callback: (e) => reject(new Error(
        e?.type === 'popup_closed' ? 'Cerraste la ventana de Google antes de autorizar.'
          : e?.type === 'popup_failed_to_open' ? 'El navegador bloqueó la ventana de Google. Permití las ventanas emergentes para este sitio.'
          : `No se pudo completar la autorización de Google (${e?.type || 'error'}).`)),
    });
    cliente.requestAccessToken();
  });
}

async function llamar(url, opciones = {}, reintento = true) {
  const t = await obtenerToken();
  const resp = await fetch(url, { ...opciones, headers: { ...(opciones.headers || {}), Authorization: `Bearer ${t}` } });
  if (resp.status === 401 && reintento) { token = null; return llamar(url, opciones, false); }
  if (!resp.ok) {
    let detalle = '';
    try { const j = await resp.json(); detalle = j?.error?.message || ''; } catch { /* sin cuerpo */ }
    if (/has not been used|accessNotConfigured|is disabled/i.test(detalle)) {
      throw new Error('Falta activar "Google Drive API" en el proyecto de Google Cloud (ver README).');
    }
    throw new Error(`Google Drive respondió con un error (${resp.status}). ${detalle}`.trim());
  }
  return resp.json();
}

// Busca la carpeta de la aplicación; si no existe, la crea.
async function asegurarCarpeta(nombre) {
  if (carpetas[nombre]) return carpetas[nombre];
  const q = `mimeType='application/vnd.google-apps.folder' and name='${nombre.replace(/'/g, "\\'")}' and trashed=false`;
  const lista = await llamar(`${API}/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=1`);
  if (lista.files?.length) { carpetas[nombre] = lista.files[0].id; return carpetas[nombre]; }
  const creada = await llamar(`${API}/files?fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: nombre, mimeType: 'application/vnd.google-apps.folder' }),
  });
  carpetas[nombre] = creada.id;
  return creada.id;
}

/** Pide el permiso de Google ahora (debe llamarse desde un clic). Sirve para adelantar la ventana de acceso. */
export const autorizarDrive = () => obtenerToken();

/** Sube un archivo (Blob) a una carpeta de la iglesia. Devuelve { id, name, webViewLink }. */
export async function subirArchivo(blob, nombre, carpeta, mime, descripcion = '') {
  await obtenerToken(); // primero la autorización, para que la ventana salga ya
  const padre = await asegurarCarpeta(carpeta);
  const limite = `secretaria_${Math.random().toString(36).slice(2)}`;
  const metadatos = JSON.stringify({ name: nombre, parents: [padre], mimeType: mime, ...(descripcion ? { description: descripcion } : {}) });
  const cuerpo = new Blob([
    `--${limite}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadatos}\r\n`,
    `--${limite}\r\nContent-Type: ${mime}\r\n\r\n`,
    blob,
    `\r\n--${limite}--`,
  ]);
  return llamar(`${SUBIDA}?uploadType=multipart&fields=id,name,webViewLink`, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${limite}` },
    body: cuerpo,
  });
}

/** Sube un PDF (Blob) a una carpeta de la iglesia (por defecto la de actas). Devuelve { id, name, webViewLink }. */
export const subirPDF = (blob, nombre, carpeta = CONFIG.DRIVE_CARPETA || 'Secretaría - Actas') =>
  subirArchivo(blob, nombre, carpeta, 'application/pdf');
