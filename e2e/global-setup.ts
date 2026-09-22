import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { createClient } from '@supabase/supabase-js';

import { getSupabaseStatus, statePath, type E2ECredentials } from './support';

export default async function globalSetup() {
  const status = getSupabaseStatus();
  const supabase = createClient(status.API_URL, status.SECRET_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const suffix = `${Date.now()}-${process.pid}`;
  const password = 'E2e-password-2026!';
  const credentials: E2ECredentials = {
    owner: { email: `owner-${suffix}@example.test`, password },
    other: { email: `other-${suffix}@example.test`, password },
    admin: { email: `admin-${suffix}@example.test`, password },
    userIds: [],
  };

  for (const [role, account] of Object.entries(credentials).filter(([key]) => key !== 'userIds')) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: (account as E2ECredentials['owner']).email,
      password: (account as E2ECredentials['owner']).password,
      email_confirm: true,
      app_metadata: role === 'admin' ? { role: 'admin' } : {},
    });
    if (error || !data.user) throw error ?? new Error(`Unable to create ${role} E2E user.`);
    credentials.userIds.push(data.user.id);
  }

  await mkdir(dirname(statePath), { recursive: true });
  await writeFile(statePath, JSON.stringify(credentials), 'utf8');
}
