import { randomInt } from 'node:crypto';

import { z } from 'zod';

import { userIdFromCookies } from '@/lib/auth';
import { createIdentifierResolver } from '@/lib/auth-identifier';
import { createSupabaseEmailEventLogger, withEventLogging } from '@/lib/email/logging';
import { brandedCodeEmail } from '@/lib/email/template';
import { createResendSender } from '@/lib/email/resend';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

import { EMAIL_DAILY_CAP, MAX_REQUESTS_PER_HOUR, handleVerifyRequest } from './handler';

export const dynamic = 'force-dynamic';

/**
 * `POST /api/verify/request` — start uni-email verification. Sends a
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
    reserveVerification: async ({ userId, email, codeHash, expiresAtMs: expires }) => {
      const { data, error } = await service.rpc('reserve_uni_verification', {
        p_user_id: userId,
        p_email: email,
        p_code_hash: codeHash,
        p_expires_at: new Date(expires).toISOString(),
        p_per_email_limit: MAX_REQUESTS_PER_HOUR,
        p_global_limit: EMAIL_DAILY_CAP,
      });
      if (error !== null) throw new Error(`reserve_uni_verification: ${error.message}`);
      const result = z.string().parse(data);
      if (result === 'rate-limited' || result === 'capacity') return { status: result };
      return { status: 'reserved', verificationId: z.uuid().parse(result) };
    },
    recordDelivery: async ({ verificationId, sent, error: deliveryError }) => {
      const { error } = await service.rpc('record_verification_email_delivery', {
        p_verification_id: verificationId,
        p_sent: sent,
        p_error: deliveryError ?? null,
      });
      if (error !== null) throw new Error(`record_verification_email_delivery: ${error.message}`);
    },
    sendCode: (email, code) => {
      const { subject, html, text } = renderVerificationEmail(code);
      return sender.send({ to: email, subject, html, text });
    },
    random: (maxExclusive) => randomInt(maxExclusive),
    now: () => Date.now(),
  });
}
