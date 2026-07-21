import { describe, expect, it } from 'vitest';

import {
  MAX_AVATAR_BYTES,
  handleAvatarDelete,
  handleAvatarPost,
  sniffImageType,
  type AvatarDeps,
} from './handler';

/** Minimal valid file bodies: real magic bytes, throwaway payloads. */
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const WEBP = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 1, 2,
]);

function deps(over: Partial<AvatarDeps> = {}): { deps: AvatarDeps; stored: string[] } {
  const stored: string[] = [];
  return {
    stored,
    deps: {
      authenticate: () => Promise.resolve('user-1'),
      storeAvatar: (userId, _bytes, contentType) => {
        stored.push(`${userId}:${contentType}`);
        return Promise.resolve(`https://cdn.example/avatars/${userId}?v=1`);
      },
      removeAvatar: (userId) => {
        stored.push(`removed:${userId}`);
        return Promise.resolve();
      },
      ...over,
    },
  };
}

function postRequest(body: Uint8Array<ArrayBuffer>, contentType: string): Request {
  return new Request('http://localhost/api/profile/avatar', {
    method: 'POST',
    headers: { 'content-type': contentType },
    body,
  });
}

describe('sniffImageType', () => {
  it('recognises png, jpeg, and webp by magic bytes', () => {
    expect(sniffImageType(PNG)).toBe('image/png');
    expect(sniffImageType(JPEG)).toBe('image/jpeg');
    expect(sniffImageType(WEBP)).toBe('image/webp');
  });

  it('returns null for anything else', () => {
    expect(sniffImageType(new Uint8Array([0x00, 0x01, 0x02, 0x03]))).toBeNull();
    expect(sniffImageType(new Uint8Array([]))).toBeNull();
    // RIFF container that is not WEBP (e.g. WAV).
    expect(
      sniffImageType(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45])),
    ).toBeNull();
  });
});

describe('handleAvatarPost', () => {
  it('rejects unauthenticated uploads', async () => {
    const { deps: d } = deps({ authenticate: () => Promise.resolve(null) });
    const response = await handleAvatarPost(postRequest(WEBP, 'image/webp'), d);
    expect(response.status).toBe(401);
  });

  it('rejects unsupported declared content types', async () => {
    const { deps: d } = deps();
    const response = await handleAvatarPost(postRequest(WEBP, 'image/gif'), d);
    expect(response.status).toBe(415);
  });

  it('rejects bodies above the size cap', async () => {
    const { deps: d } = deps();
    const big = new Uint8Array(MAX_AVATAR_BYTES + 1);
    big.set(WEBP, 0);
    const response = await handleAvatarPost(postRequest(big, 'image/webp'), d);
    expect(response.status).toBe(413);
  });

  it('rejects bodies whose magic bytes contradict the declared type', async () => {
    const { deps: d } = deps();
    const response = await handleAvatarPost(postRequest(PNG, 'image/webp'), d);
    expect(response.status).toBe(400);
  });

  it('stores a valid avatar and returns its public URL', async () => {
    const { deps: d, stored } = deps();
    const response = await handleAvatarPost(postRequest(WEBP, 'image/webp'), d);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; avatarUrl: string };
    expect(body.ok).toBe(true);
    expect(body.avatarUrl).toContain('avatars/user-1');
    expect(stored).toEqual(['user-1:image/webp']);
  });
});

describe('handleAvatarDelete', () => {
  it('rejects unauthenticated removals', async () => {
    const { deps: d } = deps({ authenticate: () => Promise.resolve(null) });
    const response = await handleAvatarDelete(d);
    expect(response.status).toBe(401);
  });

  it('removes the avatar for the signed-in user', async () => {
    const { deps: d, stored } = deps();
    const response = await handleAvatarDelete(d);
    expect(response.status).toBe(200);
    expect(stored).toEqual(['removed:user-1']);
  });
});
