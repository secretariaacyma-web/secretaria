-- =====================================================================
-- MIGRACIÓN 08 — Tesorería (libro de caja, aportes y planilla mensual ACMA)
-- Ejecutar UNA vez en Supabase → SQL Editor (después de schema.sql y 02 a 07).
-- Se puede volver a ejecutar sin problemas.
--
-- Reglas:
--  * Nuevo rol "tesorero": ve y carga SOLO Tesorería (además de lo básico de lectura).
--  * Ven y modifican Tesorería: administrador y tesorero. Nadie más.
--  * Nada se borra: un movimiento equivocado se ANULA (queda el historial y el motivo).
--  * Los porcentajes (pastor / distrito / central) se guardan con "vigente desde" para que
--    cambiarlos no altere los meses ya cerrados.
-- =====================================================================

-- 1) Rol "tesorero" ---------------------------------------------------
do $$
declare c record;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.perfiles'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) ilike '%administrador%' loop
    execute format('alter table public.perfiles drop constraint %I', c.conname);
  end loop;
  alter table public.perfiles add constraint perfiles_rol_check
    check (rol in ('administrador','secretario','pastor','comision','consulta','tesorero'));
end $$;

-- 2) Datos para la planilla ---------------------------------------------
create table if not exists public.tesoreria_config (
  id               uuid primary key default gen_random_uuid(),
  iglesia_id       uuid not null unique references public.iglesias(id),
  nombre_planilla  text,
  distrito         text,
  tesorero_nombre  text,
  tesorero_tel     text,
  tesorero_email   text,
  pastor_nombre    text,
  revisor_nombre   text,
  creado_por       uuid references auth.users(id),
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now()
);

-- 3) Porcentajes con vigencia ---------------------------------------------
create table if not exists public.tesoreria_porcentajes (
  id               uuid primary key default gen_random_uuid(),
  iglesia_id       uuid not null references public.iglesias(id),
  vigente_desde    date not null check (extract(day from vigente_desde) = 1),
  pastor           numeric(5,2) not null check (pastor   between 0 and 100),
  distrito         numeric(5,2) not null check (distrito between 0 and 100),
  central          numeric(5,2) not null check (central  between 0 and 100),
  creado_por       uuid references auth.users(id),
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now(),
  check (pastor + distrito + central <= 100),
  unique (iglesia_id, vigente_desde)
);

-- 4) Movimientos ----------------------------------------------------------
create table if not exists public.tesoreria_movimientos (
  id               uuid primary key default gen_random_uuid(),
  iglesia_id       uuid not null references public.iglesias(id),
  fecha            date not null,
  tipo             text not null check (tipo in ('ingreso','egreso')),
  categoria        text check (categoria in ('culto_general','otros')),   -- solo ingresos
  rubro            smallint check (rubro between 1 and 10),                -- solo egresos (rubros de la planilla)
  descripcion      text,
  monto            numeric(14,2) not null check (monto > 0),
  sin_pastor       boolean not null default false,   -- ingreso de culto sin aporte al pastor
  comprobante      text,
  anulado          boolean not null default false,
  motivo_anulacion text,
  origen_id        text,                              -- id del sistema anterior (importación)
  creado_por       uuid references auth.users(id),
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now(),
  check ((tipo = 'ingreso' and categoria is not null and rubro is null)
      or (tipo = 'egreso'  and rubro is not null and categoria is null)),
  check (not sin_pastor or (tipo = 'ingreso' and categoria = 'culto_general')),
  check (not anulado or length(trim(coalesce(motivo_anulacion, ''))) > 0)
);
create index if not exists tes_mov_fecha_idx on public.tesoreria_movimientos (iglesia_id, fecha);
create unique index if not exists tes_mov_origen_uq on public.tesoreria_movimientos (iglesia_id, origen_id);

create or replace function public.fn_tes_mov_proteger()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Los movimientos no se pueden eliminar: anulalos.';
  end if;
  if tg_op = 'UPDATE' then
    if old.anulado and new.anulado then
      raise exception 'Este movimiento está anulado. Restauralo para modificarlo.';
    end if;
    if old.anulado and not new.anulado then
      if (to_jsonb(new) - 'anulado' - 'motivo_anulacion' - 'actualizado_en')
         is distinct from (to_jsonb(old) - 'anulado' - 'motivo_anulacion' - 'actualizado_en') then
        raise exception 'Al restaurar un movimiento no se puede modificar su contenido.';
      end if;
      new.motivo_anulacion := null;
    end if;
    if not old.anulado and new.anulado then
      if (to_jsonb(new) - 'anulado' - 'motivo_anulacion' - 'actualizado_en')
         is distinct from (to_jsonb(old) - 'anulado' - 'motivo_anulacion' - 'actualizado_en') then
        raise exception 'Al anular un movimiento no se puede modificar su contenido.';
      end if;
    end if;
    new.origen_id := old.origen_id;
  end if;
  return new;
end $$;

drop trigger if exists trg_tes_mov_proteger on public.tesoreria_movimientos;
create trigger trg_tes_mov_proteger before update or delete on public.tesoreria_movimientos
  for each row execute function public.fn_tes_mov_proteger();

-- 5) Datos propios de cada planilla mensual -------------------------------
create table if not exists public.tesoreria_planillas (
  id               uuid primary key default gen_random_uuid(),
  iglesia_id       uuid not null references public.iglesias(id),
  mes              date not null check (extract(day from mes) = 1),
  f_ministerios    numeric(14,2) not null default 0 check (f_ministerios >= 0),   -- F: aporte a ministerios nacionales
  g_otros          numeric(14,2) not null default 0 check (g_otros >= 0),         -- G: otros aportes (además del distrito)
  ret_jubilados    numeric(14,2) not null default 0 check (ret_jubilados >= 0),   -- I
  ret_alquileres   numeric(14,2) not null default 0 check (ret_alquileres >= 0),  -- II
  ret_otros        numeric(14,2) not null default 0 check (ret_otros >= 0),       -- III
  rem_fecha        date,
  rem_efectivo     numeric(14,2) not null default 0 check (rem_efectivo >= 0),
  rem_deposito     numeric(14,2) not null default 0 check (rem_deposito >= 0),
  rem_deposito_fecha date,
  rem_cheque       numeric(14,2) not null default 0 check (rem_cheque >= 0),
  rem_cheque_banco text,
  rem_cheque_nro   text,
  rem_giro         numeric(14,2) not null default 0 check (rem_giro >= 0),
  rem_giro_nro     text,
  rem_giro_fecha   date,
  observaciones    text,
  creado_por       uuid references auth.users(id),
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now(),
  unique (iglesia_id, mes)
);

-- 6) Control común, auditoría y bloqueo de borrado ------------------------
do $$
declare t text;
begin
  foreach t in array array['tesoreria_config','tesoreria_porcentajes','tesoreria_movimientos','tesoreria_planillas'] loop
    execute format('drop trigger if exists trg_control on public.%I', t);
    execute format('create trigger trg_control before insert or update on public.%I
                    for each row execute function public.fn_control_comun()', t);
    execute format('drop trigger if exists trg_auditoria on public.%I', t);
    execute format('create trigger trg_auditoria after insert or update or delete on public.%I
                    for each row execute function public.fn_auditar()', t);
  end loop;
  foreach t in array array['tesoreria_config','tesoreria_porcentajes','tesoreria_planillas'] loop
    execute format('drop trigger if exists trg_no_borrar on public.%I', t);
    execute format('create trigger trg_no_borrar before delete on public.%I
                    for each row execute function public.fn_bloquear_borrado()', t);
  end loop;
end $$;

-- 7) Seguridad: solo administrador y tesorero --------------------------------
do $$
declare t text; p text;
begin
  foreach t in array array['tesoreria_config','tesoreria_porcentajes','tesoreria_movimientos','tesoreria_planillas'] loop
    execute format('alter table public.%I enable row level security', t);
    foreach p in array array['leer','crear','editar'] loop
      execute format('drop policy if exists %I on public.%I', t || '_' || p, t);
    end loop;
    execute format($f$create policy %I on public.%I for select to authenticated
      using (iglesia_id = public.mi_iglesia() and public.tiene_rol('administrador','tesorero'))$f$, t || '_leer', t);
    execute format($f$create policy %I on public.%I for insert to authenticated
      with check (iglesia_id = public.mi_iglesia() and public.tiene_rol('administrador','tesorero'))$f$, t || '_crear', t);
    execute format($f$create policy %I on public.%I for update to authenticated
      using (iglesia_id = public.mi_iglesia() and public.tiene_rol('administrador','tesorero'))
      with check (iglesia_id = public.mi_iglesia())$f$, t || '_editar', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
  end loop;
end $$;

-- 8) Porcentajes iniciales (40 % pastor, 2 % distrito, 10 % central) ----------
insert into public.tesoreria_porcentajes (iglesia_id, vigente_desde, pastor, distrito, central)
select i.id, date '2000-01-01', 40, 2, 10 from public.iglesias i
where not exists (select 1 from public.tesoreria_porcentajes p where p.iglesia_id = i.id);
