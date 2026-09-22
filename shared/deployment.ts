const placeholderPrefixes = ['replace-with-', 'changeme', 'example-'];

function isMissing(value: string | undefined) {
  const normalized = value?.trim().toLowerCase() ?? '';
  return !normalized || placeholderPrefixes.some((prefix) => normalized.startsWith(prefix));
}

function parseHttpsUrl(name: string, value: string | undefined, errors: string[]) {
  if (isMissing(value)) {
    errors.push(`${name} no está configurada.`);
    return null;
  }
  try {
    const parsed = new URL(value!);
    if (parsed.protocol !== 'https:') errors.push(`${name} debe usar HTTPS.`);
    return parsed;
  } catch {
    errors.push(`${name} no contiene una URL válida.`);
    return null;
  }
}

type DeploymentEnvironment = Record<string, string | undefined>;

function requireValue(name: string, env: DeploymentEnvironment, errors: string[]) {
  const value = env[name];
  if (isMissing(value)) errors.push(`${name} no está configurada.`);
  return value?.trim() ?? '';
}

function requireSecret(name: string, env: DeploymentEnvironment, errors: string[]) {
  const value = requireValue(name, env, errors);
  if (value && value.length < 32) errors.push(`${name} debe tener al menos 32 caracteres.`);
  return value;
}

export function validateDeploymentEnvironment(env: DeploymentEnvironment) {
  const errors: string[] = [];
  const publicSupabase = parseHttpsUrl('VITE_SUPABASE_URL', env.VITE_SUPABASE_URL, errors);
  const serverSupabase = parseHttpsUrl('SUPABASE_URL', env.SUPABASE_URL, errors);
  const appUrl = parseHttpsUrl('APP_BASE_URL', env.APP_BASE_URL, errors);
  parseHttpsUrl('VITE_MAP_TILE_URL', env.VITE_MAP_TILE_URL, errors);
  parseHttpsUrl('UPSTASH_REDIS_REST_URL', env.UPSTASH_REDIS_REST_URL, errors);

  const publishableKey = requireValue('VITE_SUPABASE_PUBLISHABLE_KEY', env, errors);
  const secretKey = requireValue('SUPABASE_SECRET_KEY', env, errors);
  requireValue('VITE_MAPTILER_KEY', env, errors);
  requireValue('UPSTASH_REDIS_REST_TOKEN', env, errors);
  const cursorSecret = requireSecret('CURSOR_SIGNING_SECRET', env, errors);
  const cronSecret = requireSecret('CRON_SECRET', env, errors);
  const monitoringSecret = requireSecret('MONITORING_SECRET', env, errors);

  if (publicSupabase && serverSupabase && publicSupabase.origin !== serverSupabase.origin) {
    errors.push('VITE_SUPABASE_URL y SUPABASE_URL deben apuntar al mismo proyecto.');
  }
  if (publishableKey && secretKey && publishableKey === secretKey) {
    errors.push('La clave pública y la clave secreta de Supabase no pueden coincidir.');
  }

  const allowedOrigins = (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (allowedOrigins.length === 0) {
    errors.push('ALLOWED_ORIGINS no está configurada.');
  } else {
    for (const origin of allowedOrigins) parseHttpsUrl('ALLOWED_ORIGINS', origin, errors);
    if (appUrl && !allowedOrigins.includes(appUrl.origin)) {
      errors.push('ALLOWED_ORIGINS debe incluir el origen exacto de APP_BASE_URL.');
    }
  }

  const secrets = [cursorSecret, cronSecret, monitoringSecret].filter(Boolean);
  if (new Set(secrets).size !== secrets.length) {
    errors.push('CURSOR_SIGNING_SECRET, CRON_SECRET y MONITORING_SECRET deben ser diferentes.');
  }

  return errors;
}
