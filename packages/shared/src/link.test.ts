import { describe, expect, it } from 'vitest';

import {
  LINK_FAILURE_MESSAGES,
  linkErrorSchema,
  linkFailureMessage,
  linkFailureSchema,
  normalizeLinkFailure,
} from './link';

describe('link failure contract', () => {
  it('accepts every public link error and the internal boundary failure', () => {
    for (const failure of Object.keys(LINK_FAILURE_MESSAGES)) {
      expect(linkFailureSchema.parse(failure)).toBe(failure);
      if (failure !== 'internal') expect(linkErrorSchema.parse(failure)).toBe(failure);
    }
    expect(linkErrorSchema.safeParse('internal').success).toBe(false);
  });

  it('normalises unknown input without exposing it in user-facing copy', () => {
    expect(normalizeLinkFailure('network')).toBe('network');
    expect(normalizeLinkFailure({ secret: 'raw failure' })).toBe('internal');
    expect(linkFailureMessage('network')).toBe(LINK_FAILURE_MESSAGES.network);
    expect(linkFailureMessage('raw failure')).toBe(LINK_FAILURE_MESSAGES.internal);
    expect(linkFailureMessage('raw failure')).not.toContain('raw failure');
  });
});
