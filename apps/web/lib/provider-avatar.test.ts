import { describe, expect, it } from 'vitest';

import { providerAvatarFrom } from './provider-avatar';

describe('providerAvatarFrom', () => {
  it('reads avatar_url from GitHub-shaped metadata', () => {
    expect(
      providerAvatarFrom({ avatar_url: 'https://avatars.githubusercontent.com/u/1?v=4' }),
    ).toBe('https://avatars.githubusercontent.com/u/1?v=4');
  });

  it('reads picture from Google-shaped metadata when avatar_url is absent', () => {
    expect(providerAvatarFrom({ picture: 'https://lh3.googleusercontent.com/a/abc=s96-c' })).toBe(
      'https://lh3.googleusercontent.com/a/abc=s96-c',
    );
  });

  it('prefers avatar_url over picture when both exist', () => {
    expect(
      providerAvatarFrom({
        avatar_url: 'https://lh3.googleusercontent.com/a/one',
        picture: 'https://lh3.googleusercontent.com/a/two',
      }),
    ).toBe('https://lh3.googleusercontent.com/a/one');
  });

  it('rejects non-https URLs', () => {
    expect(providerAvatarFrom({ avatar_url: 'http://insecure.example/pic.png' })).toBeNull();
    expect(providerAvatarFrom({ avatar_url: 'javascript:alert(1)' })).toBeNull();
    expect(providerAvatarFrom({ avatar_url: 'data:image/png;base64,AAAA' })).toBeNull();
  });

  it('rejects URLs longer than the profile column allows', () => {
    expect(providerAvatarFrom({ avatar_url: `https://x.example/${'a'.repeat(500)}` })).toBeNull();
  });

  it('returns null for absent, malformed, or non-object metadata', () => {
    expect(providerAvatarFrom(undefined)).toBeNull();
    expect(providerAvatarFrom(null)).toBeNull();
    expect(providerAvatarFrom('https://x.example/pic')).toBeNull();
    expect(providerAvatarFrom({})).toBeNull();
    expect(providerAvatarFrom({ avatar_url: 42 })).toBeNull();
  });
});
