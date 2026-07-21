import { z } from 'zod';

/**
 * Environment access for the web app.
 *
 * Parsing is **lazy on purpose**: CI builds this app with zero env vars
 * (`pnpm build` must succeed), so schemas are never evaluated at module load.
 * Each getter validates `process.env` on call and throws a single, readable
 * error naming every offending variable. Callers on hot paths may cache the
 * result themselves; the getters intentionally do not memoise so that tests
 * (and long-lived dev servers) observe env changes.
 */

/** Client-safe variables — inlined into the browser bundle by Next.js. */
const clientSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

/** Server-only variables. The service-role key must never reach the browser. */
const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  RESEND_API_KEY: z.string().min(1),
  EMAIL_FROM: z.string().min(1),
});

/** Client and server-only variables together — the shape server code receives. */
const fullServerSchema = clientSchema.extend(serverSchema.shape);

/** Client-safe configuration, validated. */
export type ClientEnv = z.infer<typeof clientSchema>;
/** Full server configuration (client vars plus server-only secrets), validated. */
export type ServerEnv = z.infer<typeof fullServerSchema>;

function parse<T>(schema: z.ZodType<T>, source: Record<string, string | undefined>): T {
  const result = schema.safeParse(source);
  if (result.success) return result.data;
  const detail = result.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('; ');
  throw new Error(`Invalid or missing environment variables — ${detail}`);
}

/**
 * Client-safe env, validated on access. Safe to call from client or server
 * code (the values it exposes are public).
 *
 * The public vars are read by explicit `process.env.NEXT_PUBLIC_*` member
 * access rather than by passing the whole `process.env`: Next.js only inlines
 * those exact member expressions into the browser bundle, so a bare
 * `process.env` would be empty client-side and this would wrongly throw.
 */
export function clientEnv(): ClientEnv {
  return parse(clientSchema, {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
}

/**
 * Full server env, validated on access. Import only from server-only modules
 * and API routes — it exposes the service-role key.
 */
export function serverEnv(): ServerEnv {
  return parse(fullServerSchema, process.env);
}
