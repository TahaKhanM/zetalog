import { describe, expect, it } from 'vitest';

import { isLinkAck, linkSessionMessage } from './link';

describe('linkSessionMessage', () => {
  it('wraps the tokens in the handoff envelope', () => {
    expect(linkSessionMessage('access-1', 'refresh-1')).toEqual({
      type: 'zl-link',
      session: { access_token: 'access-1', refresh_token: 'refresh-1' },
    });
  });
});

describe('isLinkAck', () => {
  it('accepts the ack message', () => {
    expect(isLinkAck({ type: 'zl-link-ack' })).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isLinkAck({ type: 'zl-link' })).toBe(false);
    expect(isLinkAck(null)).toBe(false);
    expect(isLinkAck('zl-link-ack')).toBe(false);
    expect(isLinkAck(undefined)).toBe(false);
  });
});
