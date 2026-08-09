import { z } from 'zod';

import { userIdFromCookies } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

import { handleVerifyConfirm } from './handler';

export const dynamic = 'force-dynamic';

/**
 * `POST /api/verify/confirm` — finish uni-email verification. Core
 * logic lives in {@link handleVerifyConfirm}; this file wires real ports.
 */
export async function POST(request: Request): Promise<Response> {
  const service = createServiceClient();
  return handleVerifyConfirm(request, {
    authenticate: async () => userIdFromCookies(await createClient()),
    confirmVerification: async ({ userId, codeHash, nowIso }) => {
      const { data, error } = await service.rpc('confirm_uni_verification', {
        p_user_id: userId,
        p_code_hash: codeHash,
        p_now: nowIso,
      });
      if (error !== null) throw new Error(`confirm_uni_verification: ${error.message}`);
      const rows = z
        .array(
          z.object({
            status: z.enum([
              'ok',
              'incorrect',
              'expired',
              'locked',
              'no-pending',
              'unknown-university',
              'alias-conflict',
            ]),
            university_name: z.string().nullable(),
            university_slug: z.string().nullable(),
            attempts_remaining: z.number().int().nullable(),
          }),
        )
        .length(1)
        .parse(data);
      const row = rows[0];
      if (row === undefined) throw new Error('confirm_uni_verification returned no row');
      if (row.status === 'ok') {
        return {
          status: 'ok' as const,
          university: {
            name: z.string().parse(row.university_name),
            slug: z.string().parse(row.university_slug),
          },
        };
      }
      if (row.status === 'incorrect') {
        return {
          status: 'incorrect' as const,
          attemptsRemaining: z.number().int().nonnegative().parse(row.attempts_remaining),
        };
      }
      return { status: row.status };
    },
    now: () => Date.now(),
  });
}
