import { z } from 'zod';

import { defineApiHandler } from '../../utils/api';
import { authorizeServiceBearer } from '../../utils/service-auth';
import { getServerSupabaseClient } from '../../utils/supabase';

const cleanupResultSchema = z.object({
  orphanOriginalPaths: z.array(z.string()),
  retainedOriginalPaths: z.array(z.string()),
});

export default defineApiHandler(
  async (event) => {
    authorizeServiceBearer(event.req.headers.get('authorization'), 'CRON_SECRET');
    const client = getServerSupabaseClient();
    const { data, error } = await client.rpc('preview_expired_cleanup', {});
    if (error) throw error;
    const result = cleanupResultSchema.parse(data);
    const originalPaths = [...result.orphanOriginalPaths, ...result.retainedOriginalPaths];
    if (originalPaths.length > 0) {
      const removal = await client.storage.from('garden-originals').remove(originalPaths);
      if (removal.error) throw removal.error;
    }
    const finalized = await client.rpc('finalize_expired_cleanup', {
      p_orphan_paths: result.orphanOriginalPaths,
      p_retained_paths: result.retainedOriginalPaths,
    });
    if (finalized.error) throw finalized.error;
    return {
      data: {
        idempotenciesDeleted: finalized.data,
        originalsDeleted: originalPaths.length,
      },
    };
  },
  { headers: { 'cache-control': 'private, no-store' } },
);
