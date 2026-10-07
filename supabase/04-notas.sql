-- =====================================================================
-- MIGRACIÓN 04 — Notas y certificados
-- Ejecutar UNA vez en Supabase → SQL Editor (después de schema.sql, 02 y 03).
-- Se puede volver a ejecutar sin problemas.
-- =====================================================================

create table if not exists public.notas (
  id             uuid primary key default gen_random_uuid(),
  iglesia_id     uuid not null references public.iglesias(id),
  tipo           text not null
                 check (tipo in ('general','recomendacion','constancia','convocatoria','bautismo','casamiento','presentacion')),
  anio           integer,          -- se asigna al emitir
  numero         integer,          -- se asigna al emitir (correlativo por año y serie)
  fecha          date not null,
  lugar          text,
  destinatario   text,
  asunto         text,
  cuerpo         text not null default '',
  datos          jsonb not null default '{}'::jsonb,
  firmantes      jsonb not null default '[]'::jsonb,
  persona_id     uuid references public.personas(id),
  estado         text not null default 'borrador' check (estado in ('borrador','emitida','archivada')),
  emitida_por    uuid references auth.users(id),
  emitida_en     timestamptz,
  archivado      boolean not null default false,
  creado_por     uuid references auth.users(id),
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists notas_fecha_idx on public.notas (iglesia_id, fecha desc);
create unique index if not exists notas_numero_uq on public.notas
  (iglesia_id, anio, numero, (case when tipo in ('bautismo','casamiento','presentacion') then tipo else 'nota' end))
  where numero is not null;

-- Alta: la base fija la iglesia y siempre nace como borrador, sin número.
create or replace function public.fn_nota_alta()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.iglesia_id := public.mi_iglesia();
  new.estado := 'borrador';
  new.anio := null; new.numero := null;
  new.emitida_por := null; new.emitida_en := null;
  new.archivado := false;
  return new;
end $$;

-- Cambios: el número se asigna al emitir (por año y serie); una nota emitida no se modifica.
-- Series: todas las notas comparten una numeración; cada tipo de certificado tiene la suya.
create or replace function public.fn_nota_proteger()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_serie text;
begin
  if tg_op = 'DELETE' then
    raise exception 'Las notas no se pueden eliminar: archivalas.';
  end if;

  if old.estado = 'archivada' then
    raise exception 'Esta nota está archivada y no se puede modificar.';
  end if;

  if old.estado = 'emitida' then
    if new.estado = 'archivada'
       and (to_jsonb(new) - 'estado' - 'archivado' - 'actualizado_en')
         = (to_jsonb(old) - 'estado' - 'archivado' - 'actualizado_en') then
      new.archivado := true;
      return new;
    end if;
    raise exception 'La nota N° %/% está emitida y no se puede modificar.', old.numero, old.anio;
  end if;

  -- old.estado = 'borrador'
  new.anio := null; new.numero := null; new.emitida_por := null; new.emitida_en := null;
  if new.estado = 'emitida' then
    if not public.tiene_rol('administrador','secretario') then
      raise exception 'Solo el administrador o el secretario pueden emitir notas.';
    end if;
    v_serie := case when new.tipo in ('bautismo','casamiento','presentacion') then new.tipo else 'nota' end;
    new.anio := extract(year from new.fecha)::integer;
    new.numero := public.fn_siguiente_numero(new.iglesia_id, 'nota-' || v_serie || '-' || new.anio);
    new.emitida_por := auth.uid();
    new.emitida_en := now();
  elsif new.estado = 'archivada' then
    new.archivado := true;       -- borrador descartado
  else
    new.archivado := false;
  end if;
  return new;
end $$;

drop trigger if exists trg_nota_alta on public.notas;
create trigger trg_nota_alta before insert on public.notas
  for each row execute function public.fn_nota_alta();
drop trigger if exists trg_nota_proteger on public.notas;
create trigger trg_nota_proteger before update or delete on public.notas
  for each row execute function public.fn_nota_proteger();

-- Seguridad: solo administrador, secretario y pastor ven y manejan notas (pueden tener datos personales).
alter table public.notas enable row level security;
drop policy if exists notas_leer   on public.notas;
drop policy if exists notas_crear  on public.notas;
drop policy if exists notas_editar on public.notas;
create policy notas_leer on public.notas for select to authenticated
  using (iglesia_id = public.mi_iglesia() and public.tiene_rol('administrador','secretario','pastor'));
create policy notas_crear on public.notas for insert to authenticated
  with check (iglesia_id = public.mi_iglesia() and public.tiene_rol('administrador','secretario'));
create policy notas_editar on public.notas for update to authenticated
  using (iglesia_id = public.mi_iglesia() and public.tiene_rol('administrador','secretario'))
  with check (iglesia_id = public.mi_iglesia());

drop trigger if exists trg_control on public.notas;
create trigger trg_control before insert or update on public.notas
  for each row execute function public.fn_control_comun();
drop trigger if exists trg_auditoria on public.notas;
create trigger trg_auditoria after insert or update or delete on public.notas
  for each row execute function public.fn_auditar();

grant select, insert, update on public.notas to authenticated;

-- Las copias en Drive también pueden pertenecer a una nota.
do $$
begin
  if to_regclass('public.archivos_drive') is not null then
    alter table public.archivos_drive add column if not exists nota_id uuid references public.notas(id);
    create index if not exists archivos_drive_nota_idx on public.archivos_drive (nota_id);
  end if;
end $$;
