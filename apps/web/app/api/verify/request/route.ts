import { randomInt } from 'node:crypto';

import { z } from 'zod';

import { userIdFromCookies } from '@/lib/auth';
import { createIdentifierResolver } from '@/lib/auth-identifier';
import { createSupabaseEmailEventLogger, withEventLogging } from '@/lib/email/logging';
import { brandedCodeEmail } from '@/lib/email/template';
import { createResendSender } from '@/lib/email/resend';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

import { handleVerifyRequest } from './handler';

export const dynamic = 'force-dynamic';

/**
 * `POST /api/verify/request` — start uni-email verification (spec §7). Sends a
 * 6-digit code via the email module (never Supabase's sender). Core logic
 * lives in {@link handleVerifyRequest}; this file wires real ports.
 */

/** The verification email, rendered through the shared branded template. */
function renderVerificationEmail(code: string): { subject: string; html: string; text: string } {
  const { html, text } = brandedCodeEmail({
    heading: 'Verify your university email',
    intro: 'Enter this code on the verification page to add your university badge.',
    code,
    expiryLine: 'The code expires in 15 minutes.',
  });
  return { subject: `${code} is your ZetaLog verification code`, html, text };
}

export async function POST(request: Request): Promise<Response> {
  const service = createServiceClient();
  const sender = withEventLogging(
    createResendSender(),
    createSupabaseEmailEventLogger(service),
    'uni_verification',
  );

  return handleVerifyRequest(request, {
    authenticate: async () => userIdFromCookies(await createClient()),
    resolveIdentifier: createIdentifierResolver(service),
    listUniversities: async () => {
      const { data, error } = await service.from('universities').select('id, domains');
      if (error !== null) throw new Error(`listUniversities: ${error.message}`);
      return z.array(z.object({ id: z.string(), domains: z.array(z.string()) })).parse(data);
    },
    countRequestsForEmail: async (email, sinceMs) => {
      const { count, error } = await service
        .from('uni_verifications')
        .select('id', { count: 'exact', head: true })
        .eq('email', email)
        .gte('created_at', new Date(sinceMs).toISOString());
      if (error !== null) throw new Error(`countRequestsForEmail: ${error.message}`);
      return count ?? 0;
    },
    countEmailsSince: async (sinceMs) => {
      const { count, error } = await service
        .from('email_events')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', new Date(sinceMs).toISOString());
      if (error !== null) throw new Error(`countEmailsSince: ${error.message}`);
      return count ?? 0;
    },
    createVerification: async ({ userId, email, codeHash, expiresAtMs: expires }) => {
      const { error } = await service.from('uni_verifications').insert({
        user_id: userId,
        email,
        code_hash: codeHash,
        expires_at: new Date(expires).toISOString(),
        attempts: 0,
      });
      if (error !== null) throw new Error(`createVerification: ${error.message}`);
    },
    sendCode: (email, code) => {
      const { subject, html, text } = renderVerificationEmail(code);
      return sender.send({ to: email, subject, html, text });
    },
    random: (maxExclusive) => randomInt(maxExclusive),
    now: () => Date.now(),
  });
}
