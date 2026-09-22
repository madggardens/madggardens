import { z } from 'zod';
import { getRouterParam } from 'h3';

import type { GardenDetailResponse } from '../../../shared/contracts/gardens';
import { defineApiHandler, ApiError } from '../../utils/api';
import { getOptionalAuthenticatedUser } from '../../utils/auth';
import { getVisibleGarden } from '../../utils/gardens';

export default defineApiHandler(
  async (event): Promise<GardenDetailResponse> => {
    const id = z.uuid().safeParse(getRouterParam(event, 'id'));
    if (!id.success) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'El identificador del jardín no es válido.');
    }

    const viewer = await getOptionalAuthenticatedUser(event);
    return { data: await getVisibleGarden(id.data, viewer) };
  },
  {
    headers: (event) => ({
      'cache-control': event.req.headers.has('authorization')
        ? 'private, no-store'
        : 'public, s-maxage=60, stale-while-revalidate=300',
      vary: 'Authorization',
    }),
  },
);
