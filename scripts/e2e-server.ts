import { spawn, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';

type SupabaseStatus = {
  API_URL: string;
  PUBLISHABLE_KEY: string;
  SECRET_KEY: string;
};

const isWindows = process.platform === 'win32';
const npm = isWindows ? 'npm.cmd' : 'npm';
const npx = isWindows ? 'npx.cmd' : 'npx';
const playwrightRoot = resolve('.playwright');
const e2eRoot = resolve(playwrightRoot, `e2e-project-${process.pid}-${Date.now()}`);
const sourceTemp = resolve('supabase/.temp');

if (!e2eRoot.startsWith(`${playwrightRoot}${sep}`)) {
  throw new Error('Unexpected E2E project path.');
}
mkdirSync(playwrightRoot, { recursive: true });
writeFileSync(resolve(playwrightRoot, 'e2e-project-path'), e2eRoot, 'utf8');
cpSync('supabase', resolve(e2eRoot, 'supabase'), {
  recursive: true,
  filter: (source) => {
    const absoluteSource = resolve(source);
    return absoluteSource !== sourceTemp && !absoluteSource.startsWith(`${sourceTemp}${sep}`);
  },
});

function run(command: string, args: string[], env = process.env) {
  const result = spawnSync(command, args, { env, shell: isWindows, stdio: 'inherit' });
  if (result.status !== 0) {
    if (result.error) process.stderr.write(`${result.error.message}\n`);
    process.exit(result.status ?? 1);
  }
}

run(npx, ['supabase', '--workdir', e2eRoot, 'start']);
run(npx, ['supabase', '--workdir', e2eRoot, 'db', 'reset']);
run(npm, ['run', 'import:service-area']);

const statusResult = spawnSync(npx, ['supabase', '--workdir', e2eRoot, 'status', '-o', 'json'], {
  encoding: 'utf8',
  shell: isWindows,
});
if (statusResult.status !== 0) {
  process.stderr.write(statusResult.stderr);
  process.exit(statusResult.status ?? 1);
}

const status = JSON.parse(statusResult.stdout) as SupabaseStatus;
const environment = {
  ...process.env,
  VITE_SUPABASE_URL: status.API_URL,
  VITE_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
  SUPABASE_URL: status.API_URL,
  SUPABASE_SECRET_KEY: status.SECRET_KEY,
  APP_BASE_URL: 'http://127.0.0.1:3000',
  ALLOWED_ORIGINS: 'http://127.0.0.1:3000',
  VITE_CACHE_DIR: 'node_modules/.vite-e2e',
  CURSOR_SIGNING_SECRET: 'e2e-cursor-signing-secret-with-at-least-32-characters',
  CRON_SECRET: 'e2e-cron-secret-with-at-least-16-characters',
};

run(npm, ['run', 'build'], environment);

const server = spawn(process.execPath, ['.output/server/index.mjs'], {
  env: environment,
  stdio: 'inherit',
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.kill(signal));
}

server.on('exit', (code) => process.exit(code ?? 0));
