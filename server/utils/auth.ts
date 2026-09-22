import type { User } from '@supabase/supabase-js';
import type { HTTPEvent } from 'h3';

import type { ApiUser } from '../../shared/contracts/auth';
import { ApiError } from './api';
import { getServerSupabaseClient } from './supabase';

type VerifyAccessToken = (accessToken: string) => Promise<User | null>;

function readBearerToken(authorization: string | null) {
  if (!authorization) {
    throw new ApiError(401, 'AUTH_REQUIRED', 'Debes iniciar sesión para continuar.');
  }

  const match = /^Bearer\s+(\S+)$/i.exec(authorization);
  if (!match?.[1]) {
    throw new ApiError(401, 'AUTH_INVALID', 'La sesión enviada no es válida.');
  }

  return match[1];
}

export async function authenticateBearerToken(
  authorization: string | null,
  verifyAccessToken: VerifyAccessToken,
): Promise<ApiUser> {
  const accessToken = readBearerToken(authorization);
  const user = await verifyAccessToken(accessToken);

  if (!user) {
    throw new ApiError(401, 'AUTH_INVALID', 'La sesión ha caducado o no es válida.');
  }

  return {
    id: user.id,
    email: user.email ?? null,
    role: user.app_metadata.role === 'admin' ? 'admin' : 'user',
  };
}

export async function getAuthenticatedUser(event: HTTPEvent) {
  return authenticateBearerToken(event.req.headers.get('authorization'), async (accessToken) => {
    const { data, error } = await getServerSupabaseClient().auth.getUser(accessToken);
    return error ? null : data.user;
  });
}

export async function getOptionalAuthenticatedUser(event: HTTPEvent) {
  return event.req.headers.has('authorization') ? getAuthenticatedUser(event) : null;
}

export function requireAdmin(user: ApiUser) {
  if (user.role !== 'admin') {
    throw new ApiError(403, 'ADMIN_REQUIRED', 'Necesitas permisos de administración.');
  }

  return user;
}
