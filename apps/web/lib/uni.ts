/**
 * University email-domain matching. An address matches a registered domain
 * when its host is equal to that domain or a subdomain of it (label-boundary
 * suffix: `cs.ox.ac.uk` matches `ox.ac.uk`, `notox.ac.uk` does not). When more
 * than one university matches, the longest (most specific) registered domain
 * wins. Comparison is case-insensitive. Uni emails are used solely to prove
 * affiliation and are never displayed.
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

/** Whether `emailDomain` is the registered host or a subdomain of it. */
function matchesRegisteredDomain(emailDomain: string, registered: string): boolean {
  return emailDomain === registered || emailDomain.endsWith(`.${registered}`);
}

/**
 * The university whose registered domain is the most specific match for the
 * address, or null. A match is an exact host or a label-boundary suffix.
 */
export function findUniversityForEmail<U extends DomainOwner>(
  email: string,
  universities: readonly U[],
): U | null {
  const domain = extractDomain(email);
  if (domain === null) return null;

  let best: U | null = null;
  let bestLength = -1;
  for (const university of universities) {
    for (const registered of university.domains) {
      const host = registered.toLowerCase();
      if (!matchesRegisteredDomain(domain, host)) continue;
      if (host.length > bestLength) {
        best = university;
        bestLength = host.length;
      }
    }
  }
  return best;
}
