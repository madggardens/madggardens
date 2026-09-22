import { timingSafeEqual } from 'node:crypto';

import { ApiError } from './api';

export function authorizeServiceBearer(
  authorization: string | null,
  secretName: 'CRON_SECRET' | 'MONITORING_SECRET',
) {
  const configured = process.env[secretName]?.trim();
  const received = authorization?.replace(/^Bearer\s+/i, '') ?? '';

  if (!configured || configured.startsWith('replace-with-')) {
    throw new Error(`${secretName} is not configured.`);
  }

  const expectedBuffer = Buffer.from(configured);
  const receivedBuffer = Buffer.from(received);
  if (
    expectedBuffer.length !== receivedBuffer.length ||
    !timingSafeEqual(expectedBuffer, receivedBuffer)
  ) {
    throw new ApiError(401, 'AUTH_INVALID', 'La autorización del proceso no es válida.');
  }
}
