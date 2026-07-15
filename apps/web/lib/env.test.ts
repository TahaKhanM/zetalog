import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { clientEnv, serverEnv } from './env';

const KEYS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'RESEND_API_KEY',
  'EMAIL_FROM',
] as const;

/**
 * The mere fact this test module imported `env` at the top without throwing is
 * the primary proof that env parsing is lazy: a module that parsed at import
 * time would crash CI (which has no env vars) before any test ran.
 */
describe('env (lazy parsing)', () => {
  beforeEach(() => {
    // Start every test from a clean slate regardless of the ambient shell env.
    for (const key of KEYS) vi.stubEnv(key, undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('throws only on access, never at import, when client vars are missing', () => {
    expect(() => clientEnv()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });

  it('names every missing server var in one thrown error', () => {
    expect(() => serverEnv()).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it('rejects a non-URL Supabase URL', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'not-a-url');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');
    expect(() => clientEnv()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });

  it('returns the parsed client env when all client vars are present', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://proj.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');
    expect(clientEnv()).toEqual({
      NEXT_PUBLIC_SUPABASE_URL: 'https://proj.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
    });
  });

  it('returns server + client vars merged when all server vars are present', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://proj.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key');
    vi.stubEnv('RESEND_API_KEY', 're_123');
    vi.stubEnv('EMAIL_FROM', 'ZetaLog <verify@zetalog.dev>');
    expect(serverEnv()).toEqual({
      NEXT_PUBLIC_SUPABASE_URL: 'https://proj.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'service-key',
      RESEND_API_KEY: 're_123',
      EMAIL_FROM: 'ZetaLog <verify@zetalog.dev>',
    });
  });

  it('reflects env changes between calls (no import-time snapshot)', () => {
    expect(() => clientEnv()).toThrow();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://proj.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');
    expect(clientEnv().NEXT_PUBLIC_SUPABASE_URL).toBe('https://proj.supabase.co');
  });
});
