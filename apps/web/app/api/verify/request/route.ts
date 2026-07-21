import { randomInt } from 'node:crypto';

import { z } from 'zod';

import { userIdFromCookies } from '@/lib/auth';
import { createSupabaseEmailEventLogger, withEventLogging } from '@/lib/email/logging';
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

/** The verification email: a large, mono, tracked code in the ZetaLog palette. */
function renderVerificationEmail(code: string): { subject: string; html: string; text: string } {
  const subject = `${code} is your ZetaLog verification code`;
  const html = `<!doctype html><html><body style="margin:0;background:#fdf0d5;padding:32px;font-family:'Spline Sans',system-ui,sans-serif;color:#003049">
  <table role="presentation" width="100%" style="max-width:480px;margin:0 auto;background:#fdf0d5">
    <tr><td style="font-weight:800;letter-spacing:.02em;color:#780000;font-size:20px;text-transform:uppercase">ZetaLog</td></tr>
    <tr><td style="padding-top:16px;font-size:15px">Enter this code to verify your university email. It expires in 15 minutes.</td></tr>
    <tr><td style="padding:24px 0"><div style="font-family:ui-monospace,SFMono-Regular,monospace;font-size:40px;letter-spacing:.3em;font-variant-numeric:tabular-nums;color:#003049">${code}</div></td></tr>
    <tr><td style="font-size:13px;color:#669bbc">If you didn't request this, you can ignore this email. Not affiliated with Zetamac.</td></tr>
  </table></body></html>`;
  const text = `Your ZetaLog verification code is ${code}. It expires in 15 minutes.`;
  return { subject, html, text };
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
