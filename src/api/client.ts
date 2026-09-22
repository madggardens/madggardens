import { z, type ZodType } from 'zod';

import {
  currentUserResponseSchema,
  deleteAccountResponseSchema,
} from '../../shared/contracts/auth';
import type { CurrentUserResponse, DeleteAccountResponse } from '../../shared/contracts/auth';
import { apiErrorResponseSchema } from '../../shared/contracts/errors';
import {
  createGardenResponseSchema,
  gardenDetailResponseSchema,
  gardenListResponseSchema,
  adminGardenListResponseSchema,
  moderateGardenResponseSchema,
  ownerGardenListResponseSchema,
  signUploadResponseSchema,
  updateGardenResponseSchema,
} from '../../shared/contracts/gardens';
import type {
  CreateGardenRequest,
  CreateGardenResponse,
  GardenDetailResponse,
  GardenListResponse,
  GardenStatus,
  OwnerGardenListResponse,
  SignUploadRequest,
  SignUploadResponse,
  UpdateGardenRequest,
  ModerateGardenRequest,
} from '../../shared/contracts/gardens';

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

type ApiRequestOptions = {
  accessToken?: string;
  body?: unknown;
  headers?: Record<string, string>;
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  signal?: AbortSignal;
};

async function apiRequest<T>(path: string, schema: ZodType<T>, options: ApiRequestOptions = {}) {
  const response = await fetch(path, {
    cache: 'no-store',
    method: options.method ?? 'GET',
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
    headers: {
      Accept: 'application/json',
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(options.accessToken ? { Authorization: `Bearer ${options.accessToken}` } : {}),
      ...options.headers,
    },
  });
  const body: unknown =
    response.status === 204 ? undefined : await response.json().catch(() => null);

  if (!response.ok) {
    const parsedError = apiErrorResponseSchema.safeParse(body);
    if (parsedError.success) {
      throw new ApiClientError(
        response.status,
        parsedError.data.error.code,
        parsedError.data.error.message,
        parsedError.data.error.requestId,
      );
    }

    throw new ApiClientError(
      response.status,
      'INVALID_API_RESPONSE',
      'La API ha devuelto una respuesta no válida.',
      response.headers.get('x-request-id') ?? undefined,
    );
  }

  return schema.parse(body);
}

export function signGardenUpload(
  input: SignUploadRequest,
  accessToken: string,
): Promise<SignUploadResponse> {
  return apiRequest('/api/uploads/sign', signUploadResponseSchema, {
    accessToken,
    body: input,
    method: 'POST',
  });
}

export function createGarden(
  input: CreateGardenRequest,
  accessToken: string,
  idempotencyKey: string,
): Promise<CreateGardenResponse> {
  return apiRequest('/api/gardens', createGardenResponseSchema, {
    accessToken,
    body: input,
    headers: { 'Idempotency-Key': idempotencyKey },
    method: 'POST',
  });
}

export function getCurrentUser(accessToken: string): Promise<CurrentUserResponse> {
  return apiRequest('/api/auth/me', currentUserResponseSchema, { accessToken });
}

export function deleteAccount(accessToken: string): Promise<DeleteAccountResponse> {
  return apiRequest('/api/account', deleteAccountResponseSchema, {
    accessToken,
    method: 'DELETE',
  });
}

export type GardenListParameters = {
  bounds: [number, number, number, number];
  status?: GardenStatus;
  limit?: number;
  cursor?: string;
  signal?: AbortSignal;
};

export function getGardens({
  bounds,
  status,
  limit = 500,
  cursor,
  signal,
}: GardenListParameters): Promise<GardenListResponse> {
  const search = new URLSearchParams({
    bbox: bounds.join(','),
    limit: String(limit),
  });
  if (status) search.set('status', status);
  if (cursor) search.set('cursor', cursor);

  return apiRequest(`/api/gardens?${search}`, gardenListResponseSchema, { signal });
}

export function getGarden(
  id: string,
  options: { accessToken?: string; signal?: AbortSignal } = {},
): Promise<GardenDetailResponse> {
  return apiRequest(`/api/gardens/${encodeURIComponent(id)}`, gardenDetailResponseSchema, options);
}

export function getMyGardens(
  accessToken: string,
  options: { moderation?: 'pendiente' | 'aprobado' | 'rechazado'; cursor?: string } = {},
): Promise<OwnerGardenListResponse> {
  const search = new URLSearchParams({ limit: '50' });
  if (options.moderation) search.set('moderation', options.moderation);
  if (options.cursor) search.set('cursor', options.cursor);
  return apiRequest(`/api/me/gardens?${search}`, ownerGardenListResponseSchema, { accessToken });
}

export function updateGarden(
  id: string,
  input: UpdateGardenRequest,
  accessToken: string,
): Promise<GardenDetailResponse> {
  return apiRequest(`/api/gardens/${encodeURIComponent(id)}`, updateGardenResponseSchema, {
    accessToken,
    body: input,
    method: 'PATCH',
  });
}

export function deleteGarden(id: string, accessToken: string): Promise<undefined> {
  return apiRequest(`/api/gardens/${encodeURIComponent(id)}`, z.undefined(), {
    accessToken,
    method: 'DELETE',
  });
}

export function getAdminGardens(
  accessToken: string,
  moderation: 'pendiente' | 'aprobado' | 'rechazado' = 'pendiente',
): Promise<OwnerGardenListResponse> {
  const search = new URLSearchParams({ moderation, limit: '50' });
  return apiRequest(`/api/admin/gardens?${search}`, adminGardenListResponseSchema, { accessToken });
}

export function moderateGarden(
  id: string,
  input: ModerateGardenRequest,
  accessToken: string,
): Promise<GardenDetailResponse> {
  return apiRequest(
    `/api/admin/gardens/${encodeURIComponent(id)}/moderation`,
    moderateGardenResponseSchema,
    { accessToken, body: input, method: 'PATCH' },
  );
}
