import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: '.env.local', quiet: true });

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const email = argument('--email')?.trim().toLowerCase();
if (!email) throw new Error('Uso: npm run set-admin -- --email usuario@example.com');

const supabaseUrl = process.env.SUPABASE_URL?.trim();
const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();
if (!supabaseUrl || !secretKey || secretKey.startsWith('replace-with-')) {
  throw new Error('Configura SUPABASE_URL y SUPABASE_SECRET_KEY en .env.local.');
}

const client = createClient(supabaseUrl, secretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
let userId: string | undefined;
let appMetadata: Record<string, unknown> = {};

for (let page = 1; !userId; page += 1) {
  const result = await client.auth.admin.listUsers({ page, perPage: 1000 });
  if (result.error) throw result.error;
  const user = result.data.users.find((candidate) => candidate.email?.toLowerCase() === email);
  if (user) {
    userId = user.id;
    appMetadata = user.app_metadata;
  }
  if (result.data.users.length < 1000) break;
}

if (!userId) throw new Error(`No existe un usuario con el correo ${email}.`);

if (!process.env.CI && !process.argv.includes('--yes')) {
  const prompt = createInterface({ input: stdin, output: stdout });
  const answer = await prompt.question(`¿Convertir ${email} en administrador? Escribe "admin": `);
  prompt.close();
  if (answer.trim().toLowerCase() !== 'admin') {
    process.stdout.write('Operación cancelada.\n');
    process.exit(0);
  }
}

const updated = await client.auth.admin.updateUserById(userId, {
  app_metadata: { ...appMetadata, role: 'admin' },
});
if (updated.error) throw updated.error;

const operator =
  process.env.GITHUB_ACTOR ?? process.env.USERNAME ?? process.env.USER ?? 'desconocido';
process.stdout.write(
  `Rol admin asignado a ${email} por ${operator} el ${new Date().toISOString()}. ` +
    'El usuario debe renovar su sesión.\n',
);
