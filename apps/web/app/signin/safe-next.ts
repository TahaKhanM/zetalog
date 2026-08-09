/**
 * Return an in-app navigation target, or the signed-in default. Browser URL
 * parsing treats backslashes as path separators, so a prefix-only `/` check
 * would accidentally accept `/\\attacker.example` as an external redirect.
 */
export function safeNext(value: string | string[] | undefined, fallback = '/me'): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === undefined || raw.includes('\\')) return fallback;

  try {
    const origin = 'https://www.zetalog.co.uk';
    const parsed = new URL(raw, origin);
    if (parsed.origin !== origin || !raw.startsWith('/')) return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}
