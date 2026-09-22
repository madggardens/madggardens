begin;

select plan(10);

insert into auth.users (id, email)
values ('80000000-0000-4000-8000-000000000001', 'photos@example.test');

insert into public.guerrilla_gardens (
  id, name, geom, status, moderation, created_by, moderated_by, moderated_at
)
values
  (
    '80000000-0000-4000-8000-000000000010', 'Con sustitución',
    extensions.st_setsrid(extensions.st_makepoint(-3.76, 40.45), 4326)::extensions.geography,
    'plantado', 'aprobado', '80000000-0000-4000-8000-000000000001',
    '80000000-0000-4000-8000-000000000099', statement_timestamp()
  ),
  (
    '80000000-0000-4000-8000-000000000011', 'Sin sustitución',
    extensions.st_setsrid(extensions.st_makepoint(-3.74, 40.45), 4326)::extensions.geography,
    'plantado', 'aprobado', '80000000-0000-4000-8000-000000000001',
    '80000000-0000-4000-8000-000000000099', statement_timestamp()
  );

insert into public.garden_photos (
  id, garden_id, owner_id, original_path, public_path, thumbnail_path,
  mime_type, size_bytes, position, status, upload_expires_at, published_at
)
values
  ('80000000-0000-4000-8000-000000000020', '80000000-0000-4000-8000-000000000010', '80000000-0000-4000-8000-000000000001', 'old/one.jpg', 'old/image.webp', 'old/thumb.webp', 'image/jpeg', 100, 0, 'publicada', statement_timestamp() + interval '1 hour', statement_timestamp()),
  ('80000000-0000-4000-8000-000000000021', '80000000-0000-4000-8000-000000000011', '80000000-0000-4000-8000-000000000001', 'keep/one.jpg', 'keep/image.webp', 'keep/thumb.webp', 'image/jpeg', 100, 0, 'publicada', statement_timestamp() + interval '1 hour', statement_timestamp());

insert into public.garden_photos (
  id, owner_id, original_path, mime_type, size_bytes, upload_expires_at
)
values
  ('80000000-0000-4000-8000-000000000030', '80000000-0000-4000-8000-000000000001', 'new/one.jpg', 'image/jpeg', 120, statement_timestamp() + interval '1 hour'),
  ('80000000-0000-4000-8000-000000000031', '80000000-0000-4000-8000-000000000001', 'new/two.jpg', 'image/jpeg', 130, statement_timestamp() + interval '1 hour');

create temporary table replacement_result as
select public.update_owner_garden_v2(
  '80000000-0000-4000-8000-000000000001',
  '80000000-0000-4000-8000-000000000010',
  null, null, false, null, null, null,
  array[
    '80000000-0000-4000-8000-000000000030'::uuid,
    '80000000-0000-4000-8000-000000000031'::uuid
  ]
) as result;

select is((select result->>'updated' from replacement_result), 'true', 'the replacement succeeds');
select is(
  (select jsonb_array_length(result->'publicPathsToDelete') from replacement_result),
  2,
  'both old public derivatives are returned for cleanup'
);
select is(
  (select result->'originalPathsToDelete'->>0 from replacement_result),
  'old/one.jpg',
  'the old original is returned for cleanup'
);
select is(
  (select count(*)::integer from public.garden_photos where id = '80000000-0000-4000-8000-000000000020'),
  0,
  'the old photo record is removed'
);
select is(
  (select count(*)::integer from public.garden_photos where garden_id = '80000000-0000-4000-8000-000000000010'),
  2,
  'all replacement photos are associated'
);
select is(
  (select max(position)::integer from public.garden_photos where garden_id = '80000000-0000-4000-8000-000000000010'),
  1,
  'replacement order is retained'
);
select is(
  (select moderation::text from public.guerrilla_gardens where id = '80000000-0000-4000-8000-000000000010'),
  'pendiente',
  'replacement resets moderation'
);

select lives_ok(
  $$ select public.update_owner_garden_v2(
    '80000000-0000-4000-8000-000000000001',
    '80000000-0000-4000-8000-000000000011',
    'Cambio de texto', null, false, null, null, null, null
  ) $$,
  'editing without replacement succeeds'
);
select is(
  (select status::text from public.garden_photos where id = '80000000-0000-4000-8000-000000000021'),
  'subida',
  'retained photos become private and await reprocessing'
);
select is(
  (select public_path from public.garden_photos where id = '80000000-0000-4000-8000-000000000021'),
  null,
  'retained photo derivatives are detached'
);

select * from finish();

rollback;
