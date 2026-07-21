import { describe, expect, it } from 'vitest';

import { bgRequestSchema } from './messages.js';

describe('bgRequestSchema', () => {
  it('accepts a link request with both tokens', () => {
    const parsed = bgRequestSchema.safeParse({
      type: 'zl-link',
      accessToken: 'a',
      refreshToken: 'r',
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts drain and unlink requests', () => {
    expect(bgRequestSchema.safeParse({ type: 'zl-drain' }).success).toBe(true);
    expect(bgRequestSchema.safeParse({ type: 'zl-unlink' }).success).toBe(true);
  });

  it('rejects a link request missing tokens', () => {
    expect(bgRequestSchema.safeParse({ type: 'zl-link' }).success).toBe(false);
  });

  it('rejects an unknown message type', () => {
    expect(bgRequestSchema.safeParse({ type: 'zl-something' }).success).toBe(false);
    expect(bgRequestSchema.safeParse('not-an-object').success).toBe(false);
  });
});
