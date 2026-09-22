import { gardenIdParamsSchema } from '../../../shared/contracts/gardens';
import { getRouterParam } from 'h3';
import { ApiError, defineApiHandler } from '../../utils/api';
import { getAuthenticatedUser } from '../../utils/auth';
import { softDeleteOwnerGarden } from '../../utils/owner-gardens';

export default defineApiHandler(
  async (event) => {
    const user = await getAuthenticatedUser(event);
    const id = gardenIdParamsSchema.safeParse({ id: getRouterParam(event, 'id') });
    if (!id.success) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'El identificador del jardín no es válido.');
    }
    await softDeleteOwnerGarden(user, id.data.id);
    return undefined;
  },
  { status: 204, headers: { 'cache-control': 'private, no-store' } },
);
