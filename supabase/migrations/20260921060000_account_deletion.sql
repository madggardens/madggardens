create function public.prepare_account_deletion(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null then
    raise exception using errcode = '22023', message = 'USER_REQUIRED';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 0));

  return jsonb_build_object(
    'originalPaths', coalesce((
      select jsonb_agg(photo.original_path order by photo.created_at)
      from public.garden_photos as photo
      where photo.owner_id = p_user_id and photo.original_deleted_at is null
    ), '[]'::jsonb),
    'publicPaths', coalesce((
      select jsonb_agg(path order by path)
      from (
        select photo.public_path as path
        from public.garden_photos as photo
        join public.guerrilla_gardens as garden on garden.id = photo.garden_id
        where garden.created_by = p_user_id
          and (garden.moderation <> 'aprobado' or garden.deleted_at is not null)
          and photo.public_path is not null
        union all
        select photo.thumbnail_path as path
        from public.garden_photos as photo
        join public.guerrilla_gardens as garden on garden.id = photo.garden_id
        where garden.created_by = p_user_id
          and (garden.moderation <> 'aprobado' or garden.deleted_at is not null)
          and photo.thumbnail_path is not null
      ) as removable_paths
    ), '[]'::jsonb)
  );
end;
$$;

create function public.finalize_account_deletion(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted_gardens integer;
  v_anonymized_gardens integer;
begin
  if p_user_id is null then
    raise exception using errcode = '22023', message = 'USER_REQUIRED';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 0));

  delete from public.api_idempotency where user_id = p_user_id;
  delete from public.garden_photos where owner_id = p_user_id and garden_id is null;

  with removed as (
    delete from public.guerrilla_gardens
    where created_by = p_user_id
      and (moderation <> 'aprobado' or deleted_at is not null)
    returning 1
  ) select count(*)::integer into v_deleted_gardens from removed;

  update public.garden_photos as photo
  set owner_id = null,
      original_deleted_at = coalesce(photo.original_deleted_at, statement_timestamp())
  from public.guerrilla_gardens as garden
  where photo.garden_id = garden.id
    and garden.created_by = p_user_id
    and garden.moderation = 'aprobado'
    and garden.deleted_at is null;

  with anonymized as (
    update public.guerrilla_gardens
    set created_by = null
    where created_by = p_user_id
      and moderation = 'aprobado'
      and deleted_at is null
    returning 1
  ) select count(*)::integer into v_anonymized_gardens from anonymized;

  return jsonb_build_object(
    'deletedGardens', v_deleted_gardens,
    'anonymizedGardens', v_anonymized_gardens
  );
end;
$$;

revoke all on function public.prepare_account_deletion(uuid) from public, anon, authenticated;
revoke all on function public.finalize_account_deletion(uuid) from public, anon, authenticated;
grant execute on function public.prepare_account_deletion(uuid) to service_role;
grant execute on function public.finalize_account_deletion(uuid) to service_role;

comment on function public.prepare_account_deletion is
  'Lists private objects that must be removed before deleting an account.';
comment on function public.finalize_account_deletion is
  'Deletes private proposals and anonymizes approved public gardens before Auth deletion.';
