import { defineApiHandler } from '../../../utils/api';
import { getAuthenticatedUser, requireAdmin } from '../../../utils/auth';
import { listAdminGardens, parseAdminGardenListQuery } from '../../../utils/admin-moderation';

export default defineApiHandler(
  async (event) => {
    requireAdmin(await getAuthenticatedUser(event));
    return listAdminGardens(parseAdminGardenListQuery(new URL(event.req.url)));
  },
  { headers: { 'cache-control': 'private, no-store' } },
);
