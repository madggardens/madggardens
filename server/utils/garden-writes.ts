import { createHash } from 'node:crypto';

import { z } from 'zod';

import type { ApiUser } from '../../shared/contracts/auth';
import type { CreateGardenRequest, CreateGardenResponse } from '../../shared/contracts/gardens';
import { ApiError } from './api';
import { getServerSupabaseClient } from './supabase';
import { verifyUploadedPhotos } from './uploads';

const creationResultSchema = z.object({
  gardenId: z.uuid(),
  replayed: z.boolean(),
});

export function parseIdempotencyKey(value: string | null) {
  const parsed = z.uuid().safeParse(value);
  if (!parsed.success) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Idempotency-Key debe contener un UUID válido.');
  }
  return parsed.data;
}

function mapCreationError(error: { message: string }) {
  const mappings = {
    GARDEN_OUTSIDE_SERVICE_AREA: [
      409,
      'GARDEN_OUTSIDE_SERVICE_AREA',
      'La ubicación debe estar dentro del municipio de Madrid.',
    ],
    GARDEN_TOO_CLOSE: [409, 'GARDEN_TOO_CLOSE', 'Ya existe un jardín a 25 metros o menos.'],
    INVALID_PHOTOS: [409, 'INVALID_PHOTOS', 'Alguna fotografía no es válida o ya está asociada.'],
    IDEMPOTENCY_CONFLICT: [
      409,
      'IDEMPOTENCY_CONFLICT',
      'La clave de idempotencia ya se utilizó con otros datos.',
    ],
  } as const;

  const mapping = mappings[error.message as keyof typeof mappings];
  if (!mapping) return error;
  return new ApiError(mapping[0], mapping[1], mapping[2]);
}

export async function createGarden(
  user: ApiUser,
  key: string,
  input: CreateGardenRequest,
): Promise<CreateGardenResponse> {
  const requestHash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
  const client = getServerSupabaseClient();
  const { data: existing, error: lookupError } = await client.rpc('get_idempotent_creation', {
    p_created_by: user.id,
    p_idempotency_key: key,
    p_request_hash: requestHash,
  });
  if (lookupError) throw mapCreationError(lookupError);
  if (existing) {
    const result = creationResultSchema.parse(existing);
    return { data: { id: result.gardenId, replayed: result.replayed } };
  }

  await verifyUploadedPhotos(user.id, input.photoIds);

  const [longitude, latitude] = input.location.coordinates;
  const { data, error } = await client.rpc('create_garden_idempotent', {
    p_created_by: user.id,
    p_idempotency_key: key,
    p_request_hash: requestHash,
    p_name: input.name,
    p_description: input.description ?? '',
    p_longitude: longitude,
    p_latitude: latitude,
    p_status: input.status,
    p_photo_ids: input.photoIds,
  });

  if (error) throw mapCreationError(error);
  const result = creationResultSchema.parse(data);
  return { data: { id: result.gardenId, replayed: result.replayed } };
}
