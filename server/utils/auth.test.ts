import type { User } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import { ApiError } from './api';
import { authenticateBearerToken, requireAdmin } from './auth';

function makeUser(role?: string): User {
  return {
    id: '10000000-0000-0000-0000-000000000001',
    email: 'madrid@example.test',
    app_metadata: role ? { role } : {},
    user_metadata: {},
    aud: 'authenticated',
    created_at: '2026-09-20T10:00:00.000Z',
  };
}

describe('API authentication', () => {
  it('rejects a request without a bearer token', async () => {
    await expect(authenticateBearerToken(null, vi.fn())).rejects.toMatchObject({
      status: 401,
      code: 'AUTH_REQUIRED',
    });
  });

  it('rejects an invalid bearer token', async () => {
    await expect(authenticateBearerToken('Bearer expired', async () => null)).rejects.toMatchObject(
      { status: 401, code: 'AUTH_INVALID' },
    );
  });

  it('uses app_metadata to resolve an administrator', async () => {
    const user = await authenticateBearerToken('Bearer valid', async () => makeUser('admin'));

    expect(user).toEqual({
      id: '10000000-0000-0000-0000-000000000001',
      email: 'madrid@example.test',
      role: 'admin',
    });
    expect(requireAdmin(user)).toBe(user);
  });

  it('does not trust user_metadata for administrator access', async () => {
    const source = makeUser();
    source.user_metadata = { role: 'admin' };
    const user = await authenticateBearerToken('Bearer valid', async () => source);

    expect(user.role).toBe('user');
    expect(() => requireAdmin(user)).toThrow(ApiError);
    expect(() => requireAdmin(user)).toThrow('Necesitas permisos de administración.');
  });
});
