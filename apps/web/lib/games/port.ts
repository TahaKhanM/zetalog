import { z } from 'zod';

import { gameStatusSchema } from '../db/rows';
import type { Db } from '../supabase/database';
import type { PersistedGame, SubmitPort } from './submit';

/**
 * The concrete {@link SubmitPort} over the service-role client. This is where
 * the pure pipeline meets the database: rate-limit counting, accepted-score
 * history, and the idempotent insert (`on conflict do nothing`, resolving to
 * the existing row on collision).
 */

const persistedRowSchema = z.object({
  id: z.uuid(),
  status: gameStatusSchema,
  server_score: z.number().int().nonnegative(),
});

function toPersisted(row: z.infer<typeof persistedRowSchema>): PersistedGame {
  return { id: row.id, outcome: row.status, serverScore: row.server_score };
}

export function createSubmitPort(service: Db): SubmitPort {
  return {
    async countGamesReceivedSince(userId, sinceMs) {
      const { count, error } = await service
        .from('games')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('received_at', new Date(sinceMs).toISOString());
      if (error !== null) throw new Error(`countGamesReceivedSince: ${error.message}`);
      return count ?? 0;
    },

    async getAcceptedScores(userId, duration) {
      const { data, error } = await service
        .from('games')
        .select('server_score')
        .eq('user_id', userId)
        .eq('rankable_duration', duration)
        .eq('status', 'accepted');
      if (error !== null) throw new Error(`getAcceptedScores: ${error.message}`);
      return z
        .array(z.object({ server_score: z.number().int().nonnegative() }))
        .parse(data)
        .map((row) => row.server_score);
    },

    async insertGame(game) {
      const row = {
        user_id: game.userId,
        client_game_id: game.clientGameId,
        played_at: game.playedAt,
        settings_fingerprint: game.settingsFingerprint,
        rankable_duration: game.rankableDuration,
        claimed_score: game.claimedScore,
        server_score: game.serverScore,
        status: game.status,
        telemetry: game.telemetry,
        validation: game.validation,
      };
      const inserted = await service
        .from('games')
        .upsert(row, { onConflict: 'user_id,client_game_id', ignoreDuplicates: true })
        .select('id, status, server_score');
      if (inserted.error !== null) throw new Error(`insertGame: ${inserted.error.message}`);
      const rows = z.array(persistedRowSchema).parse(inserted.data);
      const fresh = rows[0];
      if (fresh !== undefined) return toPersisted(fresh);

      // Conflict: the row already existed and the insert was ignored. Return
      // the stored outcome so the response is identical on retry (idempotent).
      const existing = await service
        .from('games')
        .select('id, status, server_score')
        .eq('user_id', game.userId)
        .eq('client_game_id', game.clientGameId)
        .single();
      if (existing.error !== null)
        throw new Error(`insertGame(conflict): ${existing.error.message}`);
      return toPersisted(persistedRowSchema.parse(existing.data));
    },
  };
}
