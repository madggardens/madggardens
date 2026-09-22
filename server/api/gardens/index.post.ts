import { createGardenRequestSchema } from '../../../shared/contracts/gardens';
import { defineApiHandler } from '../../utils/api';
import { getAuthenticatedUser } from '../../utils/auth';
import { createGarden, parseIdempotencyKey } from '../../utils/garden-writes';
import { parseJsonBody } from '../../utils/request';

export default defineApiHandler(
  async (event) => {
    const user = await getAuthenticatedUser(event);
    const key = parseIdempotencyKey(event.req.headers.get('idempotency-key'));
    const input = await parseJsonBody(event, createGardenRequestSchema);
    return createGarden(user, key, input);
  },
  {
    status: 201,
    headers: { 'cache-control': 'private, no-store' },
    rateLimit: {
      namespace: 'create-garden',
      limit: 10,
      windowSeconds: 3600,
      identity: 'authorization',
    },
  },
);
