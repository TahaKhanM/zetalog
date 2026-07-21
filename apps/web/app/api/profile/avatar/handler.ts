import { apiError, apiJson } from '@/lib/http';

/**
 * The testable core of `POST/DELETE /api/profile/avatar` (CO-6).
 *
 * The client downscales to a small square before uploading (canvas, ≤ 256px),
 * so the server only accepts small webp/jpeg/png bodies, verifies the magic
 * bytes actually match the declared type (never trust a content-type header),
 * and hands the bytes to the injected storage port — service-role writes into
 * the public `avatars` bucket, one object per user.
 */

/** Body cap — matches the bucket's file_size_limit (300 KiB). */
export const MAX_AVATAR_BYTES = 300 * 1024;

/** The image types the bucket accepts. */
export type AvatarContentType = 'image/webp' | 'image/jpeg' | 'image/png';

const ACCEPTED: readonly AvatarContentType[] = ['image/webp', 'image/jpeg', 'image/png'];

/** Identify an image by magic bytes: png / jpeg / webp, or null. */
export function sniffImageType(bytes: Uint8Array): AvatarContentType | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return 'image/png';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && // R
    bytes[1] === 0x49 && // I
    bytes[2] === 0x46 && // F
    bytes[3] === 0x46 && // F
    bytes[8] === 0x57 && // W
    bytes[9] === 0x45 && // E
    bytes[10] === 0x42 && // B
    bytes[11] === 0x50 // P
  ) {
    return 'image/webp';
  }
  return null;
}

/** Injected dependencies for the avatar handlers. */
export interface AvatarDeps {
  authenticate: () => Promise<string | null>;
  /** Persist the bytes and return the public URL to store on the profile. */
  storeAvatar: (
    userId: string,
    bytes: Uint8Array,
    contentType: AvatarContentType,
  ) => Promise<string>;
  /** Delete the stored object and clear the profile column. */
  removeAvatar: (userId: string) => Promise<void>;
}

export async function handleAvatarPost(request: Request, deps: AvatarDeps): Promise<Response> {
  const userId = await deps.authenticate();
  if (userId === null) {
    return apiError(401, 'unauthorized', 'Sign in to set a profile picture.');
  }

  const declared = request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? '';
  if (!ACCEPTED.includes(declared as AvatarContentType)) {
    return apiError(415, 'unsupported-type', 'Upload a WebP, JPEG, or PNG image.');
  }

  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length > MAX_AVATAR_BYTES) {
    return apiError(413, 'too-large', 'Profile pictures are capped at 300 KB.');
  }

  const sniffed = sniffImageType(bytes);
  if (sniffed !== declared) {
    return apiError(400, 'not-an-image', 'The file does not look like the declared image type.');
  }

  const avatarUrl = await deps.storeAvatar(userId, bytes, sniffed);
  return apiJson(200, { ok: true, avatarUrl });
}

export async function handleAvatarDelete(deps: AvatarDeps): Promise<Response> {
  const userId = await deps.authenticate();
  if (userId === null) {
    return apiError(401, 'unauthorized', 'Sign in to remove your profile picture.');
  }
  await deps.removeAvatar(userId);
  return apiJson(200, { ok: true });
}
