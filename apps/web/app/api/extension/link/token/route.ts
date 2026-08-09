import { redeemExtensionAuthorizationCode } from '@/lib/extension-auth';
import { extensionOAuthRedirectUris } from '@/lib/env.server';
import { clientIpFrom } from '@/lib/http';
import { consumeSharedRateLimit } from '@/lib/shared-rate-limit';
import { createServiceClient } from '@/lib/supabase/service';

import {
  handleToken,
  TOKEN_CORS_HEADERS,
  TOKEN_LIMIT_PER_HOUR,
  TOKEN_LIMIT_WINDOW_MS,
} from './handler';

export const dynamic = 'force-dynamic';

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: TOKEN_CORS_HEADERS });
}

export async function POST(request: Request): Promise<Response> {
  const allowedRedirectUris = extensionOAuthRedirectUris();
  return handleToken(request, {
    allowedRedirectUris,
    async consumeClientRateLimit() {
      return consumeSharedRateLimit(createServiceClient(), {
        bucket: 'extension-link-token-ip',
        key: clientIpFrom(request),
        nowMs: Date.now(),
        windowMs: TOKEN_LIMIT_WINDOW_MS,
        limit: TOKEN_LIMIT_PER_HOUR,
      });
    },
    async redeemAuthorizationCode({ code, codeVerifier, redirectUri }) {
      return redeemExtensionAuthorizationCode(
        createServiceClient(),
        code,
        codeVerifier,
        redirectUri,
      );
    },
  });
}
