create function public.list_public_gardens(
  p_min_longitude double precision,
  p_min_latitude double precision,
  p_max_longitude double precision,
  p_max_latitude double precision,
  p_status public.garden_status default null,
  p_limit integer default 101,
  p_cursor_created_at timestamptz default null,
  p_cursor_id uuid default null
)
returns table (
  id uuid,
  name text,
  longitude double precision,
  latitude double precision,
  status public.garden_status,
  thumbnail_path text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_bounds extensions.geography(Polygon, 4326);
begin
  if p_min_longitude is null or p_min_latitude is null
    or p_max_longitude is null or p_max_latitude is null
    or p_min_longitude >= p_max_longitude
    or p_min_latitude >= p_max_latitude
    or p_max_longitude - p_min_longitude > 0.5
    or p_max_latitude - p_min_latitude > 0.5
    or p_min_longitude < -180 or p_max_longitude > 180
    or p_min_latitude < -90 or p_max_latitude > 90 then
    raise exception using errcode = '22023', message = 'INVALID_BBOX';
  end if;

  if p_limit < 1 or p_limit > 501 then
    raise exception using errcode = '22023', message = 'INVALID_LIMIT';
  end if;

  if (p_cursor_created_at is null) <> (p_cursor_id is null) then
    raise exception using errcode = '22023', message = 'INVALID_CURSOR';
  end if;

  v_bounds := extensions.st_makeenvelope(
    p_min_longitude,
    p_min_latitude,
    p_max_longitude,
    p_max_latitude,
    4326
  )::extensions.geography;

  return query
  select
    garden.id,
    garden.name,
    extensions.st_x(garden.geom::extensions.geometry) as longitude,
    extensions.st_y(garden.geom::extensions.geometry) as latitude,
    garden.status,
    (
      select photo.thumbnail_path
      from public.garden_photos as photo
      where photo.garden_id = garden.id
        and photo.status = 'publicada'
      order by photo.position
      limit 1
    ) as thumbnail_path,
    garden.created_at
  from public.guerrilla_gardens as garden
  where garden.moderation = 'aprobado'
    and garden.deleted_at is null
    and (p_status is null or garden.status = p_status)
    and extensions.st_intersects(garden.geom, v_bounds)
    and (
      p_cursor_created_at is null
      or (garden.created_at, garden.id) < (p_cursor_created_at, p_cursor_id)
    )
  order by garden.created_at desc, garden.id desc
  limit p_limit;
end;
$$;

create function public.get_visible_garden(
  p_id uuid,
  p_viewer_id uuid default null,
  p_is_admin boolean default false
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'id', garden.id,
    'name', garden.name,
    'description', garden.description,
    'longitude', extensions.st_x(garden.geom::extensions.geometry),
    'latitude', extensions.st_y(garden.geom::extensions.geometry),
    'status', garden.status,
    'moderation', garden.moderation,
    'rejectionReason', garden.rejection_reason,
    'createdBy', garden.created_by,
    'createdAt', garden.created_at,
    'updatedAt', garden.updated_at,
    'photos', coalesce(
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'id', photo.id,
            'publicPath', photo.public_path,
            'thumbnailPath', photo.thumbnail_path
          )
          order by photo.position
        )
        from public.garden_photos as photo
        where photo.garden_id = garden.id
          and photo.status = 'publicada'
      ),
      '[]'::jsonb
    )
  )
  from public.guerrilla_gardens as garden
  where garden.id = p_id
    and garden.deleted_at is null
    and (
      garden.moderation = 'aprobado'
      or garden.created_by = p_viewer_id
      or p_is_admin
    );
$$;

revoke all on function public.list_public_gardens(
  double precision,
  double precision,
  double precision,
  double precision,
  public.garden_status,
  integer,
  timestamptz,
  uuid
) from public, anon, authenticated;

revoke all on function public.get_visible_garden(uuid, uuid, boolean)
from public, anon, authenticated;

grant execute on function public.list_public_gardens(
  double precision,
  double precision,
  double precision,
  double precision,
  public.garden_status,
  integer,
  timestamptz,
  uuid
) to service_role;

grant execute on function public.get_visible_garden(uuid, uuid, boolean)
to service_role;

comment on function public.list_public_gardens is
  'Returns approved, non-deleted gardens inside a validated viewport using stable keyset pagination.';

comment on function public.get_visible_garden is
  'Returns an approved garden, or a non-public garden only to its owner or an administrator.';
