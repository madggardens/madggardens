import { z } from 'zod';

export const gardenStatusSchema = z.enum(['vacio', 'en_proceso', 'plantado', 'exuberante']);
export const moderationStatusSchema = z.enum(['pendiente', 'aprobado', 'rechazado']);

export const geoPointSchema = z.object({
  type: z.literal('Point'),
  coordinates: z.tuple([
    z.number().finite().min(-180).max(180),
    z.number().finite().min(-90).max(90),
  ]),
});

export const gardenSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  location: geoPointSchema,
  status: gardenStatusSchema,
  thumbnailUrl: z.url().nullable(),
  createdAt: z.iso.datetime(),
});

export const gardenListResponseSchema = z.object({
  data: z.array(gardenSummarySchema),
  page: z.object({ nextCursor: z.string().nullable() }),
});

export const gardenPhotoSchema = z.object({
  id: z.uuid(),
  url: z.url(),
  thumbnailUrl: z.url(),
});

export const gardenDetailSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  location: geoPointSchema,
  status: gardenStatusSchema,
  moderation: moderationStatusSchema,
  rejectionReason: z.string().nullable(),
  photos: z.array(gardenPhotoSchema),
  isOwner: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const gardenDetailResponseSchema = z.object({
  data: gardenDetailSchema,
});

export const gardenListRequestSchema = z.object({
  bbox: z.string().meta({ example: '-3.76,40.37,-3.64,40.46' }),
  status: gardenStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  cursor: z.string().optional(),
});

export const gardenIdParamsSchema = z.object({
  id: z.uuid(),
});

export const createGardenRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(2000).nullable().optional(),
    location: geoPointSchema,
    status: gardenStatusSchema,
    photoIds: z.array(z.uuid()).min(1).max(5),
  })
  .strict();

export const createGardenResponseSchema = z.object({
  data: z.object({
    id: z.uuid(),
    replayed: z.boolean(),
  }),
});

export const signUploadRequestSchema = z
  .object({
    fileName: z.string().trim().min(1).max(255),
    mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
    sizeBytes: z
      .number()
      .int()
      .min(1)
      .max(10 * 1024 * 1024),
  })
  .strict();

export const signUploadResponseSchema = z.object({
  data: z.object({
    path: z.string(),
    token: z.string(),
    photoId: z.uuid(),
    expiresAt: z.iso.datetime(),
  }),
});

export const ownerGardenSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  status: gardenStatusSchema,
  moderation: moderationStatusSchema,
  rejectionReason: z.string().nullable(),
  location: geoPointSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const ownerGardenListResponseSchema = z.object({
  data: z.array(ownerGardenSummarySchema),
  page: z.object({ nextCursor: z.string().nullable() }),
});

export const ownerGardenListRequestSchema = z.object({
  moderation: moderationStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  cursor: z.string().optional(),
});

export const updateGardenRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    location: geoPointSchema.optional(),
    status: gardenStatusSchema.optional(),
    photoIds: z.array(z.uuid()).min(1).max(5).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Envía al menos un campo para actualizar.');

export const updateGardenResponseSchema = gardenDetailResponseSchema;

export const adminGardenListResponseSchema = ownerGardenListResponseSchema;

export const adminGardenListRequestSchema = z.object({
  moderation: moderationStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  cursor: z.string().optional(),
});

export const moderateGardenRequestSchema = z.discriminatedUnion('moderation', [
  z.object({ moderation: z.literal('aprobado') }).strict(),
  z
    .object({
      moderation: z.literal('rechazado'),
      rejectionReason: z.string().trim().min(1).max(500),
    })
    .strict(),
]);

export const moderateGardenResponseSchema = gardenDetailResponseSchema;

export type GardenStatus = z.infer<typeof gardenStatusSchema>;
export type GardenSummary = z.infer<typeof gardenSummarySchema>;
export type GardenListResponse = z.infer<typeof gardenListResponseSchema>;
export type GardenDetail = z.infer<typeof gardenDetailSchema>;
export type GardenDetailResponse = z.infer<typeof gardenDetailResponseSchema>;
export type CreateGardenRequest = z.infer<typeof createGardenRequestSchema>;
export type CreateGardenResponse = z.infer<typeof createGardenResponseSchema>;
export type SignUploadRequest = z.infer<typeof signUploadRequestSchema>;
export type SignUploadResponse = z.infer<typeof signUploadResponseSchema>;
export type OwnerGardenSummary = z.infer<typeof ownerGardenSummarySchema>;
export type OwnerGardenListResponse = z.infer<typeof ownerGardenListResponseSchema>;
export type UpdateGardenRequest = z.infer<typeof updateGardenRequestSchema>;
export type ModerateGardenRequest = z.infer<typeof moderateGardenRequestSchema>;
