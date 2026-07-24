import { err, ok } from '@zetalog/shared';
import { Resend } from 'resend';

import { serverEnv } from '../env.server';
import type { EmailSender } from './types';

/**
 * The Resend-backed {@link EmailSender}. This is the only place the
 * app talks to an email provider directly; swapping to Brevo/SES means writing
 * one more file like this and changing the factory call — verification logic is
 * untouched. Note this sends the uni-verification OTP; Supabase Auth's magic
 * links go through Resend's SMTP separately (configured in the dashboard).
 *
 * Provider and network failures are returned as typed {@link SendResult}
 * errors, never thrown.
 */
export function createResendSender(): EmailSender {
  return {
    async send(message) {
      const env = serverEnv();
      const resend = new Resend(env.RESEND_API_KEY);
      const base = {
        from: env.EMAIL_FROM,
        to: message.to,
        subject: message.subject,
        html: message.html,
      };
      const payload = message.text === undefined ? base : { ...base, text: message.text };
      try {
        const { data, error } = await resend.emails.send(payload);
        if (error !== null) return err({ code: 'send-failed', message: error.message });
        return ok({ id: data.id });
      } catch (cause) {
        const detail = cause instanceof Error ? cause.message : 'unknown error';
        return err({ code: 'send-failed', message: detail });
      }
    },
  };
}
