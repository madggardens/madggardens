import { z } from 'zod';

import { getServerSupabaseClient } from './supabase';

const deletionPlanSchema = z.object({
  originalPaths: z.array(z.string()),
  publicPaths: z.array(z.string()),
});

async function removeInBatches(bucket: string, paths: string[]) {
  const client = getServerSupabaseClient();
  for (let index = 0; index < paths.length; index += 100) {
    const { error } = await client.storage.from(bucket).remove(paths.slice(index, index + 100));
    if (error) throw error;
  }
}

export async function deleteUserAccount(userId: string) {
  const client = getServerSupabaseClient();
  const prepared = await client.rpc('prepare_account_deletion', { p_user_id: userId });
  if (prepared.error) throw prepared.error;
  const plan = deletionPlanSchema.parse(prepared.data);

  await removeInBatches('garden-originals', plan.originalPaths);
  await removeInBatches('garden-public', plan.publicPaths);

  const finalized = await client.rpc('finalize_account_deletion', { p_user_id: userId });
  if (finalized.error) throw finalized.error;

  const deleted = await client.auth.admin.deleteUser(userId);
  if (deleted.error) throw deleted.error;
}
