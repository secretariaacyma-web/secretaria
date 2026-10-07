-- =====================================================================
-- MIGRACIÓN 06 — Inventario (bienes, historial de movimientos y préstamos)
-- Ejecutar UNA vez en Supabase → SQL Editor (después de schema.sql y 02 a 05).
-- Se puede volver a ejecutar sin problemas.
--
-- Reglas:
--  * El código (INV-0001, INV-0002...) lo asigna la base y nunca cambia.
--  * Nada se borra: un bien que ya no está se da de BAJA (con motivo) y queda en el archivo.
--  * El historial (movimientos) se completa solo y no se puede modificar ni borrar.
--  * Ven el inventario: administrador, secretario, pastor y comisión.
--    Lo modifican: administrador y secretario.
-- =====================================================================

create table if not exists public.inventario_bienes (
  id                 uuid primary key default gen_random_uuid(),
  iglesia_id         uuid not null references public.iglesias(id),
  codigo             text,                      -- lo asigna la base (INV-0001)
  nombre             text not null check (length(trim(nombre)) > 0),
  descripcion        text,
  categoria          text not null default 'otros',
  cantidad           integer not null default 1 check (cantidad >= 1),
  ubicacion          text not null default 'Salón',
  ubicacion_detalle  text,
  estado             text not null default 'bueno'
                     check (estado in ('bueno','regular','malo','en_reparacion','baja')),
  fecha_adquisicion  date,
  forma_adquisicion  text check (forma_adquisicion in ('compra','donacion','otra')),
  responsable_id     uuid references public.personas(id),
  observaciones      text,
  foto_miniatura     text,                      -- imagen chica (data URL) para mostrar en pantalla e informes
  foto_drive_id      text,                      -- foto original guardada en Drive
  foto_url           text,
  foto_nombre        text,
  baja_fecha         date,
  baja_motivo        text,
  archivado          boolean not null default false,
  creado_por         uuid references auth.users(id),
  creado_en          timestamptz not null default now(),
  actualizado_en     timestamptz not null default now()
);
create unique index if not exists inventario_codigo_uq on public.inventario_bienes (iglesia_id, codigo);
create index if not exists inventario_cat_idx on public.inventario_bienes (iglesia_id, categoria);

create table if not exists public.inventario_prestamos (
  id                         uuid primary key default gen_random_uuid(),
  iglesia_id                 uuid not null references public.iglesias(id),
  bien_id                    uuid not null references public.inventario_bienes(id),
  cantidad                   integer not null default 1 check (cantidad >= 1),
  prestado_a                 text not null check (length(trim(prestado_a)) > 0),
  contacto                   text,
  fecha_prestamo             date not null default current_date,
  fecha_devolucion_prevista  date not null,
  devuelto_en                date,
  obs_devolucion             text,
  observaciones              text,
  creado_por                 uuid references auth.users(id),
  creado_en                  timestamptz not null default now(),
  actualizado_en             timestamptz not null default now(),
  check (fecha_devolucion_prevista >= fecha_prestamo)
);
create index if not exists inv_prestamos_bien_idx on public.inventario_prestamos (bien_id);
create index if not exists inv_prestamos_abiertos_idx on public.inventario_prestamos (iglesia_id) where devuelto_en is null;

create table if not exists public.inventario_movimientos (
  id          uuid primary key default gen_random_uuid(),
  iglesia_id  uuid not null references public.iglesias(id),
  bien_id     uuid not null references public.inventario_bienes(id),
  tipo        text not null check (tipo in ('alta','ubicacion','estado','responsable','prestamo','devolucion','reparacion','baja','reactivacion','nota')),
  fecha       date not null default current_date,
  detalle     text not null,
  creado_por  uuid references auth.users(id),
  creado_en   timestamptz not null default now()
);
create index if not exists inv_mov_bien_idx on public.inventario_movimientos (bien_id, creado_en desc);

-- ---------------------------------------------------------------------
-- Bienes: alta (código automático) y protección
-- ---------------------------------------------------------------------
create or replace function public.fn_bien_alta()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.iglesia_id := public.mi_iglesia();
  new.codigo := 'INV-' || lpad(public.fn_siguiente_numero(new.iglesia_id, 'inventario')::text, 4, '0');
  if new.estado = 'baja' then
    raise exception 'Un bien nuevo no puede nacer dado de baja.';
  end if;
  new.archivado := false;
  new.baja_fecha := null; new.baja_motivo := null;
  return new;
end $$;

create or replace function public.fn_bien_proteger()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_prestado integer;
begin
  if tg_op = 'DELETE' then
    raise exception 'Los bienes no se pueden eliminar: dalos de baja.';
  end if;
  new.codigo := old.codigo;                       -- el código nunca cambia

  if old.estado = 'baja' and new.estado = 'baja' then
    raise exception 'Este bien está dado de baja. Reactivalo si fue un error.';
  end if;

  if new.estado = 'baja' and old.estado <> 'baja' then
    if coalesce(trim(new.baja_motivo), '') = '' then
      raise exception 'Indicá el motivo de la baja.';
    end if;
    if exists (select 1 from public.inventario_prestamos where bien_id = old.id and devuelto_en is null) then
      raise exception 'No se puede dar de baja: tiene un préstamo sin devolver.';
    end if;
    new.baja_fecha := coalesce(new.baja_fecha, current_date);
    new.archivado := true;
  elsif old.estado = 'baja' and new.estado <> 'baja' then   -- reactivación
    new.baja_fecha := null; new.baja_motivo := null;
    new.archivado := false;
  else
    new.baja_fecha := old.baja_fecha; new.baja_motivo := old.baja_motivo;
    new.archivado := false;
  end if;

  select coalesce(sum(cantidad), 0) into v_prestado
  from public.inventario_prestamos where bien_id = old.id and devuelto_en is null;
  if new.cantidad < v_prestado then
    raise exception 'La cantidad no puede ser menor a las unidades prestadas (%).', v_prestado;
  end if;
  return new;
end $$;

-- Historial automático
create or replace function public.fn_bien_historial()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r_ant text; r_nue text;
  et jsonb := '{"bueno":"Bueno","regular":"Regular","malo":"Malo","en_reparacion":"En reparación","baja":"Baja"}';
begin
  if tg_op = 'INSERT' then
    insert into public.inventario_movimientos (iglesia_id, bien_id, tipo, fecha, detalle, creado_por)
    values (new.iglesia_id, new.id, 'alta', current_date,
            'Alta en el inventario (' || new.cantidad || ' u.) en ' || new.ubicacion, auth.uid());
    return new;
  end if;

  if new.ubicacion is distinct from old.ubicacion then
    insert into public.inventario_movimientos (iglesia_id, bien_id, tipo, detalle, creado_por)
    values (new.iglesia_id, new.id, 'ubicacion', 'Ubicación: ' || old.ubicacion || ' → ' || new.ubicacion, auth.uid());
  end if;

  if new.estado is distinct from old.estado and new.estado <> 'baja' and old.estado <> 'baja' then
    insert into public.inventario_movimientos (iglesia_id, bien_id, tipo, detalle, creado_por)
    values (new.iglesia_id, new.id, 'estado', 'Estado: ' || (et->>old.estado) || ' → ' || (et->>new.estado), auth.uid());
  end if;

  if new.responsable_id is distinct from old.responsable_id then
    select trim(apellido || ', ' || nombre) into r_ant from public.personas where id = old.responsable_id;
    select trim(apellido || ', ' || nombre) into r_nue from public.personas where id = new.responsable_id;
    insert into public.inventario_movimientos (iglesia_id, bien_id, tipo, detalle, creado_por)
    values (new.iglesia_id, new.id, 'responsable',
            'Responsable: ' || coalesce(r_ant, 'sin asignar') || ' → ' || coalesce(r_nue, 'sin asignar'), auth.uid());
  end if;

  if new.estado = 'baja' and old.estado <> 'baja' then
    insert into public.inventario_movimientos (iglesia_id, bien_id, tipo, fecha, detalle, creado_por)
    values (new.iglesia_id, new.id, 'baja', new.baja_fecha, 'Dado de baja. Motivo: ' || new.baja_motivo, auth.uid());
  elsif old.estado = 'baja' and new.estado <> 'baja' then
    insert into public.inventario_movimientos (iglesia_id, bien_id, tipo, detalle, creado_por)
    values (new.iglesia_id, new.id, 'reactivacion', 'Reactivado en el inventario (estado: ' || (et->>new.estado) || ')', auth.uid());
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Préstamos
-- ---------------------------------------------------------------------
create or replace function public.fn_prestamo_alta()
returns trigger language plpgsql security definer set search_path = public as $$
declare b public.inventario_bienes; v_prestado integer;
begin
  select * into b from public.inventario_bienes where id = new.bien_id and iglesia_id = public.mi_iglesia();
  if not found then raise exception 'El bien no existe.'; end if;
  if b.estado = 'baja' then raise exception 'No se puede prestar un bien dado de baja.'; end if;
  new.iglesia_id := b.iglesia_id;
  select coalesce(sum(cantidad), 0) into v_prestado
  from public.inventario_prestamos where bien_id = b.id and devuelto_en is null;
  if new.cantidad > b.cantidad - v_prestado then
    raise exception 'Solo quedan % unidad(es) disponibles para prestar.', b.cantidad - v_prestado;
  end if;
  new.devuelto_en := null; new.obs_devolucion := null;
  insert into public.inventario_movimientos (iglesia_id, bien_id, tipo, fecha, detalle, creado_por)
  values (b.iglesia_id, b.id, 'prestamo', new.fecha_prestamo,
          'Prestado a ' || new.prestado_a || ' (' || new.cantidad || ' u.). Devolución prevista: '
          || to_char(new.fecha_devolucion_prevista, 'DD/MM/YYYY'), auth.uid());
  return new;
end $$;

create or replace function public.fn_prestamo_proteger()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Los préstamos no se pueden eliminar.';
  end if;
  if old.devuelto_en is not null then
    raise exception 'Este préstamo ya fue devuelto y no se puede modificar.';
  end if;
  new.bien_id := old.bien_id; new.cantidad := old.cantidad; new.prestado_a := old.prestado_a;
  new.fecha_prestamo := old.fecha_prestamo;
  if new.devuelto_en is not null then
    if new.devuelto_en < old.fecha_prestamo then
      raise exception 'La fecha de devolución no puede ser anterior al préstamo.';
    end if;
    insert into public.inventario_movimientos (iglesia_id, bien_id, tipo, fecha, detalle, creado_por)
    values (old.iglesia_id, old.bien_id, 'devolucion', new.devuelto_en,
            'Devuelto por ' || old.prestado_a || coalesce('. ' || nullif(trim(new.obs_devolucion), ''), ''), auth.uid());
  end if;
  return new;
end $$;

-- Movimientos manuales (reparaciones y notas): solo esos dos tipos; el resto lo registra la base.
create or replace function public.fn_mov_proteger()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('UPDATE','DELETE') then
    raise exception 'El historial no se puede modificar ni borrar.';
  end if;
  -- Inserciones desde la aplicación (no desde otros triggers)
  if pg_trigger_depth() = 1 then
    if new.tipo not in ('reparacion','nota') then
      raise exception 'Ese tipo de movimiento lo registra el sistema automáticamente.';
    end if;
    if not exists (select 1 from public.inventario_bienes where id = new.bien_id and iglesia_id = public.mi_iglesia()) then
      raise exception 'El bien no existe.';
    end if;
    new.iglesia_id := public.mi_iglesia();
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Instalación de triggers
-- ---------------------------------------------------------------------
drop trigger if exists trg_bien_alta on public.inventario_bienes;
create trigger trg_bien_alta before insert on public.inventario_bienes
  for each row execute function public.fn_bien_alta();
drop trigger if exists trg_bien_proteger on public.inventario_bienes;
create trigger trg_bien_proteger before update or delete on public.inventario_bienes
  for each row execute function public.fn_bien_proteger();
drop trigger if exists trg_bien_historial on public.inventario_bienes;
create trigger trg_bien_historial after insert or update on public.inventario_bienes
  for each row execute function public.fn_bien_historial();

drop trigger if exists trg_prestamo_alta on public.inventario_prestamos;
create trigger trg_prestamo_alta before insert on public.inventario_prestamos
  for each row execute function public.fn_prestamo_alta();
drop trigger if exists trg_prestamo_proteger on public.inventario_prestamos;
create trigger trg_prestamo_proteger before update or delete on public.inventario_prestamos
  for each row execute function public.fn_prestamo_proteger();

drop trigger if exists trg_mov_proteger on public.inventario_movimientos;
create trigger trg_mov_proteger before insert or update or delete on public.inventario_movimientos
  for each row execute function public.fn_mov_proteger();

do $$
declare t text;
begin
  foreach t in array array['inventario_bienes','inventario_prestamos'] loop
    execute format('drop trigger if exists trg_control on public.%I', t);
    execute format('create trigger trg_control before insert or update on public.%I
                    for each row execute function public.fn_control_comun()', t);
    execute format('drop trigger if exists trg_auditoria on public.%I', t);
    execute format('create trigger trg_auditoria after insert or update or delete on public.%I
                    for each row execute function public.fn_auditar()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Seguridad (RLS)
-- ---------------------------------------------------------------------
alter table public.inventario_bienes      enable row level security;
alter table public.inventario_prestamos   enable row level security;
alter table public.inventario_movimientos enable row level security;

drop policy if exists inv_bienes_leer   on public.inventario_bienes;
drop policy if exists inv_bienes_crear  on public.inventario_bienes;
drop policy if exists inv_bienes_editar on public.inventario_bienes;
create policy inv_bienes_leer on public.inventario_bienes for select to authenticated
  using (iglesia_id = public.mi_iglesia() and public.tiene_rol('administrador','secretario','pastor','comision'));
create policy inv_bienes_crear on public.inventario_bienes for insert to authenticated
  with check (iglesia_id = public.mi_iglesia() and public.tiene_rol('administrador','secretario'));
create policy inv_bienes_editar on public.inventario_bienes for update to authenticated
  using (iglesia_id = public.mi_iglesia() and public.tiene_rol('administrador','secretario'))
  with check (iglesia_id = public.mi_iglesia());

drop policy if exists inv_prestamos_leer   on public.inventario_prestamos;
drop policy if exists inv_prestamos_crear  on public.inventario_prestamos;
drop policy if exists inv_prestamos_editar on public.inventario_prestamos;
create policy inv_prestamos_leer on public.inventario_prestamos for select to authenticated
  using (iglesia_id = public.mi_iglesia() and public.tiene_rol('administrador','secretario','pastor','comision'));
create policy inv_prestamos_crear on public.inventario_prestamos for insert to authenticated
  with check (iglesia_id = public.mi_iglesia() and public.tiene_rol('administrador','secretario'));
create policy inv_prestamos_editar on public.inventario_prestamos for update to authenticated
  using (iglesia_id = public.mi_iglesia() and public.tiene_rol('administrador','secretario'))
  with check (iglesia_id = public.mi_iglesia());

drop policy if exists inv_mov_leer  on public.inventario_movimientos;
drop policy if exists inv_mov_crear on public.inventario_movimientos;
create policy inv_mov_leer on public.inventario_movimientos for select to authenticated
  using (iglesia_id = public.mi_iglesia() and public.tiene_rol('administrador','secretario','pastor','comision'));
create policy inv_mov_crear on public.inventario_movimientos for insert to authenticated
  with check (public.tiene_rol('administrador','secretario'));

revoke all on public.inventario_bienes, public.inventario_prestamos, public.inventario_movimientos from anon, authenticated;
grant select, insert, update on public.inventario_bienes, public.inventario_prestamos to authenticated;
grant select, insert on public.inventario_movimientos to authenticated;

-- Las fotos guardadas en Drive también se registran en archivos_drive.
do $$
begin
  if to_regclass('public.archivos_drive') is not null then
    alter table public.archivos_drive add column if not exists bien_id uuid references public.inventario_bienes(id);
    create index if not exists archivos_drive_bien_idx on public.archivos_drive (bien_id);
  end if;
end $$;
