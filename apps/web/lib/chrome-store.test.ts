import { describe, expect, it } from 'vitest';

import {
  OFFICIAL_CHROME_EXTENSION_ID,
  OFFICIAL_CHROME_WEB_STORE_URL,
  OFFICIAL_EXTENSION_REDIRECT_URI,
  chromeWebStoreUrl,
} from './chrome-store';

const ID = OFFICIAL_CHROME_EXTENSION_ID;

describe('chromeWebStoreUrl', () => {
  it.each([
    `https://chromewebstore.google.com/detail/${ID}`,
    `https://chromewebstore.google.com/detail/zetalog/${ID}`,
  ])('accepts a final Store listing URL: %s', (value) => {
    expect(chromeWebStoreUrl(value)).toBe(value);
  });

  it('keeps the Store item and Chrome Identity callback on the same published id', () => {
    expect(OFFICIAL_CHROME_WEB_STORE_URL).toBe(
      `https://chromewebstore.google.com/detail/zetalog/${ID}`,
    );
    expect(OFFICIAL_EXTENSION_REDIRECT_URI).toBe(`https://${ID}.chromiumapp.org/zetalog-link`);
  });

  it.each([
    undefined,
    '',
    `http://chromewebstore.google.com/detail/zetalog/${ID}`,
    `https://attacker.example/detail/zetalog/${ID}`,
    `https://chromewebstore.google.com.attacker.example/detail/zetalog/${ID}`,
    `https://chromewebstore.google.com/webstore/detail/zetalog/${ID}`,
    'https://chromewebstore.google.com/detail/zetalog/not-an-extension-id',
    'https://chromewebstore.google.com/detail/zetalog/bhbpjdngipckdepgblhopdfijnpeefml',
    `https://chromewebstore.google.com/detail/zetalog/${ID}?source=site`,
    `https://chromewebstore.google.com/detail/zetalog/${ID}#reviews`,
  ])('rejects a non-listing value: %s', (value) => {
    expect(chromeWebStoreUrl(value)).toBeNull();
  });
});
