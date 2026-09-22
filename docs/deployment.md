# Despliegue y operación

Esta guía cubre Preview y producción. Usa proyectos separados de Supabase y Upstash para evitar que
una prueba o migración de Preview afecte a datos reales.

## 1. Preparar los servicios

1. Crea un proyecto Supabase de staging y otro de producción en la misma región que Vercel.
2. Vincula el repositorio con Vercel. La rama `main` será producción y cada pull request tendrá un
   Preview.
3. Crea una base Redis de Upstash por entorno.
4. Crea una clave de MapTiler restringida a los dominios exactos de cada entorno.
5. Configura SMTP y Google OAuth en cada proyecto Supabase. Añade como redirecciones permitidas
   `https://<dominio>/auth/callback` y las URL de Preview que vayas a validar.

## 2. Variables de entorno

Configura en Vercel las variables descritas en `.env.example`. Las variables `VITE_*` son públicas;
ningún secreto puede usar ese prefijo. El resto debe permanecer solo en el servidor.

- `APP_BASE_URL`: URL canónica exacta y con HTTPS.
- `ALLOWED_ORIGINS`: orígenes exactos separados por comas, sin rutas.
- `CURSOR_SIGNING_SECRET`, `CRON_SECRET` y `MONITORING_SECRET`: valores aleatorios diferentes de al
  menos 32 caracteres.
- `CRON_SECRET`: Vercel lo envía como Bearer al cron configurado en `vercel.json`.
- `MONITORING_SECRET`: solo para el monitor que consulta `/api/ready`.

Genera secretos con `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`.
No reutilices claves de Supabase ni copies secretos entre staging y producción.

Descarga las variables de Preview sin versionarlas y valídalas antes de desplegar:

```cmd
vercel env pull .env.preview.local --environment=preview
npm run check:deploy-env -- --env-file=.env.preview.local
```

Repite el proceso con `--environment=production` y un fichero `.env.production.local`. Los ficheros
`.env*.local` están excluidos de Git.

## 3. Base de datos y administradores

Vincula la CLI con el proyecto correcto y revisa siempre el destino antes de aplicar migraciones:

```cmd
npx supabase link --project-ref REFERENCIA_DEL_PROYECTO
npx supabase migration list
npx supabase db push --dry-run
npx supabase db push
```

No ejecutes `db:setup` contra staging o producción: reconstruye la base y elimina datos. Después del
primer acceso de las dos personas administradoras, promuévelas desde una terminal con las variables
del entorno cargadas:

```cmd
npm run set-admin -- --email persona@example.com
```

## 4. Validar Preview y producción

Con `APP_BASE_URL` y `MONITORING_SECRET` del entorno cargados, ejecuta:

```cmd
npm run verify:deployment
```

La comprobación valida liveness, conexión a PostgreSQL y Storage, presencia de ambos buckets y
cabeceras de seguridad. Después realiza manualmente el recorrido crítico: magic link, alta con foto,
moderación con otra cuenta, aparición en el mapa, edición y retirada pública.

El monitor externo puede consultar `/api/health` sin credenciales para liveness y `/api/ready` con
`Authorization: Bearer <MONITORING_SECRET>` para readiness. Alerta si readiness falla, el porcentaje
de `5xx` supera el 2 % durante cinco minutos o el cron no termina en 36 horas.

## 5. Promoción y rollback

Promueve a producción únicamente un commit que haya pasado CI y el recorrido de Preview. Las
migraciones deben ser compatibles hacia atrás: primero amplía el esquema, despliega el código y
retira columnas antiguas en una entrega posterior.

Para revertir la aplicación, vuelve a desplegar en Vercel el último deployment sano. No reviertas una
migración destructivamente; crea una migración correctora y pruébala primero en staging.

## 6. Rotación y restauración

- Rota de inmediato cualquier secreto expuesto. Actualiza primero Vercel/servicio consumidor,
  despliega y revoca después el valor anterior.
- Rota trimestralmente los secretos operativos y las claves de terceros. Al rotar
  `CURSOR_SIGNING_SECRET`, los cursores existentes dejan de ser válidos, algo aceptable.
- Mantén copia diaria de Supabase con RPO de 24 horas y RTO de 8 horas.
- Ensaya trimestralmente la restauración en un proyecto aislado: restaura, aplica migraciones
  pendientes, ejecuta las pruebas SQL y comprueba `/api/ready`. Nunca ensayes sobre producción.
