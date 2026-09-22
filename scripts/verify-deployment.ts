import { readinessResponseSchema, healthResponseSchema } from '../shared/contracts/health';

const baseUrl = process.env.APP_BASE_URL?.replace(/\/$/, '');
const monitoringSecret = process.env.MONITORING_SECRET?.trim();
if (!baseUrl || !monitoringSecret) {
  throw new Error('Configura APP_BASE_URL y MONITORING_SECRET para verificar el despliegue.');
}

const healthResponse = await fetch(`${baseUrl}/api/health`, { redirect: 'error' });
if (!healthResponse.ok) throw new Error(`/api/health respondió ${healthResponse.status}.`);
healthResponseSchema.parse(await healthResponse.json());

const readinessResponse = await fetch(`${baseUrl}/api/ready`, {
  headers: { authorization: `Bearer ${monitoringSecret}` },
  redirect: 'error',
});
if (!readinessResponse.ok) throw new Error(`/api/ready respondió ${readinessResponse.status}.`);
readinessResponseSchema.parse(await readinessResponse.json());

const pageResponse = await fetch(baseUrl, { redirect: 'error' });
if (!pageResponse.ok) throw new Error(`/ respondió ${pageResponse.status}.`);
const requiredHeaders: Record<string, string> = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
};
for (const [name, expected] of Object.entries(requiredHeaders)) {
  if (pageResponse.headers.get(name) !== expected) {
    throw new Error(`La cabecera ${name} no tiene el valor esperado.`);
  }
}
if (!pageResponse.headers.get('content-security-policy')) {
  throw new Error('Falta la cabecera content-security-policy.');
}

process.stdout.write(`Despliegue verificado correctamente en ${baseUrl}.\n`);
