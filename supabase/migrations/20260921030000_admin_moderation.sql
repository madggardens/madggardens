create function public.list_admin_gardens(
  p_moderation public.moderation_status default 'pendiente',
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
  where garden.deleted_at is null
    and garden.moderation = p_moderation
    and (
      p_cursor_created_at is null
      or (garden.created_at, garden.id) < (p_cursor_created_at, p_cursor_id)
    )
  order by garden.created_at desc, garden.id desc
  limit p_limit;
end;
$$;

create function public.begin_garden_approval(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_photo_count integer;
begin
  perform 1
  from public.guerrilla_gardens
  where id = p_id and deleted_at is null and moderation = 'pendiente'
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'GARDEN_NOT_PENDING';
  end if;

  select count(*)::integer into v_photo_count
  from public.garden_photos
  where garden_id = p_id and status in ('subida', 'fallida');
  if v_photo_count < 1 or v_photo_count > 5 then
    raise exception using errcode = 'P0001', message = 'PHOTOS_NOT_READY';
  end if;

  update public.garden_photos
  set status = 'procesando'
  where garden_id = p_id and status in ('subida', 'fallida');

  select jsonb_build_object(
    'gardenId', p_id,
    'photos', jsonb_agg(
      jsonb_build_object('id', photo.id, 'originalPath', photo.original_path)
      order by photo.position
    )
  ) into v_result
  from public.garden_photos as photo
  where photo.garden_id = p_id and photo.status = 'procesando';

  return v_result;
end;
$$;

create function public.complete_garden_approval(
  p_id uuid,
  p_actor_id uuid,
  p_request_id uuid,
  p_photo_ids uuid[],
  p_public_paths text[],
  p_thumbnail_paths text[]
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if coalesce(array_length(p_photo_ids, 1), 0) < 1
    or array_length(p_photo_ids, 1) <> array_length(p_public_paths, 1)
    or array_length(p_photo_ids, 1) <> array_length(p_thumbnail_paths, 1) then
    raise exception using errcode = '22023', message = 'INVALID_PROCESSED_PHOTOS';
  end if;

  select count(*)::integer into v_count
  from public.garden_photos
  where garden_id = p_id and id = any(p_photo_ids) and status = 'procesando';
  if v_count <> array_length(p_photo_ids, 1) then
    raise exception using errcode = 'P0001', message = 'PHOTOS_NOT_PROCESSING';
  end if;

  update public.garden_photos as photo
  set status = 'publicada',
      public_path = processed.public_path,
      thumbnail_path = processed.thumbnail_path,
      published_at = statement_timestamp()
  from (
    select ids.id, public_paths.path as public_path, thumbnails.path as thumbnail_path
    from unnest(p_photo_ids) with ordinality as ids(id, n)
    join unnest(p_public_paths) with ordinality as public_paths(path, n) using (n)
    join unnest(p_thumbnail_paths) with ordinality as thumbnails(path, n) using (n)
  ) as processed
  where photo.id = processed.id and photo.garden_id = p_id;

  update public.guerrilla_gardens
  set moderation = 'aprobado',
      rejection_reason = null,
      moderated_by = p_actor_id,
      moderated_at = statement_timestamp()
  where id = p_id and deleted_at is null and moderation = 'pendiente';
  if not found then
    raise exception using errcode = 'P0001', message = 'GARDEN_NOT_PENDING';
  end if;

  insert into public.admin_audit_log(actor_id, garden_id, action, request_id)
  values (p_actor_id, p_id, 'approve', p_request_id);
  return true;
end;
$$;

create function public.fail_garden_approval(p_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.garden_photos
  set status = 'fallida'
  where garden_id = p_id and status = 'procesando';
$$;

create function public.reject_garden(
  p_id uuid,
  p_actor_id uuid,
  p_request_id uuid,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if char_length(btrim(p_reason)) < 1 or char_length(btrim(p_reason)) > 500 then
    raise exception using errcode = '22023', message = 'INVALID_REJECTION_REASON';
  end if;

  update public.guerrilla_gardens
  set moderation = 'rechazado',
      rejection_reason = btrim(p_reason),
      moderated_by = p_actor_id,
      moderated_at = statement_timestamp()
  where id = p_id and deleted_at is null and moderation = 'pendiente';
  if not found then
    return false;
  end if;

  insert into public.admin_audit_log(actor_id, garden_id, action, reason, request_id)
  values (p_actor_id, p_id, 'reject', btrim(p_reason), p_request_id);
  return true;
end;
$$;

create or replace function public.get_visible_garden(
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
            'status', photo.status,
            'originalPath', case
              when garden.created_by = p_viewer_id or p_is_admin then photo.original_path
              else null
            end,
            'publicPath', photo.public_path,
            'thumbnailPath', photo.thumbnail_path
          )
          order by photo.position
        )
        from public.garden_photos as photo
        where photo.garden_id = garden.id
          and (
            photo.status = 'publicada'
            or garden.created_by = p_viewer_id
            or p_is_admin
          )
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

revoke all on function public.list_admin_gardens(public.moderation_status, integer, timestamptz, uuid) from public, anon, authenticated;
revoke all on function public.begin_garden_approval(uuid) from public, anon, authenticated;
revoke all on function public.complete_garden_approval(uuid, uuid, uuid, uuid[], text[], text[]) from public, anon, authenticated;
revoke all on function public.fail_garden_approval(uuid) from public, anon, authenticated;
revoke all on function public.reject_garden(uuid, uuid, uuid, text) from public, anon, authenticated;

grant execute on function public.list_admin_gardens(public.moderation_status, integer, timestamptz, uuid) to service_role;
grant execute on function public.begin_garden_approval(uuid) to service_role;
grant execute on function public.complete_garden_approval(uuid, uuid, uuid, uuid[], text[], text[]) to service_role;
grant execute on function public.fail_garden_approval(uuid) to service_role;
grant execute on function public.reject_garden(uuid, uuid, uuid, text) to service_role;
