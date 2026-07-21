import { err, ok } from '@zetalog/shared';
import { describe, expect, it, vi } from 'vitest';

import { sha256Hex } from '../hash';
import { withEventLogging } from './logging';
import type { EmailEvent, EmailMessage, EmailSender, SendResult } from './types';

const message: EmailMessage = {
  to: 'student@ox.ac.uk',
  subject: 'Your ZetaLog code',
  html: '<p>123456</p>',
};

function fakeSender(result: SendResult): EmailSender {
  return { send: vi.fn(async () => Promise.resolve(result)) };
}

function recordingLogger(): { logged: EmailEvent[]; log: (event: EmailEvent) => Promise<void> } {
  const logged: EmailEvent[] = [];
  return {
    logged,
    log: async (event: EmailEvent) => {
      logged.push(event);
      return Promise.resolve();
    },
  };
}

describe('withEventLogging', () => {
  it('logs a sent event with the hashed recipient and returns the success', async () => {
    const sender = fakeSender(ok({ id: 'email_1' }));
    const logger = recordingLogger();
    const decorated = withEventLogging(sender, logger, 'uni_verification');

    const result = await decorated.send(message);

    expect(result).toEqual(ok({ id: 'email_1' }));
    expect(logger.logged).toEqual([
      {
        kind: 'uni_verification',
        recipientHash: sha256Hex('student@ox.ac.uk'),
        status: 'sent',
      },
    ]);
  });

  it('never records the raw recipient address', async () => {
    const logger = recordingLogger();
    const decorated = withEventLogging(fakeSender(ok({ id: 'e' })), logger, 'uni_verification');

    await decorated.send(message);

    expect(JSON.stringify(logger.logged)).not.toContain('student@ox.ac.uk');
  });

  it('logs a failed event with the error and surfaces the typed failure', async () => {
    const failure = err({ code: 'send-failed', message: 'provider down' } as const);
    const logger = recordingLogger();
    const decorated = withEventLogging(fakeSender(failure), logger, 'uni_verification');

    const result = await decorated.send(message);

    expect(result).toEqual(failure);
    expect(logger.logged).toEqual([
      {
        kind: 'uni_verification',
        recipientHash: sha256Hex('student@ox.ac.uk'),
        status: 'failed',
        error: 'provider down',
      },
    ]);
  });
});
