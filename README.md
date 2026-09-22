# Guerrilla Gardens Madrid

Mapa comunitario de jardines urbanos del municipio de Madrid. El repositorio contiene la SPA, la API y las migraciones de Supabase.

## Requisitos

- Node.js 24 LTS
- npm 11
- Docker Desktop o Docker Engine

## Inicio completo en Windows con CMD

Los siguientes comandos son para el Símbolo del sistema (`cmd.exe`), cuyo prompt tiene un aspecto similar a `F:\Proyectos\madggardens>`. No los ejecutes en PowerShell ni en Git Bash porque la inicialización de fnm cambia según el shell.

### 1. Abrir el repositorio y activar Node 24

Abre Docker Desktop y espera a que indique que el motor está en ejecución. Después abre una ventana nueva de CMD y ejecuta:

```cmd
cd /d F:\Proyectos\madggardens
FOR /f "tokens=*" %i IN ('fnm env --use-on-cd --shell cmd') DO CALL %i
fnm use 24
node --version
npm --version
```

`node --version` debe mostrar `v24.x`. La línea de fnm utiliza `%i` en una terminal interactiva; dentro de un archivo `.bat` tendría que utilizar `%%i`.

### 2. Instalar las dependencias

En el primer arranque, o cuando cambie `package-lock.json`, ejecuta:

```cmd
npm ci
```

No es necesario repetir `npm ci` en cada arranque. Si aparece un error `EPERM`, consulta la sección de resolución de problemas más abajo antes de continuar.

### 3. Iniciar y preparar Supabase

```cmd
npm run supabase:start
npm run db:setup
npx supabase status
```

`db:setup` reconstruye la base de datos, aplica las migraciones, importa el perímetro municipal y carga los datos de ejemplo. Es destructivo para los datos locales y solo es necesario en la preparación inicial, al incorporar migraciones o cuando quieras reiniciar la base.

El último comando muestra, entre otros valores, `API_URL`, `PUBLISHABLE_KEY` y `SECRET_KEY`. No publiques ni añadas esas claves al repositorio.

### 4. Crear y configurar `.env.local`

Crea el archivo únicamente si aún no existe y ábrelo con el Bloc de notas:

```cmd
if not exist .env.local copy .env.example .env.local
notepad .env.local
```

Completa el archivo usando los valores mostrados por `npx supabase status`:

| Variable de `.env.local`            | Valor que debes utilizar                      |
| ----------------------------------- | --------------------------------------------- |
| `VITE_SUPABASE_URL`                 | `API_URL`                                     |
| `VITE_SUPABASE_PUBLISHABLE_KEY`     | `PUBLISHABLE_KEY`                             |
| `SUPABASE_URL`                      | `API_URL`                                     |
| `SUPABASE_SECRET_KEY`               | `SECRET_KEY`                                  |
| `APP_BASE_URL` y `ALLOWED_ORIGINS`  | `http://localhost:3000`                       |
| `VITE_MAPTILER_KEY`                 | Puede conservar el valor ficticio en local    |
| `UPSTASH_REDIS_REST_URL` y `_TOKEN` | Pueden quedar vacías para el desarrollo local |
| `CURSOR_SIGNING_SECRET`              | Secreto aleatorio exclusivo para cursores      |
| `CRON_SECRET`                        | Secreto aleatorio exclusivo para el cron       |
| `MONITORING_SECRET`                  | Secreto diferente para `/api/ready`             |

Genera dos secretos locales nuevos desde CMD:

```cmd
node -e "const c=require('node:crypto'); console.log('CURSOR_SIGNING_SECRET='+c.randomBytes(32).toString('hex')); console.log('CRON_SECRET='+c.randomBytes(32).toString('hex')); console.log('MONITORING_SECRET='+c.randomBytes(32).toString('hex'))"
```

Copia cada línea generada en la variable correspondiente de `.env.local`. No reutilices `SECRET_KEY` para estos valores. Guarda el archivo y cierra el Bloc de notas.

### 5. Levantar y comprobar la aplicación

Arranca el servidor después de haber guardado `.env.local`:

```cmd
npm run dev
```

Mantén esa ventana abierta. En una segunda ventana de CMD, comprueba la API:

```cmd
cd /d F:\Proyectos\madggardens
curl http://localhost:3000/api/health
start "" http://localhost:3000
```

La API debe responder con JSON y el navegador debe mostrar el mapa con los jardines de ejemplo. También puedes abrir Supabase Studio en `http://localhost:54323`.

Si modificas `.env.local` mientras Vite está abierto, detén `npm run dev` con `Ctrl+C` y vuelve a ejecutarlo. Las variables de entorno se leen al arrancar y no basta con refrescar el navegador.

El acceso por correo no utiliza contraseña. Supabase envía un enlace de un solo uso y, en local,
el mensaje se consulta en Mailpit desde `http://localhost:54324`. Para producción y Preview:

1. Configura un proveedor SMTP en Supabase Auth.
2. Añade las URL exactas de ambos entornos a la lista de redirecciones permitidas.
3. Habilita Google en Supabase Auth, configura sus credenciales OAuth y registra como callback la
   URL que muestra el panel de Supabase.

Para promover una cuenta existente a administrador usa la clave secreta únicamente desde una
terminal segura:

```cmd
npm run set-admin -- --email usuario@example.com
```

El comando solicita escribir `admin`, conserva el resto de `app_metadata` y no imprime claves. La
persona deberá cerrar y volver a iniciar sesión para recibir el rol actualizado.

### 6. Ejecutar las comprobaciones

Con Supabase todavía levantado, ejecuta en la segunda ventana de CMD:

```cmd
cd /d F:\Proyectos\madggardens
FOR /f "tokens=*" %i IN ('fnm env --use-on-cd --shell cmd') DO CALL %i
fnm use 24
npm run typecheck
npm run lint
npm run format:check
npm run check:openapi
npm run test:run
npm run db:test
npm run build
```

### 7. Parar los servicios

Pulsa `Ctrl+C` en la ventana donde se ejecuta `npm run dev`. Después ejecuta:

```cmd
npm run supabase:stop
```

Supabase conserva los datos locales al detenerse.

## Preparación

### Git Bash en Windows

Activa Node 24 en cada terminal nueva antes de usar npm:

```bash
eval "$(fnm env --use-on-cd --shell bash)"
fnm use 24
node --version
npm --version
```

`node --version` debe mostrar una versión `v24.x`. Ejecuta después estos pasos desde la raíz del repositorio la primera vez que lo clones:

```bash
npm ci
npm run supabase:start
npm run db:setup
cp .env.example .env.local
npx supabase status
```

Tras iniciar Supabase, sustituye las claves ficticias de `.env.local` por `API_URL`, `PUBLISHABLE_KEY` y `SECRET_KEY`, que puedes volver a consultar con `npx supabase status`. La clave publicable se utiliza en `VITE_SUPABASE_PUBLISHABLE_KEY`; la secreta, únicamente en `SUPABASE_SECRET_KEY`. Nunca pongas la clave secreta en una variable que empiece por `VITE_`.

Sustituye también `CURSOR_SIGNING_SECRET` por un valor aleatorio propio de al menos 32 caracteres. Se utiliza exclusivamente en el servidor para firmar los cursores de paginación y no debe reutilizar ninguna clave de Supabase ni exponerse mediante una variable `VITE_`.

En PowerShell, inicializa primero fnm con `fnm env --shell powershell | Out-String | Invoke-Expression` y usa `Copy-Item .env.example .env.local` en lugar de `cp`. En CMD, inicializa fnm con `FOR /f "tokens=*" %i IN ('fnm env --use-on-cd --shell cmd') DO CALL %i`.

`db:setup` reconstruye la base e importa el perímetro oficial del municipio de Madrid. El importador verifica el checksum ya versionado y se detiene si la fuente oficial cambia; ese cambio debe revisarse antes de ejecutar `npm run import:service-area -- --accept-source-change`.

### Error `EPERM` durante `npm ci` en Windows

`npm ci` reemplaza por completo `node_modules`. Windows devuelve `EPERM` si Vite, Vitest, otro proceso de Node, el editor o el antivirus mantiene abierto uno de esos archivos. No suele ser un problema de permisos y abrir la terminal como administrador no es el primer paso recomendado.

1. Detén con `Ctrl+C` cualquier `npm run dev`, `npm test` o proceso similar abierto para este repositorio y cierra los terminales o editores que estén usando `node_modules`.
2. Abre una terminal Git Bash nueva, vuelve a la raíz del repositorio, activa Node 24 y reintenta:

   ```bash
   cd /f/Proyectos/madggardens
   eval "$(fnm env --use-on-cd --shell bash)"
   fnm use 24
   npm ci
   ```

3. Si vuelve a fallar, verifica primero que `pwd` termina exactamente en `/Proyectos/madggardens`. Solo entonces elimina la instalación incompleta y reinstala:

   ```bash
   pwd
   rm -rf -- ./node_modules
   npm cache verify
   npm ci
   ```

Si `rm` también indica que el archivo está en uso, reinicia Windows y ejecuta directamente el paso 2 antes de abrir el editor. No es necesario ejecutar `npm ci` cada vez que levantas el proyecto; basta tras el primer clonado o cuando cambia `package-lock.json`.

Desde CMD, la recuperación equivalente es la siguiente. Comprueba que `cd` muestra exactamente `F:\Proyectos\madggardens` antes de borrar la carpeta:

```cmd
cd
rmdir /s /q node_modules
npm cache verify
npm ci
```

### Pantalla en blanco al ejecutar `npm run dev`

Comprueba que `.env.local` existe y que `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `CURSOR_SIGNING_SECRET` y `CRON_SECRET` ya no empiezan por `replace-with-`. Ejecuta `npx supabase status` para recuperar las claves locales y sigue la tabla de configuración anterior. Después reinicia `npm run dev`; refrescar el navegador sin reiniciar Vite no aplica los cambios.

## Levantar el servicio en local

Con Docker en ejecución, inicia primero Supabase y después la aplicación:

```bash
npm run supabase:start
npm run dev
```

En el primer arranque, ejecuta `npm run db:setup` entre ambos comandos si todavía no has aplicado las migraciones y los datos de ejemplo:

```bash
npm run supabase:start
npm run db:setup
npm run dev
```

`npm run dev` mantiene el proceso en primer plano. Mientras esté activo estarán disponibles:

- Aplicación web y API: `http://localhost:3000`
- Comprobación de salud: `http://localhost:3000/api/health`
- Registro: `http://localhost:3000/registro`
- Inicio de sesión: `http://localhost:3000/acceso`
- Mapa público: `http://localhost:3000`
- Nueva propuesta (requiere sesión): `http://localhost:3000/gardens/new`
- Área personal y propuestas propias: `http://localhost:3000/cuenta`
- Moderación (requiere rol admin): `http://localhost:3000/admin`
- Supabase Studio: `http://localhost:54323`

Sin una clave de MapTiler configurada se utilizan teselas de OpenStreetMap únicamente para desarrollo local. En producción configura `VITE_MAPTILER_KEY` y `VITE_MAP_TILE_URL`, respetando la atribución y los límites del proveedor.

No es necesario ejecutar `db:setup` en cada arranque. Úsalo cuando quieras reconstruir la base local desde cero o después de incorporar migraciones nuevas.

## Parar el servicio local

1. En la terminal donde se ejecuta `npm run dev`, pulsa `Ctrl+C`.
2. Detén los contenedores de Supabase:

```bash
npm run supabase:stop
```

Supabase conserva los datos locales al detenerse. Para reconstruirlos posteriormente desde las migraciones, ejecuta `npm run db:setup`.

## Comprobaciones

Con Supabase levantado, abre una segunda terminal Git Bash, activa Node 24 y ejecuta:

```bash
eval "$(fnm env --use-on-cd --shell bash)"
fnm use 24
npm run typecheck
npm run lint
npm run format:check
npm run check:openapi
npm run test:run
npm run db:test
npm run build
```

El recorrido de navegador completo se ejecuta aparte:

```bash
npx playwright install chromium
npm run test:e2e
```

La prueba E2E es autosuficiente: inicia Supabase, reconstruye la base local, compila la aplicación,
crea usuarios temporales, valida el ciclo de propuesta y moderación en Chromium y finalmente detiene
Supabase. Por tanto, `npm run test:e2e` reemplaza los datos de la base local.

## Base de datos local

```bash
npm run supabase:start
npm run db:setup
npm run db:test
npm run supabase:stop
```

La especificación técnica vigente está en [`docs/ai_full_documentation.md`](docs/ai_full_documentation.md).
La preparación de Preview/producción, validación, rollback, rotación y restauración está en
[`docs/deployment.md`](docs/deployment.md).
