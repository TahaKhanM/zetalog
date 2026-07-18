/**
 * University email-domain matching (spec §7). Matching is exact and
 * case-insensitive: `student@ox.ac.uk` matches the registered `ox.ac.uk`, but
 * a subdomain (`cs.ox.ac.uk`) or a look-alike (`notox.ac.uk`) does not. Uni
 * emails are used solely to prove affiliation and are never displayed.
 */

/**
 * The lowercase domain of an email address, or null if the address is not
 * exactly `local@domain` with both parts non-empty.
 */
export function extractDomain(email: string): string | null {
  const parts = email.split('@');
  if (parts.length !== 2) return null;
  const [local, domain] = parts;
  if (local === undefined || domain === undefined || local === '' || domain === '') return null;
  return domain.toLowerCase();
}

/** A university with the email domains that grant its badge. */
export interface DomainOwner {
  readonly domains: readonly string[];
}

/**
 * The university whose registered domains contain the address's exact domain,
 * or null. Comparison is case-insensitive; subdomains never match.
 */
export function findUniversityForEmail<U extends DomainOwner>(
  email: string,
  universities: readonly U[],
): U | null {
  const domain = extractDomain(email);
  if (domain === null) return null;
  return (
    universities.find((university) =>
      university.domains.some((registered) => registered.toLowerCase() === domain),
    ) ?? null
  );
}
