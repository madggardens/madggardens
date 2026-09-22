import type { DeleteAccountResponse } from '../../shared/contracts/auth';
import { deleteUserAccount } from '../utils/account-deletion';
import { defineApiHandler } from '../utils/api';
import { getAuthenticatedUser } from '../utils/auth';

export default defineApiHandler(
  async (event): Promise<DeleteAccountResponse> => {
    const user = await getAuthenticatedUser(event);
    await deleteUserAccount(user.id);
    return { data: { deleted: true } };
  },
  {
    rateLimit: {
      namespace: 'account-delete',
      limit: 3,
      windowSeconds: 60 * 60,
      identity: 'authorization',
    },
  },
);
