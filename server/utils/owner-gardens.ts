import { z } from 'zod';

import type { ApiUser } from '../../shared/contracts/auth';
import {
  moderationStatusSchema,
  type OwnerGardenListResponse,
  type UpdateGardenRequest,
} from '../../shared/contracts/gardens';
import { ApiError } from './api';
import { decodeGardenCursor, encodeGardenCursor } from './cursor';
import { getServerSupabaseClient } from './supabase';
import { verifyUploadedPhotos } from './uploads';

const ownerListQuerySchema = z
  .object({
    moderation: moderationStatusSchema.optional(),
    limit: z.coerce.number().int().min(1).max(50).default(50),
    cursor: z.string().min(1).optional(),
  })
  .strict();

const ownerRowSchema = z.object({
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

const updateResultSchema = z.object({
  updated: z.boolean(),
  publicPathsToDelete: z.array(z.string()).default([]),
  originalPathsToDelete: z.array(z.string()).default([]),
});

export function parseOwnerGardenListQuery(url: URL) {
  const values: Record<string, string> = {};
  for (const [key, value] of url.searchParams) {
    if (key in values) {
      throw new ApiError(400, 'VALIDATION_ERROR', `El parámetro ${key} está repetido.`);
    }
    values[key] = value;
  }

  const parsed = ownerListQuerySchema.safeParse(values);
  if (!parsed.success) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Los filtros no son válidos.');
  }

  return {
    ...parsed.data,
    cursor: parsed.data.cursor ? decodeGardenCursor(parsed.data.cursor) : undefined,
  };
}

export async function listOwnerGardens(
  user: ApiUser,
  query: ReturnType<typeof parseOwnerGardenListQuery>,
): Promise<OwnerGardenListResponse> {
  const { data, error } = await getServerSupabaseClient().rpc('list_owner_gardens', {
    p_owner_id: user.id,
    p_moderation: query.moderation,
    p_limit: query.limit + 1,
    p_cursor_created_at: query.cursor?.createdAt,
    p_cursor_id: query.cursor?.id,
  });
  if (error) throw error;

  const rows = z.array(ownerRowSchema).parse(data);
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

function mapOwnerWriteError(error: { message: string }) {
  if (error.message === 'GARDEN_OUTSIDE_SERVICE_AREA') {
    return new ApiError(
      409,
      'GARDEN_OUTSIDE_SERVICE_AREA',
      'La ubicación debe estar dentro del municipio de Madrid.',
    );
  }
  if (error.message === 'GARDEN_TOO_CLOSE') {
    return new ApiError(409, 'GARDEN_TOO_CLOSE', 'Ya existe un jardín a 25 metros o menos.');
  }
  if (error.message === 'INVALID_PHOTOS') {
    return new ApiError(
      409,
      'INVALID_PHOTOS',
      'Alguna fotografía no es válida o ya está asociada.',
    );
  }
  if (error.message === 'GARDEN_PROCESSING') {
    return new ApiError(
      409,
      'VALIDATION_ERROR',
      'El jardín se está procesando. Inténtalo de nuevo.',
    );
  }
  return error;
}

export async function updateOwnerGarden(user: ApiUser, id: string, input: UpdateGardenRequest) {
  if (input.photoIds) await verifyUploadedPhotos(user.id, input.photoIds);
  const client = getServerSupabaseClient();
  const [longitude, latitude] = input.location?.coordinates ?? [];
  const { data, error } = await client.rpc('update_owner_garden_v2', {
    p_owner_id: user.id,
    p_id: id,
    p_name: input.name,
    p_description: input.description ?? undefined,
    p_description_present: 'description' in input,
    p_longitude: longitude,
    p_latitude: latitude,
    p_status: input.status,
    p_photo_ids: input.photoIds,
  });
  if (error) throw mapOwnerWriteError(error);
  const result = updateResultSchema.parse(data);
  if (!result.updated) throw new ApiError(404, 'NOT_FOUND', 'No se ha encontrado el jardín.');

  const removals = await Promise.all([
    result.publicPathsToDelete.length > 0
      ? client.storage.from('garden-public').remove(result.publicPathsToDelete)
      : null,
    result.originalPathsToDelete.length > 0
      ? client.storage.from('garden-originals').remove(result.originalPathsToDelete)
      : null,
  ]);
  if (removals.some((removal) => removal?.error)) {
    console.error(
      JSON.stringify({ level: 'error', event: 'garden_photo_cleanup_failed', gardenId: id }),
    );
  }
}

export async function softDeleteOwnerGarden(user: ApiUser, id: string) {
  const { data, error } = await getServerSupabaseClient().rpc('soft_delete_owner_garden', {
    p_owner_id: user.id,
    p_id: id,
  });
  if (error) throw error;
  if (!data) throw new ApiError(404, 'NOT_FOUND', 'No se ha encontrado el jardín.');
}
