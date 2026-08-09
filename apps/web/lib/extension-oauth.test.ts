import { describe, expect, it } from 'vitest';

import {
  authorizationCallbackUrl,
  isAllowedExtensionRedirect,
  parseExtensionRedirectUris,
} from './extension-oauth';

const REDIRECT_URI = 'https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/zetalog-link';

describe('extension OAuth redirect validation', () => {
  it('accepts only exact Chrome Identity callback URLs', () => {
    expect(parseExtensionRedirectUris(REDIRECT_URI)).toEqual([REDIRECT_URI]);
    expect(() => parseExtensionRedirectUris('https://attacker.example/zetalog-link')).toThrow();
    expect(() => parseExtensionRedirectUris(`${REDIRECT_URI}?code=attacker`)).toThrow();
    expect(() =>
      parseExtensionRedirectUris('https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/other'),
    ).toThrow();
  });

  it('uses exact-string allowlisting without URL normalisation', () => {
    expect(isAllowedExtensionRedirect(REDIRECT_URI, [REDIRECT_URI])).toBe(true);
    expect(isAllowedExtensionRedirect(`${REDIRECT_URI}/`, [REDIRECT_URI])).toBe(false);
    expect(isAllowedExtensionRedirect(REDIRECT_URI.toUpperCase(), [REDIRECT_URI])).toBe(false);
  });

  it('round-trips code and state on the prevalidated callback URL', () => {
    const callback = new URL(
      authorizationCallbackUrl(REDIRECT_URI, 'zla_code', 'state_value_1234'),
    );
    expect(callback.origin + callback.pathname).toBe(REDIRECT_URI);
    expect(callback.searchParams.get('code')).toBe('zla_code');
    expect(callback.searchParams.get('state')).toBe('state_value_1234');
  });
});
