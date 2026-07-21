import { z } from 'zod';

/**
 * Client-safe environment access. Server-only variables live in
 * `env.server.ts` — keeping them out of this module means client chunks never
 * even carry the server variable NAMES, let alone their values.
 *
 * Parsing is **lazy on purpose**: CI builds this app with zero env vars
 * (`pnpm build` must succeed), so schemas are never evaluated at module load.
 * Each getter validates on call and throws a single, readable error naming
 * every offending variable. The getters intentionally do not memoise so that
 * tests (and long-lived dev servers) observe env changes.
 */

/** Client-safe variables — inlined into the browser bundle by Next.js. */
export const clientSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
});

/** Client-safe configuration, validated. */
export type ClientEnv = z.infer<typeof clientSchema>;

/**
 * Validate an env source against a schema, throwing one readable error that
 * names every offending variable. Shared with `env.server.ts`.
 */
export function parseEnv<T>(schema: z.ZodType<T>, source: Record<string, string | undefined>): T {
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
  return parseEnv(clientSchema, {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
}
