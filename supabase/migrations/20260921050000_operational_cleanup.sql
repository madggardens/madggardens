alter table public.garden_photos
add column original_deleted_at timestamptz;

create function public.claim_expired_cleanup()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_orphan_paths text[];
  v_retained_original_paths text[];
  v_idempotencies integer;
begin
  with expired as (
    delete from public.api_idempotency
    where expires_at <= statement_timestamp()
    returning 1
  ) select count(*)::integer into v_idempotencies from expired;

  with orphaned as (
    delete from public.garden_photos
    where garden_id is null and upload_expires_at <= statement_timestamp()
    returning original_path
  ) select coalesce(array_agg(original_path), '{}'::text[])
    into v_orphan_paths from orphaned;

  with retained as (
    update public.garden_photos as photo
    set original_deleted_at = statement_timestamp()
    from public.guerrilla_gardens as garden
    where photo.garden_id = garden.id
      and photo.original_deleted_at is null
      and (
        (garden.moderated_at is not null and garden.moderated_at <= statement_timestamp() - interval '30 days')
        or (garden.deleted_at is not null and garden.deleted_at <= statement_timestamp() - interval '30 days')
      )
    returning photo.original_path
  ) select coalesce(array_agg(original_path), '{}'::text[])
    into v_retained_original_paths from retained;

  return jsonb_build_object(
    'idempotenciesDeleted', v_idempotencies,
    'orphanOriginalPaths', to_jsonb(v_orphan_paths),
    'retainedOriginalPaths', to_jsonb(v_retained_original_paths)
  );
end;
$$;

revoke all on function public.claim_expired_cleanup() from public, anon, authenticated;
grant execute on function public.claim_expired_cleanup() to service_role;

create function public.preview_expired_cleanup()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'orphanOriginalPaths', coalesce((
      select jsonb_agg(original_path) from public.garden_photos
      where garden_id is null and upload_expires_at <= statement_timestamp()
    ), '[]'::jsonb),
    'retainedOriginalPaths', coalesce((
      select jsonb_agg(photo.original_path)
      from public.garden_photos as photo
      join public.guerrilla_gardens as garden on garden.id = photo.garden_id
      where photo.original_deleted_at is null
        and (
          (garden.moderated_at is not null and garden.moderated_at <= statement_timestamp() - interval '30 days')
          or (garden.deleted_at is not null and garden.deleted_at <= statement_timestamp() - interval '30 days')
        )
    ), '[]'::jsonb)
  );
$$;

create function public.finalize_expired_cleanup(p_orphan_paths text[], p_retained_paths text[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_idempotencies integer;
begin
  delete from public.garden_photos
  where garden_id is null
    and upload_expires_at <= statement_timestamp()
    and original_path = any(p_orphan_paths);

  update public.garden_photos
  set original_deleted_at = statement_timestamp()
  where original_deleted_at is null and original_path = any(p_retained_paths);

  with expired as (
    delete from public.api_idempotency where expires_at <= statement_timestamp() returning 1
  ) select count(*)::integer into v_idempotencies from expired;
  return v_idempotencies;
end;
$$;

revoke all on function public.preview_expired_cleanup() from public, anon, authenticated;
revoke all on function public.finalize_expired_cleanup(text[], text[]) from public, anon, authenticated;
grant execute on function public.preview_expired_cleanup() to service_role;
grant execute on function public.finalize_expired_cleanup(text[], text[]) to service_role;
