begin;

select plan(10);

select is(
  (
    select count(*)::integer
    from public.list_public_gardens(-3.8, 40.3, -3.6, 40.5)
  ),
  2,
  'public listing contains only approved gardens'
);

select is(
  (
    select count(*)::integer
    from public.list_public_gardens(-3.8, 40.3, -3.6, 40.5, 'plantado')
  ),
  1,
  'public listing filters by physical status'
);

select is(
  (
    select count(*)::integer
    from public.list_public_gardens(-3.71, 40.4, -3.69, 40.41)
  ),
  1,
  'public listing filters by viewport'
);

select throws_ok(
  $$ select * from public.list_public_gardens(-4.0, 40.0, -3.0, 41.0) $$,
  '22023',
  'INVALID_BBOX',
  'oversized viewports are rejected in the database'
);

select is(
  (
    select name
    from public.list_public_gardens(
      -3.8,
      40.3,
      -3.6,
      40.5,
      null,
      10,
      '2026-09-19T10:00:00Z',
      '40000000-0000-4000-8000-000000000002'
    )
    limit 1
  ),
  'Jardín de Lavapiés',
  'keyset cursor returns only older gardens'
);

select is(
  (public.get_visible_garden('40000000-0000-4000-8000-000000000001')->>'name'),
  'Jardín de Lavapiés',
  'approved garden detail is public'
);

select is(
  public.get_visible_garden('40000000-0000-4000-8000-000000000003'),
  null,
  'pending garden detail is hidden from visitors'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.list_public_gardens(double precision,double precision,double precision,double precision,public.garden_status,integer,timestamp with time zone,uuid)',
    'execute'
  ),
  'anonymous clients cannot execute the listing function directly'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.get_visible_garden(uuid,uuid,boolean)',
    'execute'
  ),
  'authenticated clients cannot execute the detail function directly'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.list_public_gardens(double precision,double precision,double precision,double precision,public.garden_status,integer,timestamp with time zone,uuid)',
    'execute'
  )
    and has_function_privilege(
      'service_role',
      'public.get_visible_garden(uuid,uuid,boolean)',
      'execute'
    ),
  'server role can execute public garden queries'
);

select * from finish();

rollback;
