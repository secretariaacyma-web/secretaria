# Secretaría de la iglesia — Etapa 1 (MVP)

Plataforma web para la Secretaría: **Inicio, Actas, Miembros, Autoridades, Reuniones, Decisiones, Calendario y Configuración** (usuarios, copia de seguridad, actividad).
Notas, Documentos, Inventario e Informes aparecen en el menú como "pronto" (Etapas 2 y 3).

- **Base de datos:** Supabase (PostgreSQL) — ya creada: `secretaria-acma`.
- **Aplicación:** archivos HTML/CSS/JS sin instalación, para publicar en GitHub Pages.

---

## Puesta en marcha (una sola vez)

### 1. Crear las tablas y la seguridad
1. En Supabase, abrí el proyecto → **SQL Editor** → **New query**.
2. Abrí el archivo `supabase/schema.sql`, copiá **todo** el contenido, pegalo y tocá **Run**.
3. Debe terminar con "Success". Se puede volver a ejecutar sin romper nada.
4. Después, en consultas nuevas (una por archivo), ejecutá también `supabase/02-archivos-drive.sql` (copias PDF en Drive) y `supabase/03-calendario.sql` (calendario y actividades fijas).

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

## PDF de las actas y copias en Drive

En cada acta hay estos botones:
- **⬇ PDF:** descarga el acta como PDF real (texto seleccionable, varias páginas, firmas y numeración). Funciona siempre, sin configurar nada.
- **☁ Guardar en Drive:** genera el PDF y lo guarda en el Drive de la iglesia, en la carpeta **"Secretaría - Actas"**, y deja el enlace registrado en el acta ("Copias en Drive"). Al **aprobar** un acta, el sistema ofrece guardarla en Drive en ese momento.
- **🖨 Imprimir** y **⬇ Word** siguen disponibles.

### Guardar en Drive: configuración (una sola vez)
Hace falta autorizar la aplicación en Google. Usá la cuenta de la iglesia.
1. Entrá a **console.cloud.google.com** y creá un proyecto (por ejemplo `Secretaria`).
2. **APIs y servicios → Biblioteca** → buscá **Google Drive API** → **Habilitar**.
3. **APIs y servicios → Pantalla de consentimiento de OAuth** (en versiones nuevas: *Google Auth Platform*):
   - Tipo de usuario: **Externo**. Nombre de la app: `Secretaría`. Correo de asistencia: el de la iglesia.
   - En **Ámbitos / Acceso a datos**, agregá `.../auth/drive.file`.
   - En **Usuarios de prueba**, agregá el correo de la iglesia (y de quienes vayan a guardar copias).
4. **Credenciales → Crear credenciales → ID de cliente de OAuth → Aplicación web**:
   - **Orígenes autorizados de JavaScript:** `https://secretariaacyma-web.github.io` (sin barra final ni ruta).
   - Crear y copiar el **ID de cliente** (termina en `.apps.googleusercontent.com`).
5. En GitHub, abrí `js/config.js`, pegá el ID entre las comillas de `GOOGLE_CLIENT_ID` y confirmá el cambio (*Commit changes*).

La primera vez que toques **Guardar en Drive**, Google abre una ventana para autorizar; después, durante esa sesión, se guarda sin volver a preguntar.
**Privacidad:** la aplicación usa el permiso mínimo (`drive.file`): solo puede ver y modificar la carpeta y los archivos que ella misma creó. No puede leer el resto del Drive.

---

## Calendario
- **Vista mensual** (en el celular, cada día muestra puntos de color; tocá el día para ver el detalle) y **lista de los próximos 60 días**. Filtro por categoría.
- **Las reuniones** cargadas en *Reuniones* aparecen solas.
- **Actividades fijas semanales** (botón *Actividades fijas*): vienen cargados Culto general (domingo 10:30), Reunión general (miércoles 19:00), Reunión de oración (jueves 18:30), Estudio bíblico (jueves 19:00) y Reunión de jóvenes (sábado 19:00). Se pueden editar, pausar o agregar.
- **Fechas especiales:** tocá una actividad en un día puntual → *Marcar como Santa Cena* (domingo 10:00 en lugar del culto general), *Cambiar solo esta fecha* o *Cancelar esta fecha*. Las demás semanas no cambian, y *Volver al horario normal* deshace el cambio.
- **Agenda pastoral / privados:** al crear un evento podés tildar *Privado*; solo lo ven administrador, secretario y pastor.
- En **Inicio** aparece la agenda de los próximos 7 días.

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
  pdf.js            generador de PDF de actas (sin librerías externas)
  drive.js          guardado de copias en Google Drive
  modules/          un archivo por módulo (actas, miembros, ...)
supabase/schema.sql tablas, relaciones, permisos, auditoría
supabase/02-archivos-drive.sql  registro de copias PDF en Drive
supabase/03-calendario.sql      eventos y actividades fijas del calendario
```

**Modelo de datos (resumen):** `personas` es la tabla central. De ella cuelgan `miembros`, `autoridades`, los participantes de `reuniones`, los asistentes y firmantes de `actas` y los responsables de `decisiones`. Todo lleva `iglesia_id`, así que más adelante se pueden sumar Finanzas, Ministerios, Asistencia, etc. como tablas nuevas que apuntan a `personas`, sin tocar lo ya cargado.

## Hoja de ruta
- **Etapa 2:** Calendario ✔. Siguen: Notas (con plantillas y PDF) y Documentos (archivos en el Drive).
- **Etapa 3:** Inventario, Informes (mensual en PDF), Búsqueda global.
- **Después:** Finanzas, ministerios, notificaciones, etc.

## Seguridad: qué es público y qué no
`js/config.js` contiene la **URL** y la clave **publishable** de Supabase. Son públicas por diseño y es normal que estén en el código. **Nunca** pegues ahí la clave `secret` o `service_role`.
