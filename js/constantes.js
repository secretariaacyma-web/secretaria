// Etiquetas y valores fijos usados en toda la aplicación.

export const ROLES = {
  administrador: 'Administrador',
  secretario: 'Secretario/a',
  pastor: 'Pastor',
  comision: 'Comisión',
  consulta: 'Consulta',
};

export const ESTADOS_MIEMBRO = {
  activo: ['Activo', 'verde'],
  inactivo: ['Inactivo', ''],
  en_proceso: ['En proceso de incorporación', 'azul'],
  trasladado: ['Trasladado', 'naranja'],
  baja: ['Baja', 'rojo'],
};

export const TIPOS_AUTORIDAD = { pastor: 'Pastoral', comision: 'Comisión' };

export const CARGOS_SUGERIDOS = [
  'Pastor', 'Pastor asociado', 'Presidente', 'Vicepresidente', 'Secretario/a', 'Tesorero/a',
  'Pro-tesorero/a', 'Revisor/a de cuentas', 'Vocal titular', 'Vocal suplente',
];

export const TIPOS_REUNION = {
  comision: 'Comisión',
  ministerial: 'Ministerial',
  pastoral: 'Pastoral',
  asamblea: 'Asamblea',
  especial: 'Reunión especial',
};

export const ESTADOS_REUNION = {
  programada: ['Programada', 'azul'],
  realizada: ['Realizada', 'verde'],
  cancelada: ['Cancelada', 'rojo'],
};

export const TIPOS_ACTA = {
  comision: 'Reunión de comisión',
  asamblea: 'Asamblea',
  ministerial: 'Reunión ministerial',
  extraordinaria: 'Reunión extraordinaria',
  otras: 'Otras',
};

// Tipo de reunión → tipo de acta al convertir una reunión en acta.
export const REUNION_A_ACTA = {
  comision: 'comision',
  ministerial: 'ministerial',
  pastoral: 'otras',
  asamblea: 'asamblea',
  especial: 'extraordinaria',
};

export const ESTADOS_ACTA = {
  borrador: ['Borrador', 'naranja'],
  aprobada: ['Aprobada', 'verde'],
  archivada: ['Archivada', ''],
};

export const ESTADOS_DECISION = {
  pendiente: ['Pendiente', 'naranja'],
  en_proceso: ['En proceso', 'azul'],
  completada: ['Completada', 'verde'],
  cancelada: ['Cancelada', ''],
};

// Menú lateral. "roles" limita quién lo ve; "pronto" marca módulos de etapas siguientes.
export const MENU = [
  { ruta: 'inicio', texto: 'Inicio', ico: '🏠' },
  { ruta: 'actas', texto: 'Actas', ico: '📜' },
  { ruta: 'miembros', texto: 'Miembros', ico: '👥', roles: ['administrador', 'secretario', 'pastor'] },
  { ruta: 'autoridades', texto: 'Autoridades', ico: '🏛️' },
  { ruta: 'reuniones', texto: 'Reuniones', ico: '🗓️' },
  { ruta: 'decisiones', texto: 'Decisiones', ico: '✅' },
  { ruta: 'notas', texto: 'Notas', ico: '✉️', pronto: true },
  { ruta: 'calendario', texto: 'Calendario', ico: '📅', pronto: true },
  { ruta: 'inventario', texto: 'Inventario', ico: '📦', pronto: true },
  { ruta: 'documentos', texto: 'Documentos', ico: '🗂️', pronto: true },
  { ruta: 'informes', texto: 'Informes', ico: '📊', pronto: true },
  { ruta: 'configuracion', texto: 'Configuración', ico: '⚙️' },
];
