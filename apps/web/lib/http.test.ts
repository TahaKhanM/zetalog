import { describe, expect, it } from 'vitest';

import { clientIpFrom } from './http';

describe('clientIpFrom', () => {
  it('takes the first (client) entry of x-forwarded-for', () => {
    const request = new Request('http://localhost/', {
      headers: { 'x-forwarded-for': '203.0.113.7, 198.51.100.2' },
    });
    expect(clientIpFrom(request)).toBe('203.0.113.7');
  });

  it('trims whitespace around the entry', () => {
    const request = new Request('http://localhost/', {
      headers: { 'x-forwarded-for': ' 203.0.113.7 ' },
    });
    expect(clientIpFrom(request)).toBe('203.0.113.7');
  });

  it('falls back to a fixed key when the header is missing or empty', () => {
    expect(clientIpFrom(new Request('http://localhost/'))).toBe('unknown');
    const empty = new Request('http://localhost/', { headers: { 'x-forwarded-for': ' ' } });
    expect(clientIpFrom(empty)).toBe('unknown');
  });
});
