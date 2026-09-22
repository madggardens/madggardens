create function public.update_owner_garden_v2(
  p_owner_id uuid,
  p_id uuid,
  p_name text default null,
  p_description text default null,
  p_description_present boolean default false,
  p_longitude double precision default null,
  p_latitude double precision default null,
  p_status public.garden_status default null,
  p_photo_ids uuid[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_point extensions.geography(Point, 4326);
  v_expected_photo_count integer;
  v_photo_count integer;
  v_public_paths text[];
  v_original_paths text[];
begin
  perform 1
  from public.guerrilla_gardens
  where id = p_id and created_by = p_owner_id and deleted_at is null
  for update;
  if not found then
    return jsonb_build_object('updated', false);
  end if;

  if exists (
    select 1 from public.garden_photos
    where garden_id = p_id and status = 'procesando'
  ) then
    raise exception using errcode = 'P0001', message = 'GARDEN_PROCESSING';
  end if;

  if (p_longitude is null) <> (p_latitude is null) then
    raise exception using errcode = '22023', message = 'INVALID_COORDINATES';
  end if;

  if p_longitude is not null then
    if p_longitude < -180 or p_longitude > 180 or p_latitude < -90 or p_latitude > 90 then
      raise exception using errcode = '22023', message = 'INVALID_COORDINATES';
    end if;
    v_point := extensions.st_setsrid(
      extensions.st_makepoint(p_longitude, p_latitude), 4326
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

  if p_photo_ids is not null then
    v_expected_photo_count := coalesce(array_length(p_photo_ids, 1), 0);
    if v_expected_photo_count < 1 or v_expected_photo_count > 5 then
      raise exception using errcode = '22023', message = 'INVALID_PHOTO_COUNT';
    end if;
    select count(*)::integer into v_photo_count
    from public.garden_photos as photo
    where photo.id = any(p_photo_ids)
      and photo.owner_id = p_owner_id
      and photo.garden_id is null
      and photo.status = 'subida'
      and photo.upload_expires_at > statement_timestamp();
    if v_photo_count <> v_expected_photo_count then
      raise exception using errcode = 'P0001', message = 'INVALID_PHOTOS';
    end if;
  end if;

  select
    coalesce(array_agg(path) filter (where path is not null), '{}'::text[])
  into v_public_paths
  from (
    select public_path as path from public.garden_photos where garden_id = p_id
    union all
    select thumbnail_path as path from public.garden_photos where garden_id = p_id
  ) as paths;

  if p_photo_ids is not null then
    select coalesce(array_agg(original_path), '{}'::text[])
    into v_original_paths
    from public.garden_photos
    where garden_id = p_id;

    delete from public.garden_photos where garden_id = p_id;
    update public.garden_photos as photo
    set garden_id = p_id,
        position = ordered.position
    from (
      select id, (ordinality - 1)::smallint as position
      from unnest(p_photo_ids) with ordinality as item(id, ordinality)
    ) as ordered
    where photo.id = ordered.id;
  else
    v_original_paths := '{}'::text[];
    update public.garden_photos
    set status = 'subida',
        public_path = null,
        thumbnail_path = null,
        published_at = null
    where garden_id = p_id;
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
  where id = p_id;

  return jsonb_build_object(
    'updated', true,
    'publicPathsToDelete', to_jsonb(v_public_paths),
    'originalPathsToDelete', to_jsonb(v_original_paths)
  );
end;
$$;

revoke all on function public.update_owner_garden_v2(
  uuid, uuid, text, text, boolean, double precision, double precision,
  public.garden_status, uuid[]
) from public, anon, authenticated;

grant execute on function public.update_owner_garden_v2(
  uuid, uuid, text, text, boolean, double precision, double precision,
  public.garden_status, uuid[]
) to service_role;

comment on function public.update_owner_garden_v2 is
  'Atomically edits a garden, optionally replaces photos, unpublishes derivatives and resets moderation.';
