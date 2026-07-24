import { userIdFromCookies } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

import { handleProfilePost } from './handler';

export const dynamic = 'force-dynamic';

/** Postgres unique-violation error code. */
const UNIQUE_VIOLATION = '23505';

/**
 * `POST /api/profile` — set or change the display name. Core logic
 * lives in {@link handleProfilePost}; this file wires the real write and maps
 * the citext unique violation to the "taken" result.
 */
export async function POST(request: Request): Promise<Response> {
  const service = createServiceClient();
  return handleProfilePost(request, {
    authenticate: async () => userIdFromCookies(await createClient()),
    setDisplayName: async (userId, displayName) => {
      const { error } = await service
        .from('profiles')
        .update({ display_name: displayName })
        .eq('id', userId);
      if (error === null) return 'ok';
      if (error.code === UNIQUE_VIOLATION) return 'taken';
      throw new Error(`setDisplayName: ${error.message}`);
    },
    setIndependent: async (userId, independent) => {
      const { error } = await service.from('profiles').update({ independent }).eq('id', userId);
      if (error !== null) throw new Error(`setIndependent: ${error.message}`);
    },
  });
}
