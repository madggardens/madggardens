import { defineApiHandler } from '../../utils/api';
import { listPublicGardens, parseGardenListQuery } from '../../utils/gardens';

export default defineApiHandler(
  async (event) => {
    return listPublicGardens(parseGardenListQuery(new URL(event.req.url)));
  },
  {
    headers: {
      'cache-control': 'public, s-maxage=60, stale-while-revalidate=300',
    },
    rateLimit: { namespace: 'public-gardens', limit: 120, windowSeconds: 60, identity: 'ip' },
  },
);
