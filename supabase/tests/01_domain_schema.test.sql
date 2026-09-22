begin;

select plan(12);

select ok(
  exists (
    select 1
    from pg_catalog.pg_extension
    where extname = 'postgis'
  ),
  'PostGIS is installed'
);

select ok(
  to_regclass('public.service_areas') is not null
    and to_regclass('public.guerrilla_gardens') is not null
    and to_regclass('public.garden_photos') is not null
    and to_regclass('public.admin_audit_log') is not null
    and to_regclass('public.api_idempotency') is not null,
  'all MVP domain tables exist'
);

select is(
  (
    select enum_range(null::public.garden_status)::text
  ),
  '{vacio,en_proceso,plantado,exuberante}',
  'garden status values match the API contract'
);

select is(
  (
    select enum_range(null::public.moderation_status)::text
  ),
  '{pendiente,aprobado,rechazado}',
  'moderation status values match the API contract'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_class as relation
    join pg_catalog.pg_namespace as namespace
      on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname in (
        'service_areas',
        'guerrilla_gardens',
        'garden_photos',
        'admin_audit_log',
        'api_idempotency'
      )
      and relation.relrowsecurity
  ),
  5,
  'RLS is enabled on every domain table'
);

select is(
  (
    select count(*)::integer
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename in (
        'service_areas',
        'guerrilla_gardens',
        'garden_photos',
        'admin_audit_log',
        'api_idempotency'
      )
  ),
  0,
  'API-only tables do not expose direct RLS policies'
);

select ok(
  not has_table_privilege('anon', 'public.guerrilla_gardens', 'select')
    and not has_table_privilege('authenticated', 'public.guerrilla_gardens', 'select'),
  'client roles cannot read gardens directly'
);

select ok(
  not has_table_privilege('anon', 'public.garden_photos', 'select')
    and not has_table_privilege('authenticated', 'public.garden_photos', 'select'),
  'client roles cannot read photo metadata directly'
);

select ok(
  not has_table_privilege('anon', 'public.service_areas', 'select')
    and not has_table_privilege('authenticated', 'public.service_areas', 'select'),
  'client roles cannot read service areas directly'
);

select ok(
  has_table_privilege('service_role', 'public.guerrilla_gardens', 'select')
    and has_table_privilege('service_role', 'public.guerrilla_gardens', 'insert')
    and has_table_privilege('service_role', 'public.guerrilla_gardens', 'update'),
  'server role can operate on gardens'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.create_garden(uuid,text,text,double precision,double precision,public.garden_status,uuid[])',
    'execute'
  ),
  'server role can execute atomic garden creation'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.create_garden(uuid,text,text,double precision,double precision,public.garden_status,uuid[])',
    'execute'
  )
    and not has_function_privilege(
      'authenticated',
      'public.create_garden(uuid,text,text,double precision,double precision,public.garden_status,uuid[])',
      'execute'
    ),
  'client roles cannot bypass the API through create_garden'
);

select * from finish();

rollback;
