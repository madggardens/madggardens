begin;

select plan(12);

insert into auth.users (id, email)
values
  ('70000000-0000-4000-8000-000000000001', 'admin@example.test'),
  ('70000000-0000-4000-8000-000000000002', 'owner@example.test');

insert into public.guerrilla_gardens (id, name, geom, status, created_by)
values
  (
    '70000000-0000-4000-8000-000000000010', 'Para aprobar',
    extensions.st_setsrid(extensions.st_makepoint(-3.76, 40.44), 4326)::extensions.geography,
    'plantado', '70000000-0000-4000-8000-000000000002'
  ),
  (
    '70000000-0000-4000-8000-000000000011', 'Para rechazar',
    extensions.st_setsrid(extensions.st_makepoint(-3.74, 40.44), 4326)::extensions.geography,
    'vacio', '70000000-0000-4000-8000-000000000002'
  ),
  (
    '70000000-0000-4000-8000-000000000012', 'Proceso fallido',
    extensions.st_setsrid(extensions.st_makepoint(-3.72, 40.44), 4326)::extensions.geography,
    'vacio', '70000000-0000-4000-8000-000000000002'
  );

insert into public.garden_photos (
  id, garden_id, owner_id, original_path, mime_type, size_bytes,
  position, upload_expires_at
)
values
  ('70000000-0000-4000-8000-000000000020', '70000000-0000-4000-8000-000000000010', '70000000-0000-4000-8000-000000000002', 'owner/approve.jpg', 'image/jpeg', 100, 0, statement_timestamp() + interval '1 hour'),
  ('70000000-0000-4000-8000-000000000021', '70000000-0000-4000-8000-000000000012', '70000000-0000-4000-8000-000000000002', 'owner/fail.jpg', 'image/jpeg', 100, 0, statement_timestamp() + interval '1 hour');

select is(
  (
    select count(*)::integer
    from public.list_admin_gardens('pendiente', 51, null, null)
    where id::text like '70000000%'
  ),
  3,
  'the admin queue lists all pending gardens'
);

select is(
  jsonb_array_length(public.begin_garden_approval('70000000-0000-4000-8000-000000000010')->'photos'),
  1,
  'approval begins with all garden photos'
);

select is(
  (select status::text from public.garden_photos where id = '70000000-0000-4000-8000-000000000020'),
  'procesando',
  'beginning approval marks photos as processing'
);

select ok(
  public.complete_garden_approval(
    '70000000-0000-4000-8000-000000000010',
    '70000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000030',
    array['70000000-0000-4000-8000-000000000020'::uuid],
    array['garden/photo/image.webp'],
    array['garden/photo/thumbnail.webp']
  ),
  'approval completes atomically'
);

select is(
  (select moderation::text from public.guerrilla_gardens where id = '70000000-0000-4000-8000-000000000010'),
  'aprobado',
  'the garden becomes approved'
);

select is(
  (select status::text from public.garden_photos where id = '70000000-0000-4000-8000-000000000020'),
  'publicada',
  'the processed photo becomes public'
);

select is(
  (select action from public.admin_audit_log where garden_id = '70000000-0000-4000-8000-000000000010'),
  'approve',
  'approval is audited'
);

select ok(
  public.reject_garden(
    '70000000-0000-4000-8000-000000000011',
    '70000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000031',
    'La ubicación no está suficientemente documentada.'
  ),
  'a pending garden can be rejected'
);

select is(
  (select rejection_reason from public.guerrilla_gardens where id = '70000000-0000-4000-8000-000000000011'),
  'La ubicación no está suficientemente documentada.',
  'the rejection reason is retained for the owner'
);

select lives_ok(
  $$ select public.begin_garden_approval('70000000-0000-4000-8000-000000000012') $$,
  'another approval can begin'
);

select lives_ok(
  $$ select public.fail_garden_approval('70000000-0000-4000-8000-000000000012') $$,
  'a failed image pipeline can be recorded'
);

select is(
  (select status::text from public.garden_photos where id = '70000000-0000-4000-8000-000000000021'),
  'fallida',
  'failed processing leaves the photo retryable'
);

select * from finish();

rollback;
