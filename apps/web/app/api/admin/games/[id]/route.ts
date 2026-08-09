import { userIdFromCookies } from '@/lib/auth';
import { getProfile } from '@/lib/db/queries';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { z } from 'zod';

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
    setGameStatus: async (gameId, adminId, status, reason) => {
      const { data, error } = await service.rpc('resolve_quarantined_game', {
        p_game_id: gameId,
        p_admin_id: adminId,
        p_status: status,
        p_reason: reason,
      });
      if (error !== null) throw new Error(`resolve_quarantined_game: ${error.message}`);
      return z.boolean().parse(data);
    },
  });
}
