import { userIdFromCookies } from '@/lib/auth';
import { getProfile } from '@/lib/db/queries';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

import { handleAdminAction } from './handler';

export const dynamic = 'force-dynamic';

/**
 * `POST /api/admin/games/[id]` — an admin resolves a quarantined game.
 * Core logic lives in {@link handleAdminAction}; this file wires real ports.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  const service = createServiceClient();
  return handleAdminAction(request, id, {
    authenticate: async () => userIdFromCookies(await createClient()),
    isAdmin: async (userId) => {
      const profile = await getProfile(service, userId);
      return profile?.is_admin ?? false;
    },
    setGameStatus: async (gameId, status) => {
      const { data, error } = await service
        .from('games')
        .update({ status })
        .eq('id', gameId)
        .eq('status', 'quarantined')
        .select('id');
      if (error !== null) throw new Error(`setGameStatus: ${error.message}`);
      return data.length > 0;
    },
  });
}
