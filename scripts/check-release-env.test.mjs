import assert from 'node:assert/strict';
import test from 'node:test';

import { releaseEnvErrors } from './check-release-env.mjs';

const valid = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'public-key',
  SUPABASE_SERVICE_ROLE_KEY: 'private-service-key',
  RESEND_API_KEY: 'resend-key',
  EMAIL_FROM: 'ZetaLog <hello@zetalog.co.uk>',
  EXTENSION_OAUTH_REDIRECT_URIS:
    'https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/zetalog-link',
  NEXT_PUBLIC_CHROME_WEB_STORE_URL:
    'https://chromewebstore.google.com/detail/zetalog/abcdefghijklmnopabcdefghijklmnop',
};

test('accepts a complete exact production configuration', () => {
  assert.deepEqual(releaseEnvErrors(valid), []);
});

test('rejects missing secrets without including any secret values', () => {
  const errors = releaseEnvErrors({ ...valid, RESEND_API_KEY: '' });
  assert.deepEqual(errors, ['RESEND_API_KEY is missing']);
  assert.equal(JSON.stringify(errors).includes(valid.SUPABASE_SERVICE_ROLE_KEY), false);
});

test('rejects wildcard, non-Chrome, and local callback URLs', () => {
  for (const callback of [
    'https://*.chromiumapp.org/zetalog-link',
    'https://attacker.example/zetalog-link',
    'http://localhost:3000/zetalog-link',
    'https://user:password@abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/zetalog-link',
  ]) {
    assert.deepEqual(releaseEnvErrors({ ...valid, EXTENSION_OAUTH_REDIRECT_URIS: callback }), [
      'each extension redirect must be one exact Chrome Identity callback URL',
    ]);
  }
});

test('rejects duplicate callbacks and a non-root Supabase URL', () => {
  const callback = valid.EXTENSION_OAUTH_REDIRECT_URIS;
  assert.deepEqual(
    releaseEnvErrors({
      ...valid,
      NEXT_PUBLIC_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co/rest/v1',
      EXTENSION_OAUTH_REDIRECT_URIS: `${callback},${callback}`,
    }),
    [
      'NEXT_PUBLIC_SUPABASE_URL must be an exact HTTPS project root URL',
      'EXTENSION_OAUTH_REDIRECT_URIS contains a duplicate entry',
    ],
  );
});

test('requires the Store item and callback to use the same extension id', () => {
  assert.deepEqual(
    releaseEnvErrors({
      ...valid,
      NEXT_PUBLIC_CHROME_WEB_STORE_URL:
        'https://chromewebstore.google.com/detail/zetalog/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    }),
    ['the Store item ID must match an allowed Chrome Identity callback'],
  );
});

test('rejects a lookalike Store URL or a non-listing path', () => {
  for (const storeUrl of [
    'https://chromewebstore.google.com.attacker.example/detail/zetalog/abcdefghijklmnopabcdefghijklmnop',
    'https://chromewebstore.google.com/webstore/detail/zetalog/abcdefghijklmnopabcdefghijklmnop',
    'https://chromewebstore.google.com/detail/zetalog/abcdefghijklmnopabcdefghijklmnop?source=test',
  ]) {
    assert.deepEqual(releaseEnvErrors({ ...valid, NEXT_PUBLIC_CHROME_WEB_STORE_URL: storeUrl }), [
      'NEXT_PUBLIC_CHROME_WEB_STORE_URL must be the exact final Store listing URL',
    ]);
  }
});
