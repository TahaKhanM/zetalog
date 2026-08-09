import { describe, expect, it } from 'vitest';

import { chromeWebStoreUrl } from './chrome-store';

const ID = 'abcdefghijklmnopabcdefghijklmnop';

describe('chromeWebStoreUrl', () => {
  it.each([
    `https://chromewebstore.google.com/detail/${ID}`,
    `https://chromewebstore.google.com/detail/zetalog/${ID}`,
  ])('accepts a final Store listing URL: %s', (value) => {
    expect(chromeWebStoreUrl(value)).toBe(value);
  });

  it.each([
    undefined,
    '',
    `http://chromewebstore.google.com/detail/zetalog/${ID}`,
    `https://attacker.example/detail/zetalog/${ID}`,
    `https://chromewebstore.google.com.attacker.example/detail/zetalog/${ID}`,
    `https://chromewebstore.google.com/webstore/detail/zetalog/${ID}`,
    'https://chromewebstore.google.com/detail/zetalog/not-an-extension-id',
    `https://chromewebstore.google.com/detail/zetalog/${ID}?source=site`,
    `https://chromewebstore.google.com/detail/zetalog/${ID}#reviews`,
  ])('rejects a non-listing value: %s', (value) => {
    expect(chromeWebStoreUrl(value)).toBeNull();
  });
});
