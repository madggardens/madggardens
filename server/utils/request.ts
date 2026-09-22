import type { HTTPEvent } from 'h3';
import type { ZodType } from 'zod';

import { ApiError } from './api';

export async function parseJsonBody<T>(event: HTTPEvent, schema: ZodType<T>, maxBytes = 32_768) {
  const contentType = event.req.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
  if (contentType !== 'application/json') {
    throw new ApiError(415, 'VALIDATION_ERROR', 'El cuerpo debe usar application/json.');
  }

  const declaredLength = Number(event.req.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new ApiError(413, 'VALIDATION_ERROR', 'El cuerpo de la petición es demasiado grande.');
  }

  const text = await event.req.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new ApiError(413, 'VALIDATION_ERROR', 'El cuerpo de la petición es demasiado grande.');
  }

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new ApiError(400, 'VALIDATION_ERROR', 'El cuerpo JSON no es válido.');
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      'Los datos enviados no son válidos.',
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  return parsed.data;
}
