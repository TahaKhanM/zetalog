import { describe, expect, it } from 'vitest';

import { isExtensionLinkIntent } from './extension-link-intent';

describe('isExtensionLinkIntent', () => {
  it('recognises the extension authorize continuation', () => {
    expect(
      isExtensionLinkIntent(
        'link-extension',
        '/api/extension/link/authorize?redirect_uri=https%3A%2F%2Fexample.chromiumapp.org',
      ),
    ).toBe(true);
  });

  it.each([
    [undefined, '/api/extension/link/authorize'],
    ['link-extension', '/me'],
    ['link-extension', 'https://attacker.example/api/extension/link/authorize'],
    ['other', '/api/extension/link/authorize'],
  ])('rejects an unrelated or untrusted context: %s, %s', (intent, next) => {
    expect(isExtensionLinkIntent(intent, next)).toBe(false);
  });
});
