import { execFileSync } from 'node:child_process';
import { rm } from 'node:fs/promises';

import { createClient } from '@supabase/supabase-js';

import { getE2eProjectPath, getSupabaseStatus, readCredentials, statePath } from './support';

export default async function globalTeardown() {
  try {
    const status = getSupabaseStatus();
    const credentials = await readCredentials();
    const supabase = createClient(status.API_URL, status.SECRET_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    await Promise.all(credentials.userIds.map((id) => supabase.auth.admin.deleteUser(id)));
  } finally {
    await rm(statePath, { force: true });
    const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const e2eProjectPath = getE2eProjectPath();
    execFileSync(npx, ['supabase', '--workdir', e2eProjectPath, 'stop'], {
      shell: process.platform === 'win32',
      stdio: 'inherit',
    });
  }
}
