begin;

select plan(12);

insert into auth.users (id, email)
values ('10000000-0000-0000-0000-000000000001', 'garden-tests@example.test');

insert into public.garden_photos (
  id,
  owner_id,
  original_path,
  mime_type,
  size_bytes,
  upload_expires_at
)
select
  format('20000000-0000-0000-0000-%s', lpad(photo_number::text, 12, '0'))::uuid,
  '10000000-0000-0000-0000-000000000001',
  format('garden-tests/%s.jpg', photo_number),
  'image/jpeg',
  1024,
  statement_timestamp() + interval '1 hour'
from generate_series(1, 5) as photo_number;

select ok(
  (
    select extensions.st_isvalid(geom)
      and extensions.st_area(geom::extensions.geography) between 600000000 and 610000000
    from public.service_areas
    where slug = 'madrid-municipio'
  ),
  'official Madrid municipality is valid and has a plausible area'
);

select ok(
  (
    select extensions.st_covers(
      geom,
      extensions.st_setsrid(extensions.st_makepoint(-3.7038, 40.4168), 4326)
    )
    from public.service_areas
    where slug = 'madrid-municipio'
  ),
  'Madrid city centre is inside the service area'
);

select lives_ok(
  $$
    select public.create_garden(
      '10000000-0000-0000-0000-000000000001',
      'Jardín central',
      'Propuesta de prueba',
      -3.7038,
      40.4168,
      'plantado',
      array['20000000-0000-0000-0000-000000000001'::uuid]
    )
  $$,
  'a garden inside Madrid can be created'
);

select is(
  (
    select moderation::text
    from public.guerrilla_gardens
    where name = 'Jardín central'
  ),
  'pendiente',
  'new gardens remain pending moderation'
);

select is(
  (
    select count(*)::integer
    from public.garden_photos
    where garden_id = (
      select id from public.guerrilla_gardens where name = 'Jardín central'
    )
      and position = 0
  ),
  1,
  'the uploaded photo is associated atomically'
);

select throws_ok(
  $$
    select public.create_garden(
      '10000000-0000-0000-0000-000000000001',
      'Jardín duplicado',
      null,
      -3.7038,
      40.4168,
      'vacio',
      array['20000000-0000-0000-0000-000000000002'::uuid]
    )
  $$,
  'P0001',
  'GARDEN_TOO_CLOSE',
  'a garden less than 25 metres away is rejected'
);

select throws_ok(
  (
    select format(
      $query$
        select public.create_garden(
          '10000000-0000-0000-0000-000000000001',
          'Jardín a 25 m',
          null,
          %L,
          %L,
          'vacio',
          array['20000000-0000-0000-0000-000000000003'::uuid]
        )
      $query$,
      extensions.st_x(projected::extensions.geometry),
      extensions.st_y(projected::extensions.geometry)
    )
    from (
      select extensions.st_project(
        extensions.st_setsrid(extensions.st_makepoint(-3.7038, 40.4168), 4326)::extensions.geography,
        25,
        radians(90)
      ) as projected
    ) as location
  ),
  'P0001',
  'GARDEN_TOO_CLOSE',
  'a garden exactly 25 metres away is rejected'
);

select lives_ok(
  (
    select format(
      $query$
        select public.create_garden(
          '10000000-0000-0000-0000-000000000001',
          'Jardín a más de 25 m',
          null,
          %L,
          %L,
          'vacio',
          array['20000000-0000-0000-0000-000000000004'::uuid]
        )
      $query$,
      extensions.st_x(projected::extensions.geometry),
      extensions.st_y(projected::extensions.geometry)
    )
    from (
      select extensions.st_project(
        extensions.st_setsrid(extensions.st_makepoint(-3.7038, 40.4168), 4326)::extensions.geography,
        25.1,
        radians(90)
      ) as projected
    ) as location
  ),
  'a garden more than 25 metres away can be created'
);

select throws_ok(
  $$
    select public.create_garden(
      '10000000-0000-0000-0000-000000000001',
      'Fuera de Madrid',
      null,
      -4.0,
      40.4,
      'vacio',
      array['20000000-0000-0000-0000-000000000005'::uuid]
    )
  $$,
  'P0001',
  'GARDEN_OUTSIDE_SERVICE_AREA',
  'a garden outside Madrid municipality is rejected'
);

select is(
  (
    select count(*)::integer
    from public.guerrilla_gardens
    where created_by = '10000000-0000-0000-0000-000000000001'
  ),
  2,
  'only successful garden creations persist'
);

select is(
  (
    select count(*)::integer
    from public.garden_photos
    where garden_id is null
  ),
  3,
  'failed creations leave their photos unassociated'
);

select is(
  (
    select count(*)::integer
    from public.garden_photos
    where status = 'publicada'
       or public_path is not null
       or thumbnail_path is not null
  ),
  0,
  'pending garden photos remain private'
);

select * from finish();

rollback;
