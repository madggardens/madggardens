# Guerrilla Gardens Madrid — especificación técnica

> Documento de implementación para el MVP. Última revisión: 22 de septiembre de 2026.

## 1. Estado del repositorio y alcance

El repositorio ya contiene el esqueleto React/Nitro, la comprobación de salud, CI, contratos Zod/OpenAPI y las migraciones de dominio. También están implementados el importador reproducible del término municipal, las reglas espaciales atómicas, autenticación sin contraseña mediante magic link y Google OAuth, mapa público, subida firmada, alta idempotente, área personal, eliminación de cuenta con anonimización, edición con sustitución de fotografías, borrado lógico, moderación y derivados WebP sin metadatos. El endurecimiento incluye límites distribuidos mediante Upstash con fallback local, cabeceras de seguridad, logs estructurados de latencia y limpieza diaria protegida. La interfaz incorpora rutas divididas, diseño adaptable, foco visible, gestión de foco en formularios y detalle, lista accesible sincronizada con el mapa, aviso de pérdida de conexión y validación geográfica preliminar en cliente. El recorrido funcional completo está cubierto mediante Playwright y las reglas de datos mediante pruebas SQL.

El MVP permite:

- consultar en un mapa jardines aprobados;
- registrarse e iniciar sesión con Supabase Auth;
- proponer un jardín con una o más fotografías;
- editar una propuesta propia, que vuelve a moderación;
- aprobar o rechazar propuestas desde un panel de administración;
- filtrar por estado físico y limitar consultas al área visible del mapa.

Quedan fuera del MVP: notificaciones push, modo sin conexión, gamificación, analítica de terceros y borrado físico inmediato.

### 1.1 Decisiones de producto adoptadas

1. **Ámbito geográfico:** término municipal de Madrid. El perímetro procede del conjunto oficial [Límites administrativos actuales](https://datos.madrid.es/dataset/900012-0-limites-administrativos-mapas/downloads) del Ayuntamiento de Madrid. El fichero usado, su fecha de descarga, checksum, licencia y script de transformación quedan versionados.
2. **Distancia mínima:** se rechazan propuestas situadas a **25 metros o menos** de otro jardín no rechazado y no eliminado. Por tanto, exactamente 25 m también es conflicto.
3. **Visibilidad de fotos:** los originales permanecen privados. Tras aprobar el jardín se publica una copia procesada, sin EXIF/GPS, en un bucket público. Una propuesta pendiente o rechazada nunca expone sus imágenes sin autorización.
4. **Notificaciones:** el MVP no envía emails al administrador; el panel muestra la cola pendiente. Se reconsiderará tras observar el volumen real.

## 2. Arquitectura

| Capa     | Tecnología                                 | Responsabilidad                                |
| -------- | ------------------------------------------ | ---------------------------------------------- |
| Web      | React + Vite + TypeScript                  | SPA, formularios y estado de sesión            |
| UI       | Tailwind CSS                               | Estilos                                        |
| Mapa     | Leaflet + React Leaflet                    | Mapa, marcadores y viewport                    |
| API      | Nitro + Vercel Functions en TypeScript     | Routing, autorización, validación y moderación |
| Datos    | Supabase PostgreSQL + PostGIS              | Persistencia y consultas geoespaciales         |
| Auth     | Supabase Auth                              | Sesiones y proveedores de identidad            |
| Ficheros | Supabase Storage                           | Originales privados y derivados públicos       |
| Pruebas  | Vitest + Testing Library + Playwright      | Unitarias, integración y E2E                   |
| Entrega  | GitHub Actions + integración Git de Vercel | CI y despliegues preview/producción            |

```text
Navegador (React + Leaflet)
  ├── Supabase Auth (inicio/renovación de sesión)
  └── /api/* (Bearer access token cuando sea necesario)
          │
          ▼
     Vercel Functions
       ├── valida usuario y permisos
       ├── PostgreSQL + PostGIS
       └── Supabase Storage
```

La clave secreta de Supabase solo existe en las Functions. El navegador recibe únicamente la URL del proyecto y la clave publicable.

### 2.1 Decisiones de implementación

- Runtime: Node.js 24 LTS, declarado en `.nvmrc` y `package.json#engines`.
- Gestor: npm con `package-lock.json`; CI usa siempre `npm ci`.
- Routing: React Router.
- Estado remoto y caché: TanStack Query. El estado local permanece en React; no se añade un store global al MVP.
- Formularios: React Hook Form con esquemas Zod compartidos.
- Contratos: Zod es la fuente de verdad y genera OpenAPI en `docs/openapi.json`; CI falla si el artefacto queda desactualizado.
- API: Nitro aporta routing por fichero y handlers Web Standard; no se mezclan handlers Vercel clásicos con handlers Nitro.
- Rate limiting distribuido: Upstash Redis mediante variables REST; nunca memoria local de una Function.
- Procesado de imágenes: Sharp en runtime Node.js.
- Teselas de producción: MapTiler Cloud con clave pública restringida por dominio. `tile.openstreetmap.org` se admite solo en desarrollo manual.

## 3. Estructura prevista

```text
.
├── server/api/
│   ├── gardens/
│   │   ├── index.get.ts
│   │   ├── index.post.ts
│   │   ├── [id].get.ts
│   │   ├── [id].patch.ts
│   │   └── [id].delete.ts
│   ├── uploads/
│   │   ├── sign.post.ts
│   │   └── [photoId].get.ts
│   ├── admin/gardens/[id]/moderation.patch.ts
│   ├── cron/cleanup.get.ts
│   ├── health.get.ts
│   └── ready.get.ts
├── src/
│   ├── api/
│   ├── components/
│   ├── features/auth/
│   ├── features/gardens/
│   ├── features/map/
│   ├── pages/
│   ├── test/
│   └── types/
├── shared/
│   ├── contracts/
│   └── errors.ts
├── data/
│   ├── madrid-municipality.geojson
│   └── service-area-source.json
├── supabase/
│   ├── migrations/
│   ├── tests/
│   └── seed.sql
├── scripts/
│   ├── import-service-area.ts
│   └── set-admin.ts
├── tests/e2e/
├── docs/openapi.json
├── .env.example
├── nitro.config.ts
├── package.json
├── vercel.json
└── vite.config.ts
```

Las dependencias exactas se fijan en `package-lock.json`. Se permiten actualizaciones mediante pull request con CI verde; no se usan rangos abiertos ni la etiqueta `latest` en automatizaciones.

## 4. Modelo de datos

El estado físico y la moderación son conceptos independientes. `PENDIENTE` no es un estado físico del jardín. El siguiente SQL resume el modelo; la migración versionada es la fuente ejecutable de verdad e incluye constraints, índices, metadatos de procedencia y triggers adicionales.

```sql
create extension if not exists postgis;

create type garden_status as enum (
  'vacio', 'en_proceso', 'plantado', 'exuberante'
);

create type moderation_status as enum (
  'pendiente', 'aprobado', 'rechazado'
);

create type photo_status as enum (
  'subida', 'procesando', 'publicada', 'fallida'
);

create table public.service_areas (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  geom geometry(MultiPolygon, 4326) not null,
  source_url text not null,
  source_checksum text not null,
  source_license text not null,
  source_retrieved_at timestamptz not null
);

create index service_areas_geom_gix
  on public.service_areas using gist (geom);

create table public.guerrilla_gardens (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  description text check (description is null or char_length(description) <= 2000),
  geom geography(Point, 4326) not null,
  status garden_status not null,
  moderation moderation_status not null default 'pendiente',
  rejection_reason text,
  created_by uuid references auth.users(id) on delete set null,
  moderated_by uuid,
  moderated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint moderation_audit_consistent check (
    (moderation = 'pendiente' and rejection_reason is null and moderated_by is null and moderated_at is null)
    or (moderation = 'aprobado' and rejection_reason is null and moderated_by is not null and moderated_at is not null)
    or (moderation = 'rechazado' and nullif(trim(rejection_reason), '') is not null and moderated_by is not null and moderated_at is not null)
  )
);

create index guerrilla_gardens_geom_gix
  on public.guerrilla_gardens using gist (geom);
create index guerrilla_gardens_public_idx
  on public.guerrilla_gardens (moderation, status)
  where deleted_at is null;
create index guerrilla_gardens_owner_idx
  on public.guerrilla_gardens (created_by, created_at desc)
  where deleted_at is null;

create table public.garden_photos (
  id uuid primary key default gen_random_uuid(),
  garden_id uuid references public.guerrilla_gardens(id) on delete cascade,
  owner_id uuid references auth.users(id) on delete set null,
  original_path text not null unique,
  public_path text unique,
  thumbnail_path text unique,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes integer not null check (size_bytes between 1 and 10485760),
  position smallint check (position between 0 and 4),
  status photo_status not null default 'subida',
  upload_expires_at timestamptz not null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (garden_id, position),
  constraint associated_photo_has_position check (
    (garden_id is null and position is null)
    or (garden_id is not null and position is not null)
  ),
  constraint published_photo_consistent check (
    (status = 'publicada' and public_path is not null and thumbnail_path is not null and published_at is not null)
    or (status <> 'publicada' and public_path is null and thumbnail_path is null and published_at is null)
  )
);

create table public.admin_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid not null,
  garden_id uuid references public.guerrilla_gardens(id) on delete set null,
  action text not null check (action in ('approve', 'reject', 'soft_delete')),
  reason text,
  request_id uuid not null,
  created_at timestamptz not null default now()
);

create table public.api_idempotency (
  user_id uuid not null,
  key uuid not null,
  request_hash text not null,
  response_status smallint not null,
  response_body jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (user_id, key)
);
```

### 4.1 Reglas espaciales

- Descargar el TopoJSON **Término municipal** del conjunto oficial del Ayuntamiento. `scripts/import-service-area.ts` verifica el checksum esperado, valida que exista una única entidad Madrid, normaliza el cierre del anillo y guarda un único `MultiPolygon` EPSG:4326 válido con `slug = 'madrid-municipio'`.
- Versionar el GeoJSON resultante y un manifiesto con URL de origen, licencia, fecha y checksums de fuente y resultado. Si cambia la fuente oficial, el importador falla hasta que se revise y se acepte expresamente con `--accept-source-change`.
- Aceptar un punto si `ST_Covers(service_area.geom, point::geometry)` es verdadero. `ST_Covers` incluye el límite del polígono.
- Rechazarlo si `ST_DWithin(existing.geom, point, 25)` encuentra otro jardín con `deleted_at is null` y `moderation <> 'rechazado'`. Al editar, excluir el propio `id`.
- Ejecutar proximidad e inserción en una función SQL con `pg_advisory_xact_lock(hashtext('garden-location-write'))`. El bloqueo global es deliberadamente simple para el volumen del MVP; si se convierte en cuello de botella se sustituirá por bloqueo por celda espacial.
- La consulta por viewport debe construir un sobre 4326 validado y usar el índice GiST. No interpolar coordenadas en SQL.

### 4.2 RLS y privilegios

Activar RLS en todas las tablas de dominio del esquema `public`. Para mantener un único límite de autorización, el MVP usa un modelo **solo API**: `anon` y `authenticated` no reciben privilegios ni políticas directas sobre estas tablas.

- Los visitantes obtienen solo jardines aprobados y no eliminados mediante `GET /api/gardens`.
- Un usuario autenticado obtiene sus propias propuestas mediante endpoints que validan su JWT y propiedad.
- No se concede al navegador `select`, `insert`, `update` ni `delete`; todas las lecturas y mutaciones de dominio pasan por la API.
- La API usa una clave secreta y, por ello, **debe** validar JWT, propiedad y rol en cada operación.
- El rol admin se guarda en `app_metadata.role = "admin"`, nunca en `user_metadata`, que puede modificar el usuario.
- `service_areas` tampoco se expone directamente; la API aplica el límite municipal.
- `garden_photos` no concede lectura directa al cliente: la API filtra metadatos y autoriza las imágenes privadas.
- `admin_audit_log` no concede privilegios al cliente y no admite `update` ni `delete` desde la aplicación.
- `storage.objects` permite acceso del cliente únicamente mediante tokens de subida firmada. Los buckets se llaman `garden-originals` (privado) y `garden-public` (público, solo derivados procesados).

Esquema de privilegios del MVP:

```sql
alter table public.guerrilla_gardens enable row level security;
revoke all on table public.guerrilla_gardens from anon, authenticated;
grant select, insert, update, delete on table public.guerrilla_gardens to service_role;
```

La migración también crea un trigger que actualiza `updated_at`. Al devolver una edición a pendiente debe limpiar, en la misma transacción, `rejection_reason`, `moderated_by` y `moderated_at`.

El administrador tampoco accede directamente con un rol PostgreSQL especial: opera mediante la API. Las pruebas de base verifican RLS activado y ausencia de privilegios de cliente; la matriz de visitante, propietario, otro usuario y admin se prueba en la capa HTTP.

## 5. Contrato HTTP

Base: `/api`. Las respuestas correctas usan el código HTTP apropiado y `{ "data": ... }`. Los errores usan:

```json
{
  "error": {
    "code": "GARDEN_TOO_CLOSE",
    "message": "Ya existe un jardín a 25 m o menos.",
    "requestId": "0195f5d0-8e50-7a5c-bc2d-7c0e81d52162",
    "details": []
  }
}
```

No duplicar el código HTTP en un campo `status`. Todas las rutas validan método, `Content-Type`, tamaño del cuerpo y parámetros desconocidos.

| Método   | Ruta                                                                                 | Auth              | Comportamiento                                                           |
| -------- | ------------------------------------------------------------------------------------ | ----------------- | ------------------------------------------------------------------------ |
| `GET`    | `/api/gardens?bbox=minLon,minLat,maxLon,maxLat&status=plantado&limit=100&cursor=...` | No                | Lista aprobados del viewport; máximo 500                                 |
| `GET`    | `/api/gardens/:id`                                                                   | Opcional          | Público si está aprobado; propietario/admin siempre                      |
| `GET`    | `/api/me/gardens?moderation=pendiente&cursor=...`                                    | Usuario           | Lista propuestas propias                                                 |
| `POST`   | `/api/gardens`                                                                       | Usuario           | Crea propuesta pendiente con 1–5 fotos ya subidas                        |
| `PATCH`  | `/api/gardens/:id`                                                                   | Propietario       | Edita contenido y restablece moderación a pendiente                      |
| `DELETE` | `/api/gardens/:id`                                                                   | Propietario/admin | Borrado lógico; `204` sin cuerpo                                         |
| `POST`   | `/api/uploads/sign`                                                                  | Usuario           | Reserva ruta y devuelve token de subida firmada                          |
| `GET`    | `/api/uploads/:photoId`                                                              | Propietario/admin | Devuelve URL temporal del original privado                               |
| `GET`    | `/api/admin/gardens?moderation=pendiente&cursor=...`                                 | Admin             | Cola de moderación                                                       |
| `PATCH`  | `/api/admin/gardens/:id/moderation`                                                  | Admin             | `{ moderation, rejectionReason? }`; el motivo es obligatorio al rechazar |
| `DELETE` | `/api/account`                                                                       | Usuario           | Anonimiza/elimina la cuenta según la política de retención               |

No se crean `/api/auth/login` ni `/api/auth/register`: el cliente usa `@supabase/supabase-js`. Esto evita mantener un envoltorio incompleto de OAuth, refresco y recuperación de contraseña.

### 5.1 Contratos y paginación

`GardenDetail` usa GeoJSON, por lo que las coordenadas siempre son `[longitude, latitude]`:

```json
{
  "id": "uuid",
  "name": "Huerto del barrio",
  "description": "Descripción del jardín",
  "location": { "type": "Point", "coordinates": [-3.7038, 40.4168] },
  "status": "plantado",
  "moderation": "aprobado",
  "photos": [
    { "id": "uuid", "url": "https://.../garden-public/...webp", "thumbnailUrl": "https://..." }
  ],
  "isOwner": false,
  "createdAt": "2026-09-20T10:00:00.000Z",
  "updatedAt": "2026-09-20T10:00:00.000Z"
}
```

- Las listas responden `{ "data": GardenSummary[], "page": { "nextCursor": string | null } }`.
- Orden estable: `created_at desc, id desc`. El cursor es opaco, firmado por el servidor y contiene ambos valores; nunca es un offset.
- `limit` por defecto 100, mínimo 1 y máximo 500 para el mapa; 50 para listas privadas/admin.
- `bbox` es obligatorio en el mapa, con `minLon < maxLon`, `minLat < maxLat` y amplitud máxima de 0,5 grados por eje.
- `GardenSummary` no incluye `description` completa ni información de propietario. `GardenDetail` sí incluye la descripción y, cuando corresponde, `rejectionReason`.
- Una petición anónima nunca revela que existe un recurso pendiente: devuelve `404`.
- Fechas en UTC ISO 8601; IDs UUID; enums en minúsculas ASCII.
- Todas las respuestas JSON usan `Cache-Control: no-store`: la visibilidad puede cambiar al editar, moderar o eliminar una cuenta y una respuesta pública obsoleta podría exponer contenido que ha vuelto a pendiente. Una futura caché de borde requerirá invalidación explícita por jardín. Las URLs firmadas también se responden con `no-store`.
- `POST /api/gardens` admite `Idempotency-Key` UUID durante 24 horas para evitar dobles altas por reintento.
- Los esquemas Zod compartidos validan cliente y servidor. `npm run generate:openapi` regenera `docs/openapi.json` y `npm run check:openapi` comprueba que no haya divergencias.

Cuerpos de escritura:

```jsonc
// POST /api/gardens
{
  "name": "Huerto del barrio",
  "description": "Texto opcional",
  "location": { "type": "Point", "coordinates": [-3.7038, 40.4168] },
  "status": "plantado",
  "photoIds": ["uuid"]
}

// POST /api/uploads/sign
{ "fileName": "foto.jpg", "mimeType": "image/jpeg", "sizeBytes": 123456 }

// PATCH /api/admin/gardens/:id/moderation
{ "moderation": "rechazado", "rejectionReason": "Motivo visible para el propietario" }
```

`PATCH /api/gardens/:id` acepta los mismos campos editables que el alta, todos opcionales pero al menos uno presente; `description: null` la borra y `photoIds`, si aparece, reemplaza el conjunto completo. Otros `null`, campos desconocidos o enums fuera de catálogo producen `400 VALIDATION_ERROR`. La moderación solo acepta `aprobado` o `rechazado`; aprobar prohíbe `rejectionReason` y rechazar exige entre 1 y 500 caracteres.

### 5.2 Validación

| Campo         | Regla                                                          |
| ------------- | -------------------------------------------------------------- |
| `name`        | cadena recortada, 1–120 caracteres                             |
| `description` | opcional, máximo 2000 caracteres                               |
| `longitude`   | número finito entre -180 y 180                                 |
| `latitude`    | número finito entre -90 y 90                                   |
| punto         | cubierto por el polígono de `service_areas`                    |
| `status`      | `vacio`, `en_proceso`, `plantado` o `exuberante`               |
| fotos         | 1–5 IDs propiedad del usuario y no asociados antes             |
| fichero       | JPEG, PNG o WebP; máximo 10 MiB; comprobar firma mágica y MIME |

Errores: validación `400`; autenticación `401`; permisos `403`; no encontrado/no visible `404`; conflicto `409`; límite de peticiones `429`.

Límites iniciales, ajustables por métricas: GET público 120/min por IP; creación 10/h por usuario; firma de subida 20/h por usuario; moderación 60/h por admin. La respuesta `429` incluye `Retry-After` y cabeceras de límite.

## 6. Autenticación y autorización

1. La SPA inicia sesión mediante Supabase Auth (email con enlace/OTP y proveedores habilitados).
2. `supabase-js` gestiona sesión y renovación; no existe `/api/auth/refresh`.
3. La SPA envía `Authorization: Bearer <access_token>` a rutas protegidas.
4. La Function valida el token con Supabase Auth antes de confiar en `sub` o claims.
5. La autorización comprueba propiedad en la base de datos; admin exige `app_metadata.role === "admin"`.
6. Tras cambiar un rol, se fuerza la renovación de sesión para actualizar el claim.

No registrar tokens, claves, URLs firmadas ni cabeceras `Authorization`.

### 6.1 Proveedores y administración inicial

- MVP: email mediante magic link/OTP y Google OAuth. No se implementan contraseñas propias ni GitHub OAuth.
- Configurar URLs de retorno separadas para local, Preview y producción; una URL no incluida se rechaza.
- `scripts/set-admin.ts --email <email>` busca un usuario existente y modifica únicamente `app_metadata.role` con la clave secreta. El script exige confirmación interactiva salvo en CI, registra quién realizó la operación fuera de la aplicación y nunca imprime claves.
- La aplicación no permite promocionar administradores. Para evitar un único punto de fallo se provisionan dos cuentas admin antes del lanzamiento.
- Un admin debe cerrar sesión o refrescarla tras cambiar su rol. Cada ruta admin vuelve a comprobar el claim en servidor.
- `DELETE /api/account` borra propuestas pendientes/rechazadas y sus objetos; en jardines aprobados elimina la asociación de usuario pero conserva el contenido público. Después elimina el usuario mediante Auth Admin. La operación es idempotente y queda completada en un máximo de 30 días si hay reintentos pendientes.

## 7. Flujo de fotografías

1. El cliente valida cantidad, tamaño y tipo básico.
2. `POST /api/uploads/sign` valida al usuario, crea el registro con caducidad a 2 h (la vigencia del token firmado de Supabase) y reserva `<user-id>/<uuid>.<ext>` en el bucket privado `garden-originals`.
3. La API devuelve `{ path, token, photoId, expiresAt }`; el cliente usa `uploadToSignedUrl(path, token, file)`.
4. Al crear el jardín, la API comprueba que cada objeto existe, pertenece al usuario y concuerda en tamaño, firma mágica y MIME; después asocia las fotos en una transacción.
5. Al aprobar, la API marca las fotos como `procesando`, descarga cada original, auto-orienta y elimina metadatos con Sharp, limita el lado mayor a 2000 px y genera WebP calidad 82 más miniatura WebP de 480 px.
6. Los derivados se escriben en el bucket público `garden-public` bajo `<garden-id>/<photo-id>/`. Solo cuando todos existen, una transacción marca fotos y jardín como publicados y escribe auditoría.
7. Si falla el procesado, el jardín sigue pendiente, la foto queda `fallida`, se eliminan derivados parciales y el admin puede reintentar. Nunca se publica una aprobación parcial.
8. Rechazadas y borradas conservan originales privados 30 días para revisión; después se eliminan. Originales de aprobadas se eliminan también a los 30 días, manteniendo derivados.
9. Un cron diario protegido mediante `CRON_SECRET` elimina subidas huérfanas caducadas, originales vencidos, derivados de registros borrados e idempotencias expiradas.

Configurar en cada bucket límites de MIME y tamaño; la validación de aplicación no sustituye esa defensa. Las URLs firmadas de originales duran cinco minutos y se responden con `no-store`.

## 8. Interfaz

### 8.1 Mapa

- Solicitar datos al terminar un movimiento significativo, con debounce y cancelación de la petición anterior.
- No consultar sin `bbox`; limitar área y resultados.
- Agrupar marcadores con una librería compatible con la versión instalada de React Leaflet.
- Mostrar atribución de OpenStreetMap y respetar su política de teselas. Para producción se debe configurar un proveedor apropiado; `tile.openstreetmap.org` no es un CDN gratuito sin límites.
- Abrir un panel accesible con nombre, estado, descripción y fotos.
- Ofrecer una lista sincronizada de los resultados visibles para que todos los jardines sean accesibles con teclado aunque los marcadores estén agrupados.
- Si se deniega o no existe geolocalización, centrar el mapa en Madrid y permitir selección manual; la geolocalización nunca es requisito para crear.
- En móvil, el detalle se abre como panel inferior; en escritorio, como panel lateral. El mapa conserva foco de teclado y el panel anuncia su apertura.

### 8.2 Rutas y formularios

- `/`: mapa y filtros públicos.
- `/gardens/new`: creación protegida.
- `/gardens/:id`: detalle; edición solo para propietario.
- `/admin`: cola de moderación, protegida en cliente por UX y en servidor por seguridad.
- Formularios con etiquetas, errores asociados, teclado, gestión de foco y estados de carga.
- La creación solicita nombre, descripción opcional, estado físico, punto en mapa y 1–5 fotos. Muestra distancia/ámbito inválido antes de enviar, pero el servidor decide definitivamente.
- El propietario puede cambiar nombre, descripción, estado, ubicación y fotos. Cualquier cambio devuelve la propuesta a pendiente; cambiar ubicación vuelve a comprobar municipio y 25 m.
- Estados obligatorios de pantalla: carga inicial, vacío, error recuperable, sin conexión, sin permisos, pendiente, rechazado con motivo y aprobado.
- El rechazo muestra el motivo solo al propietario y administradores.
- MapTiler se configura mediante URL/clave de entorno restringida por dominio y con su atribución. La aplicación debe poder sustituir el proveedor sin cambiar componentes.

## 9. Seguridad y privacidad

- Validar todo en servidor, aunque el cliente ya lo haya hecho.
- Usar consultas parametrizadas o SDK; nunca concatenar SQL.
- Limitar peticiones por IP y usuario, especialmente subida y creación.
- Aplicar allowlist CORS si hay otros orígenes. CORS no autentica.
- Añadir CSP, `X-Content-Type-Options`, `Referrer-Policy` y `Permissions-Policy`.
- La clave secreta nunca lleva prefijo `VITE_`; esas variables son públicas en el bundle.
- Eliminar EXIF/GPS de imágenes para no filtrar ubicación adicional.
- Documentar base legal, retención, derechos y contacto antes de producción: fotos y geolocalización pueden ser datos personales.
- Aplicar borrado lógico inmediato y borrado definitivo programado.
- JWT no elimina todo riesgo CSRF: si la sesión pasa a cookies, se necesita protección CSRF y `SameSite`.

## 10. Variables de entorno

```dotenv
# Públicas: incluidas en el bundle
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_MAPTILER_KEY=
VITE_MAP_TILE_URL=https://api.maptiler.com/maps/streets-v2/256/{z}/{x}/{y}.png?key={key}

# Solo servidor
SUPABASE_URL=
SUPABASE_SECRET_KEY=
APP_BASE_URL=
ALLOWED_ORIGINS=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
CURSOR_SIGNING_SECRET=
CRON_SECRET=
MONITORING_SECRET=
```

- `.env.example` solo contiene nombres y valores ficticios.
- `.env.local` está ignorado por Git.
- Hay valores separados para Development, Preview y Production.
- Preview usa un proyecto Supabase de staging sin datos reales; producción tiene su propio proyecto. El desarrollo usa Supabase CLI local.
- Las claves públicas de MapTiler se restringen por dominio aunque aparezcan en el bundle.
- Se rota inmediatamente cualquier secreto publicado por accidente.

### 10.1 Desarrollo local y migraciones

Requisitos: Git, Docker, Supabase CLI y Node.js 24. El README debe permitir arrancar sin conocimientos implícitos:

```bash
npm ci
supabase start
supabase db reset
npm run dev
```

Scripts mínimos: `dev`, `build`, `preview`, `typecheck`, `lint`, `format:check`, `test`, `test:e2e`, `db:test`, `generate:openapi` y `check:openapi`. `npm run dev` levanta Vite/Nitro; no requiere dos terminales para web y API.

- Toda modificación de esquema es una migración inmutable en `supabase/migrations`; nunca se cambia producción desde el dashboard.
- `seed.sql` solo contiene datos ficticios y un jardín aprobado para desarrollo. No crea administradores ni se ejecuta en producción.
- CI ejecuta una base efímera, aplica todas las migraciones desde cero y corre `supabase test db`.
- Staging y producción son proyectos separados. Un workflow con GitHub Environments y aprobación aplica `supabase db push` usando secretos de ese entorno.
- Las migraciones de producción son retrocompatibles. Cambios destructivos usan patrón expand/contract en dos releases, de modo que el orden entre migración y despliegue web no rompa la aplicación.
- Una comprobación semanal compara el esquema remoto con las migraciones y alerta de drift.
- El `vercel.json` define el fallback de la SPA sin interceptar `/api/*`, el cron diario y las cabeceras de seguridad. CI prueba un deep link de React Router y una ruta API en Preview.

## 11. Pruebas y aceptación

### Unitarias

- validación y normalización;
- conversión GeoJSON/Leaflet (`[longitude, latitude]` frente a `[latitude, longitude]`);
- autorización;
- UI vacía, cargando, error y éxito.

### Integración

- migraciones desde una base vacía;
- RLS activo sin acceso directo para `anon`/`authenticated`, privilegios de `service_role` y autorización HTTP para visitante, propietario, otro usuario y admin;
- punto dentro/fuera del polígono y sobre el límite;
- duplicado a menos de, exactamente y más de 25 m;
- carrera entre dos altas próximas;
- transición de moderación y auditoría;
- límites/propiedad de fotos;
- procesado correcto, eliminación de EXIF y rollback de publicación parcial;
- idempotencia con mismo cuerpo y conflicto si la misma clave llega con otro cuerpo;
- compatibilidad entre esquemas Zod y OpenAPI generado;
- respuestas `400`, `401`, `403`, `404`, `409`, `429` y `5xx` sin detalles internos.

### E2E

1. Visitante ve solo jardines aprobados.
2. Usuario inicia sesión, sube foto y crea propuesta.
3. Otro usuario no puede editarla ni verla pendiente.
4. Admin la aprueba.
5. Visitante la ve en el mapa.
6. Una edición del propietario la devuelve a pendiente.
7. Una fotografía pendiente no es accesible anónimamente y la derivada aprobada sí.
8. Usuario sin geolocalización puede seleccionar el punto manualmente.

La CI ejecuta typecheck, lint, pruebas, build y migraciones de comprobación. El MVP requiere pruebas RLS.

## 12. CI/CD

GitHub Actions valida cada pull request y push a `main`. La integración Git de Vercel crea previews y despliega producción al fusionar en `main`; no hace falta una Action de Vercel con tokens duplicados.

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint
      - run: npm run format:check
      - run: npm run check:openapi
      - run: npm run test -- --run
      - run: npm run build
```

Otro job instala Supabase CLI, ejecuta `supabase start`, `npm run db:setup` y `npm run db:test`. Las E2E se ejecutan en un proyecto local temporal y aislado, nunca contra staging o producción. Renovate agrupa actualizaciones menores y separa cambios mayores para revisión manual.

### 12.1 Entornos y entrega

- Pull request: CI completa y Preview de Vercel conectado a Supabase staging.
- `main`: producción. Solo admite merge con CI, revisión y rama protegida.
- Migraciones: workflow manual/protegido por environment; después se verifica salud y se promueve el despliegue.
- Rollback de aplicación: redeploy del último build sano. Las migraciones no se revierten automáticamente; deben ser compatibles hacia atrás y corregirse con una migración nueva.
- `/api/health` comprueba que el proceso responde, sin consultar dependencias. `/api/ready` verifica conexión mínima a base/Storage y queda protegido mediante `MONITORING_SECRET`.
- `npm run check:deploy-env` rechaza placeholders, HTTP, proyectos cruzados y secretos operativos reutilizados. `npm run verify:deployment` valida un entorno ya desplegado. El procedimiento completo está en `docs/deployment.md`.

## 13. Observabilidad y operación

- Generar `request_id` por petición y devolverlo.
- Usar logs estructurados sin datos sensibles.
- Alertar por `5xx`, latencia, Storage y fallos de moderación.
- Registrar acciones admin en auditoría append-only.
- Antes de admitir datos reales, usar un plan de Supabase con copia diaria o configurar un backup lógico diario cifrado. Objetivos MVP: RPO 24 h y RTO 8 h; probar restauración al menos trimestralmente.
- Mostrar error neutral al usuario y conservar detalle solo en logs.
- SLO inicial: 99,5 % mensual para API; p95 menor de 750 ms en GET y 1,5 s en mutaciones, sin contar subida/procesado de imágenes.
- Presupuesto web móvil: LCP p75 menor de 2,5 s, CLS menor de 0,1 y JavaScript inicial menor de 350 KiB gzip. Panel admin y formularios se cargan de forma diferida.
- Alertar si `5xx` supera 2 % durante cinco minutos, si el cron no termina en 36 h o si hay fotos `procesando` durante más de 15 minutos.
- Retención: logs de aplicación 30 días sin PII; auditoría administrativa 12 meses; idempotencias y subidas huérfanas 24 h; originales privados 30 días tras resolución.

## 14. Orden de implementación

1. Inicializar Vite/TypeScript, calidad y `.env.example`.
2. Integrar Nitro, `/api/health`, contratos Zod/OpenAPI y CI.
3. Crear Supabase local, migraciones, importar el término municipal y añadir pruebas RLS.
4. Implementar autenticación y cliente API.
5. Implementar listado, detalle y mapa como primera funcionalidad vertical.
6. Implementar subida firmada y alta transaccional.
7. Implementar edición, borrado lógico, procesado y moderación.
8. Añadir E2E, rate limit, cabeceras y observabilidad.
9. Provisionar dos admins, conectar Vercel y validar Preview.
10. Revisar seguridad/privacidad, ensayar restauración y fusionar por pull request.

## 15. Definición de terminado

- Los flujos del alcance funcionan en móvil y escritorio.
- RLS, privilegios y autorización HTTP pasan su matriz de pruebas.
- No hay secretos en bundle, repositorio ni logs.
- Las comprobaciones geográficas son atómicas, usan 25 m e índice espacial.
- Originales y fotos pendientes no son públicas; solo derivados procesados de aprobadas lo son.
- CI está verde y Preview validado.
- Hay runbooks de despliegue, rollback, rotación y restauración.
- Accesibilidad básica y política de privacidad están revisadas.

## 16. Referencias oficiales

- [Supabase Auth](https://supabase.com/docs/guides/auth)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase: claves publicables y secretas](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys)
- [Supabase Storage: buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals)
- [Supabase: uploadToSignedUrl](https://supabase.com/docs/reference/javascript/file-buckets-uploadtosignedurl)
- [Supabase: migraciones de base de datos](https://supabase.com/docs/guides/local-development/database-migrations)
- [Ayuntamiento de Madrid: límites administrativos actuales](https://datos.madrid.es/dataset/900012-0-limites-administrativos-mapas/downloads)
- [PostGIS ST_DWithin](https://postgis.net/docs/ST_DWithin.html)
- [PostGIS: índices espaciales](https://postgis.net/documentation/faq/spatial-indexes/)
- [Node.js: versiones y estado LTS](https://nodejs.org/en/about/previous-releases)
- [Vercel con Vite](https://vercel.com/docs/frameworks/frontend/vite)
- [Vercel: Vite + Nitro](https://vercel.com/docs/frameworks/full-stack/vite-with-nitro)
- [Despliegues Git de Vercel](https://vercel.com/docs/git)
- [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs)
- [Upstash Ratelimit](https://upstash.com/docs/redis/sdks/ratelimit-ts/overview)
- [React Leaflet](https://react-leaflet.js.org/)
- [Política de teselas de OpenStreetMap](https://operations.osmfoundation.org/policies/tiles/)

---

Este documento es la fuente técnica inicial del MVP. Toda desviación debe reflejarse aquí o en una decisión de arquitectura versionada.
