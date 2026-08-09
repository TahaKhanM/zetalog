import { userIdFromCookies } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

import { handleAliasDelete } from './handler';

export const dynamic = 'force-dynamic';

/**
 * `DELETE /api/verify/alias` — remove the verified university email and the
 * badge that came with it. Core logic lives in
 * {@link handleAliasDelete}; this file wires the real service-role writes.
 */
export async function DELETE(): Promise<Response> {
  const service = createServiceClient();
  return handleAliasDelete({
    authenticate: async () => userIdFromCookies(await createClient()),
    removeAlias: async (userId) => {
      const { error } = await service.rpc('remove_verified_alias', { p_user_id: userId });
      if (error !== null) throw new Error(`remove_verified_alias: ${error.message}`);
    },
  });
}
