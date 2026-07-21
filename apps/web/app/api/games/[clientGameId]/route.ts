import { userIdFromBearer, userIdFromCookies } from '@/lib/auth';
import { readBearerToken } from '@/lib/http';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

import { REVOCABLE_STATUSES, handleGameDelete } from './handler';

export const dynamic = 'force-dynamic';

/**
 * `DELETE /api/games/[clientGameId]` — remove one of the user's own games.
 * Accepts either the session cookie (website) or a bearer token (extension).
 * Core logic lives in {@link handleGameDelete}.
 */
export async function DELETE(
  request: Request,
  context: { params: Promise<{ clientGameId: string }> },
): Promise<Response> {
  const { clientGameId } = await context.params;
  const service = createServiceClient();
  return handleGameDelete(request, clientGameId, {
    authenticate: async (req) => {
      const token = readBearerToken(req);
      if (token !== null) return userIdFromBearer(service, token);
      return userIdFromCookies(await createClient());
    },
    removeGame: async (userId, gameId) => {
      const { data, error } = await service
        .from('games')
        .update({ status: 'user_removed' })
        .eq('user_id', userId)
        .eq('client_game_id', gameId)
        .in('status', [...REVOCABLE_STATUSES])
        .select('id');
      if (error !== null) throw new Error(`removeGame: ${error.message}`);
      return data.length > 0;
    },
  });
}
