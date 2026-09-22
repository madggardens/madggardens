create function public.list_owner_gardens(
  p_owner_id uuid,
  p_moderation public.moderation_status default null,
  p_limit integer default 51,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null
)
returns table (
  id uuid,
  name text,
  status public.garden_status,
  moderation public.moderation_status,
  rejection_reason text,
  longitude double precision,
  latitude double precision,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_owner_id is null then
    raise exception using errcode = '22023', message = 'USER_REQUIRED';
  end if;
  if p_limit < 1 or p_limit > 51 then
    raise exception using errcode = '22023', message = 'INVALID_LIMIT';
  end if;
  if (p_cursor_created_at is null) <> (p_cursor_id is null) then
    raise exception using errcode = '22023', message = 'INVALID_CURSOR';
  end if;

  return query
  select
    garden.id,
    garden.name,
    garden.status,
    garden.moderation,
    garden.rejection_reason,
    extensions.st_x(garden.geom::extensions.geometry),
    extensions.st_y(garden.geom::extensions.geometry),
    garden.created_at,
    garden.updated_at
  from public.guerrilla_gardens as garden
  where garden.created_by = p_owner_id
    and garden.deleted_at is null
    and (p_moderation is null or garden.moderation = p_moderation)
    and (
      p_cursor_created_at is null
      or (garden.created_at, garden.id) < (p_cursor_created_at, p_cursor_id)
    )
  order by garden.created_at desc, garden.id desc
  limit p_limit;
end;
$$;

create function public.update_owner_garden(
  p_owner_id uuid,
  p_id uuid,
  p_name text default null,
  p_description text default null,
  p_description_present boolean default false,
  p_longitude double precision default null,
  p_latitude double precision default null,
  p_status public.garden_status default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_point extensions.geography(Point, 4326);
begin
  if not exists (
    select 1 from public.guerrilla_gardens
    where id = p_id and created_by = p_owner_id and deleted_at is null
  ) then
    return false;
  end if;

  if (p_longitude is null) <> (p_latitude is null) then
    raise exception using errcode = '22023', message = 'INVALID_COORDINATES';
  end if;

  if p_longitude is not null then
    if p_longitude < -180 or p_longitude > 180 or p_latitude < -90 or p_latitude > 90 then
      raise exception using errcode = '22023', message = 'INVALID_COORDINATES';
    end if;

    v_point := extensions.st_setsrid(
      extensions.st_makepoint(p_longitude, p_latitude),
      4326
    )::extensions.geography;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('garden-location-write')::bigint);

    if not exists (
      select 1 from public.service_areas as area
      where area.slug = 'madrid-municipio'
        and extensions.st_covers(area.geom, v_point::extensions.geometry)
    ) then
      raise exception using errcode = 'P0001', message = 'GARDEN_OUTSIDE_SERVICE_AREA';
    end if;

    if exists (
      select 1 from public.guerrilla_gardens as garden
      where garden.id <> p_id
        and garden.deleted_at is null
        and garden.moderation <> 'rechazado'
        and extensions.st_dwithin(garden.geom, v_point, 25)
    ) then
      raise exception using errcode = 'P0001', message = 'GARDEN_TOO_CLOSE';
    end if;
  end if;

  update public.guerrilla_gardens
  set name = coalesce(btrim(p_name), name),
      description = case
        when p_description_present then nullif(btrim(p_description), '')
        else description
      end,
      geom = coalesce(v_point, geom),
      status = coalesce(p_status, status),
      moderation = 'pendiente',
      rejection_reason = null,
      moderated_by = null,
      moderated_at = null
  where id = p_id and created_by = p_owner_id and deleted_at is null;

  return true;
end;
$$;

create function public.soft_delete_owner_garden(p_owner_id uuid, p_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with deleted as (
    update public.guerrilla_gardens
    set deleted_at = statement_timestamp()
    where id = p_id and created_by = p_owner_id and deleted_at is null
    returning 1
  )
  select exists(select 1 from deleted);
$$;

revoke all on function public.list_owner_gardens(uuid, public.moderation_status, integer, timestamptz, uuid)
from public, anon, authenticated;
revoke all on function public.update_owner_garden(uuid, uuid, text, text, boolean, double precision, double precision, public.garden_status)
from public, anon, authenticated;
revoke all on function public.soft_delete_owner_garden(uuid, uuid)
from public, anon, authenticated;

grant execute on function public.list_owner_gardens(uuid, public.moderation_status, integer, timestamptz, uuid)
to service_role;
grant execute on function public.update_owner_garden(uuid, uuid, text, text, boolean, double precision, double precision, public.garden_status)
to service_role;
grant execute on function public.soft_delete_owner_garden(uuid, uuid)
to service_role;

comment on function public.list_owner_gardens is
  'Lists only active gardens owned by the authenticated API user using keyset pagination.';
comment on function public.update_owner_garden is
  'Updates owner-editable fields, rechecks changed coordinates and resets moderation to pending.';
comment on function public.soft_delete_owner_garden is
  'Soft-deletes a garden only when the caller is its owner.';
