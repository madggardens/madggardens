import { signUploadRequestSchema } from '../../../shared/contracts/gardens';
import { defineApiHandler } from '../../utils/api';
import { getAuthenticatedUser } from '../../utils/auth';
import { parseJsonBody } from '../../utils/request';
import { reserveUpload } from '../../utils/uploads';

export default defineApiHandler(
  async (event) => {
    const user = await getAuthenticatedUser(event);
    const input = await parseJsonBody(event, signUploadRequestSchema);
    return reserveUpload(user, input);
  },
  {
    headers: { 'cache-control': 'private, no-store' },
    rateLimit: {
      namespace: 'sign-upload',
      limit: 20,
      windowSeconds: 3600,
      identity: 'authorization',
    },
  },
);
