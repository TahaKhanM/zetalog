import { describe, expect, it } from 'vitest';

import { LINK_ACK, parseLinkMessage } from './link.js';

const ORIGINS = ['https://zetalog.vercel.app', 'http://localhost:3000'];
const SOURCE = { id: 'window' };

const validData = {
  type: 'zl-link',
  session: { access_token: 'access-1', refresh_token: 'refresh-1' },
};

describe('parseLinkMessage', () => {
  it('extracts tokens from a valid same-window message on an allowed origin', () => {
    const result = parseLinkMessage(
      { origin: 'https://zetalog.vercel.app', source: SOURCE, data: validData },
      SOURCE,
      ORIGINS,
    );
    expect(result).toEqual({
      ok: true,
      value: { accessToken: 'access-1', refreshToken: 'refresh-1' },
    });
  });

  it('rejects a disallowed origin before reading anything', () => {
    const result = parseLinkMessage(
      { origin: 'https://evil.example', source: SOURCE, data: validData },
      SOURCE,
      ORIGINS,
    );
    expect(result).toEqual({ ok: false, error: { reason: 'bad-origin' } });
  });

  it('rejects a message from a different source (e.g. an embedded frame)', () => {
    const result = parseLinkMessage(
      { origin: 'https://zetalog.vercel.app', source: { other: true }, data: validData },
      SOURCE,
      ORIGINS,
    );
    expect(result).toEqual({ ok: false, error: { reason: 'bad-source' } });
  });

  it('rejects a payload that is not a link message', () => {
    const result = parseLinkMessage(
      { origin: 'http://localhost:3000', source: SOURCE, data: { type: 'other' } },
      SOURCE,
      ORIGINS,
    );
    expect(result).toEqual({ ok: false, error: { reason: 'bad-payload' } });
  });

  it('rejects a link message missing a token', () => {
    const result = parseLinkMessage(
      {
        origin: 'http://localhost:3000',
        source: SOURCE,
        data: { type: 'zl-link', session: { access_token: 'a', refresh_token: '' } },
      },
      SOURCE,
      ORIGINS,
    );
    expect(result).toEqual({ ok: false, error: { reason: 'bad-payload' } });
  });

  it('exposes the ack message shape', () => {
    expect(LINK_ACK).toEqual({ type: 'zl-link-ack' });
  });
});
