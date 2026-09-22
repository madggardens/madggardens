create function public.reserve_garden_photo(
  p_id uuid,
  p_owner_id uuid,
  p_original_path text,
  p_mime_type text,
  p_size_bytes integer,
  p_upload_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_owner_id is null then
    raise exception using errcode = '22023', message = 'USER_REQUIRED';
  end if;

  if p_original_path !~ ('^' || p_owner_id::text || '/[0-9a-f-]+\.(jpg|png|webp)$') then
    raise exception using errcode = '22023', message = 'INVALID_PHOTO_PATH';
  end if;

  insert into public.garden_photos (
    id,
    owner_id,
    original_path,
    mime_type,
    size_bytes,
    upload_expires_at
  )
  values (
    p_id,
    p_owner_id,
    p_original_path,
    p_mime_type,
    p_size_bytes,
    p_upload_expires_at
  );

  return p_id;
end;
$$;

create function public.create_garden_idempotent(
  p_created_by uuid,
  p_idempotency_key uuid,
  p_request_hash text,
  p_name text,
  p_description text,
  p_longitude double precision,
  p_latitude double precision,
  p_status public.garden_status,
  p_photo_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.api_idempotency%rowtype;
  v_garden_id uuid;
  v_response jsonb;
begin
  if p_created_by is null or p_idempotency_key is null or p_request_hash is null then
    raise exception using errcode = '22023', message = 'INVALID_IDEMPOTENCY_REQUEST';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_created_by::text || ':' || p_idempotency_key::text, 0)
  );

  select *
  into v_existing
  from public.api_idempotency
  where user_id = p_created_by
    and key = p_idempotency_key
    and expires_at > statement_timestamp();

  if found then
    if v_existing.request_hash <> p_request_hash then
      raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_CONFLICT';
    end if;

    return v_existing.response_body || jsonb_build_object('replayed', true);
  end if;

  delete from public.api_idempotency
  where user_id = p_created_by
    and key = p_idempotency_key
    and expires_at <= statement_timestamp();

  v_garden_id := public.create_garden(
    p_created_by,
    p_name,
    p_description,
    p_longitude,
    p_latitude,
    p_status,
    p_photo_ids
  );
  v_response := jsonb_build_object('gardenId', v_garden_id, 'replayed', false);

  insert into public.api_idempotency (
    user_id,
    key,
    request_hash,
    response_status,
    response_body,
    expires_at
  )
  values (
    p_created_by,
    p_idempotency_key,
    p_request_hash,
    201,
    v_response,
    statement_timestamp() + interval '24 hours'
  );

  return v_response;
end;
$$;

create function public.get_idempotent_creation(
  p_created_by uuid,
  p_idempotency_key uuid,
  p_request_hash text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_existing public.api_idempotency%rowtype;
begin
  select *
  into v_existing
  from public.api_idempotency
  where user_id = p_created_by
    and key = p_idempotency_key
    and expires_at > statement_timestamp();

  if not found then
    return null;
  end if;

  if v_existing.request_hash <> p_request_hash then
    raise exception using errcode = 'P0001', message = 'IDEMPOTENCY_CONFLICT';
  end if;

  return v_existing.response_body || jsonb_build_object('replayed', true);
end;
$$;

create function public.get_unassociated_photos(
  p_owner_id uuid,
  p_photo_ids uuid[]
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', photo.id,
        'path', photo.original_path,
        'mimeType', photo.mime_type,
        'sizeBytes', photo.size_bytes
      )
      order by requested.ordinality
    ),
    '[]'::jsonb
  )
  from unnest(p_photo_ids) with ordinality as requested(id, ordinality)
  join public.garden_photos as photo on photo.id = requested.id
  where photo.owner_id = p_owner_id
    and photo.garden_id is null
    and photo.status = 'subida'
    and photo.upload_expires_at > statement_timestamp();
$$;

revoke all on function public.reserve_garden_photo(
  uuid,
  uuid,
  text,
  text,
  integer,
  timestamptz
) from public, anon, authenticated;

revoke all on function public.create_garden_idempotent(
  uuid,
  uuid,
  text,
  text,
  text,
  double precision,
  double precision,
  public.garden_status,
  uuid[]
) from public, anon, authenticated;

revoke all on function public.get_unassociated_photos(uuid, uuid[])
from public, anon, authenticated;

revoke all on function public.get_idempotent_creation(uuid, uuid, text)
from public, anon, authenticated;

grant execute on function public.reserve_garden_photo(
  uuid,
  uuid,
  text,
  text,
  integer,
  timestamptz
) to service_role;

grant execute on function public.create_garden_idempotent(
  uuid,
  uuid,
  text,
  text,
  text,
  double precision,
  double precision,
  public.garden_status,
  uuid[]
) to service_role;

grant execute on function public.get_unassociated_photos(uuid, uuid[])
to service_role;

grant execute on function public.get_idempotent_creation(uuid, uuid, text)
to service_role;

comment on function public.reserve_garden_photo is
  'Reserves an immutable private storage path before issuing a signed upload token.';

comment on function public.create_garden_idempotent is
  'Creates a garden once per user and idempotency key, rejecting reuse with another body.';

comment on function public.get_unassociated_photos is
  'Returns private upload metadata in requested order for server-side verification.';

comment on function public.get_idempotent_creation is
  'Returns a previous creation response before uploaded photos are revalidated.';
