import { createHmac, timingSafeEqual } from 'node:crypto';

import { z } from 'zod';

import { ApiError } from './api';

const cursorPayloadSchema = z.object({
  version: z.literal(1),
  createdAt: z.iso.datetime(),
  id: z.uuid(),
});

export type GardenCursor = z.infer<typeof cursorPayloadSchema>;

function getCursorSecret() {
  const secret = process.env.CURSOR_SIGNING_SECRET?.trim();

  if (!secret || secret.startsWith('replace-with-') || secret.length < 32) {
    throw new Error('Missing or insecure CURSOR_SIGNING_SECRET');
  }

  return secret;
}

function signature(value: string) {
  return createHmac('sha256', getCursorSecret()).update(value).digest('base64url');
}

export function encodeGardenCursor(cursor: Omit<GardenCursor, 'version'>) {
  const payload = Buffer.from(JSON.stringify({ version: 1, ...cursor })).toString('base64url');
  return `${payload}.${signature(payload)}`;
}

export function decodeGardenCursor(cursor: string): GardenCursor {
  const [payload, receivedSignature, extra] = cursor.split('.');

  if (!payload || !receivedSignature || extra) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'El cursor no es válido.');
  }

  const expectedSignature = signature(payload);
  const received = Buffer.from(receivedSignature);
  const expected = Buffer.from(expectedSignature);

  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'El cursor no es válido.');
  }

  try {
    return cursorPayloadSchema.parse(
      JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')),
    );
  } catch {
    throw new ApiError(400, 'VALIDATION_ERROR', 'El cursor no es válido.');
  }
}
