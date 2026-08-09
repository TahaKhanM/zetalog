import { z } from 'zod';

import type { IdentifierMatch } from '@/lib/auth-modes';
import { apiError, apiJson, clientIpFrom, readJsonBody } from '@/lib/http';

const bodySchema = z.object({
  identifier: z.string().trim().pipe(z.email().max(254)),
  code: z.string().regex(/^\d{6}$/),
});

export interface RecoveryVerifyDeps {
  allowIp: (ip: string) => Promise<boolean>;
  resolveIdentifier: (identifier: string) => Promise<IdentifierMatch | null>;
  allowRecipient: (primaryEmail: string) => Promise<boolean>;
  verify: (primaryEmail: string, code: string) => Promise<{ error: object | null }>;
}

/** Alias-aware OTP verification which leaves cookie persistence to its injected client. */
export async function handleRecoveryVerify(
  request: Request,
  deps: RecoveryVerifyDeps,
): Promise<Response> {
  if (!(await deps.allowIp(clientIpFrom(request))))
    return apiError(429, 'rate-limited', 'Please wait before trying again.');

  const body = await readJsonBody(request);
  if (!body.ok && body.reason === 'payload-too-large') {
    return apiError(413, 'payload-too-large', 'Request body is too large.');
  }
  const parsed = bodySchema.safeParse(body.ok ? body.value : null);
  if (!parsed.success) return apiError(400, 'bad-request', 'Enter the six-digit code.');

  const identifier = parsed.data.identifier.toLowerCase();
  const match = await deps.resolveIdentifier(identifier);
  const target = (match?.primaryEmail ?? identifier).toLowerCase();
  if (!(await deps.allowRecipient(target)))
    return apiError(429, 'rate-limited', 'Please wait before trying again.');

  const { error } = await deps.verify(target, parsed.data.code);
  if (error !== null) return apiError(400, 'invalid-code', 'That code is invalid or expired.');
  return apiJson(200, { ok: true });
}
