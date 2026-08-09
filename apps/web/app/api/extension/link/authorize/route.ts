import { userIdFromCookies } from '@/lib/auth';
import { createExtensionAuthorizationCode } from '@/lib/extension-auth';
import { extensionOAuthRedirectUris } from '@/lib/env.server';
import { consumeSharedRateLimit } from '@/lib/shared-rate-limit';
import { createServiceClient } from '@/lib/supabase/service';
import { createClient } from '@/lib/supabase/server';

import { AUTHORIZE_LIMIT_PER_HOUR, AUTHORIZE_LIMIT_WINDOW_MS, handleAuthorize } from './handler';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const allowedRedirectUris = extensionOAuthRedirectUris();
  return handleAuthorize(request, {
    allowedRedirectUris,
    async signedInUserId() {
      return userIdFromCookies(await createClient());
    },
    async consumeUserRateLimit(userId) {
      return consumeSharedRateLimit(createServiceClient(), {
        bucket: 'extension-link-authorize-user',
        key: userId,
        nowMs: Date.now(),
        windowMs: AUTHORIZE_LIMIT_WINDOW_MS,
        limit: AUTHORIZE_LIMIT_PER_HOUR,
      });
    },
    async createAuthorizationCode({ userId, codeChallenge, redirectUri }) {
      return createExtensionAuthorizationCode(
        createServiceClient(),
        userId,
        codeChallenge,
        redirectUri,
      );
    },
  });
}
