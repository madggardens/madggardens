import { gardenIdParamsSchema, updateGardenRequestSchema } from '../../../shared/contracts/gardens';
import { getRouterParam } from 'h3';
import { ApiError, defineApiHandler } from '../../utils/api';
import { getAuthenticatedUser } from '../../utils/auth';
import { getVisibleGarden } from '../../utils/gardens';
import { updateOwnerGarden } from '../../utils/owner-gardens';
import { parseJsonBody } from '../../utils/request';

export default defineApiHandler(
  async (event) => {
    const user = await getAuthenticatedUser(event);
    const id = gardenIdParamsSchema.safeParse({ id: getRouterParam(event, 'id') });
    if (!id.success) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'El identificador del jardín no es válido.');
    }
    const input = await parseJsonBody(event, updateGardenRequestSchema);
    await updateOwnerGarden(user, id.data.id, input);
    return { data: await getVisibleGarden(id.data.id, user) };
  },
  {
    headers: { 'cache-control': 'private, no-store' },
    rateLimit: {
      namespace: 'edit-garden',
      limit: 60,
      windowSeconds: 3600,
      identity: 'authorization',
    },
  },
);
