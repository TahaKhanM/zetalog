import { apiError, apiJson, readBearerToken } from '@/lib/http';

export const MIGRATE_LIMIT_PER_HOUR = 10;
export const MIGRATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

export const MIGRATE_CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

export interface MigrateHandlerDeps {
  readonly resolveLegacyUserId: (bearer: string) => Promise<string | null>;
  readonly consumeUserRateLimit: (userId: string) => Promise<boolean>;
  readonly createCredential: (userId: string) => Promise<string>;
}

/** Replace a valid legacy browser bearer with an independent extension credential. */
export async function handleMigrate(request: Request, deps: MigrateHandlerDeps): Promise<Response> {
  const bearer = readBearerToken(request);
  if (bearer === null)
    return apiError(401, 'unauthorized', 'Missing bearer token.', MIGRATE_CORS_HEADERS);
  const userId = await deps.resolveLegacyUserId(bearer);
  if (userId === null)
    return apiError(401, 'unauthorized', 'Invalid or expired token.', MIGRATE_CORS_HEADERS);
  if (!(await deps.consumeUserRateLimit(userId))) {
    return apiError(
      429,
      'rate-limited',
      'Too many migration attempts. Please try again later.',
      MIGRATE_CORS_HEADERS,
    );
  }
  const token = await deps.createCredential(userId);
  return apiJson(200, { token, userId }, MIGRATE_CORS_HEADERS);
}
