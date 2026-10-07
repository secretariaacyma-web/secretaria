# Secretaría de la iglesia — Etapa 1 (MVP)

Plataforma web para la Secretaría: **Inicio, Actas, Miembros, Autoridades, Reuniones, Decisiones y Configuración** (usuarios, copia de seguridad, actividad).
Notas, Calendario, Documentos, Inventario e Informes aparecen en el menú como "pronto" (Etapas 2 y 3).

- **Base de datos:** Supabase (PostgreSQL) — ya creada: `secretaria-acma`.
- **Aplicación:** archivos HTML/CSS/JS sin instalación, para publicar en GitHub Pages.

---

## Puesta en marcha (una sola vez)

### 1. Crear las tablas y la seguridad
1. En Supabase, abrí el proyecto → **SQL Editor** → **New query**.
2. Abrí el archivo `supabase/schema.sql`, copiá **todo** el contenido, pegalo y tocá **Run**.
3. Debe terminar con "Success". Se puede volver a ejecutar sin romper nada.

### 2. Cerrar el registro público
**Authentication → Sign In / Providers** (o *Providers → Email*) → desactivá **Allow new users to sign up**.
Así nadie ajeno puede crearse una cuenta; los usuarios los das de alta vos.

### 3. Crear tu usuario administrador
**Authentication → Users → Add user → Create new user**:
- Email: el de la iglesia (o el tuyo).
- Contraseña: una fuerte.
- Tildá **Auto Confirm User**.

El **primer usuario** que se crea después de ejecutar el esquema queda automáticamente como **Administrador** y se crea la iglesia.

### 4. Publicar la aplicación
1. En GitHub creá un repositorio (por ejemplo `secretaria`) y subí **todo el contenido** de esta carpeta, manteniendo las carpetas (`index.html`, `css/`, `js/`, `supabase/`).
   - Desde la computadora: **Add file → Upload files** y arrastrá las carpetas.
2. **Settings → Pages → Branch: main / (root) → Save**.
3. En unos minutos queda en `https://TU-USUARIO.github.io/secretaria/`.

> No se abre haciendo doble clic en `index.html`: los navegadores bloquean los módulos en archivos locales. Tiene que estar publicada (o probarla con un servidor local).

### 5. Ingresar
Abrí la dirección, entrá con el usuario del paso 3 y listo.

---

## Cómo se manejan los usuarios
1. Creá el usuario en **Supabase → Authentication → Users → Add user** (con *Auto Confirm User*).
2. Entrá a **Configuración → Usuarios y permisos** de la aplicación. Ahí aparece como *Pendiente*: asignale el **rol** y tildá **Acceso**.

| Rol | Qué puede hacer |
|---|---|
| Administrador | Todo, incluida la gestión de usuarios |
| Secretario/a | Todo lo de Secretaría (crear, editar, aprobar actas, copias de seguridad) |
| Pastor | Ve miembros, actas, reuniones, decisiones y autoridades (solo lectura) |
| Comisión | Ve actas, reuniones, decisiones y autoridades; puede cambiar el estado de decisiones. **No ve datos personales de miembros** |
| Consulta | Solo lectura de actas, reuniones, decisiones y autoridades |

Estos permisos los hace cumplir **la base de datos**, no solo la pantalla.

---

## Reglas de protección ya incluidas
- **Actas aprobadas bloqueadas:** no se pueden modificar (solo archivar). Lo impone la base.
- **Número de acta automático** y correlativo, sin repetidos.
- **Nada se borra definitivamente:** se *archiva*. La base rechaza los borrados.
- **Auditoría automática:** quién creó, modificó o aprobó cada registro y qué campos cambió (botón *Historial* en actas y miembros, y *Actividad reciente* en Configuración).
- **DNI sin repetir** dentro de la iglesia.

## Copias de seguridad
El plan gratuito de Supabase **no hace backups automáticos**. Por eso:
- **Configuración → Copia de seguridad → Exportar todo** descarga un archivo `.json` con todos los datos. Hacelo una vez por mes y guardalo en el Drive de la iglesia.
- El sistema te avisa cuando pasaron más de 30 días.
- El plan pago de Supabase agrega backups diarios automáticos (si más adelante lo necesitás).
- Un proyecto gratuito se **pausa tras una semana sin uso**: se reactiva desde el panel de Supabase sin perder datos.

---

## Estructura

```
index.html
css/styles.css
js/
  app.js            sesión, menú y navegación
  config.js         URL y clave pública de Supabase
  supabase.js       conexión
  state.js          sesión y datos compartidos
  constantes.js     etiquetas, estados y menú
  ui.js             formularios, ventanas, tablas, descargas
  modules/          un archivo por módulo (actas, miembros, ...)
supabase/schema.sql tablas, relaciones, permisos, auditoría
```

**Modelo de datos (resumen):** `personas` es la tabla central. De ella cuelgan `miembros`, `autoridades`, los participantes de `reuniones`, los asistentes y firmantes de `actas` y los responsables de `decisiones`. Todo lleva `iglesia_id`, así que más adelante se pueden sumar Finanzas, Ministerios, Asistencia, etc. como tablas nuevas que apuntan a `personas`, sin tocar lo ya cargado.

## Hoja de ruta
- **Etapa 2:** Notas (con plantillas y PDF), Calendario, Documentos (enlaces a archivos del Drive).
- **Etapa 3:** Inventario, Informes (mensual en PDF), Búsqueda global.
- **Después:** Finanzas, ministerios, notificaciones, etc.

## Seguridad: qué es público y qué no
`js/config.js` contiene la **URL** y la clave **publishable** de Supabase. Son públicas por diseño y es normal que estén en el código. **Nunca** pegues ahí la clave `secret` o `service_role`.
