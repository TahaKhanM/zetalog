import { z } from 'zod';

import { isAllowedExtensionRedirect, pkceVerifierSchema } from '@/lib/extension-oauth';
import { apiError, apiJson, readJsonBody } from '@/lib/http';

export const TOKEN_LIMIT_PER_HOUR = 60;
export const TOKEN_LIMIT_WINDOW_MS = 60 * 60 * 1000;

const tokenRequestSchema = z.object({
  code: z.string().min(1).max(256),
  codeVerifier: pkceVerifierSchema,
  redirectUri: z.string(),
});

export const TOKEN_CORS_HEADERS = {
  // The exchange carries no web cookies. The code plus PKCE verifier are
  // extension-held capabilities, so a wildcard CORS response cannot grant a
  // website a credential it does not already possess the verifier for.
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export interface TokenHandlerDeps {
  readonly allowedRedirectUris: readonly string[];
  readonly redeemAuthorizationCode: (input: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
  }) => Promise<{ credential: string; userId: string } | null>;
  readonly consumeClientRateLimit: () => Promise<boolean>;
}

/** Exchange one PKCE-bound browser code for an independent extension credential. */
export async function handleToken(request: Request, deps: TokenHandlerDeps): Promise<Response> {
  const body = await readJsonBody(request);
  if (!body.ok && body.reason === 'payload-too-large') {
    return apiError(413, 'payload-too-large', 'Request body is too large.', TOKEN_CORS_HEADERS);
  }
  if (!body.ok) {
    return apiError(400, 'bad-request', 'Request body must be JSON.', TOKEN_CORS_HEADERS);
  }
  const parsed = tokenRequestSchema.safeParse(body.value);
  if (
    !parsed.success ||
    !isAllowedExtensionRedirect(parsed.data.redirectUri, deps.allowedRedirectUris)
  ) {
    return apiError(400, 'bad-request', 'Invalid authorization-code exchange.', TOKEN_CORS_HEADERS);
  }

  if (!(await deps.consumeClientRateLimit())) {
    return apiError(
      429,
      'rate-limited',
      'Too many authorization-code exchanges. Please try again later.',
      TOKEN_CORS_HEADERS,
    );
  }

  const linked = await deps.redeemAuthorizationCode(parsed.data);
  if (linked === null)
    return apiError(
      401,
      'invalid-grant',
      'Authorization code is invalid or expired.',
      TOKEN_CORS_HEADERS,
    );
  return apiJson(200, linked, TOKEN_CORS_HEADERS);
}
