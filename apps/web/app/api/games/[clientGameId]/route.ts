import { userIdFromCookies } from '@/lib/auth';
import { userIdFromApiBearer } from '@/lib/extension-auth';
import { readBearerToken } from '@/lib/http';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

import { CORS_HEADERS, handleGameDelete, handleGameRestore } from './handler';

export const dynamic = 'force-dynamic';

/**
 * CORS preflight for the extension's background DELETE (no host_permissions ⇒
 * the browser preflights the cross-origin request).
 */
export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

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
      if (token !== null) return userIdFromApiBearer(service, token);
      return userIdFromCookies(await createClient());
    },
    removeGame: async (userId, gameId) => {
      const { data, error } = await service.rpc('remove_owned_game', {
        p_user_id: userId,
        p_client_game_id: gameId,
      });
      if (error !== null) throw new Error(`removeGame: ${error.message}`);
      return data === true;
    },
  });
}

/** Restore a previously removed owned game to its recorded moderation state. */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ clientGameId: string }> },
): Promise<Response> {
  const { clientGameId } = await context.params;
  const service = createServiceClient();
  return handleGameRestore(request, clientGameId, {
    authenticate: async (req) => {
      const token = readBearerToken(req);
      if (token !== null) return userIdFromApiBearer(service, token);
      return userIdFromCookies(await createClient());
    },
    restoreGame: async (userId, gameId) => {
      const { data, error } = await service.rpc('restore_owned_game', {
        p_user_id: userId,
        p_client_game_id: gameId,
      });
      if (error !== null) throw new Error(`restoreGame: ${error.message}`);
      if (data !== true) return null;
      const restored = await service
        .from('games')
        .select('status, server_score')
        .eq('user_id', userId)
        .eq('client_game_id', gameId)
        .single();
      if (restored.error !== null) throw new Error(`restoreGame(read): ${restored.error.message}`);
      const row = restored.data;
      const outcome = row.status;
      if (
        outcome !== 'accepted' &&
        outcome !== 'quarantined' &&
        outcome !== 'rejected' &&
        outcome !== 'user_removed'
      ) {
        throw new Error('restoreGame(read): invalid status');
      }
      if (typeof row.server_score !== 'number') throw new Error('restoreGame(read): invalid score');
      return { id: gameId, outcome, serverScore: row.server_score };
    },
  });
}
