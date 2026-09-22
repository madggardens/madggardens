import { createClient } from '@supabase/supabase-js';

function requirePublicEnvironment(name: 'VITE_SUPABASE_URL' | 'VITE_SUPABASE_PUBLISHABLE_KEY') {
  const value = import.meta.env[name]?.trim();

  if (!value || value.startsWith('replace-with-')) {
    throw new Error(`Falta configurar ${name} en .env.local`);
  }

  return value;
}

export const supabase = createClient(
  requirePublicEnvironment('VITE_SUPABASE_URL'),
  requirePublicEnvironment('VITE_SUPABASE_PUBLISHABLE_KEY'),
  {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true,
    },
  },
);
