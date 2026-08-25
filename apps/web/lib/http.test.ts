import { describe, expect, it } from 'vitest';

import { clientIpFrom, readJsonBody } from './http';

describe('clientIpFrom', () => {
  it("takes the first client entry of Vercel's trusted forwarding header", () => {
    const request = new Request('http://localhost/', {
      headers: { 'x-vercel-forwarded-for': '203.0.113.7, 198.51.100.2' },
    });
    expect(clientIpFrom(request)).toBe('203.0.113.7');
  });

  it('trims whitespace around the entry', () => {
    const request = new Request('http://localhost/', {
      headers: { 'x-vercel-forwarded-for': ' 203.0.113.7 ' },
    });
    expect(clientIpFrom(request)).toBe('203.0.113.7');
  });

  it('falls back to a fixed key when the header is missing or empty', () => {
    expect(clientIpFrom(new Request('http://localhost/'))).toBe('unknown');
    const empty = new Request('http://localhost/', {
      headers: { 'x-vercel-forwarded-for': ' ' },
    });
    expect(clientIpFrom(empty)).toBe('unknown');
  });

  it('ignores spoofable generic proxy headers', () => {
    const request = new Request('http://localhost/', {
      headers: {
        'x-forwarded-for': '203.0.113.7',
        'x-real-ip': '203.0.113.8',
      },
    });
    expect(clientIpFrom(request)).toBe('unknown');
  });
});

describe('readJsonBody', () => {
  it('parses a bounded JSON stream', async () => {
    await expect(
      readJsonBody(new Request('http://localhost/', { method: 'POST', body: '{"ok":true}' }), 64),
    ).resolves.toEqual({ ok: true, value: { ok: true } });
  });

  it('rejects declared and streamed oversize bodies before parsing', async () => {
    const declared = new Request('http://localhost/', {
      method: 'POST',
      headers: { 'content-length': '100' },
      body: '{}',
    });
    await expect(readJsonBody(declared, 10)).resolves.toEqual({
      ok: false,
      reason: 'payload-too-large',
    });

    const streamed = new Request('http://localhost/', { method: 'POST', body: '01234567890' });
    await expect(readJsonBody(streamed, 10)).resolves.toEqual({
      ok: false,
      reason: 'payload-too-large',
    });
  });

  it('rejects empty and malformed JSON', async () => {
    await expect(readJsonBody(new Request('http://localhost/'), 10)).resolves.toEqual({
      ok: false,
      reason: 'invalid-json',
    });
    await expect(
      readJsonBody(new Request('http://localhost/', { method: 'POST', body: '{' }), 10),
    ).resolves.toEqual({ ok: false, reason: 'invalid-json' });
  });
});
