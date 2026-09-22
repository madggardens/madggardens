import sharp from 'sharp';
import { z } from 'zod';

import type { ApiUser } from '../../shared/contracts/auth';
import {
  moderationStatusSchema,
  type ModerateGardenRequest,
  type OwnerGardenListResponse,
} from '../../shared/contracts/gardens';
import { ApiError } from './api';
import { decodeGardenCursor, encodeGardenCursor } from './cursor';
import { getServerSupabaseClient } from './supabase';

const adminListQuerySchema = z
  .object({
    moderation: moderationStatusSchema.default('pendiente'),
    limit: z.coerce.number().int().min(1).max(50).default(50),
    cursor: z.string().min(1).optional(),
  })
  .strict();

const adminRowSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  status: z.enum(['vacio', 'en_proceso', 'plantado', 'exuberante']),
  moderation: moderationStatusSchema,
  rejection_reason: z.string().nullable(),
  longitude: z.number(),
  latitude: z.number(),
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
});

const approvalPayloadSchema = z.object({
  gardenId: z.uuid(),
  photos: z
    .array(z.object({ id: z.uuid(), originalPath: z.string().min(1) }))
    .min(1)
    .max(5),
});

export function parseAdminGardenListQuery(url: URL) {
  const values: Record<string, string> = {};
  for (const [key, value] of url.searchParams) {
    if (key in values) {
      throw new ApiError(400, 'VALIDATION_ERROR', `El parámetro ${key} está repetido.`);
    }
    values[key] = value;
  }
  const parsed = adminListQuerySchema.safeParse(values);
  if (!parsed.success) throw new ApiError(400, 'VALIDATION_ERROR', 'Los filtros no son válidos.');
  return {
    ...parsed.data,
    cursor: parsed.data.cursor ? decodeGardenCursor(parsed.data.cursor) : undefined,
  };
}

export async function listAdminGardens(
  query: ReturnType<typeof parseAdminGardenListQuery>,
): Promise<OwnerGardenListResponse> {
  const { data, error } = await getServerSupabaseClient().rpc('list_admin_gardens', {
    p_moderation: query.moderation,
    p_limit: query.limit + 1,
    p_cursor_created_at: query.cursor?.createdAt,
    p_cursor_id: query.cursor?.id,
  });
  if (error) throw error;

  const rows = z.array(adminRowSchema).parse(data);
  const hasNextPage = rows.length > query.limit;
  const visibleRows = hasNextPage ? rows.slice(0, query.limit) : rows;
  const lastRow = visibleRows.at(-1);
  return {
    data: visibleRows.map((row) => ({
      id: row.id,
      name: row.name,
      status: row.status,
      moderation: row.moderation,
      rejectionReason: row.rejection_reason,
      location: { type: 'Point', coordinates: [row.longitude, row.latitude] },
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
    })),
    page: {
      nextCursor:
        hasNextPage && lastRow
          ? encodeGardenCursor({
              createdAt: new Date(lastRow.created_at).toISOString(),
              id: lastRow.id,
            })
          : null,
    },
  };
}

async function rejectGarden(id: string, admin: ApiUser, requestId: string, reason: string) {
  const { data, error } = await getServerSupabaseClient().rpc('reject_garden', {
    p_id: id,
    p_actor_id: admin.id,
    p_request_id: requestId,
    p_reason: reason,
  });
  if (error) throw error;
  if (!data) throw new ApiError(409, 'VALIDATION_ERROR', 'El jardín ya no está pendiente.');
}

export async function processPhoto(input: Buffer) {
  const baseOptions = {
    failOn: 'error' as const,
    limitInputPixels: 40_000_000,
    sequentialRead: true,
  };
  const full = await sharp(input, baseOptions)
    .rotate()
    .resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();
  const thumbnail = await sharp(input, baseOptions)
    .rotate()
    .resize({ width: 480, height: 480, fit: 'cover', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();
  return { full, thumbnail };
}

async function approveGarden(id: string, admin: ApiUser, requestId: string) {
  const client = getServerSupabaseClient();
  const { data, error } = await client.rpc('begin_garden_approval', { p_id: id });
  if (error?.message === 'GARDEN_NOT_PENDING') {
    throw new ApiError(409, 'VALIDATION_ERROR', 'El jardín ya no está pendiente.');
  }
  if (error) throw error;
  const payload = approvalPayloadSchema.parse(data);
  const uploadedPaths: string[] = [];

  try {
    const processed: { id: string; publicPath: string; thumbnailPath: string }[] = [];
    for (const photo of payload.photos) {
      const original = await client.storage.from('garden-originals').download(photo.originalPath);
      if (original.error) throw original.error;
      const images = await processPhoto(Buffer.from(await original.data.arrayBuffer()));
      const publicPath = `${id}/${photo.id}/image.webp`;
      const thumbnailPath = `${id}/${photo.id}/thumbnail.webp`;
      const fullUpload = await client.storage
        .from('garden-public')
        .upload(publicPath, images.full, { contentType: 'image/webp', upsert: true });
      if (fullUpload.error) throw fullUpload.error;
      uploadedPaths.push(publicPath);
      const thumbnailUpload = await client.storage
        .from('garden-public')
        .upload(thumbnailPath, images.thumbnail, { contentType: 'image/webp', upsert: true });
      if (thumbnailUpload.error) throw thumbnailUpload.error;
      uploadedPaths.push(thumbnailPath);
      processed.push({ id: photo.id, publicPath, thumbnailPath });
    }

    const completed = await client.rpc('complete_garden_approval', {
      p_id: id,
      p_actor_id: admin.id,
      p_request_id: requestId,
      p_photo_ids: processed.map((photo) => photo.id),
      p_public_paths: processed.map((photo) => photo.publicPath),
      p_thumbnail_paths: processed.map((photo) => photo.thumbnailPath),
    });
    if (completed.error) throw completed.error;
  } catch {
    if (uploadedPaths.length > 0) await client.storage.from('garden-public').remove(uploadedPaths);
    await client.rpc('fail_garden_approval', { p_id: id });
    throw new ApiError(
      422,
      'PROCESSING_FAILED',
      'No se han podido procesar las fotografías. La propuesta sigue pendiente.',
    );
  }
}

export async function moderateGarden(
  id: string,
  admin: ApiUser,
  requestId: string,
  input: ModerateGardenRequest,
) {
  if (input.moderation === 'rechazado') {
    await rejectGarden(id, admin, requestId, input.rejectionReason);
  } else {
    await approveGarden(id, admin, requestId);
  }
}
