import { z } from 'zod';

export const apiErrorCodeSchema = z.enum([
  'AUTH_REQUIRED',
  'AUTH_INVALID',
  'ADMIN_REQUIRED',
  'VALIDATION_ERROR',
  'NOT_FOUND',
  'UPLOAD_FAILED',
  'INVALID_PHOTOS',
  'GARDEN_OUTSIDE_SERVICE_AREA',
  'GARDEN_TOO_CLOSE',
  'IDEMPOTENCY_CONFLICT',
  'PROCESSING_FAILED',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
]);

export const apiErrorResponseSchema = z.object({
  error: z.object({
    code: apiErrorCodeSchema,
    message: z.string(),
    requestId: z.uuid(),
    details: z.array(z.unknown()),
  }),
});

export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;
export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;
