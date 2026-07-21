import { z } from 'zod';

import { userIdFromCookies } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

import { handleVerifyConfirm } from './handler';

export const dynamic = 'force-dynamic';

/**
 * `POST /api/verify/confirm` — finish uni-email verification (spec §7). Core
 * logic lives in {@link handleVerifyConfirm}; this file wires real ports.
 */
export async function POST(request: Request): Promise<Response> {
  const service = createServiceClient();
  return handleVerifyConfirm(request, {
    authenticate: async () => userIdFromCookies(await createClient()),
    getLatestPending: async (userId) => {
      const { data, error } = await service
        .from('uni_verifications')
        .select('id, email, code_hash, expires_at, attempts')
        .eq('user_id', userId)
        .is('verified_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error !== null) throw new Error(`getLatestPending: ${error.message}`);
      if (data === null) return null;
      const row = z
        .object({
          id: z.uuid(),
          email: z.string(),
          code_hash: z.string(),
          expires_at: z.string(),
          attempts: z.number().int().nonnegative(),
        })
        .parse(data);
      return {
        id: row.id,
        email: row.email,
        codeHash: row.code_hash,
        expiresAtMs: new Date(row.expires_at).getTime(),
        attempts: row.attempts,
      };
    },
    listUniversities: async () => {
      const { data, error } = await service.from('universities').select('id, name, slug, domains');
      if (error !== null) throw new Error(`listUniversities: ${error.message}`);
      return z
        .array(
          z.object({
            id: z.string(),
            name: z.string(),
            slug: z.string(),
            domains: z.array(z.string()),
          }),
        )
        .parse(data);
    },
    incrementAttempts: async (verificationId) => {
      const { data, error } = await service
        .from('uni_verifications')
        .select('attempts')
        .eq('id', verificationId)
        .single();
      if (error !== null) throw new Error(`incrementAttempts(read): ${error.message}`);
      const current = z.object({ attempts: z.number().int() }).parse(data).attempts;
      const { error: updateError } = await service
        .from('uni_verifications')
        .update({ attempts: current + 1 })
        .eq('id', verificationId);
      if (updateError !== null) throw new Error(`incrementAttempts: ${updateError.message}`);
    },
    applyVerification: async ({ userId, universityId, verificationId, nowIso }) => {
      // Stamp the verification FIRST: the partial unique index on verified
      // aliases (W8) makes this the statement that can lose a claim race —
      // losing must not leave a half-applied profile.
      const verification = await service
        .from('uni_verifications')
        .update({ verified_at: nowIso })
        .eq('id', verificationId);
      if (verification.error !== null) {
        if (verification.error.code === '23505') return { ok: false, reason: 'alias-conflict' };
        throw new Error(`applyVerification(verification): ${verification.error.message}`);
      }
      const profile = await service
        .from('profiles')
        .update({ university_id: universityId, uni_verified_at: nowIso })
        .eq('id', userId);
      if (profile.error !== null) {
        throw new Error(`applyVerification(profile): ${profile.error.message}`);
      }
      return { ok: true };
    },
    now: () => Date.now(),
  });
}
