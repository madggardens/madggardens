import { getRouterParam } from 'h3';

import {
  gardenIdParamsSchema,
  moderateGardenRequestSchema,
} from '../../../../../shared/contracts/gardens';
import { moderateGarden } from '../../../../utils/admin-moderation';
import { ApiError, defineApiHandler } from '../../../../utils/api';
import { getAuthenticatedUser, requireAdmin } from '../../../../utils/auth';
import { getVisibleGarden } from '../../../../utils/gardens';
import { parseJsonBody } from '../../../../utils/request';

export default defineApiHandler(
  async (event, requestId) => {
    const admin = requireAdmin(await getAuthenticatedUser(event));
    const id = gardenIdParamsSchema.safeParse({ id: getRouterParam(event, 'id') });
    if (!id.success) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'El identificador del jardín no es válido.');
    }
    const input = await parseJsonBody(event, moderateGardenRequestSchema);
    await moderateGarden(id.data.id, admin, requestId, input);
    return { data: await getVisibleGarden(id.data.id, admin) };
  },
  {
    headers: { 'cache-control': 'private, no-store' },
    rateLimit: {
      namespace: 'moderation',
      limit: 60,
      windowSeconds: 3600,
      identity: 'authorization',
    },
  },
);
