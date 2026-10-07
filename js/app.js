// Punto de entrada: sesión, menú lateral y enrutador por hash (#/actas, #/actas/ID).
import { sb, q } from './supabase.js';
import { CONFIG } from './config.js';
import { estado, rolActual } from './state.js';
import { MENU, ROLES } from './constantes.js';
import { esc, toast, errorAmigable, formModal } from './ui.js';

const raiz = document.getElementById('raiz');

// ---------------------------------------------------------------- Módulos
const MODULOS = {
  inicio: () => import('./modules/dashboard.js'),
  actas: () => import('./modules/actas.js'),
  miembros: () => import('./modules/miembros.js'),
  autoridades: () => import('./modules/autoridades.js'),
  reuniones: () => import('./modules/reuniones.js'),
  decisiones: () => import('./modules/decisiones.js'),
  configuracion: () => import('./modules/configuracion.js'),
  notas: () => import('./modules/pronto.js'),
  calendario: () => import('./modules/pronto.js'),
  inventario: () => import('./modules/pronto.js'),
  documentos: () => import('./modules/pronto.js'),
  informes: () => import('./modules/pronto.js'),
};

function parsearHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [camino, qs = ''] = h.split('?');
  const [ruta, id] = camino.split('/');
  return { ruta: ruta || 'inicio', id: id || null, query: Object.fromEntries(new URLSearchParams(qs)) };
}

let tokenNavegacion = 0;
async function navegar() {
  const cont = document.getElementById('contenido');
  if (!cont || !estado.perfil) return;
  const { ruta, id, query } = parsearHash();
  const item = MENU.find((m) => m.ruta === ruta);
  const cargador = MODULOS[ruta];
  const miToken = ++tokenNavegacion;

  document.querySelectorAll('.lateral nav a').forEach((a) => a.classList.toggle('activo', a.dataset.ruta === ruta));
  document.getElementById('titulo-movil').textContent = item?.texto || CONFIG.NOMBRE_APP;
  cerrarMenuMovil();
  window.scrollTo(0, 0);

  if (!cargador || (item?.roles && !item.roles.includes(rolActual()))) {
    cont.innerHTML = `<div class="tarjeta"><div class="vacio">No tenés acceso a esta sección o no existe. <a href="#/inicio">Volver al inicio</a></div></div>`;
    return;
  }
  cont.dataset.vista = String(miToken);
  cont.innerHTML = '<div class="cargando">Cargando…</div>';
  try {
    const mod = await cargador();
    if (miToken !== tokenNavegacion) return;
    await mod.render(cont, { id, query, ruta });
  } catch (e) {
    if (miToken !== tokenNavegacion) return;
    console.error(e);
    cont.innerHTML = `<div class="tarjeta"><div class="cuerpo">
      <div class="form-error">${esc(errorAmigable(e))}</div>
      <button class="btn sec" id="reintentar">Reintentar</button></div></div>`;
    document.getElementById('reintentar').onclick = navegar;
  }
}

// ---------------------------------------------------------------- Estructura
function abrirMenuMovil() {
  document.getElementById('lateral')?.classList.add('abierto');
  document.getElementById('velo')?.classList.add('abierto');
}
function cerrarMenuMovil() {
  document.getElementById('lateral')?.classList.remove('abierto');
  document.getElementById('velo')?.classList.remove('abierto');
}

function dibujarApp() {
  const rol = rolActual();
  const items = MENU.filter((m) => !m.roles || m.roles.includes(rol));
  raiz.innerHTML = `
    <div class="app">
      <aside class="lateral" id="lateral">
        <div class="marca"><b>⛪ ${esc(CONFIG.NOMBRE_APP)}</b><span>${esc(estado.iglesia?.nombre || '')}</span></div>
        <nav>${items.map((m) => `
          <a href="#/${m.ruta}" data-ruta="${m.ruta}"><span class="ico">${m.ico}</span>${esc(m.texto)}${m.pronto ? '<span class="pronto">pronto</span>' : ''}</a>`).join('')}
        </nav>
        <div class="usuario">
          <b>${esc(estado.perfil.nombre || estado.perfil.email || 'Usuario')}</b>
          <span>${esc(ROLES[rol] || rol)}</span><br>
          <button id="btn-salir">Cerrar sesión</button>
        </div>
      </aside>
      <div class="velo" id="velo"></div>
      <div class="principal">
        <div class="barra-movil"><button id="btn-menu" aria-label="Menú">☰</button><b id="titulo-movil">${esc(CONFIG.NOMBRE_APP)}</b></div>
        <main id="contenido"></main>
      </div>
    </div>`;
  document.getElementById('btn-menu').onclick = abrirMenuMovil;
  document.getElementById('velo').onclick = cerrarMenuMovil;
  document.getElementById('btn-salir').onclick = salir;
  navegar();
}

export async function salir() {
  await sb.auth.signOut();
}

// ---------------------------------------------------------------- Ingreso
function dibujarLogin(mensaje = null) {
  let modo = 'ingresar';
  const pintar = () => {
    raiz.innerHTML = `
      <div class="login-wrap"><form class="login-card" id="form-login" novalidate>
        <div class="logo">⛪</div>
        <h1>${esc(CONFIG.NOMBRE_APP)}</h1>
        <div class="sub">${modo === 'ingresar' ? 'Ingresá para continuar' : 'Crear cuenta'}</div>
        <div id="login-msg" class="login-msg ${mensaje?.tipo || ''}" ${mensaje ? '' : 'hidden'}>${esc(mensaje?.texto || '')}</div>
        <div class="campo"><label for="l-email">Correo electrónico</label><input id="l-email" type="email" autocomplete="username" required></div>
        <div class="campo"><label for="l-pass">Contraseña</label><input id="l-pass" type="password" autocomplete="${modo === 'ingresar' ? 'current-password' : 'new-password'}" required></div>
        <button class="btn" type="submit" id="l-enviar">${modo === 'ingresar' ? 'Ingresar' : 'Crear cuenta'}</button>
        ${CONFIG.GOOGLE_LOGIN ? '<div class="sep">o</div><button class="btn sec" type="button" id="l-google">Ingresar con Google</button>' : ''}
        <div class="cambiar">
          ${modo === 'ingresar' ? '<a href="#" id="l-olvide">Olvidé mi contraseña</a>' : ''}
          ${CONFIG.PERMITIR_REGISTRO ? `<br><a href="#" id="l-modo">${modo === 'ingresar' ? 'Crear cuenta' : 'Ya tengo cuenta'}</a>` : ''}
        </div>
      </form></div>`;
    const msg = document.getElementById('login-msg');
    const mostrar = (texto, tipo = 'error') => { msg.hidden = false; msg.className = `login-msg ${tipo}`; msg.textContent = texto; };

    document.getElementById('form-login').onsubmit = async (ev) => {
      ev.preventDefault();
      const email = document.getElementById('l-email').value.trim();
      const password = document.getElementById('l-pass').value;
      if (!email || !password) return mostrar('Completá el correo y la contraseña.');
      const btn = document.getElementById('l-enviar');
      btn.disabled = true;
      try {
        if (modo === 'ingresar') {
          const { error } = await sb.auth.signInWithPassword({ email, password });
          if (error) throw error;
        } else {
          if (password.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres.');
          const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } });
          if (error) throw error;
          if (!data.session) {
            modo = 'ingresar';
            mensaje = { tipo: 'ok', texto: 'Cuenta creada. Revisá tu correo y confirmá el enlace; después ingresá.' };
            pintar();
            return;
          }
        }
      } catch (e) {
        const t = /Invalid login/i.test(e.message) ? 'Correo o contraseña incorrectos.'
          : /Email not confirmed/i.test(e.message) ? 'Todavía no confirmaste tu correo. Revisá tu bandeja de entrada.'
          : errorAmigable(e);
        mostrar(t);
        btn.disabled = false;
      }
    };
    document.getElementById('l-modo')?.addEventListener('click', (ev) => { ev.preventDefault(); modo = modo === 'ingresar' ? 'registro' : 'ingresar'; mensaje = null; pintar(); });
    document.getElementById('l-olvide')?.addEventListener('click', async (ev) => {
      ev.preventDefault();
      const email = document.getElementById('l-email').value.trim();
      if (!email) return mostrar('Escribí tu correo arriba y volvé a tocar "Olvidé mi contraseña".');
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
      if (error) return mostrar(errorAmigable(error));
      mostrar('Te enviamos un correo con el enlace para crear una contraseña nueva.', 'ok');
    });
    document.getElementById('l-google')?.addEventListener('click', () =>
      sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } }));
  };
  pintar();
}

function dibujarPendiente(email) {
  raiz.innerHTML = `
    <div class="login-wrap"><div class="login-card">
      <div class="logo">🔒</div>
      <h1>Cuenta pendiente</h1>
      <div class="sub">La cuenta <b>${esc(email || '')}</b> todavía no fue activada. Pedile al administrador que la active y volvé a ingresar.</div>
      <button class="btn sec" id="p-salir">Cerrar sesión</button>
    </div></div>`;
  document.getElementById('p-salir').onclick = salir;
}

// ---------------------------------------------------------------- Arranque
let cargando = false;
async function iniciarConSesion(session) {
  if (cargando) return;
  cargando = true;
  try {
    estado.user = session.user;
    const perfil = await q(sb.from('perfiles').select('*').eq('id', session.user.id).maybeSingle());
    if (!perfil || !perfil.activo) {
      estado.perfil = null;
      dibujarPendiente(session.user.email);
      return;
    }
    estado.perfil = perfil;
    estado.iglesia = await q(sb.from('iglesias').select('*').eq('id', perfil.iglesia_id).maybeSingle());
    dibujarApp();
  } catch (e) {
    console.error(e);
    raiz.innerHTML = `<div class="login-wrap"><div class="login-card">
      <div class="logo">⚠️</div><h1>No se pudo cargar</h1>
      <div class="sub">${esc(errorAmigable(e))}<br><br>Si es la primera vez, verificá que ejecutaste el archivo <b>schema.sql</b> en Supabase.</div>
      <button class="btn" onclick="location.reload()">Reintentar</button><br><br>
      <button class="btn sec" id="e-salir">Cerrar sesión</button></div></div>`;
    document.getElementById('e-salir').onclick = salir;
  } finally {
    cargando = false;
  }
}

sb.auth.onAuthStateChange((evento, session) => {
  // Evitamos llamar a Supabase dentro del callback (puede trabarse): lo diferimos.
  setTimeout(async () => {
    if (evento === 'PASSWORD_RECOVERY') {
      await formModal({
        titulo: 'Crear contraseña nueva',
        textoGuardar: 'Guardar contraseña',
        campos: [{ name: 'password', label: 'Contraseña nueva (mínimo 8 caracteres)', type: 'password', required: true }],
        guardar: async ({ password }) => {
          if (password.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres.');
          const { error } = await sb.auth.updateUser({ password });
          if (error) throw error;
          toast('Contraseña actualizada.', 'ok');
        },
      });
    }
    if (session) {
      if (!estado.perfil || estado.user?.id !== session.user.id) await iniciarConSesion(session);
    } else if (evento === 'SIGNED_OUT' || evento === 'INITIAL_SESSION') {
      estado.user = estado.perfil = estado.iglesia = null;
      dibujarLogin();
    }
  }, 0);
});

window.addEventListener('hashchange', navegar);
