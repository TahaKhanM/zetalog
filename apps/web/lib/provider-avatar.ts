/**
 * Extract a usable profile picture from an OAuth provider's user metadata
 * (CO-6): GitHub and Google both hand Supabase an `avatar_url` (Google also a
 * `picture`). The URL is untrusted input — only well-formed https URLs short
 * enough for the `profiles.avatar_url` column pass.
 */

/** Matches the profiles.avatar_url CHECK (≤ 500 chars). */
const MAX_AVATAR_URL_LENGTH = 500;

function safeHttpsUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_AVATAR_URL_LENGTH) {
    return null;
  }
  try {
    return new URL(value).protocol === 'https:' ? value : null;
  } catch {
    return null;
  }
}

/** The provider avatar URL carried in `user_metadata`, or null. */
export function providerAvatarFrom(metadata: unknown): string | null {
  if (typeof metadata !== 'object' || metadata === null) return null;
  const record = metadata as Record<string, unknown>;
  return safeHttpsUrl(record.avatar_url) ?? safeHttpsUrl(record.picture);
}
