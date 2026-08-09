import { createExtensionCredential, userIdFromLegacyBearer } from '@/lib/extension-auth';
import { consumeSharedRateLimit } from '@/lib/shared-rate-limit';
import { createServiceClient } from '@/lib/supabase/service';

import {
  handleMigrate,
  MIGRATE_CORS_HEADERS,
  MIGRATE_LIMIT_PER_HOUR,
  MIGRATE_LIMIT_WINDOW_MS,
} from './handler';

export const dynamic = 'force-dynamic';

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: MIGRATE_CORS_HEADERS });
}

/** Silently replace a still-valid legacy Supabase session with an independent credential. */
export async function POST(request: Request): Promise<Response> {
  const service = createServiceClient();
  return handleMigrate(request, {
    async resolveLegacyUserId(bearer) {
      return userIdFromLegacyBearer(service, bearer);
    },
    async consumeUserRateLimit(userId) {
      return consumeSharedRateLimit(service, {
        bucket: 'extension-migrate-user',
        key: userId,
        nowMs: Date.now(),
        windowMs: MIGRATE_LIMIT_WINDOW_MS,
        limit: MIGRATE_LIMIT_PER_HOUR,
      });
    },
    async createCredential(userId) {
      return createExtensionCredential(service, userId);
    },
  });
}
