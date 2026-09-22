create extension if not exists postgis with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create type public.garden_status as enum (
  'vacio',
  'en_proceso',
  'plantado',
  'exuberante'
);

create type public.moderation_status as enum (
  'pendiente',
  'aprobado',
  'rechazado'
);

create type public.photo_status as enum (
  'subida',
  'procesando',
  'publicada',
  'fallida'
);

create table public.service_areas (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  geom extensions.geometry(MultiPolygon, 4326) not null,
  source_url text not null,
  source_checksum text not null check (source_checksum ~ '^sha256:[0-9a-f]{64}$'),
  source_license text not null,
  source_retrieved_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index service_areas_geom_gix
  on public.service_areas using gist (geom);

create table public.guerrilla_gardens (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  description text check (description is null or char_length(description) <= 2000),
  geom extensions.geography(Point, 4326) not null,
  status public.garden_status not null,
  moderation public.moderation_status not null default 'pendiente',
  rejection_reason text check (
    rejection_reason is null or char_length(btrim(rejection_reason)) between 1 and 500
  ),
  created_by uuid references auth.users(id) on delete set null,
  moderated_by uuid,
  moderated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint moderation_audit_consistent check (
    (
      moderation = 'pendiente'
      and rejection_reason is null
      and moderated_by is null
      and moderated_at is null
    )
    or (
      moderation = 'aprobado'
      and rejection_reason is null
      and moderated_by is not null
      and moderated_at is not null
    )
    or (
      moderation = 'rechazado'
      and rejection_reason is not null
      and moderated_by is not null
      and moderated_at is not null
    )
  )
);

create index guerrilla_gardens_geom_gix
  on public.guerrilla_gardens using gist (geom);

create index guerrilla_gardens_public_idx
  on public.guerrilla_gardens (moderation, status, created_at desc, id desc)
  where deleted_at is null;

create index guerrilla_gardens_owner_idx
  on public.guerrilla_gardens (created_by, created_at desc, id desc)
  where deleted_at is null;

create table public.garden_photos (
  id uuid primary key default gen_random_uuid(),
  garden_id uuid references public.guerrilla_gardens(id) on delete cascade,
  owner_id uuid references auth.users(id) on delete set null,
  original_path text not null unique,
  public_path text unique,
  thumbnail_path text unique,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes integer not null check (size_bytes between 1 and 10485760),
  position smallint check (position between 0 and 4),
  status public.photo_status not null default 'subida',
  upload_expires_at timestamptz not null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (garden_id, position),
  constraint associated_photo_has_position check (
    (garden_id is null and position is null)
    or (garden_id is not null and position is not null)
  ),
  constraint published_photo_consistent check (
    (
      status = 'publicada'
      and public_path is not null
      and thumbnail_path is not null
      and published_at is not null
    )
    or (
      status <> 'publicada'
      and public_path is null
      and thumbnail_path is null
      and published_at is null
    )
  )
);

create index garden_photos_owner_idx
  on public.garden_photos (owner_id, created_at desc)
  where garden_id is null;

create index garden_photos_garden_idx
  on public.garden_photos (garden_id, position)
  where garden_id is not null;

create table public.admin_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid not null,
  garden_id uuid references public.guerrilla_gardens(id) on delete set null,
  action text not null check (action in ('approve', 'reject', 'soft_delete')),
  reason text,
  request_id uuid not null,
  created_at timestamptz not null default now()
);

create index admin_audit_log_garden_idx
  on public.admin_audit_log (garden_id, created_at desc);

create index admin_audit_log_actor_idx
  on public.admin_audit_log (actor_id, created_at desc);

create table public.api_idempotency (
  user_id uuid not null,
  key uuid not null,
  request_hash text not null,
  response_status smallint not null check (response_status between 200 and 599),
  response_body jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (user_id, key),
  check (expires_at > created_at)
);

create index api_idempotency_expiry_idx
  on public.api_idempotency (expires_at);

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = statement_timestamp();
  return new;
end;
$$;

create trigger service_areas_set_updated_at
before update on public.service_areas
for each row execute function private.set_updated_at();

create trigger guerrilla_gardens_set_updated_at
before update on public.guerrilla_gardens
for each row execute function private.set_updated_at();

create function private.prevent_audit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = '42501',
    message = 'ADMIN_AUDIT_LOG_IS_APPEND_ONLY';
end;
$$;

create trigger admin_audit_log_append_only
before update or delete on public.admin_audit_log
for each row execute function private.prevent_audit_mutation();

create function public.create_garden(
  p_created_by uuid,
  p_name text,
  p_description text,
  p_longitude double precision,
  p_latitude double precision,
  p_status public.garden_status,
  p_photo_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_garden_id uuid;
  v_point extensions.geography(Point, 4326);
  v_photo_count integer;
  v_expected_photo_count integer;
begin
  if p_created_by is null then
    raise exception using errcode = '22023', message = 'USER_REQUIRED';
  end if;

  if p_longitude is null or p_latitude is null
    or p_longitude < -180 or p_longitude > 180
    or p_latitude < -90 or p_latitude > 90 then
    raise exception using errcode = '22023', message = 'INVALID_COORDINATES';
  end if;

  v_expected_photo_count := coalesce(array_length(p_photo_ids, 1), 0);
  if v_expected_photo_count < 1 or v_expected_photo_count > 5 then
    raise exception using errcode = '22023', message = 'INVALID_PHOTO_COUNT';
  end if;

  v_point := extensions.st_setsrid(
    extensions.st_makepoint(p_longitude, p_latitude),
    4326
  )::extensions.geography;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('garden-location-write')::bigint
  );

  if not exists (
    select 1
    from public.service_areas as area
    where area.slug = 'madrid-municipio'
      and extensions.st_covers(area.geom, v_point::extensions.geometry)
  ) then
    raise exception using errcode = 'P0001', message = 'GARDEN_OUTSIDE_SERVICE_AREA';
  end if;

  if exists (
    select 1
    from public.guerrilla_gardens as garden
    where garden.deleted_at is null
      and garden.moderation <> 'rechazado'
      and extensions.st_dwithin(garden.geom, v_point, 25)
  ) then
    raise exception using errcode = 'P0001', message = 'GARDEN_TOO_CLOSE';
  end if;

  select count(*)::integer
  into v_photo_count
  from public.garden_photos as photo
  where photo.id = any(p_photo_ids)
    and photo.owner_id = p_created_by
    and photo.garden_id is null
    and photo.status = 'subida'
    and photo.upload_expires_at > statement_timestamp();

  if v_photo_count <> v_expected_photo_count then
    raise exception using errcode = 'P0001', message = 'INVALID_PHOTOS';
  end if;

  insert into public.guerrilla_gardens (
    name,
    description,
    geom,
    status,
    created_by
  )
  values (
    btrim(p_name),
    nullif(btrim(p_description), ''),
    v_point,
    p_status,
    p_created_by
  )
  returning id into v_garden_id;

  update public.garden_photos as photo
  set garden_id = v_garden_id,
      position = ordered.position
  from (
    select id, (ordinality - 1)::smallint as position
    from unnest(p_photo_ids) with ordinality as item(id, ordinality)
  ) as ordered
  where photo.id = ordered.id;

  return v_garden_id;
end;
$$;

alter table public.service_areas enable row level security;
alter table public.guerrilla_gardens enable row level security;
alter table public.garden_photos enable row level security;
alter table public.admin_audit_log enable row level security;
alter table public.api_idempotency enable row level security;

revoke all on table public.service_areas from anon, authenticated;
revoke all on table public.guerrilla_gardens from anon, authenticated;
revoke all on table public.garden_photos from anon, authenticated;
revoke all on table public.admin_audit_log from anon, authenticated;
revoke all on table public.api_idempotency from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on function public.create_garden(
  uuid,
  text,
  text,
  double precision,
  double precision,
  public.garden_status,
  uuid[]
) from public, anon, authenticated;

grant usage on schema public to service_role;
grant all on table public.service_areas to service_role;
grant all on table public.guerrilla_gardens to service_role;
grant all on table public.garden_photos to service_role;
grant select, insert on table public.admin_audit_log to service_role;
grant all on table public.api_idempotency to service_role;
grant usage, select on all sequences in schema public to service_role;
grant execute on function public.create_garden(
  uuid,
  text,
  text,
  double precision,
  double precision,
  public.garden_status,
  uuid[]
) to service_role;

comment on function public.create_garden is
  'Atomically validates Madrid boundary, 25 m separation and photo ownership before creating a pending garden.';
