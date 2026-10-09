// Etiquetas y valores fijos usados en toda la aplicación.

export const ROLES = {
  administrador: 'Administrador',
  secretario: 'Secretario/a',
  pastor: 'Pastor',
  comision: 'Comisión',
  consulta: 'Consulta',
  tesorero: 'Tesorero/a',
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

// Categorías del calendario: [etiqueta, color].
export const CATEGORIAS_EVENTO = {
  culto: ['Culto', '#1f3a5f'],
  comision: ['Reunión de comisión', '#b7892f'],
  pastoral: ['Agenda pastoral', '#7b3f98'],
  estudio: ['Estudio bíblico', '#2d7a4f'],
  joven: ['Jóvenes', '#c46a1a'],
  oracion: ['Oración', '#0e7c86'],
  especial: ['Evento especial', '#b3382c'],
  otro: ['Otro', '#5b6878'],
};
export const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

// Inventario
export const CATEGORIAS_INV = {
  sonido: 'Sonido y multimedia',
  instrumentos: 'Instrumentos',
  mobiliario: 'Mobiliario',
  electrodomesticos: 'Electrodomésticos',
  cocina: 'Cocina',
  limpieza: 'Limpieza',
  otros: 'Otros',
};
export const UBICACIONES_INV = ['Salón', 'Cabina del sonido', 'Patio', 'Baños', 'Otros'];
export const ESTADOS_BIEN = {
  bueno: ['Bueno', 'verde'],
  regular: ['Regular', 'naranja'],
  malo: ['Malo', 'rojo'],
  en_reparacion: ['En reparación', 'azul'],
  baja: ['Baja', ''],
};
export const FORMAS_ADQUISICION = { compra: 'Compra', donacion: 'Donación', otra: 'Otra' };
export const TIPOS_MOV_INV = {
  alta: 'Alta', ubicacion: 'Cambio de ubicación', estado: 'Cambio de estado', responsable: 'Responsable',
  prestamo: 'Préstamo', devolucion: 'Devolución', reparacion: 'Reparación', baja: 'Baja', reactivacion: 'Reactivación', nota: 'Nota',
};

// Documentos
export const CATEGORIAS_DOC = {
  estatutos: 'Estatutos y reglamentos',
  actas: 'Actas escaneadas',
  legales: 'Legales y contratos',
  seguros: 'Seguros y habilitaciones',
  facturas: 'Facturas y comprobantes',
  inmuebles: 'Planos e inmuebles',
  fotos: 'Fotos y eventos',
  otros: 'Otros',
};

// Menú lateral. "roles" limita quién lo ve; "pronto" marca módulos de etapas siguientes.
export const MENU = [
  { ruta: 'inicio', texto: 'Inicio', ico: '🏠', roles: ['administrador', 'secretario', 'pastor', 'comision', 'consulta'] },
  { ruta: 'actas', texto: 'Actas', ico: '📜', roles: ['administrador', 'secretario', 'pastor', 'comision', 'consulta'] },
  { ruta: 'miembros', texto: 'Miembros', ico: '👥', roles: ['administrador', 'secretario', 'pastor'] },
  { ruta: 'autoridades', texto: 'Autoridades', ico: '🏛️', roles: ['administrador', 'secretario', 'pastor', 'comision', 'consulta'] },
  { ruta: 'reuniones', texto: 'Reuniones', ico: '🗓️', roles: ['administrador', 'secretario', 'pastor', 'comision', 'consulta'] },
  { ruta: 'decisiones', texto: 'Decisiones', ico: '✅', roles: ['administrador', 'secretario', 'pastor', 'comision', 'consulta'] },
  { ruta: 'notas', texto: 'Notas', ico: '✉️', roles: ['administrador', 'secretario', 'pastor'] },
  { ruta: 'calendario', texto: 'Calendario', ico: '📅', roles: ['administrador', 'secretario', 'pastor', 'comision', 'consulta', 'tesorero'] },
  { ruta: 'inventario', texto: 'Inventario', ico: '📦', roles: ['administrador', 'secretario', 'pastor', 'comision'] },
  { ruta: 'documentos', texto: 'Documentos', ico: '🗂️', roles: ['administrador', 'secretario', 'pastor', 'comision'] },
  { ruta: 'informes', texto: 'Informes', ico: '📊', roles: ['administrador', 'secretario', 'pastor'] },
  { ruta: 'tesoreria', texto: 'Tesorería', ico: '💰', roles: ['administrador', 'tesorero'] },
  { ruta: 'configuracion', texto: 'Configuración', ico: '⚙️' },
];
