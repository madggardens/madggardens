import { resolve } from 'node:path';

import { config } from 'dotenv';

import { validateDeploymentEnvironment } from '../shared/deployment';

const envFileArgument = process.argv.find((argument) => argument.startsWith('--env-file='));
if (envFileArgument) {
  const envFile = resolve(envFileArgument.slice('--env-file='.length));
  const loaded = config({ path: envFile, override: true, quiet: true });
  if (loaded.error) throw new Error(`No se ha podido leer ${envFile}.`);
}

const errors = validateDeploymentEnvironment(process.env);
if (errors.length > 0) {
  process.stderr.write(`Configuración de despliegue no válida:\n- ${errors.join('\n- ')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write('Configuración de despliegue válida. No se ha mostrado ningún secreto.\n');
}
