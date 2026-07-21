import { sha256Hex } from '../hash';
import type { Db } from '../supabase/database';
import type { EmailEvent, EmailEventLogger, EmailSender } from './types';

/**
 * Wrap an {@link EmailSender} so every send is recorded to `email_events`
 * (spec §7). This decorator is the single audit point: it hashes the recipient
 * before logging (the address itself is never persisted) and records whether
 * the send succeeded or failed. The original {@link SendResult} is returned
 * unchanged, so callers still see typed failures.
 *
 * @param sender the underlying provider sender (e.g. Resend)
 * @param logger persists the resulting `email_events` row
 * @param kind the event kind stored alongside each row (e.g. `uni_verification`)
 */
export function withEventLogging(
  sender: EmailSender,
  logger: EmailEventLogger,
  kind: string,
): EmailSender {
  return {
    async send(message) {
      const recipientHash = sha256Hex(message.to);
      const result = await sender.send(message);
      const event: EmailEvent = result.ok
        ? { kind, recipientHash, status: 'sent' }
        : { kind, recipientHash, status: 'failed', error: result.error.message };
      await logger.log(event);
      return result;
    },
  };
}

/**
 * The concrete `email_events` logger: inserts one row via the service client
 * (the table is service-role only — RLS has zero policies). Insert failures
 * throw with context rather than being swallowed.
 */
export function createSupabaseEmailEventLogger(service: Db): EmailEventLogger {
  return {
    async log(event) {
      const { error } = await service.from('email_events').insert({
        kind: event.kind,
        recipient_hash: event.recipientHash,
        status: event.status,
        error: event.error ?? null,
      });
      if (error !== null) throw new Error(`email_events insert failed: ${error.message}`);
    },
  };
}
