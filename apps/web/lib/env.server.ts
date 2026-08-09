import { z } from 'zod';

import { clientSchema, parseEnv } from './env';
import { parseExtensionRedirectUris } from './extension-oauth';

// Server-only tripwire: this module names the service-role key and other secrets.
if (typeof window !== 'undefined')
  throw new Error('lib/env.server.ts must never load in a client bundle');

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

/** Read only by the extension authorize/token routes, never unrelated APIs. */
const extensionOauthSchema = z.object({
  // Comma-separated exact Chrome Identity callback URLs. This is server-only
  // because it defines which installed extension release may receive a code.
  EXTENSION_OAUTH_REDIRECT_URIS: z.string().min(1).transform(parseExtensionRedirectUris),
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

/** Exact Chrome Identity callback URLs for the extension OAuth flow. */
export function extensionOAuthRedirectUris(): string[] {
  return parseEnv(extensionOauthSchema, process.env).EXTENSION_OAUTH_REDIRECT_URIS;
}
