begin;

select plan(10);

insert into auth.users (id, email)
values
  ('60000000-0000-4000-8000-000000000001', 'owner@example.test'),
  ('60000000-0000-4000-8000-000000000002', 'other@example.test');

insert into public.guerrilla_gardens (
  id, name, description, geom, status, moderation, created_by,
  moderated_by, moderated_at, created_at, updated_at
)
values
  (
    '60000000-0000-4000-8000-000000000010', 'Jardín editable', 'Antes',
    extensions.st_setsrid(extensions.st_makepoint(-3.74, 40.42), 4326)::extensions.geography,
    'plantado', 'aprobado', '60000000-0000-4000-8000-000000000001',
    '60000000-0000-4000-8000-000000000099', statement_timestamp(),
    statement_timestamp() - interval '2 hours', statement_timestamp() - interval '1 hour'
  ),
  (
    '60000000-0000-4000-8000-000000000011', 'Otra propuesta', null,
    extensions.st_setsrid(extensions.st_makepoint(-3.75, 40.43), 4326)::extensions.geography,
    'vacio', 'pendiente', '60000000-0000-4000-8000-000000000001',
    null, null, statement_timestamp() - interval '1 hour', statement_timestamp() - interval '1 hour'
  ),
  (
    '60000000-0000-4000-8000-000000000012', 'Jardín ajeno', null,
    extensions.st_setsrid(extensions.st_makepoint(-3.73, 40.41), 4326)::extensions.geography,
    'vacio', 'pendiente', '60000000-0000-4000-8000-000000000002',
    null, null, statement_timestamp(), statement_timestamp()
  );

select is(
  (select count(*)::integer from public.list_owner_gardens('60000000-0000-4000-8000-000000000001', null, 51, null, null)),
  2,
  'the owner list excludes other users gardens'
);

select is(
  (select count(*)::integer from public.list_owner_gardens('60000000-0000-4000-8000-000000000001', 'pendiente', 51, null, null)),
  1,
  'the owner list filters by moderation'
);

select ok(
  public.update_owner_garden(
    '60000000-0000-4000-8000-000000000001',
    '60000000-0000-4000-8000-000000000010',
    'Jardín corregido', 'Después', true, -3.741, 40.421, 'exuberante'
  ),
  'the owner can edit their garden'
);

select is(
  (select moderation::text from public.guerrilla_gardens where id = '60000000-0000-4000-8000-000000000010'),
  'pendiente',
  'editing resets moderation to pending'
);

select is(
  (select moderated_by from public.guerrilla_gardens where id = '60000000-0000-4000-8000-000000000010'),
  null,
  'editing clears previous moderation metadata'
);

select is(
  public.update_owner_garden(
    '60000000-0000-4000-8000-000000000002',
    '60000000-0000-4000-8000-000000000010',
    'Intrusión', null, false, null, null, null
  ),
  false,
  'another user cannot edit the garden'
);

select throws_ok(
  $$ select public.update_owner_garden(
    '60000000-0000-4000-8000-000000000001',
    '60000000-0000-4000-8000-000000000010',
    null, null, false, -4.0, 40.4, null
  ) $$,
  'P0001', 'GARDEN_OUTSIDE_SERVICE_AREA',
  'moving a garden outside Madrid is rejected'
);

select is(
  public.soft_delete_owner_garden(
    '60000000-0000-4000-8000-000000000002',
    '60000000-0000-4000-8000-000000000011'
  ),
  false,
  'another user cannot delete the garden'
);

select ok(
  public.soft_delete_owner_garden(
    '60000000-0000-4000-8000-000000000001',
    '60000000-0000-4000-8000-000000000011'
  ),
  'the owner can soft-delete the garden'
);

select is(
  (select count(*)::integer from public.list_owner_gardens('60000000-0000-4000-8000-000000000001', null, 51, null, null)),
  1,
  'soft-deleted gardens disappear from the owner list'
);

select * from finish();

rollback;
