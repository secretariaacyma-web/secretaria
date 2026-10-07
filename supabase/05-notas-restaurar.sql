-- =====================================================================
-- MIGRACIÓN 05 — Notas: poder restaurar una nota archivada por error
-- Ejecutar UNA vez en Supabase → SQL Editor (después de la 04).
-- Se puede volver a ejecutar sin problemas.
--
-- Reglas:
--  * Solo administrador o secretario pueden restaurar.
--  * Un borrador descartado vuelve a ser borrador (sigue sin número).
--  * Una nota que ya estaba emitida vuelve a "emitida" con su MISMO número.
--  * Al restaurar no se puede cambiar ningún otro dato.
--  * Todo queda registrado en la auditoría.
-- =====================================================================

create or replace function public.fn_nota_proteger()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_serie text;
begin
  if tg_op = 'DELETE' then
    raise exception 'Las notas no se pueden eliminar: archivalas.';
  end if;

  -- Archivada: solo se puede restaurar (sin tocar nada más).
  if old.estado = 'archivada' then
    if new.estado = 'archivada' then
      raise exception 'Esta nota está archivada y no se puede modificar. Podés restaurarla.';
    end if;
    if not public.tiene_rol('administrador','secretario') then
      raise exception 'Solo el administrador o el secretario pueden restaurar notas.';
    end if;
    if (to_jsonb(new) - 'estado' - 'archivado' - 'actualizado_en')
       is distinct from (to_jsonb(old) - 'estado' - 'archivado' - 'actualizado_en') then
      raise exception 'Al restaurar una nota no se puede modificar su contenido.';
    end if;
    if old.numero is null and new.estado = 'borrador' then
      new.archivado := false;
      return new;
    elsif old.numero is not null and new.estado = 'emitida' then
      new.archivado := false;
      return new;
    end if;
    raise exception 'Una nota con número se restaura como emitida; un borrador descartado, como borrador.';
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
