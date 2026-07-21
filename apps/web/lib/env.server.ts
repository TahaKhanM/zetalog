import { z } from 'zod';

import { clientSchema, parseEnv } from './env';

/**
 * Server-only environment access. Import ONLY from API routes and server-only
 * lib modules — never from a Client Component. Splitting this from `env.ts`
 * keeps the server variable names (and the service-role key they guard) out of
 * every client chunk. Parsing stays lazy for the zero-env CI build.
 */

/** Server-only variables. The service-role key must never reach the browser. */
const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  RESEND_API_KEY: z.string().min(1),
  EMAIL_FROM: z.string().min(1),
});

/** Client and server-only variables together — the shape server code receives. */
const fullServerSchema = clientSchema.extend(serverSchema.shape);

/** Full server configuration (client vars plus server-only secrets), validated. */
export type ServerEnv = z.infer<typeof fullServerSchema>;

/**
 * Full server env, validated on access. Reads `process.env` wholesale — fine
 * here because this module only ever runs server-side, where the runtime env
 * is fully populated.
 */
export function serverEnv(): ServerEnv {
  return parseEnv(fullServerSchema, process.env);
}
