import { z } from 'zod';

import { gameStatusSchema } from '../db/rows';
import { hashExtensionSecret } from '../extension-auth';
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

const atomicSubmitRowSchema = z.object({
  result: z.enum(['inserted', 'existing', 'rate-limited']),
  id: z.uuid().nullable(),
  outcome: gameStatusSchema.nullable(),
  server_score: z.number().int().nonnegative().nullable(),
});

function toPersisted(row: z.infer<typeof persistedRowSchema>): PersistedGame {
  return { id: row.id, outcome: row.status, serverScore: row.server_score };
}

export function createSubmitPort(service: Db): SubmitPort {
  return {
    async findExistingGame(userId, clientGameId) {
      const result = await service
        .from('games')
        .select('id, status, server_score')
        .eq('user_id', userId)
        .eq('client_game_id', clientGameId)
        .maybeSingle();
      if (result.error !== null) throw new Error(`findExistingGame: ${result.error.message}`);
      return result.data === null ? null : toPersisted(persistedRowSchema.parse(result.data));
    },

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

    async resolveChallenge(userId, evidence, startedAtMs) {
      const result = await service
        .from('game_challenges')
        .select('id, issued_at, start_expires_at')
        .eq('id', evidence.challengeId)
        .eq('user_id', userId)
        .eq('nonce_hash', hashExtensionSecret(evidence.nonce))
        .is('consumed_at', null)
        .maybeSingle();
      if (result.error !== null || result.data === null) return null;
      const parsed = z
        .object({ id: z.uuid(), issued_at: z.string(), start_expires_at: z.string() })
        .parse(result.data);
      const issuedAt = Date.parse(parsed.issued_at);
      const expiresAt = Date.parse(parsed.start_expires_at);
      // Accommodate ordinary device clock skew. Invalid evidence is ignored so
      // a legitimate offline/clock-skewed game still follows the agreed checks.
      const skewMs = 5 * 60 * 1000;
      if (startedAtMs < issuedAt - skewMs || startedAtMs > expiresAt + skewMs) return null;
      return parsed.id;
    },

    async insertGame(game, rateSinceMs = Date.now() - 60 * 60 * 1000, rateLimit = 60) {
      const inserted = await service.rpc('submit_game_atomic', {
        p_user_id: game.userId,
        p_client_game_id: game.clientGameId,
        p_played_at: game.playedAt,
        p_settings_fingerprint: game.settingsFingerprint,
        p_rankable_duration: game.rankableDuration,
        p_claimed_score: game.claimedScore,
        p_server_score: game.serverScore,
        p_status: game.status,
        p_telemetry: game.telemetry,
        p_validation: game.validation,
        p_challenge_id: game.challengeId ?? null,
        p_rate_since: new Date(rateSinceMs).toISOString(),
        p_rate_limit: rateLimit,
      });
      if (inserted.error !== null) throw new Error(`insertGame: ${inserted.error.message}`);
      const row = z.array(atomicSubmitRowSchema).parse(inserted.data)[0];
      if (row === undefined) throw new Error('insertGame: empty atomic response');
      if (row.result === 'rate-limited') return null;
      if (row.id === null || row.outcome === null || row.server_score === null)
        throw new Error('insertGame: incomplete atomic response');
      return toPersisted({ id: row.id, status: row.outcome, server_score: row.server_score });
    },
  };
}
