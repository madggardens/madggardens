begin;

select plan(10);

insert into auth.users (id, email)
values ('50000000-0000-4000-8000-000000000001', 'creation-tests@example.test');

select is(
  public.reserve_garden_photo(
    '50000000-0000-4000-8000-000000000010',
    '50000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001/50000000-0000-4000-8000-000000000010.jpg',
    'image/jpeg',
    1234,
    statement_timestamp() + interval '2 hours'
  ),
  '50000000-0000-4000-8000-000000000010'::uuid,
  'a private photo path can be reserved'
);

select is(
  (
    select owner_id
    from public.garden_photos
    where id = '50000000-0000-4000-8000-000000000010'
  ),
  '50000000-0000-4000-8000-000000000001'::uuid,
  'the reservation belongs to the authenticated user'
);

select throws_ok(
  $$
    select public.reserve_garden_photo(
      '50000000-0000-4000-8000-000000000011',
      '50000000-0000-4000-8000-000000000001',
      'another-user/50000000-0000-4000-8000-000000000011.jpg',
      'image/jpeg',
      1234,
      statement_timestamp() + interval '2 hours'
    )
  $$,
  '22023',
  'INVALID_PHOTO_PATH',
  'a reservation cannot escape the user namespace'
);

select is(
  jsonb_array_length(
    public.get_unassociated_photos(
      '50000000-0000-4000-8000-000000000001',
      array['50000000-0000-4000-8000-000000000010'::uuid]
    )
  ),
  1,
  'reserved photo metadata is available for server verification'
);

select is(
  (
    public.create_garden_idempotent(
      '50000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000020',
      'same-request-hash',
      'Jardín idempotente',
      null,
      -3.75,
      40.44,
      'en_proceso',
      array['50000000-0000-4000-8000-000000000010'::uuid]
    )->>'replayed'
  ),
  'false',
  'the first request creates the garden'
);

select is(
  (
    public.get_idempotent_creation(
      '50000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000020',
      'same-request-hash'
    )->>'replayed'
  ),
  'true',
  'an API retry can recover the response before revalidating associated photos'
);

select is(
  (
    public.create_garden_idempotent(
      '50000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000020',
      'same-request-hash',
      'Jardín idempotente',
      null,
      -3.75,
      40.44,
      'en_proceso',
      array['50000000-0000-4000-8000-000000000010'::uuid]
    )->>'replayed'
  ),
  'true',
  'repeating the same request returns the stored response'
);

select throws_ok(
  $$
    select public.create_garden_idempotent(
      '50000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000020',
      'different-request-hash',
      'Otro jardín',
      null,
      -3.74,
      40.44,
      'vacio',
      array['50000000-0000-4000-8000-000000000010'::uuid]
    )
  $$,
  'P0001',
  'IDEMPOTENCY_CONFLICT',
  'reusing a key with another body is rejected'
);

select is(
  (select count(*)::integer from public.guerrilla_gardens where name = 'Jardín idempotente'),
  1,
  'idempotent retries create only one garden'
);

select is(
  (
    select count(*)::integer
    from public.api_idempotency
    where user_id = '50000000-0000-4000-8000-000000000001'
  ),
  1,
  'the successful response is retained once'
);

select * from finish();

rollback;
