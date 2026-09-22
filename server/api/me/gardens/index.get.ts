import { defineApiHandler } from '../../../utils/api';
import { getAuthenticatedUser } from '../../../utils/auth';
import { listOwnerGardens, parseOwnerGardenListQuery } from '../../../utils/owner-gardens';

export default defineApiHandler(
  async (event) => {
    const user = await getAuthenticatedUser(event);
    return listOwnerGardens(user, parseOwnerGardenListQuery(new URL(event.req.url)));
  },
  { headers: { 'cache-control': 'private, no-store' } },
);
