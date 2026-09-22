begin;

select plan(3);

select ok(current_database() is not null, 'database is reachable');

select is(
  (select public from storage.buckets where id = 'garden-originals'),
  false,
  'garden-originals bucket is private'
);

select is(
  (select public from storage.buckets where id = 'garden-public'),
  true,
  'garden-public bucket is public'
);

select * from finish();

rollback;
