# Secretaría de la iglesia — Etapa 1 (MVP)

Plataforma web para la Secretaría: **Inicio, Actas, Miembros, Autoridades, Reuniones, Decisiones, Calendario, Notas y Configuración** (usuarios, copia de seguridad, actividad).
Documentos, Inventario e Informes aparecen en el menú como "pronto" (Etapas 2 y 3).

- **Base de datos:** Supabase (PostgreSQL) — ya creada: `secretaria-acma`.
- **Aplicación:** archivos HTML/CSS/JS sin instalación, para publicar en GitHub Pages.

---

## Puesta en marcha (una sola vez)

### 1. Crear las tablas y la seguridad
1. En Supabase, abrí el proyecto → **SQL Editor** → **New query**.
2. Abrí el archivo `supabase/schema.sql`, copiá **todo** el contenido, pegalo y tocá **Run**.
3. Debe terminar con "Success". Se puede volver a ejecutar sin romper nada.
4. Después, en consultas nuevas (una por archivo), ejecutá también `supabase/02-archivos-drive.sql` (copias PDF en Drive) `supabase/03-calendario.sql` (calendario y actividades fijas) `supabase/04-notas.sql` (notas y certificados), `supabase/05-notas-restaurar.sql` (restaurar notas archivadas) `supabase/06-inventario.sql` (inventario) y `supabase/07-documentos.sql` (documentos).

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

## Notas y certificados
- **Modelos:** nota general, carta de recomendación, constancia de membresía, convocatoria a reunión o asamblea, y certificados de bautismo, matrimonio y presentación de niños.
- Se completan los datos y el texto se arma solo (se puede corregir a mano). Si elegís un miembro de la lista, completa nombre y DNI.
- **Borrador → Emitir:** el número se asigna al emitir (Nota N° 1/2026, vuelve a 1 cada año). Cada certificado tiene su propia numeración por año. Una vez emitida queda **protegida**: si hay un error se archiva y se redacta otra.
- **PDF con membrete** (logo, Secretaría, ubicación y correo) y firmas tomadas de *Autoridades* (Pastor y Secretario/a). Con **Guardar en Drive** se guarda en la carpeta "Secretaría - Notas".
- Los datos del membrete (ubicación, correo, lugar de las notas) se cambian en `js/config.js`. El nombre de la iglesia que aparece en los textos se cambia en *Configuración → Datos de la iglesia*.
- Lo ven y manejan administrador y secretario; el pastor solo las ve.
- **Archivadas por error:** abrí la nota y tocá **Restaurar** (un borrador descartado vuelve a ser borrador; una nota emitida vuelve a quedar emitida con el mismo número). **Duplicar** crea un borrador nuevo a partir de otra nota.

## Inventario
- **Bienes** con código automático (INV-0001...), nombre, descripción, categoría (sonido y multimedia, instrumentos, mobiliario, electrodomésticos, cocina, limpieza, otros), cantidad, ubicación (salón, cabina del sonido, patio, baños, otros), estado, responsable, forma y fecha de adquisición y observaciones.
- **Foto:** se elige desde la aplicación (en el celular, cámara o galería). Se achica, se guarda en el Drive de la iglesia, carpeta **"Secretaría - Inventario"**, con un nombre que se puede buscar, por ejemplo `INV-0007 - Parlante JBL (Sonido y multimedia) - Salón.jpg`, y una miniatura queda en la aplicación para verla e imprimirla en los informes.
- **Préstamos** con fecha de devolución prevista: se ve quién tiene qué, cuántas unidades, y si está **vencido**. En *Inicio* aparece el aviso de préstamos vencidos. Se registra la devolución con observaciones.
- **Historial automático** de cada bien: alta, cambios de ubicación, estado y responsable, préstamos, devoluciones, bajas; más reparaciones y notas que se anotan a mano. No se puede modificar ni borrar.
- **Baja:** un bien nunca se borra; se da de baja con motivo y fecha (y se puede reactivar). No se puede dar de baja con un préstamo sin devolver.
- **Informes:** PDF del inventario (resumen, agrupado por ubicación o categoría, préstamos vigentes; respeta los filtros), **ficha PDF** de cada bien con foto e historial, y exportación a **Excel**.
- Lo ven administrador, secretario, pastor y comisión; lo modifican administrador y secretario.

## Documentos
- **Subir documento:** PDF, fotos, Word, Excel… (hasta 50 MB). Se guarda en el Drive de la iglesia, carpeta **"Secretaría - Documentos"**, en una subcarpeta según la categoría, con un nombre que se puede buscar, por ejemplo `2026-03-15 - Seguros y habilitaciones - Seguro del templo.pdf`. Las fotos pesadas se achican solas.
- **Categorías:** Estatutos y reglamentos, Actas escaneadas, Legales y contratos, Seguros y habilitaciones, Facturas y comprobantes, Planos e inmuebles, Fotos y eventos, Otros.
- **Etiquetas, descripción y buscador** (título, descripción, etiquetas), con filtros por categoría, año y vencimiento.
- **Vencimientos:** al cargar un documento se puede indicar cuándo vence (seguros, habilitaciones, contratos). Se marca *vencido* o *vence en N días* y en *Inicio* aparece el aviso 30 días antes.
- **Restringido:** al cargar o editar un documento se puede tildar *Restringido*; entonces solo lo ven administrador, secretario y pastor (la comisión no).
- **Enlaces:** para videos o archivos muy pesados, subilos a YouTube (como *no listado*) o al Drive a mano y registralos con **Agregar enlace**: quedan con categoría, etiquetas y buscador como cualquier otro documento.
- **Copias automáticas:** una pestaña lista las actas, notas, certificados y fotos de inventario que la plataforma guardó en el Drive.
- El archivo subido no se reemplaza: si hay que cambiarlo se archiva el documento y se sube uno nuevo. Nada se borra; *Archivar* se deshace con *Restaurar*.
- Lo ven administrador, secretario, pastor y comisión; lo modifican administrador y secretario.

## Informes
- Informe de Secretaría para reuniones y asambleas, con el logo. Se elige el **período** (mensual, trimestral, anual o entre fechas) y los **apartados**: actas, reuniones, decisiones y seguimiento, notas y certificados, miembros, inventario, documentos y eventos especiales.
- Se arma una **vista previa** en pantalla con cifras y detalle; después se descarga el **PDF** o se guarda una copia en el Drive (carpeta "Secretaría - Informes").
- Se puede agregar un texto propio en *Observaciones* y las líneas de firma (Secretario/a y Pastor, tomados de *Autoridades*).
- Los informes se arman con los datos ya cargados: nada nuevo que instalar en la base de datos. Las cifras de "a hoy" (decisiones vencidas, préstamos vencidos, estado de miembros) muestran la situación del día en que se genera el informe. Los eventos privados no se incluyen.
- Lo generan administrador, secretario y pastor.

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
supabase/04-notas.sql           notas y certificados con numeración por año
supabase/05-notas-restaurar.sql restaurar notas archivadas por error
supabase/06-inventario.sql      bienes, historial y préstamos del inventario
supabase/07-documentos.sql      documentos, vencimientos y enlaces
js/logo.js, js/notas-modelos.js logo del membrete y modelos de texto
js/imagen.js                    achica las fotos antes de guardarlas
```

**Modelo de datos (resumen):** `personas` es la tabla central. De ella cuelgan `miembros`, `autoridades`, los participantes de `reuniones`, los asistentes y firmantes de `actas` y los responsables de `decisiones`. Todo lleva `iglesia_id`, así que más adelante se pueden sumar Finanzas, Ministerios, Asistencia, etc. como tablas nuevas que apuntan a `personas`, sin tocar lo ya cargado.

## Hoja de ruta
- **Etapa 2:** Calendario ✔, Notas ✔, Inventario ✔ y Documentos ✔.
- **Etapa 3:** Informes ✔. Sigue: Búsqueda global.
- **Después:** Finanzas, ministerios, notificaciones, etc.

## Seguridad: qué es público y qué no
`js/config.js` contiene la **URL** y la clave **publishable** de Supabase. Son públicas por diseño y es normal que estén en el código. **Nunca** pegues ahí la clave `secret` o `service_role`.
