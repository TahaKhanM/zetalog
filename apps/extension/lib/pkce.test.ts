import { describe, expect, it } from 'vitest';

import { codeFromLinkCallback, createPkceValues } from './pkce.js';

describe('createPkceValues', () => {
  it('creates independent, URL-safe state and verifier values with an S256 challenge', async () => {
    const first = await createPkceValues();
    const second = await createPkceValues();

    expect(first.state).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first.challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first.state).not.toBe(second.state);
    expect(first.verifier).not.toBe(second.verifier);

    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(first.verifier));
    const expected = Buffer.from(digest).toString('base64url');
    expect(first.challenge).toBe(expected);
  });
});

describe('codeFromLinkCallback', () => {
  const redirectUri = 'https://extension-id.chromiumapp.org/zetalog-link';
  const state = 'expected-state';

  it('accepts exactly one code and matching state at the configured redirect endpoint', () => {
    expect(
      codeFromLinkCallback(
        `${redirectUri}?code=authorization-code&state=${state}`,
        redirectUri,
        state,
      ),
    ).toBe('authorization-code');
  });

  it.each([
    ['wrong path', 'https://extension-id.chromiumapp.org/other?code=x&state=expected-state'],
    ['wrong host', 'https://attacker.example/zetalog-link?code=x&state=expected-state'],
    ['wrong state', `${redirectUri}?code=x&state=attacker-state`],
    ['duplicate code', `${redirectUri}?code=x&code=y&state=${state}`],
    ['extra parameter', `${redirectUri}?code=x&state=${state}&next=attacker`],
    ['fragment', `${redirectUri}?code=x&state=${state}#fragment`],
    ['missing code', `${redirectUri}?state=${state}`],
  ])('rejects a %s callback', (_name, callback) => {
    expect(codeFromLinkCallback(callback, redirectUri, state)).toBeNull();
  });

  it('rejects a redirect URI that is not an exact identity endpoint', () => {
    expect(
      codeFromLinkCallback(
        `${redirectUri}?code=authorization-code&state=${state}`,
        `${redirectUri}?unexpected=query`,
        state,
      ),
    ).toBeNull();
  });
});
