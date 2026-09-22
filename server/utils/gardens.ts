import { z } from 'zod';

import {
  gardenStatusSchema,
  type GardenDetail,
  type GardenListResponse,
  type GardenStatus,
} from '../../shared/contracts/gardens';
import type { ApiUser } from '../../shared/contracts/auth';
import { ApiError } from './api';
import { decodeGardenCursor, encodeGardenCursor } from './cursor';
import { getServerSupabaseClient } from './supabase';

const boundingBoxSchema = z
  .string()
  .transform((value) => value.split(',').map(Number))
  .pipe(
    z.tuple([
      z.number().finite().min(-180).max(180),
      z.number().finite().min(-90).max(90),
      z.number().finite().min(-180).max(180),
      z.number().finite().min(-90).max(90),
    ]),
  )
  .refine(([minLongitude, minLatitude, maxLongitude, maxLatitude]) => {
    return (
      minLongitude < maxLongitude &&
      minLatitude < maxLatitude &&
      maxLongitude - minLongitude <= 0.5 &&
      maxLatitude - minLatitude <= 0.5
    );
  }, 'El área visible no es válida o supera 0,5 grados por eje.');

const listQuerySchema = z
  .object({
    bbox: boundingBoxSchema,
    status: gardenStatusSchema.optional(),
    limit: z.coerce.number().int().min(1).max(500).default(100),
    cursor: z.string().min(1).optional(),
  })
  .strict();

const gardenListRowSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  longitude: z.number(),
  latitude: z.number(),
  status: gardenStatusSchema,
  thumbnail_path: z.string().nullable(),
  created_at: z.iso.datetime({ offset: true }),
});

const visibleGardenSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  longitude: z.number(),
  latitude: z.number(),
  status: gardenStatusSchema,
  moderation: z.enum(['pendiente', 'aprobado', 'rechazado']),
  rejectionReason: z.string().nullable(),
  createdBy: z.uuid().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
  photos: z.array(
    z.object({
      id: z.uuid(),
      status: z.enum(['subida', 'procesando', 'publicada', 'fallida']),
      originalPath: z.string().nullable(),
      publicPath: z.string().nullable(),
      thumbnailPath: z.string().nullable(),
    }),
  ),
});

export type GardenListQuery = {
  bounds: [number, number, number, number];
  status?: GardenStatus;
  limit: number;
  cursor?: ReturnType<typeof decodeGardenCursor>;
};

export function parseGardenListQuery(url: URL): GardenListQuery {
  const values: Record<string, string> = {};
  for (const [key, value] of url.searchParams) {
    if (key in values) {
      throw new ApiError(400, 'VALIDATION_ERROR', `El parámetro ${key} está repetido.`);
    }
    values[key] = value;
  }

  const parsed = listQuerySchema.safeParse(values);
  if (!parsed.success) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      'Los parámetros del mapa no son válidos.',
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  return {
    bounds: parsed.data.bbox,
    status: parsed.data.status,
    limit: parsed.data.limit,
    cursor: parsed.data.cursor ? decodeGardenCursor(parsed.data.cursor) : undefined,
  };
}

function publicPhotoUrl(path: string) {
  return getServerSupabaseClient().storage.from('garden-public').getPublicUrl(path).data.publicUrl;
}

export async function listPublicGardens(query: GardenListQuery): Promise<GardenListResponse> {
  const [minLongitude, minLatitude, maxLongitude, maxLatitude] = query.bounds;
  const { data, error } = await getServerSupabaseClient().rpc('list_public_gardens', {
    p_min_longitude: minLongitude,
    p_min_latitude: minLatitude,
    p_max_longitude: maxLongitude,
    p_max_latitude: maxLatitude,
    p_status: query.status ?? undefined,
    p_limit: query.limit + 1,
    p_cursor_created_at: query.cursor?.createdAt,
    p_cursor_id: query.cursor?.id,
  });

  if (error) throw error;

  const rows = z.array(gardenListRowSchema).parse(data);
  const hasNextPage = rows.length > query.limit;
  const visibleRows = hasNextPage ? rows.slice(0, query.limit) : rows;
  const lastRow = visibleRows.at(-1);

  return {
    data: visibleRows.map((row) => ({
      id: row.id,
      name: row.name,
      location: { type: 'Point', coordinates: [row.longitude, row.latitude] },
      status: row.status,
      thumbnailUrl: row.thumbnail_path ? publicPhotoUrl(row.thumbnail_path) : null,
      createdAt: new Date(row.created_at).toISOString(),
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

export async function getVisibleGarden(id: string, viewer: ApiUser | null): Promise<GardenDetail> {
  const { data, error } = await getServerSupabaseClient().rpc('get_visible_garden', {
    p_id: id,
    p_viewer_id: viewer?.id,
    p_is_admin: viewer?.role === 'admin',
  });

  if (error) throw error;
  if (!data) throw new ApiError(404, 'NOT_FOUND', 'No se ha encontrado el jardín.');

  const garden = visibleGardenSchema.parse(data);
  const photos = await Promise.all(
    garden.photos.map(async (photo) => {
      if (photo.status === 'publicada' && photo.publicPath && photo.thumbnailPath) {
        return {
          id: photo.id,
          url: publicPhotoUrl(photo.publicPath),
          thumbnailUrl: publicPhotoUrl(photo.thumbnailPath),
        };
      }
      if (!photo.originalPath) {
        throw new Error('Visible private photo is missing its original path.');
      }
      const { data: signed, error: signError } = await getServerSupabaseClient()
        .storage.from('garden-originals')
        .createSignedUrl(photo.originalPath, 300);
      if (signError) throw signError;
      return { id: photo.id, url: signed.signedUrl, thumbnailUrl: signed.signedUrl };
    }),
  );
  return {
    id: garden.id,
    name: garden.name,
    description: garden.description,
    location: { type: 'Point', coordinates: [garden.longitude, garden.latitude] },
    status: garden.status,
    moderation: garden.moderation,
    rejectionReason: garden.rejectionReason,
    photos,
    isOwner: Boolean(viewer && garden.createdBy === viewer.id),
    createdAt: new Date(garden.createdAt).toISOString(),
    updatedAt: new Date(garden.updatedAt).toISOString(),
  };
}
