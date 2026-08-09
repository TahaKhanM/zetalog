import { NextResponse } from 'next/server';

import {
  authorizationCallbackUrl,
  isAllowedExtensionRedirect,
  oauthStateSchema,
  pkceChallengeSchema,
} from '@/lib/extension-oauth';
import { apiError } from '@/lib/http';

export const AUTHORIZE_LIMIT_PER_HOUR = 20;
export const AUTHORIZE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

const authorizeQuerySchema = {
  parse(url: URL): { redirectUri: string; codeChallenge: string; state: string } | null {
    const redirectUri = url.searchParams.get('redirect_uri');
    const method = url.searchParams.get('code_challenge_method');
    const codeChallenge = pkceChallengeSchema.safeParse(url.searchParams.get('code_challenge'));
    const state = oauthStateSchema.safeParse(url.searchParams.get('state'));
    if (redirectUri === null || method !== 'S256' || !codeChallenge.success || !state.success)
      return null;
    return { redirectUri, codeChallenge: codeChallenge.data, state: state.data };
  },
};

export interface AuthorizeHandlerDeps {
  readonly allowedRedirectUris: readonly string[];
  readonly signedInUserId: () => Promise<string | null>;
  readonly createAuthorizationCode: (input: {
    userId: string;
    codeChallenge: string;
    redirectUri: string;
  }) => Promise<string>;
  readonly consumeUserRateLimit: (userId: string) => Promise<boolean>;
}

/**
 * Issue a code only for a signed-in user and only to a preconfigured Chrome
 * Identity callback. If sign-in is needed, resume this exact local endpoint
 * after authentication rather than accepting an arbitrary `next` URL.
 */
export async function handleAuthorize(
  request: Request,
  deps: AuthorizeHandlerDeps,
): Promise<Response> {
  const requestUrl = new URL(request.url);
  const query = authorizeQuerySchema.parse(requestUrl);
  if (query === null || !isAllowedExtensionRedirect(query.redirectUri, deps.allowedRedirectUris)) {
    return apiError(400, 'invalid-authorize-request', 'Invalid extension authorization request.');
  }

  const userId = await deps.signedInUserId();
  if (userId === null) {
    const signIn = new URL('/signin', requestUrl.origin);
    signIn.searchParams.set('next', `${requestUrl.pathname}${requestUrl.search}`);
    return NextResponse.redirect(signIn, 303);
  }

  if (!(await deps.consumeUserRateLimit(userId))) {
    return apiError(
      429,
      'rate-limited',
      'Too many extension link attempts. Please try again later.',
    );
  }

  const code = await deps.createAuthorizationCode({
    userId,
    codeChallenge: query.codeChallenge,
    redirectUri: query.redirectUri,
  });
  return NextResponse.redirect(authorizationCallbackUrl(query.redirectUri, code, query.state), 303);
}
