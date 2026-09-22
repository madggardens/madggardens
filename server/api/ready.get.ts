import type { ReadinessResponse } from '../../shared/contracts/health';
import { defineApiHandler } from '../utils/api';
import { authorizeServiceBearer } from '../utils/service-auth';
import { getServerSupabaseClient } from '../utils/supabase';

export default defineApiHandler(
  async (event): Promise<ReadinessResponse> => {
    authorizeServiceBearer(event.req.headers.get('authorization'), 'MONITORING_SECRET');

    const client = getServerSupabaseClient();
    const [database, storage] = await Promise.all([
      client.rpc('list_public_gardens', {
        p_min_longitude: -3.9,
        p_min_latitude: 40.3,
        p_max_longitude: -3.4,
        p_max_latitude: 40.6,
        p_limit: 1,
      }),
      client.storage.listBuckets(),
    ]);

    if (database.error) throw database.error;
    if (storage.error) throw storage.error;
    if (!storage.data.some((bucket) => bucket.name === 'garden-originals')) {
      throw new Error('The private storage bucket is unavailable.');
    }
    if (!storage.data.some((bucket) => bucket.name === 'garden-public')) {
      throw new Error('The public storage bucket is unavailable.');
    }

    return {
      data: {
        status: 'ready',
        service: 'madggardens-api',
        checks: { database: 'ok', storage: 'ok' },
        timestamp: new Date().toISOString(),
      },
    };
  },
  { headers: { 'cache-control': 'private, no-store' } },
);
