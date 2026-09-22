import { createClient } from '@supabase/supabase-js';

import type { Database } from '../types/database';

let serverClient: ReturnType<typeof createClient<Database>> | undefined;

function requireServerEnvironment(name: 'SUPABASE_URL' | 'SUPABASE_SECRET_KEY') {
  const value = process.env[name]?.trim();

  if (!value || value.startsWith('replace-with-')) {
    throw new Error(`Missing server environment variable: ${name}`);
  }

  return value;
}

export function getServerSupabaseClient() {
  serverClient ??= createClient<Database>(
    requireServerEnvironment('SUPABASE_URL'),
    requireServerEnvironment('SUPABASE_SECRET_KEY'),
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    },
  );

  return serverClient;
}
