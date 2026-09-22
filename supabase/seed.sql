insert into public.guerrilla_gardens (
  id,
  name,
  description,
  geom,
  status,
  moderation,
  moderated_by,
  moderated_at,
  created_at,
  updated_at
)
values
  (
    '40000000-0000-4000-8000-000000000001',
    'Jardín de Lavapiés',
    'Un pequeño espacio vecinal recuperado entre alcorques.',
    extensions.st_setsrid(extensions.st_makepoint(-3.7006, 40.4084), 4326)::extensions.geography,
    'plantado',
    'aprobado',
    '40000000-0000-4000-8000-000000000099',
    '2026-09-18T10:00:00Z',
    '2026-09-18T09:00:00Z',
    '2026-09-18T10:00:00Z'
  ),
  (
    '40000000-0000-4000-8000-000000000002',
    'Rincón verde del Retiro',
    'Plantas resistentes junto a una zona de paso.',
    extensions.st_setsrid(extensions.st_makepoint(-3.6818, 40.4153), 4326)::extensions.geography,
    'exuberante',
    'aprobado',
    '40000000-0000-4000-8000-000000000099',
    '2026-09-19T11:00:00Z',
    '2026-09-19T10:00:00Z',
    '2026-09-19T11:00:00Z'
  ),
  (
    '40000000-0000-4000-8000-000000000003',
    'Propuesta pendiente de prueba',
    'Nunca debe aparecer en la API pública.',
    extensions.st_setsrid(extensions.st_makepoint(-3.715, 40.425), 4326)::extensions.geography,
    'en_proceso',
    'pendiente',
    null,
    null,
    '2026-09-20T09:00:00Z',
    '2026-09-20T09:00:00Z'
  );
