import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { createClient } from '@supabase/supabase-js';

export type E2ECredentials = {
  owner: { email: string; password: string };
  other: { email: string; password: string };
  admin: { email: string; password: string };
  userIds: string[];
};

export type SupabaseStatus = {
  API_URL: string;
  PUBLISHABLE_KEY: string;
  SECRET_KEY: string;
};

export const statePath = resolve('.playwright/e2e-state.json');

export function getE2eProjectPath() {
  return readFileSync(resolve('.playwright/e2e-project-path'), 'utf8').trim();
}

export function getSupabaseStatus() {
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const e2eProjectPath = getE2eProjectPath();
  return JSON.parse(
    execFileSync(npx, ['supabase', '--workdir', e2eProjectPath, 'status', '-o', 'json'], {
      encoding: 'utf8',
      shell: process.platform === 'win32',
    }),
  ) as SupabaseStatus;
}

export async function readCredentials() {
  return JSON.parse(await readFile(statePath, 'utf8')) as E2ECredentials;
}

export async function createMagicLink(email: string) {
  const status = getSupabaseStatus();
  const client = createClient(status.API_URL, status.SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await client.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: 'http://127.0.0.1:3000/cuenta' },
  });
  if (error) throw error;
  return data.properties.action_link;
}
