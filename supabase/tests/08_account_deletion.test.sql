begin;

select plan(12);

insert into auth.users (id, email)
values ('90000000-0000-4000-8000-000000000001', 'delete-me@example.test');

insert into public.guerrilla_gardens (
  id, name, geom, status, moderation, created_by, moderated_by, moderated_at, rejection_reason, deleted_at
)
values
  (
    '90000000-0000-4000-8000-000000000010', 'Aprobado conservado',
    extensions.st_setsrid(extensions.st_makepoint(-3.80, 40.45), 4326)::extensions.geography,
    'plantado', 'aprobado', '90000000-0000-4000-8000-000000000001',
    '90000000-0000-4000-8000-000000000099', statement_timestamp(), null, null
  ),
  (
    '90000000-0000-4000-8000-000000000011', 'Pendiente eliminado',
    extensions.st_setsrid(extensions.st_makepoint(-3.79, 40.45), 4326)::extensions.geography,
    'vacio', 'pendiente', '90000000-0000-4000-8000-000000000001', null, null, null, null
  ),
  (
    '90000000-0000-4000-8000-000000000012', 'Rechazado eliminado',
    extensions.st_setsrid(extensions.st_makepoint(-3.78, 40.45), 4326)::extensions.geography,
    'vacio', 'rechazado', '90000000-0000-4000-8000-000000000001',
    '90000000-0000-4000-8000-000000000099', statement_timestamp(), 'No válido', null
  ),
  (
    '90000000-0000-4000-8000-000000000013', 'Aprobado ya borrado',
    extensions.st_setsrid(extensions.st_makepoint(-3.77, 40.45), 4326)::extensions.geography,
    'plantado', 'aprobado', '90000000-0000-4000-8000-000000000001',
    '90000000-0000-4000-8000-000000000099', statement_timestamp(), null, statement_timestamp()
  );

insert into public.garden_photos (
  id, garden_id, owner_id, original_path, public_path, thumbnail_path,
  mime_type, size_bytes, position, status, upload_expires_at, published_at
)
values
  ('90000000-0000-4000-8000-000000000020', '90000000-0000-4000-8000-000000000010', '90000000-0000-4000-8000-000000000001', 'account/approved.jpg', 'approved/image.webp', 'approved/thumb.webp', 'image/jpeg', 100, 0, 'publicada', statement_timestamp() + interval '1 hour', statement_timestamp()),
  ('90000000-0000-4000-8000-000000000021', '90000000-0000-4000-8000-000000000011', '90000000-0000-4000-8000-000000000001', 'account/pending.jpg', null, null, 'image/jpeg', 100, 0, 'subida', statement_timestamp() + interval '1 hour', null),
  ('90000000-0000-4000-8000-000000000022', '90000000-0000-4000-8000-000000000013', '90000000-0000-4000-8000-000000000001', 'account/deleted.jpg', 'deleted/image.webp', 'deleted/thumb.webp', 'image/jpeg', 100, 0, 'publicada', statement_timestamp() + interval '1 hour', statement_timestamp());

insert into public.garden_photos (
  id, owner_id, original_path, mime_type, size_bytes, upload_expires_at
)
values ('90000000-0000-4000-8000-000000000023', '90000000-0000-4000-8000-000000000001', 'account/orphan.jpg', 'image/jpeg', 100, statement_timestamp() + interval '1 hour');

insert into public.api_idempotency (
  user_id, key, request_hash, response_status, response_body, expires_at
)
values (
  '90000000-0000-4000-8000-000000000001',
  '90000000-0000-4000-8000-000000000030', 'hash', 201, '{}'::jsonb,
  statement_timestamp() + interval '1 day'
);

create temporary table deletion_plan as
select public.prepare_account_deletion('90000000-0000-4000-8000-000000000001') as result;

select is(
  (select jsonb_array_length(result->'originalPaths') from deletion_plan),
  4,
  'all private originals are scheduled for removal'
);
select is(
  (select jsonb_array_length(result->'publicPaths') from deletion_plan),
  2,
  'only derivatives belonging to non-public gardens are removed'
);

select public.finalize_account_deletion('90000000-0000-4000-8000-000000000001');

select is((select count(*)::integer from public.guerrilla_gardens where id = '90000000-0000-4000-8000-000000000010'), 1, 'approved garden remains');
select is((select created_by from public.guerrilla_gardens where id = '90000000-0000-4000-8000-000000000010'), null, 'approved garden is anonymized');
select is((select count(*)::integer from public.guerrilla_gardens where id in ('90000000-0000-4000-8000-000000000011', '90000000-0000-4000-8000-000000000012', '90000000-0000-4000-8000-000000000013')), 0, 'private and already deleted gardens are removed');
select is((select owner_id from public.garden_photos where id = '90000000-0000-4000-8000-000000000020'), null, 'approved photo is detached from the account');
select ok((select original_deleted_at is not null from public.garden_photos where id = '90000000-0000-4000-8000-000000000020'), 'approved original is marked as deleted');
select is((select public_path from public.garden_photos where id = '90000000-0000-4000-8000-000000000020'), 'approved/image.webp', 'approved derivative remains public');
select is((select count(*)::integer from public.garden_photos where id = '90000000-0000-4000-8000-000000000023'), 0, 'orphan upload record is removed');
select is((select count(*)::integer from public.api_idempotency where user_id = '90000000-0000-4000-8000-000000000001'), 0, 'idempotency data is removed');
select ok(not has_function_privilege('authenticated', 'public.prepare_account_deletion(uuid)', 'EXECUTE'), 'authenticated cannot prepare account deletion directly');
select ok(not has_function_privilege('authenticated', 'public.finalize_account_deletion(uuid)', 'EXECUTE'), 'authenticated cannot finalize account deletion directly');

select * from finish();
rollback;
