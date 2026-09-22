# Guía de desarrollo (documento histórico)

> **No usar como especificación de implementación.** Este documento conserva el planteamiento inicial y contiene decisiones sustituidas. La fuente técnica vigente es [`ai_full_documentation.md`](./ai_full_documentation.md): municipio de Madrid, distancia mínima superior a 25 m, fotografías privadas hasta moderación, claves publicables/secretas de Supabase y el stack definido allí.

## 1. Visión General

| Elemento                    | Descripción                                                            | Por qué                                  |
| --------------------------- | ---------------------------------------------------------------------- | ---------------------------------------- |
| **Front‑end**               | SPA con React + Vite; Leaflet para el mapa.                            | UI ligera, carga rápida.                 |
| **Back‑end**                | Server‑less API en Vercel (FastAPI o Node) y Supabase para DB & media. | No mantenimiento de servidores.          |
| **Base de datos**           | PostgreSQL + PostGIS (Supabase)                                        | Índices espaciales, consultas GEO.       |
| **Autenticación**           | JWT (Supabase Auth o Firebase Auth).                                   | Registro social, control de subida.      |
| **Almacenamiento de fotos** | Supabase Storage (bucket `gardens`).                                   | CDN + S3‑compat.                         |
| **Infra‑estructura**        | Vercel (deploy y CDN), Supabase (DB, Auth, Storage).                   | Plan gratuito – nada de hosting en mano. |

## 2. Plan de Desarrollo (Fases)

| Fase                                     | Objetivo                                                         | Entregables                                                                    | Tiempo estimado | Dependencias                | Riesgos                  |
| ---------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------- | --------------------------- | ------------------------ |
| **0. Configuración inicial**             | Crear cuentas, repositorios y infra básica.                      | ✔️ Vercel account, GitHub repo, Supabase project                               | 0.5 día         | Ninguna                     | Falta de credenciales    |
| **1. MVP – Frontend + API**              | Mapa con GG ya existentes + formulario de carga.                 | • SPA cargando pins <br>• Endpoints básicos `/api/gardens`                     | 1 semana        | Supabase ready              | Latencia de API          |
| **2. Autenticación y control de subida** | Registro social, JWT, validación de cercanía, aprobación manual. | • Registro/login <br>• Endpoint POST restringido <br>• Dashboard de aprobación | 1 semana        | JWT library, geofence logic | Ataques XSS/CSRF         |
| **3. Geografía & filtros**               | Filtros por estado, zona, búsqueda por nombre/area.              | • API con query params <br>• UI con filtros                                    | 0.5 semana      | Index spatial               | Inconsistencias de datos |
| **4. Medios & validaciones**             | Subida de fotos, tamaños, tipos, limitaciones de 50 m repetidos. | • Endpoint de uploads <br>• Validaciones serverless                            | 0.5 semana      | supabase storage            | Sobrecarga de banda      |
| **5. Optimización & CI/CD**              | Compilación, tests unitarios, lint, pipeline.                    | • Github Actions – build+deploy <br>• Lint + Jest                              | 1 día           | GitHub Actions              | Fallos de merge          |
| **6. Producción y monitoreo**            | Despacho en producción, métricas, alertas.                       | • Enlace a dominio custom <br>• Configura logs Vercel                          | 0.5 día         | DNS                         | Errores de configuración |
| **7. Feedback & Iteración**              | Recoger usuarios, aplicar mejoras (gamificación, offline, etc.)  | • Issue tracker <br>• Plan de nuevas features                                  | Continuo        | Usuarios                    | Prioridades cambiantes   |

> **Nota**: Si el MVP necesita más tráfico, puede migrar a Vercel Pro o usar un Plan de Supabase a costo.

## 3. Cuentas y Configuraciones Iniciales

### 3.1 Vercel

1. **Crear cuenta** – <https://vercel.com/signup> (GitHub auth o email).
2. **Dashboard → New Project → Import Project** – conectar con GitHub (`gg-madrid/gg-madrid`).
3. **Environment Variables** – en _Settings → Environment Variables_
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (solo para funciones que escriben en DB).
4. **Build & Output Settings**
   - Build Command: `npm run build`
   - Output Directory: `dist` (Vite default).
5. **Cierre de despliegue** – `vercel --prod` en repositorio local.

### 3.2 Supabase

1. **Crear cuenta** – <https://app.supabase.com> (GitHub auth).
2. **Nuevo proyecto** – nombre: `gg-madrid`.
3. **Base de datos** – crea tabla `guerrilla_gardens`
   ```sql
   CREATE TABLE guerrilla_gardens (
       id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       name text NOT NULL,
       geom geography(Point, 4326) NOT NULL,
       status text NOT NULL CHECK (status IN ('VACÍO','EN PROCESO','PLANTADO','EXHUBERANTE','PENDIENTE')),
       photos_url text[],
       description text,
       created_at timestamp with time zone DEFAULT now(),
       created_by uuid REFERENCES auth.users(id)
   );
   CREATE INDEX idx_geom USING GIST (geom);
   ```
4. **Auth** – habilita “Social logins” (Google, GitHub, etc.).
5. **Storage** – crea bucket `gardens` y establece `public` si quieres que las fotos sean accesibles con URL pública; de lo contrario usa signed URLs.
6. **Policies** – escribe políticas row‑level:
   ```sql
   -- Solo los autores pueden editar
   CREATE POLICY "Users can update own gardens"
     ON guerrilla_gardens
     FOR UPDATE USING (created_by = auth.uid());
   ```

### 3.3 Domain (opcional)

1. **Configura un dominio personalizado** en Vercel (ej. `gg-madrid.com`).
2. **DNS** – apuntar `www` a CNAME de Vercel.
3. **SSL** – Vercel genera automáticamente.

## 4. Detalle de Implementación

### 4.1 Front‑End (React + Vite)

| Sección                                                                 | Código / Config                                                                      | Explicación              |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------ |
| **Estructura de carpetas**                                              | `/src/components` – Map, GardenModal, FilterForm, Auth; `/src/api` – fetch wrappers. | Separar vista de lógica. |
| **Map (Leaflet)**                                                       | ```tsx                                                                               |
| import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'; |

````
- Capa OSM: `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`. | Ligera y libre. |
| **Estado del mapa** | `useState<GeoJSON.FeatureCollection>` para pins. | Re-render eficiente. |
| **Filtro** | Dropdown que llama a `/api/gardens?status=PLANTADO`. | Filtrar en backend, no en frontend. |
| **Auth** | `@supabase/supabase-js`. Store token en `sessionStorage`. | `AuthClient.getSession()`. |
| **Formulario de creación** | `Form` con `<input type="file" multiple>`, `<input type="text" name="name">`. | Enviar a `/api/gardens` vía `fetch`. |
| **Plantilla de estilo** | CSS modules o Tailwind. | Rapidez y comunidad. |

### 4.2 API (Vercel Serverless, e.g. `api/gardens/index.ts`)

```ts
// imports...
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') return getGardens(req, res);
  if (req.method === 'POST') return createGarden(req, res);
  res.status(405).end();
}
````

_GET_: recibe `bbox`, `status`. Usa `SELECT * FROM guerrilla_gardens WHERE geom && ST_MakeEnvelope(...)`. _POST_: 1. Valida JWT. 2. Checa `ST_DWithin(geom, point, 50)`. 3. Inserta con `status='PENDIENTE'`. 4. Envia email a admin (SendGrid).

**Upload** (`/api/upload.ts`): - Acepta `multipart/form-data`. - Usa `supabase.storage.from('gardens').upload(...)`. - Devolver URL.

### 4.3 Autenticación y seguridad

- **JWT**: Se genera con `supabase.auth.api.getAccessToken()`. - **Rate‑limit**: Middleware Vercel. - **CORS**: Por defecto Vercel permite los origenes del host. - **XSS/CSRF**: Evitar `dangerouslySetInnerHTML`. - **HTTPS**: Vercel y Supabase garantizan certificado.

### 4.4 CI/CD (GitHub Actions)

```yaml
name: CI/CD

on:
  push:
    branches: [main]

jobs:
  build_and_deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run build
      - uses: amondnet/vercel-action@v20
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
```

- **Secrets** (GitHub repo settings): - `VERCEL_TOKEN` (from Vercel profile) - `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` - `SUPABASE_URL`, `SUPABASE_ANON_KEY` (secrets se pasan al Vercel env).

### 4.5 Testing

| Tipo        | Herramienta                  | Alcance                                           |
| ----------- | ---------------------------- | ------------------------------------------------- |
| Unit        | Jest + React Testing Library | Componentes, utilidades                           |
| Integration | Supertest                    | Endpoints API                                     |
| E2E         | Cypress (Cypress.dev)        | Flujo completo (signup → mapa → submit → approve) |

### 4.6 Monitoreo & Alertas

- **Vercel Analytics** – métricas de despliegue y tráfico. - **Supabase Metrics** – logs de DB, storage. - **Email** – usar SendGrid (con su plan gratuito).

## 5. Flujo de Usuario

1. **Invitado** abre la app → ve mapa y pins. 2. **Usuario registrado** - **Login** (Google, GitHub). - **Mapa** → arranca cámara GPS. - **Click en mapa → Pin** → abre modal de datos. - **Envía** → backend marca como `PENDIENTE`. - **Admin** recibe correo y aprueba → status cambia a `PLANTADO`. 3. **Filtro**: Selecciona `En proceso` → solo pins relevantes.

## 6. Checklist de Preparación

| Paso | Acción                      | Enlace                     | Responsable |
| ---- | --------------------------- | -------------------------- | ----------- |
| 1    | Crear repositorio GitHub    | <https://github.com/new>   | Equipo      |
| 2    | Instalar Vercel CLI         | `npm i -g vercel`          | Dev         |
| 3    | Crear proyecto Vercel       | `vercel init` (React)      | Dev         |
| 4    | Crear proyecto Supabase     | <https://app.supabase.com> | Dev         |
| 5    | Añadir variables env Vercel | `vercel env add ...`       | Dev         |
| 6    | Definir esquema de DB       | `supabase sql ...`         | DBA         |
| 7    | Implementar API y front     | `git push`                 | Dev         |
| 8    | Configurar GitHub Actions   | `.github/workflows/ci.yml` | DevOps      |
| 9    | Test local + staging        | `npm run dev`              | QA          |
| 10   | Deploy a prod               | `vercel --prod`            | DevOps      |

## 7. Roadmap “Siguientes 3 Meses"

| Mes | Tareas                                                                                 | Resultado                   |
| --- | -------------------------------------------------------------------------------------- | --------------------------- |
| 1   | Finalizar MVP con mapa + datos (todos los gg de prueba).                               | MVP funcional               |
| 2   | Lanza Beta cerrada a 200 usuarios, recoge feedback.                                    | Mejorar UX y añadir filtros |
| 3   | Implementar gamificación (badge, ranking) y plan de pago (Vercel Pro) si es necesario. | Escala y monetización       |

## 8. Resumen de Decisiones Clave

| Tema               | Decisión                       | Racional                         |
| ------------------ | ------------------------------ | -------------------------------- |
| **Hosting**        | Vercel (Hobby)                 | CDN, deploy automático, costo 0  |
| **Mapa**           | Leaflet + OSM                  | Totalmente libre, personalizable |
| **Auth**           | Supabase Auth                  | Social + JWT, integración con DB |
| **DB**             | Supabase PostgreSQL + PostGIS  | Índices espaciales, coste bajo   |
| **Almacenamiento** | Supabase Storage               | CDN, compatibilidad S3           |
| **CI/CD**          | GitHub Actions + Vercel action | Integración nativa con repo      |
| **CI**             | Jest + Cypress                 | Cobertura de flujos críticos     |

> **Próximo**: Si deseas lanzar inmediatamente, crea las cuentas y sigue el checklist de configuración. Después de cada fase, haz una revisión de código y actualiza el road‑map con métricas reales. ¡Éxito con Guerrilla Gardens!
