-- =====================================================================
-- MIGRACIÓN 07 — Documentos (archivo digital con categorías, vencimientos y enlaces)
-- Ejecutar UNA vez en Supabase → SQL Editor (después de schema.sql y 02 a 06).
-- Se puede volver a ejecutar sin problemas.
--
-- Reglas:
--  * El archivo en sí vive en el Drive de la iglesia; acá se guarda el registro y el enlace.
--  * También se pueden registrar solo enlaces (por ejemplo videos en YouTube o Drive).
--  * Un documento "restringido" solo lo ven administrador, secretario y pastor.
--  * Nada se borra: se archiva. El archivo o enlace de un documento archivado no se toca.
--  * Ven documentos: administrador, secretario, pastor y comisión. Los modifican: administrador y secretario.
-- =====================================================================

create table if not exists public.documentos (
  id               uuid primary key default gen_random_uuid(),
  iglesia_id       uuid not null references public.iglesias(id),
  titulo           text not null check (length(trim(titulo)) > 0),
  categoria        text not null check (length(trim(categoria)) > 0),
  fecha_documento  date not null default current_date,
  descripcion      text,
  etiquetas        text[] not null default '{}',
  origen           text not null default 'archivo' check (origen in ('archivo','enlace')),
  url              text not null check (url ~* '^https?://'),
  drive_id         text,
  nombre_archivo   text,
  mime             text,
  tamano           bigint,
  vence_el         date,
  restringido      boolean not null default false,
  archivado        boolean not null default false,
  creado_por       uuid references auth.users(id),
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now()
);
create index if not exists documentos_cat_idx on public.documentos (iglesia_id, categoria);
create index if not exists documentos_fecha_idx on public.documentos (iglesia_id, fecha_documento desc);
create index if not exists documentos_vence_idx on public.documentos (iglesia_id, vence_el) where vence_el is not null;

create or replace function public.fn_documento_alta()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.iglesia_id := public.mi_iglesia();
  new.archivado := false;
  if new.origen = 'enlace' then
    new.drive_id := null; new.nombre_archivo := null; new.mime := null; new.tamano := null;
  end if;
  return new;
end $$;

create or replace function public.fn_documento_proteger()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Los documentos no se pueden eliminar: archivalos.';
  end if;
  -- El archivo subido no se reemplaza: si hace falta otro, se archiva este y se sube uno nuevo.
  new.origen := old.origen;
  if old.origen = 'archivo' then
    new.url := old.url; new.drive_id := old.drive_id; new.nombre_archivo := old.nombre_archivo;
    new.mime := old.mime; new.tamano := old.tamano;
  else
    new.drive_id := null; new.nombre_archivo := null; new.mime := null; new.tamano := null;
  end if;
  -- Un documento archivado solo se puede restaurar (sin tocar nada más).
  if old.archivado and new.archivado then
    raise exception 'Este documento está archivado. Restauralo para modificarlo.';
  end if;
  if old.archivado and not new.archivado then
    if (to_jsonb(new) - 'archivado' - 'actualizado_en') is distinct from (to_jsonb(old) - 'archivado' - 'actualizado_en') then
      raise exception 'Al restaurar un documento no se puede modificar su contenido.';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_documento_alta on public.documentos;
create trigger trg_documento_alta before insert on public.documentos
  for each row execute function public.fn_documento_alta();
drop trigger if exists trg_documento_proteger on public.documentos;
create trigger trg_documento_proteger before update or delete on public.documentos
  for each row execute function public.fn_documento_proteger();
drop trigger if exists trg_control on public.documentos;
create trigger trg_control before insert or update on public.documentos
  for each row execute function public.fn_control_comun();
drop trigger if exists trg_auditoria on public.documentos;
create trigger trg_auditoria after insert or update or delete on public.documentos
  for each row execute function public.fn_auditar();

alter table public.documentos enable row level security;
drop policy if exists documentos_leer   on public.documentos;
drop policy if exists documentos_crear  on public.documentos;
drop policy if exists documentos_editar on public.documentos;
create policy documentos_leer on public.documentos for select to authenticated
  using (iglesia_id = public.mi_iglesia()
         and public.tiene_rol('administrador','secretario','pastor','comision')
         and (not restringido or public.tiene_rol('administrador','secretario','pastor')));
create policy documentos_crear on public.documentos for insert to authenticated
  with check (iglesia_id = public.mi_iglesia() and public.tiene_rol('administrador','secretario'));
create policy documentos_editar on public.documentos for update to authenticated
  using (iglesia_id = public.mi_iglesia() and public.tiene_rol('administrador','secretario'))
  with check (iglesia_id = public.mi_iglesia());

revoke all on public.documentos from anon, authenticated;
grant select, insert, update on public.documentos to authenticated;
