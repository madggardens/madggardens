import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import type { ApiUser } from '../../shared/contracts/auth';
import type { SignUploadRequest, SignUploadResponse } from '../../shared/contracts/gardens';
import { ApiError } from './api';
import { getServerSupabaseClient } from './supabase';

const extensions: Record<SignUploadRequest['mimeType'], string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const uploadedPhotoSchema = z.object({
  id: z.uuid(),
  path: z.string(),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  sizeBytes: z.number().int().positive(),
});

export async function reserveUpload(
  user: ApiUser,
  input: SignUploadRequest,
): Promise<SignUploadResponse> {
  const client = getServerSupabaseClient();
  const photoId = randomUUID();
  const path = `${user.id}/${photoId}.${extensions[input.mimeType]}`;
  const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  const { error: reservationError } = await client.rpc('reserve_garden_photo', {
    p_id: photoId,
    p_owner_id: user.id,
    p_original_path: path,
    p_mime_type: input.mimeType,
    p_size_bytes: input.sizeBytes,
    p_upload_expires_at: expiresAt,
  });

  if (reservationError) throw reservationError;

  const { data, error } = await client.storage
    .from('garden-originals')
    .createSignedUploadUrl(path, { upsert: false });
  if (error) throw new ApiError(503, 'UPLOAD_FAILED', 'No se ha podido preparar la subida.');

  return { data: { path, token: data.token, photoId, expiresAt } };
}

function hasExpectedSignature(bytes: Uint8Array, mimeType: SignUploadRequest['mimeType']) {
  if (mimeType === 'image/jpeg') {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mimeType === 'image/png') {
    return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
      (value, index) => bytes[index] === value,
    );
  }
  return (
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  );
}

export async function verifyUploadedPhotos(userId: string, photoIds: string[]) {
  const client = getServerSupabaseClient();
  const { data, error } = await client.rpc('get_unassociated_photos', {
    p_owner_id: userId,
    p_photo_ids: photoIds,
  });
  if (error) throw error;

  const parsed = z.array(uploadedPhotoSchema).safeParse(data);
  if (!parsed.success || parsed.data.length !== photoIds.length) {
    throw new ApiError(409, 'INVALID_PHOTOS', 'Alguna fotografía no es válida o ya está asociada.');
  }

  for (const photo of parsed.data) {
    const { data: blob, error: downloadError } = await client.storage
      .from('garden-originals')
      .download(photo.path);
    if (downloadError || blob.size !== photo.sizeBytes) {
      throw new ApiError(409, 'INVALID_PHOTOS', 'Alguna fotografía no se ha subido correctamente.');
    }

    const bytes = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
    if (!hasExpectedSignature(bytes, photo.mimeType)) {
      throw new ApiError(
        409,
        'INVALID_PHOTOS',
        'El contenido de una fotografía no coincide con su tipo.',
      );
    }
  }
}
