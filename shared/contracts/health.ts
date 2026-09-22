import { z } from 'zod';

export const healthResponseSchema = z.object({
  data: z.object({
    status: z.literal('ok'),
    service: z.literal('madggardens-api'),
    timestamp: z.iso.datetime(),
  }),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const readinessResponseSchema = z.object({
  data: z.object({
    status: z.literal('ready'),
    service: z.literal('madggardens-api'),
    checks: z.object({
      database: z.literal('ok'),
      storage: z.literal('ok'),
    }),
    timestamp: z.iso.datetime(),
  }),
});

export type ReadinessResponse = z.infer<typeof readinessResponseSchema>;
