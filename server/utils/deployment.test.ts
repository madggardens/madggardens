import { describe, expect, it } from 'vitest';

import { validateDeploymentEnvironment } from '../../shared/deployment';

const validEnvironment: NodeJS.ProcessEnv = {
  VITE_SUPABASE_URL: 'https://project.supabase.co',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_public',
  VITE_MAPTILER_KEY: 'maptiler_public_key',
  VITE_MAP_TILE_URL: 'https://api.maptiler.com/maps/streets/{z}/{x}/{y}.png?key={key}',
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_SECRET_KEY: 'sb_secret_server_only',
  APP_BASE_URL: 'https://preview.example.com',
  ALLOWED_ORIGINS: 'https://preview.example.com',
  UPSTASH_REDIS_REST_URL: 'https://redis.upstash.io',
  UPSTASH_REDIS_REST_TOKEN: 'upstash_token',
  CURSOR_SIGNING_SECRET: 'cursor-secret-abcdefghijklmnopqrstuvwxyz',
  CRON_SECRET: 'cron-secret-abcdefghijklmnopqrstuvwxyz12',
  MONITORING_SECRET: 'monitor-secret-abcdefghijklmnopqrstuvwxyz',
};

describe('deployment environment validation', () => {
  it('accepts a complete HTTPS environment', () => {
    expect(validateDeploymentEnvironment(validEnvironment)).toEqual([]);
  });

  it('rejects placeholders, insecure URLs and missing origins', () => {
    const errors = validateDeploymentEnvironment({
      ...validEnvironment,
      VITE_SUPABASE_PUBLISHABLE_KEY: 'replace-with-key',
      APP_BASE_URL: 'http://preview.example.com',
      ALLOWED_ORIGINS: 'https://other.example.com',
    });

    expect(errors).toContain('VITE_SUPABASE_PUBLISHABLE_KEY no está configurada.');
    expect(errors).toContain('APP_BASE_URL debe usar HTTPS.');
    expect(errors).toContain('ALLOWED_ORIGINS debe incluir el origen exacto de APP_BASE_URL.');
  });

  it('rejects shared operational secrets and mismatched Supabase projects', () => {
    const errors = validateDeploymentEnvironment({
      ...validEnvironment,
      SUPABASE_URL: 'https://other.supabase.co',
      CRON_SECRET: validEnvironment.CURSOR_SIGNING_SECRET,
    });

    expect(errors).toContain('VITE_SUPABASE_URL y SUPABASE_URL deben apuntar al mismo proyecto.');
    expect(errors).toContain(
      'CURSOR_SIGNING_SECRET, CRON_SECRET y MONITORING_SECRET deben ser diferentes.',
    );
  });
});
