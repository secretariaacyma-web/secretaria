-- =====================================================================
-- SECRETARÍA DE IGLESIA — Esquema de base de datos (Supabase / PostgreSQL)
-- Etapa 1 (MVP): personas, miembros, autoridades, reuniones, actas,
-- decisiones, usuarios/roles, auditoría.
--
-- CÓMO USAR: Supabase → SQL Editor → New query → pegar TODO → Run.
-- Es seguro volver a ejecutarlo (usa IF NOT EXISTS / OR REPLACE).
--
-- Principios:
--  * Nada se borra: se archiva (archivado = true). No hay políticas DELETE.
--  * Actas aprobadas quedan bloqueadas por trigger (no solo por la interfaz).
--  * Numeración correlativa asignada por la base (sin duplicados).
--  * Toda alta/modificación queda en audit_log automáticamente.
--  * Todas las tablas llevan iglesia_id: listo para crecer (más módulos
--    o más iglesias) sin rehacer nada.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. IGLESIAS Y USUARIOS
-- ---------------------------------------------------------------------
create table if not exists public.iglesias (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null,
  creado_en  timestamptz not null default now()
);

create table if not exists public.perfiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  iglesia_id  uuid not null references public.iglesias(id),
  nombre      text,
  email       text,
  rol         text not null default 'consulta'
              check (rol in ('administrador','secretario','pastor','comision','consulta')),
  activo      boolean not null default false,
  creado_en   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 2. FUNCIONES AUXILIARES DE PERMISOS
-- ---------------------------------------------------------------------
create or replace function public.mi_iglesia()
returns uuid language sql stable security definer set search_path = public as $$
  select iglesia_id from public.perfiles where id = auth.uid() and activo
$$;

create or replace function public.mi_rol()
returns text language sql stable security definer set search_path = public as $$
  select rol from public.perfiles where id = auth.uid() and activo
$$;

create or replace function public.tiene_rol(variadic roles text[])
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.mi_rol() = any(roles), false)
$$;

-- ---------------------------------------------------------------------
-- 3. PERSONAS (tabla central) Y MIEMBROS
-- ---------------------------------------------------------------------
create table if not exists public.personas (
  id               uuid primary key default gen_random_uuid(),
  iglesia_id       uuid not null references public.iglesias(id),
  nombre           text not null,
  apellido         text not null,
  dni              text,
  fecha_nacimiento date,
  telefono         text,
  email            text,
  direccion        text,
  observaciones    text,
  archivado        boolean not null default false,
  creado_por       uuid references auth.users(id),
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now()
);
create unique index if not exists personas_dni_unico
  on public.personas (iglesia_id, dni) where dni is not null and dni <> '';
create index if not exists personas_nombre_idx on public.personas (iglesia_id, apellido, nombre);

create table if not exists public.miembros (
  id             uuid primary key default gen_random_uuid(),
  iglesia_id     uuid not null references public.iglesias(id),
  persona_id     uuid not null unique references public.personas(id),
  estado         text not null default 'activo'
                 check (estado in ('activo','inactivo','en_proceso','trasladado','baja')),
  fecha_ingreso  date,
  forma_ingreso  text,
  observaciones  text,
  archivado      boolean not null default false,
  creado_por     uuid references auth.users(id),
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists miembros_estado_idx on public.miembros (iglesia_id, estado);

-- Vista con datos NO sensibles (nombre y apellido) para listas desplegables
-- de responsables/asistentes. Se ejecuta con permisos del dueño, filtrada
-- por la iglesia del usuario conectado.
create or replace view public.personas_basico as
  select id, iglesia_id, nombre, apellido, archivado
  from public.personas
  where iglesia_id = public.mi_iglesia();

-- ---------------------------------------------------------------------
-- 4. AUTORIDADES (con historial: fecha_fin = null → cargo vigente)
-- ---------------------------------------------------------------------
create table if not exists public.autoridades (
  id            uuid primary key default gen_random_uuid(),
  iglesia_id    uuid not null references public.iglesias(id),
  persona_id    uuid not null references public.personas(id),
  tipo          text not null check (tipo in ('pastor','comision')),
  cargo         text not null,
  fecha_inicio  date not null,
  fecha_fin     date,
  observaciones text,
  archivado     boolean not null default false,
  creado_por    uuid references auth.users(id),
  creado_en     timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  check (fecha_fin is null or fecha_fin >= fecha_inicio)
);
create index if not exists autoridades_vigentes_idx on public.autoridades (iglesia_id, fecha_fin);

-- ---------------------------------------------------------------------
-- 5. REUNIONES Y ACTAS
-- ---------------------------------------------------------------------
create table if not exists public.reuniones (
  id             uuid primary key default gen_random_uuid(),
  iglesia_id     uuid not null references public.iglesias(id),
  tipo           text not null
                 check (tipo in ('comision','ministerial','pastoral','asamblea','especial')),
  fecha          date not null,
  hora           time,
  lugar          text,
  temas          text,
  responsable_id uuid references public.personas(id),
  estado         text not null default 'programada'
                 check (estado in ('programada','realizada','cancelada')),
  observaciones  text,
  archivado      boolean not null default false,
  creado_por     uuid references auth.users(id),
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists reuniones_fecha_idx on public.reuniones (iglesia_id, fecha);

create table if not exists public.reunion_participantes (
  reunion_id uuid not null references public.reuniones(id),
  persona_id uuid not null references public.personas(id),
  iglesia_id uuid not null references public.iglesias(id),
  primary key (reunion_id, persona_id)
);

create table if not exists public.numeracion (
  iglesia_id uuid not null references public.iglesias(id),
  tipo       text not null,
  ultimo     integer not null default 0,
  primary key (iglesia_id, tipo)
);

create table if not exists public.actas (
  id               uuid primary key default gen_random_uuid(),
  iglesia_id       uuid not null references public.iglesias(id),
  numero           integer not null,
  fecha            date not null,
  hora_inicio      time,
  hora_fin         time,
  lugar            text,
  tipo             text not null
                   check (tipo in ('comision','asamblea','ministerial','extraordinaria','otras')),
  reunion_id       uuid references public.reuniones(id),
  orden_del_dia    text,
  temas_tratados   text,
  observaciones    text,
  estado           text not null default 'borrador'
                   check (estado in ('borrador','aprobada','archivada')),
  aprobada_por     uuid references auth.users(id),
  aprobada_en      timestamptz,
  archivado        boolean not null default false,
  creado_por       uuid references auth.users(id),
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now(),
  unique (iglesia_id, numero)
);
create index if not exists actas_fecha_idx on public.actas (iglesia_id, fecha desc);

create table if not exists public.acta_asistentes (
  acta_id    uuid not null references public.actas(id),
  persona_id uuid not null references public.personas(id),
  iglesia_id uuid not null references public.iglesias(id),
  primary key (acta_id, persona_id)
);

create table if not exists public.acta_firmas (
  id         uuid primary key default gen_random_uuid(),
  acta_id    uuid not null references public.actas(id),
  persona_id uuid not null references public.personas(id),
  iglesia_id uuid not null references public.iglesias(id),
  cargo      text,
  unique (acta_id, persona_id)
);

-- ---------------------------------------------------------------------
-- 6. DECISIONES Y SEGUIMIENTO
-- ---------------------------------------------------------------------
create table if not exists public.decisiones (
  id             uuid primary key default gen_random_uuid(),
  iglesia_id     uuid not null references public.iglesias(id),
  descripcion    text not null,
  fecha          date not null default current_date,
  acta_id        uuid references public.actas(id),
  responsable_id uuid references public.personas(id),
  fecha_limite   date,
  estado         text not null default 'pendiente'
                 check (estado in ('pendiente','en_proceso','completada','cancelada')),
  observaciones  text,
  completada_en  timestamptz,
  archivado      boolean not null default false,
  creado_por     uuid references auth.users(id),
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists decisiones_estado_idx on public.decisiones (iglesia_id, estado, fecha_limite);

-- ---------------------------------------------------------------------
-- 7. AUDITORÍA
-- ---------------------------------------------------------------------
create table if not exists public.audit_log (
  id           bigint generated always as identity primary key,
  iglesia_id   uuid,
  tabla        text not null,
  registro_id  text,
  accion       text not null check (accion in ('INSERT','UPDATE','DELETE')),
  usuario_id   uuid,
  fecha        timestamptz not null default now(),
  antes        jsonb,
  despues      jsonb,
  cambios      text[]
);
create index if not exists audit_registro_idx on public.audit_log (tabla, registro_id, fecha desc);
create index if not exists audit_fecha_idx on public.audit_log (iglesia_id, fecha desc);

create or replace function public.fn_auditar()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_antes jsonb;
  v_despues jsonb;
  v_cambios text[];
  v_id text;
  v_iglesia uuid;
  k text;
begin
  if tg_op = 'INSERT' then
    v_despues := to_jsonb(new);
    v_id := v_despues->>'id';
  elsif tg_op = 'UPDATE' then
    v_antes := to_jsonb(old);
    v_despues := to_jsonb(new);
    v_id := v_despues->>'id';
    for k in select jsonb_object_keys(v_despues) loop
      if k <> 'actualizado_en' and (v_antes->k) is distinct from (v_despues->k) then
        v_cambios := array_append(v_cambios, k);
      end if;
    end loop;
    if v_cambios is null then
      return new; -- sin cambios reales: no se registra
    end if;
  else
    v_antes := to_jsonb(old);
    v_id := v_antes->>'id';
  end if;

  v_iglesia := coalesce((coalesce(v_despues, v_antes))->>'iglesia_id', null)::uuid;

  insert into public.audit_log (iglesia_id, tabla, registro_id, accion, usuario_id, antes, despues, cambios)
  values (v_iglesia, tg_table_name, v_id, tg_op, auth.uid(), v_antes, v_despues, v_cambios);

  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 8. TRIGGERS: datos de control, numeración, protección de actas
-- ---------------------------------------------------------------------
create or replace function public.fn_control_comun()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.creado_por := auth.uid();
    new.iglesia_id := coalesce(new.iglesia_id, public.mi_iglesia());
  else
    new.iglesia_id := old.iglesia_id;      -- no se puede cambiar de iglesia
    new.creado_por := old.creado_por;
    new.creado_en  := old.creado_en;
  end if;
  new.actualizado_en := now();
  return new;
end $$;

create or replace function public.fn_siguiente_numero(p_iglesia uuid, p_tipo text)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  insert into public.numeracion (iglesia_id, tipo, ultimo) values (p_iglesia, p_tipo, 1)
  on conflict (iglesia_id, tipo) do update set ultimo = public.numeracion.ultimo + 1
  returning ultimo into n;
  return n;
end $$;

create or replace function public.fn_acta_numero()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- La iglesia y el número siempre los asigna la base, ignora lo que mande el cliente.
  new.iglesia_id := public.mi_iglesia();
  new.numero := public.fn_siguiente_numero(new.iglesia_id, 'acta');
  new.estado := 'borrador';
  new.aprobada_por := null;
  new.aprobada_en := null;
  return new;
end $$;

create or replace function public.fn_acta_proteger()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Las actas no se pueden eliminar: archivalas.';
  end if;

  new.numero := old.numero;  -- el número nunca cambia

  if old.estado = 'archivada' then
    raise exception 'El acta N° % está archivada y no se puede modificar.', old.numero;
  end if;

  if old.estado = 'aprobada' then
    -- Única modificación permitida: pasar a archivada.
    if new.estado = 'archivada'
       and (to_jsonb(new) - 'estado' - 'archivado' - 'actualizado_en')
         = (to_jsonb(old) - 'estado' - 'archivado' - 'actualizado_en') then
      new.archivado := true;
      return new;
    end if;
    raise exception 'El acta N° % está aprobada y no se puede modificar.', old.numero;
  end if;

  -- old.estado = 'borrador'
  if new.estado = 'aprobada' then
    if not public.tiene_rol('administrador','secretario') then
      raise exception 'Solo el administrador o el secretario pueden aprobar actas.';
    end if;
    new.aprobada_por := auth.uid();
    new.aprobada_en := now();
  elsif new.estado = 'archivada' then
    new.archivado := true;
  else
    new.aprobada_por := null;
    new.aprobada_en := null;
  end if;
  return new;
end $$;

-- Asistentes y firmas de un acta aprobada/archivada quedan congelados.
create or replace function public.fn_acta_hijos_proteger()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_acta uuid; v_estado text;
begin
  v_acta := case when tg_op = 'DELETE' then old.acta_id else new.acta_id end;
  select estado into v_estado from public.actas where id = v_acta;
  if v_estado in ('aprobada','archivada') then
    raise exception 'El acta está % y no admite cambios en asistentes o firmas.', v_estado;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

create or replace function public.fn_decision_estado()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.estado = 'completada' and (tg_op = 'INSERT' or old.estado <> 'completada') then
    new.completada_en := now();
  elsif new.estado <> 'completada' then
    new.completada_en := null;
  end if;
  return new;
end $$;

-- Evita borrar definitivamente: bloquea DELETE en tablas principales.
create or replace function public.fn_bloquear_borrado()
returns trigger language plpgsql as $$
begin
  raise exception 'No se puede eliminar definitivamente: archivá el registro.';
end $$;

-- Instalación de triggers (se recrean para poder re-ejecutar el script)
do $$
declare t text;
begin
  foreach t in array array['personas','miembros','autoridades','reuniones','actas','decisiones'] loop
    execute format('drop trigger if exists trg_control on public.%I', t);
    execute format('create trigger trg_control before insert or update on public.%I
                    for each row execute function public.fn_control_comun()', t);
    execute format('drop trigger if exists trg_auditoria on public.%I', t);
    execute format('create trigger trg_auditoria after insert or update or delete on public.%I
                    for each row execute function public.fn_auditar()', t);
  end loop;

  foreach t in array array['personas','miembros','autoridades','reuniones','decisiones'] loop
    execute format('drop trigger if exists trg_no_borrar on public.%I', t);
    execute format('create trigger trg_no_borrar before delete on public.%I
                    for each row execute function public.fn_bloquear_borrado()', t);
  end loop;
end $$;

drop trigger if exists trg_acta_numero on public.actas;
create trigger trg_acta_numero before insert on public.actas
  for each row execute function public.fn_acta_numero();
-- Nota: los triggers BEFORE se ejecutan en orden alfabético por nombre.
-- trg_acta_numero (a) < trg_acta_proteger (a..p) < trg_control (c).
drop trigger if exists trg_acta_proteger on public.actas;
create trigger trg_acta_proteger before update or delete on public.actas
  for each row execute function public.fn_acta_proteger();

drop trigger if exists trg_acta_asistentes_prot on public.acta_asistentes;
create trigger trg_acta_asistentes_prot before insert or update or delete on public.acta_asistentes
  for each row execute function public.fn_acta_hijos_proteger();
drop trigger if exists trg_acta_firmas_prot on public.acta_firmas;
create trigger trg_acta_firmas_prot before insert or update or delete on public.acta_firmas
  for each row execute function public.fn_acta_hijos_proteger();

drop trigger if exists trg_decision_estado on public.decisiones;
create trigger trg_decision_estado before insert or update on public.decisiones
  for each row execute function public.fn_decision_estado();

-- ---------------------------------------------------------------------
-- 9. ALTA AUTOMÁTICA DE USUARIOS
--    El PRIMER usuario que se registra crea la iglesia y queda como
--    administrador activo. Los siguientes quedan INACTIVOS hasta que un
--    administrador los active (así nadie ajeno puede entrar).
-- ---------------------------------------------------------------------
create or replace function public.fn_nuevo_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_iglesia uuid; v_primero boolean;
begin
  select id into v_iglesia from public.iglesias order by creado_en limit 1;
  v_primero := v_iglesia is null;
  if v_primero then
    insert into public.iglesias (nombre)
    values ('Alianza Cristiana y Misionera Argentina') returning id into v_iglesia;
  end if;

  insert into public.perfiles (id, iglesia_id, nombre, email, rol, activo)
  values (new.id, v_iglesia,
          coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email,'@',1)),
          new.email,
          case when v_primero then 'administrador' else 'consulta' end,
          v_primero);
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.fn_nuevo_usuario();

-- ---------------------------------------------------------------------
-- 10. SEGURIDAD: RLS + PERMISOS POR ROL
--   Lectura de personas/miembros (datos privados): administrador, secretario, pastor.
--   Escritura: administrador y secretario.
--   Actas/reuniones/decisiones: lectura todos los roles activos;
--     escritura administrador y secretario.
--   Comisión puede actualizar el estado de decisiones.
-- ---------------------------------------------------------------------
alter table public.iglesias              enable row level security;
alter table public.perfiles              enable row level security;
alter table public.personas              enable row level security;
alter table public.miembros              enable row level security;
alter table public.autoridades           enable row level security;
alter table public.reuniones             enable row level security;
alter table public.reunion_participantes enable row level security;
alter table public.numeracion            enable row level security;
alter table public.actas                 enable row level security;
alter table public.acta_asistentes       enable row level security;
alter table public.acta_firmas           enable row level security;
alter table public.decisiones            enable row level security;
alter table public.audit_log             enable row level security;

-- helper para recrear políticas
do $$
declare r record;
begin
  for r in select schemaname, tablename, policyname from pg_policies
           where schemaname = 'public'
             and tablename in ('iglesias','perfiles','personas','miembros','autoridades','reuniones',
                               'reunion_participantes','numeracion','actas','acta_asistentes',
                               'acta_firmas','decisiones','audit_log') loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- iglesias / perfiles
create policy iglesias_leer on public.iglesias for select to authenticated
  using (id = public.mi_iglesia());
create policy iglesias_editar on public.iglesias for update to authenticated
  using (id = public.mi_iglesia() and public.tiene_rol('administrador'))
  with check (id = public.mi_iglesia());

create policy perfiles_leer_propio on public.perfiles for select to authenticated
  using (id = auth.uid() or (iglesia_id = public.mi_iglesia() and public.tiene_rol('administrador','secretario')));
create policy perfiles_admin_editar on public.perfiles for update to authenticated
  using (iglesia_id = public.mi_iglesia() and public.tiene_rol('administrador'))
  with check (iglesia_id = public.mi_iglesia());

-- personas y miembros (privados)
create policy personas_leer on public.personas for select to authenticated
  using (iglesia_id = public.mi_iglesia() and public.tiene_rol('administrador','secretario','pastor'));
create policy personas_crear on public.personas for insert to authenticated
  with check (iglesia_id = public.mi_iglesia() and public.tiene_rol('administrador','secretario'));
create policy personas_editar on public.personas for update to authenticated
  using (iglesia_id = public.mi_iglesia() and public.tiene_rol('administrador','secretario'))
  with check (iglesia_id = public.mi_iglesia());

create policy miembros_leer on public.miembros for select to authenticated
  using (iglesia_id = public.mi_iglesia() and public.tiene_rol('administrador','secretario','pastor'));
create policy miembros_crear on public.miembros for insert to authenticated
  with check (iglesia_id = public.mi_iglesia() and public.tiene_rol('administrador','secretario'));
create policy miembros_editar on public.miembros for update to authenticated
  using (iglesia_id = public.mi_iglesia() and public.tiene_rol('administrador','secretario'))
  with check (iglesia_id = public.mi_iglesia());

-- tablas de secretaría: lectura todos, escritura admin/secretario
do $$
declare t text;
begin
  foreach t in array array['autoridades','reuniones','reunion_participantes','actas','acta_asistentes','acta_firmas'] loop
    execute format('create policy %I on public.%I for select to authenticated using (iglesia_id = public.mi_iglesia())', t||'_leer', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (iglesia_id = public.mi_iglesia() and public.tiene_rol(''administrador'',''secretario''))', t||'_crear', t);
  end loop;
  foreach t in array array['autoridades','reuniones','actas'] loop
    execute format('create policy %I on public.%I for update to authenticated using (iglesia_id = public.mi_iglesia() and public.tiene_rol(''administrador'',''secretario'')) with check (iglesia_id = public.mi_iglesia())', t||'_editar', t);
  end loop;
end $$;

-- participantes / asistentes / firmas: se reemplazan al editar un borrador
create policy reunion_participantes_borrar on public.reunion_participantes for delete to authenticated
  using (iglesia_id = public.mi_iglesia() and public.tiene_rol('administrador','secretario'));
create policy acta_asistentes_borrar on public.acta_asistentes for delete to authenticated
  using (iglesia_id = public.mi_iglesia() and public.tiene_rol('administrador','secretario'));
create policy acta_firmas_borrar on public.acta_firmas for delete to authenticated
  using (iglesia_id = public.mi_iglesia() and public.tiene_rol('administrador','secretario'));

-- decisiones
create policy decisiones_leer on public.decisiones for select to authenticated
  using (iglesia_id = public.mi_iglesia());
create policy decisiones_crear on public.decisiones for insert to authenticated
  with check (iglesia_id = public.mi_iglesia() and public.tiene_rol('administrador','secretario'));
create policy decisiones_editar on public.decisiones for update to authenticated
  using (iglesia_id = public.mi_iglesia() and public.tiene_rol('administrador','secretario','comision'))
  with check (iglesia_id = public.mi_iglesia());

-- numeración y auditoría: la numeración solo la toca la base;
-- el historial lo lee administrador/secretario y nadie lo modifica.
create policy audit_leer on public.audit_log for select to authenticated
  using (iglesia_id = public.mi_iglesia() and public.tiene_rol('administrador','secretario'));

-- ---------------------------------------------------------------------
-- 11. PERMISOS DE API (la opción "exponer tablas automáticamente" está
--     desactivada, por eso se otorgan explícitamente y solo lo necesario)
-- ---------------------------------------------------------------------
-- Punto de partida limpio: nadie (ni anon ni authenticated) tiene acceso por
-- defecto; después se otorga solo lo necesario.
revoke all on all tables in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

grant usage on schema public to authenticated;

grant select on public.iglesias, public.perfiles, public.audit_log, public.personas_basico to authenticated;
grant update on public.iglesias, public.perfiles to authenticated;

grant select, insert, update on
  public.personas, public.miembros, public.autoridades, public.reuniones,
  public.actas, public.decisiones to authenticated;

grant select, insert, delete on
  public.reunion_participantes, public.acta_asistentes, public.acta_firmas to authenticated;

grant execute on function public.mi_iglesia(), public.mi_rol(), public.tiene_rol(variadic text[]) to authenticated;

-- Fin del esquema.
