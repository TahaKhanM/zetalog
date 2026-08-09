import { z } from 'zod';

import type { IdentifierMatch } from '@/lib/auth-modes';
import { apiError, apiJson, clientIpFrom, readJsonBody } from '@/lib/http';

const bodySchema = z.object({ identifier: z.string().trim().pipe(z.email().max(254)) });

export interface RecoveryRequestDeps {
  allowIp: (ip: string) => Promise<boolean>;
  resolveIdentifier: (identifier: string) => Promise<IdentifierMatch | null>;
  allowRecipient: (primaryEmail: string) => Promise<boolean>;
  send: (primaryEmail: string) => Promise<{ error: { status: number | undefined } | null }>;
}

/** Non-enumerating recovery request over explicit rate-limit and delivery ports. */
export async function handleRecoveryRequest(
  request: Request,
  deps: RecoveryRequestDeps,
): Promise<Response> {
  if (!(await deps.allowIp(clientIpFrom(request))))
    return apiError(429, 'rate-limited', 'Please wait before requesting another code.');

  const body = await readJsonBody(request);
  if (!body.ok && body.reason === 'payload-too-large') {
    return apiError(413, 'payload-too-large', 'Request body is too large.');
  }
  const parsed = bodySchema.safeParse(body.ok ? body.value : null);
  if (!parsed.success) return apiError(400, 'bad-request', 'Enter a valid email address.');

  const identifier = parsed.data.identifier.toLowerCase();
  const match = await deps.resolveIdentifier(identifier);
  const target = (match?.primaryEmail ?? identifier).toLowerCase();
  if (!(await deps.allowRecipient(target)))
    return apiError(429, 'rate-limited', 'Please wait before requesting another code.');

  const { error } = await deps.send(target);
  // Preserve the non-enumerating response: unknown addresses and ordinary
  // delivery failures never reveal whether an account exists.
  if (error?.status === 429)
    return apiError(429, 'rate-limited', 'Please wait before requesting another code.');
  return apiJson(200, { ok: true });
}
