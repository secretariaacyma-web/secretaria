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

  // ---- Copias en Google Drive (ver README, sección "Guardar en Drive") ----
  // Pegá acá el "ID de cliente" de Google Cloud. Si queda vacío, el botón
  // "Guardar en Drive" no aparece (el PDF se puede descargar igual).
  GOOGLE_CLIENT_ID: '258846401489-0s3joef8kcmlnabeqdbdc61t8vvbs40r.apps.googleusercontent.com',
  // Cuenta de Google de la iglesia (solo para sugerirla en la ventana de acceso).
  GOOGLE_CUENTA: 'secretariaacyma@gmail.com',
  // Nombre de la carpeta que la aplicación crea en el Drive.
  DRIVE_CARPETA: 'Secretaría - Actas',
  DRIVE_CARPETA_NOTAS: 'Secretaría - Notas',
  DRIVE_CARPETA_INVENTARIO: 'Secretaría - Inventario',
  DRIVE_CARPETA_DOCUMENTOS: 'Secretaría - Documentos',
  DRIVE_CARPETA_INFORMES: 'Secretaría - Informes',

  // ---- Membrete de los PDF (notas, certificados y actas) ----
  IGLESIA_LUGAR: 'Lanús',                          // "Lanús, 7 de octubre de 2026"
  IGLESIA_UBICACION: 'Villa Jardín, Lanús',        // aparece en el membrete
  IGLESIA_EMAIL: 'secretariaacyma@gmail.com',      // aparece en el membrete
};
