-- =====================================================================
-- MIGRACIÓN 03 — Calendario (eventos y actividades fijas de la semana)
-- Ejecutar UNA vez en Supabase → SQL Editor (después de schema.sql y 02).
-- Se puede volver a ejecutar sin problemas.
-- =====================================================================

-- Actividades que se repiten todas las semanas (cultos, jóvenes, oración...)
create table if not exists public.actividades_fijas (
  id              uuid primary key default gen_random_uuid(),
  iglesia_id      uuid not null references public.iglesias(id),
  titulo          text not null check (length(trim(titulo)) > 0),
  categoria       text not null default 'culto'
                  check (categoria in ('culto','comision','pastoral','estudio','joven','oracion','especial','otro')),
  dia_semana      smallint not null check (dia_semana between 0 and 6),   -- 0 = domingo ... 6 = sábado
  hora            time not null,
  hora_fin        time,
  lugar           text,
  variante_titulo text,        -- versión alternativa elegible por fecha (ej.: "Santa Cena")
  variante_hora   time,        -- hora de esa versión alternativa
  activa          boolean not null default true,
  archivado       boolean not null default false,
  creado_por      uuid references auth.users(id),
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);

-- Eventos concretos. Si tiene fija_id, reemplaza a la actividad fija en esa fecha
-- (por ejemplo: Santa Cena en lugar del culto general, o una fecha cancelada).
create table if not exists public.eventos (
  id             uuid primary key default gen_random_uuid(),
  iglesia_id     uuid not null references public.iglesias(id),
  titulo         text not null check (length(trim(titulo)) > 0),
  categoria      text not null default 'otro'
                 check (categoria in ('culto','comision','pastoral','estudio','joven','oracion','especial','otro')),
  fecha          date not null,
  hora           time,
  hora_fin       time,
  lugar          text,
  descripcion    text,
  privado        boolean not null default false,   -- solo administrador, secretario y pastor
  estado         text not null default 'programado' check (estado in ('programado','cancelado')),
  fija_id        uuid references public.actividades_fijas(id),
  archivado      boolean not null default false,
  creado_por     uuid references auth.users(id),
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index if not exists eventos_fecha_idx on public.eventos (iglesia_id, fecha);
-- Una sola reemplazo vigente por actividad fija y fecha.
create unique index if not exists eventos_fija_fecha_uq on public.eventos (fija_id, fecha)
  where fija_id is not null and not archivado;

alter table public.actividades_fijas enable row level security;
alter table public.eventos           enable row level security;

drop policy if exists actividades_fijas_leer   on public.actividades_fijas;
drop policy if exists actividades_fijas_crear  on public.actividades_fijas;
drop policy if exists actividades_fijas_editar on public.actividades_fijas;
create policy actividades_fijas_leer on public.actividades_fijas for select to authenticated
  using (iglesia_id = public.mi_iglesia());
create policy actividades_fijas_crear on public.actividades_fijas for insert to authenticated
  with check (iglesia_id = public.mi_iglesia() and public.tiene_rol('administrador','secretario'));
create policy actividades_fijas_editar on public.actividades_fijas for update to authenticated
  using (iglesia_id = public.mi_iglesia() and public.tiene_rol('administrador','secretario'))
  with check (iglesia_id = public.mi_iglesia());

drop policy if exists eventos_leer   on public.eventos;
drop policy if exists eventos_crear  on public.eventos;
drop policy if exists eventos_editar on public.eventos;
create policy eventos_leer on public.eventos for select to authenticated
  using (iglesia_id = public.mi_iglesia()
         and (not privado or public.tiene_rol('administrador','secretario','pastor')));
create policy eventos_crear on public.eventos for insert to authenticated
  with check (iglesia_id = public.mi_iglesia() and public.tiene_rol('administrador','secretario'));
create policy eventos_editar on public.eventos for update to authenticated
  using (iglesia_id = public.mi_iglesia() and public.tiene_rol('administrador','secretario'))
  with check (iglesia_id = public.mi_iglesia());

do $$
declare t text;
begin
  foreach t in array array['actividades_fijas','eventos'] loop
    execute format('drop trigger if exists trg_control on public.%I', t);
    execute format('create trigger trg_control before insert or update on public.%I
                    for each row execute function public.fn_control_comun()', t);
    execute format('drop trigger if exists trg_auditoria on public.%I', t);
    execute format('create trigger trg_auditoria after insert or update or delete on public.%I
                    for each row execute function public.fn_auditar()', t);
    execute format('drop trigger if exists trg_no_borrar on public.%I', t);
    execute format('create trigger trg_no_borrar before delete on public.%I
                    for each row execute function public.fn_bloquear_borrado()', t);
  end loop;
end $$;

grant select, insert, update on public.actividades_fijas, public.eventos to authenticated;

-- Actividades fijas iniciales (se pueden cambiar desde la aplicación).
insert into public.actividades_fijas (iglesia_id, titulo, categoria, dia_semana, hora, variante_titulo, variante_hora)
select i.id, v.titulo, v.categoria, v.dia, v.hora::time, v.var_titulo, v.var_hora::time
from (select id from public.iglesias order by creado_en limit 1) i
cross join (values
  ('Culto general',         'culto',   0, '10:30', 'Santa Cena', '10:00'),
  ('Reunión de jóvenes',    'joven',   6, '19:00', null,         null),
  ('Reunión de oración',    'oracion', 4, '18:30', null,         null),
  ('Estudio bíblico',       'estudio', 4, '19:00', null,         null),
  ('Reunión general',       'culto',   3, '19:00', null,         null)
) as v(titulo, categoria, dia, hora, var_titulo, var_hora)
where not exists (
  select 1 from public.actividades_fijas f where f.iglesia_id = i.id and f.titulo = v.titulo
);
