// Configuración de la aplicación.
// La URL y la clave "publishable" son PÚBLICAS por diseño: la seguridad real
// la dan las reglas de la base de datos (RLS). Nunca pongas acá la clave
// "secret" ni "service_role".
export const CONFIG = {
  SUPABASE_URL: 'https://cvcgporpckqvowiqkxri.supabase.co',
  SUPABASE_KEY: 'sb_publishable_jlJEmLQ6jTmnh2kYL1iRaQ_nmHQuO6f',

  NOMBRE_APP: 'Secretaría',

  // Mostrar el botón "Crear cuenta". Recomendado: false. Los usuarios se crean
  // desde el panel de Supabase (ver README), así nadie ajeno puede registrarse.
  PERMITIR_REGISTRO: false,

  // Mostrar "Ingresar con Google" (requiere configurar Google en Supabase).
  GOOGLE_LOGIN: false,
};
