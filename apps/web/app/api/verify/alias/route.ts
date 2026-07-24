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
      const verifications = await service
        .from('uni_verifications')
        .delete()
        .eq('user_id', userId)
        .not('verified_at', 'is', null);
      if (verifications.error !== null) {
        throw new Error(`removeAlias(verifications): ${verifications.error.message}`);
      }
      const profile = await service
        .from('profiles')
        .update({ university_id: null, uni_verified_at: null })
        .eq('id', userId);
      if (profile.error !== null) {
        throw new Error(`removeAlias(profile): ${profile.error.message}`);
      }
    },
  });
}
