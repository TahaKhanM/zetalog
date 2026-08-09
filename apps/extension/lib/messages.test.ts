import { ZETAMAC_DEFAULT_SETTINGS } from '@zetalog/shared';
import { describe, expect, it } from 'vitest';

import {
  bgRequestSchema,
  capturePortRequestSchema,
  capturePortResponseSchema,
  captureRequestSchema,
} from './messages.js';

const record = {
  id: '11111111-1111-4111-8111-111111111111',
  startedAtMs: 1,
  playedMs: 2,
  settings: ZETAMAC_DEFAULT_SETTINGS,
  events: [],
  claimedScore: 0,
};

describe('captureRequestSchema', () => {
  it('accepts only validated capture records', () => {
    expect(captureRequestSchema.safeParse({ type: 'zl-checkpoint-game', record }).success).toBe(
      true,
    );
    expect(captureRequestSchema.safeParse({ type: 'zl-save-game', record: {} }).success).toBe(
      false,
    );
    expect(captureRequestSchema.safeParse({ type: 'zl-drain' }).success).toBe(false);
  });

  it('keeps the port handshake separate from record messages', () => {
    expect(capturePortRequestSchema.safeParse({ type: 'zl-capture-mounted' }).success).toBe(true);
    expect(capturePortRequestSchema.safeParse({ type: 'zl-checkpoint-game', record }).success).toBe(
      true,
    );
    expect(capturePortResponseSchema.safeParse({ type: 'zl-capture-ready' }).success).toBe(true);
    expect(capturePortResponseSchema.safeParse({ type: 'zl-capture-mounted' }).success).toBe(false);
  });
});

describe('bgRequestSchema', () => {
  it('accepts an explicit link-begin request', () => {
    expect(bgRequestSchema.safeParse({ type: 'zl-begin-link' }).success).toBe(true);
  });

  it('accepts drain and unlink requests', () => {
    expect(bgRequestSchema.safeParse({ type: 'zl-drain' }).success).toBe(true);
    expect(bgRequestSchema.safeParse({ type: 'zl-unlink' }).success).toBe(true);
  });

  it('accepts profile read and privacy requests', () => {
    expect(bgRequestSchema.safeParse({ type: 'zl-get-profile' }).success).toBe(true);
    expect(bgRequestSchema.safeParse({ type: 'zl-set-privacy', optOut: true }).success).toBe(true);
    expect(bgRequestSchema.safeParse({ type: 'zl-set-privacy' }).success).toBe(false);
  });

  it('accepts a backfill request', () => {
    expect(bgRequestSchema.safeParse({ type: 'zl-backfill' }).success).toBe(true);
  });

  it('rejects the obsolete link-claim protocol', () => {
    expect(
      bgRequestSchema.safeParse({ type: 'zl-claim-link', requestId: 'zlr_request' }).success,
    ).toBe(false);
  });

  it('rejects an unknown message type', () => {
    expect(bgRequestSchema.safeParse({ type: 'zl-something' }).success).toBe(false);
    expect(bgRequestSchema.safeParse('not-an-object').success).toBe(false);
  });
});
