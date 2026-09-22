import type { CurrentUserResponse } from '../../../shared/contracts/auth';
import { defineApiHandler } from '../../utils/api';
import { getAuthenticatedUser } from '../../utils/auth';

export default defineApiHandler(async (event): Promise<CurrentUserResponse> => {
  return {
    data: await getAuthenticatedUser(event),
  };
});
