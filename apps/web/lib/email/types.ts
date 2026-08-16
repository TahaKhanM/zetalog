import type { Result } from '@zetalog/shared';

/**
 * The email boundary. Every send goes through one {@link EmailSender}
 * so the provider (Resend today) can be swapped without touching verification
 * logic, and so sends can be decorated with logging in exactly one place.
 */

/** A ready-to-send message. `text` is an optional plain-text alternative. */
export interface EmailMessage {
  readonly to: string;
  readonly subject: string;
  readonly html: string;
  readonly text?: string;
}

/** A typed send failure — errors are values, never thrown across this boundary. */
export interface EmailError {
  readonly code: 'send-failed';
  readonly message: string;
}

/** Success carries the provider's message id; failure carries a typed error. */
export type SendResult = Result<{ readonly id: string }, EmailError>;

/** Sends one message and reports the outcome without throwing. */
export interface EmailSender {
  send(message: EmailMessage): Promise<SendResult>;
}

/** Whether a send succeeded or failed, as recorded in `email_events`. */
export type EmailEventStatus = 'sent' | 'failed';

/**
 * One row destined for `email_events`. The recipient is stored only as a
 * SHA-256 hash.
 */
export interface EmailEvent {
  readonly kind: string;
  readonly recipientHash: string;
  readonly status: EmailEventStatus;
  readonly error?: string;
}

/** Persists an {@link EmailEvent} (the `email_events` insert). */
export interface EmailEventLogger {
  log(event: EmailEvent): Promise<void>;
}
