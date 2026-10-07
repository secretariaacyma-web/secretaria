-- =====================================================================
-- MIGRACIÓN 02 — Registro de copias PDF guardadas en Google Drive
-- Ejecutar UNA vez en Supabase → SQL Editor (después de schema.sql).
-- Se puede volver a ejecutar sin problemas.
-- =====================================================================

create table if not exists public.archivos_drive (
  id             uuid primary key default gen_random_uuid(),
  iglesia_id     uuid not null references public.iglesias(id),
  acta_id        uuid references public.actas(id),
  nombre         text not null,
  drive_id       text not null,
  url            text not null,
  creado_por     uuid references auth.users(id),
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists archivos_drive_acta_idx on public.archivos_drive (acta_id);

alter table public.archivos_drive enable row level security;

drop policy if exists archivos_drive_leer  on public.archivos_drive;
drop policy if exists archivos_drive_crear on public.archivos_drive;
create policy archivos_drive_leer on public.archivos_drive for select to authenticated
  using (iglesia_id = public.mi_iglesia());
create policy archivos_drive_crear on public.archivos_drive for insert to authenticated
  with check (iglesia_id = public.mi_iglesia() and public.tiene_rol('administrador','secretario'));

drop trigger if exists trg_control on public.archivos_drive;
create trigger trg_control before insert or update on public.archivos_drive
  for each row execute function public.fn_control_comun();
drop trigger if exists trg_auditoria on public.archivos_drive;
create trigger trg_auditoria after insert or update or delete on public.archivos_drive
  for each row execute function public.fn_auditar();
drop trigger if exists trg_no_borrar on public.archivos_drive;
create trigger trg_no_borrar before delete on public.archivos_drive
  for each row execute function public.fn_bloquear_borrado();

grant select, insert on public.archivos_drive to authenticated;
