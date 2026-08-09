import { describe, expect, it, vi } from 'vitest';

import type { Db } from './supabase/database';
import {
  AUTHORIZATION_CODE_TTL_MS,
  EXTENSION_AUTHORIZATION_CODE_PREFIX,
  EXTENSION_TOKEN_PREFIX,
  GAME_START_WINDOW_MS,
  LEGACY_API_SUNSET_MS,
  createExtensionAuthorizationCode,
  createExtensionCredential,
  createGameChallenge,
  hashExtensionSecret,
  redeemExtensionAuthorizationCode,
  revokeExtensionCredential,
  userIdFromApiBearer,
  userIdFromLegacyBearer,
} from './extension-auth';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const ROW_ID = '22222222-2222-4222-8222-222222222222';
const REDIRECT_URI = 'https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/zetalog-link';
const CODE_CHALLENGE = 'a'.repeat(43);
const CODE_VERIFIER = 'a'.repeat(43);

describe('extension secrets', () => {
  it('hashes deterministically without retaining the plaintext', () => {
    const secret = 'zlx_secret';
    expect(hashExtensionSecret(secret)).toHaveLength(64);
    expect(hashExtensionSecret(secret)).toBe(hashExtensionSecret(secret));
    expect(hashExtensionSecret(secret)).not.toContain(secret);
  });

  it('stores only a hash for a short-lived PKCE-bound authorization code', async () => {
    const insert = vi.fn((row: unknown) => {
      void row;
      return Promise.resolve({ error: null });
    });
    const service = { from: vi.fn(() => ({ insert })) } as unknown as Db;
    const now = 1_700_000_000_000;
    const code = await createExtensionAuthorizationCode(
      service,
      USER_ID,
      CODE_CHALLENGE,
      REDIRECT_URI,
      now,
    );

    expect(code.startsWith(EXTENSION_AUTHORIZATION_CODE_PREFIX)).toBe(true);
    expect(insert).toHaveBeenCalledWith({
      code_hash: hashExtensionSecret(code),
      user_id: USER_ID,
      code_challenge: CODE_CHALLENGE,
      redirect_uri: REDIRECT_URI,
      created_at: new Date(now).toISOString(),
      expires_at: new Date(now + AUTHORIZATION_CODE_TTL_MS).toISOString(),
    });
    expect(JSON.stringify(insert.mock.calls)).not.toContain(code);
  });

  it('stores only an independent credential hash', async () => {
    const insert = vi.fn((row: unknown) => {
      void row;
      return Promise.resolve({ error: null });
    });
    const service = { from: vi.fn(() => ({ insert })) } as unknown as Db;
    const token = await createExtensionCredential(service, USER_ID, 1000);

    expect(token.startsWith(EXTENSION_TOKEN_PREFIX)).toBe(true);
    expect(insert.mock.calls[0]?.[0]).toMatchObject({
      user_id: USER_ID,
      token_hash: hashExtensionSecret(token),
    });
    expect(JSON.stringify(insert.mock.calls)).not.toContain(token);
  });

  it('stores a hashed, time-bounded game nonce', async () => {
    const single = vi.fn(async () => Promise.resolve({ error: null, data: { id: ROW_ID } }));
    const select = vi.fn(() => ({ single }));
    const insert = vi.fn((row: unknown) => {
      void row;
      return { select };
    });
    const service = { from: vi.fn(() => ({ insert })) } as unknown as Db;
    const now = 10_000;
    const challenge = await createGameChallenge(service, USER_ID, now);

    expect(challenge.challengeId).toBe(ROW_ID);
    expect(insert.mock.calls[0]?.[0]).toMatchObject({
      user_id: USER_ID,
      nonce_hash: hashExtensionSecret(challenge.nonce),
      issued_at: new Date(now).toISOString(),
      start_expires_at: new Date(now + GAME_START_WINDOW_MS).toISOString(),
    });
    expect(JSON.stringify(insert.mock.calls)).not.toContain(challenge.nonce);
  });
});

describe('extension authorization-code lifecycle', () => {
  it('rejects malformed codes and verifiers without touching the database', async () => {
    const rpc = vi.fn();
    const service = { rpc } as unknown as Db;
    expect(
      await redeemExtensionAuthorizationCode(service, 'legacy', CODE_VERIFIER, REDIRECT_URI, 1000),
    ).toBeNull();
    expect(
      await redeemExtensionAuthorizationCode(
        service,
        `${EXTENSION_AUTHORIZATION_CODE_PREFIX}code`,
        'short',
        REDIRECT_URI,
        1000,
      ),
    ).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('redeems a code through the atomic PKCE database function', async () => {
    const rpc = vi.fn(async () => Promise.resolve({ error: null, data: [USER_ID] }));
    const service = { rpc } as unknown as Db;
    const code = `${EXTENSION_AUTHORIZATION_CODE_PREFIX}code`;
    const linked = await redeemExtensionAuthorizationCode(
      service,
      code,
      CODE_VERIFIER,
      REDIRECT_URI,
      1000,
    );

    expect(linked?.userId).toBe(USER_ID);
    expect(linked?.credential.startsWith(EXTENSION_TOKEN_PREFIX)).toBe(true);
    expect(rpc).toHaveBeenCalledWith(
      'redeem_extension_authorization_code',
      expect.objectContaining({
        p_code_hash: hashExtensionSecret(code),
        p_code_verifier: CODE_VERIFIER,
        p_redirect_uri: REDIRECT_URI,
        p_token_hash: hashExtensionSecret(linked?.credential ?? ''),
      }),
    );
  });

  it('returns null for an expired, already-used, or PKCE-mismatched code', async () => {
    const service = {
      rpc: vi.fn(async () => Promise.resolve({ error: null, data: null })),
    } as unknown as Db;
    expect(
      await redeemExtensionAuthorizationCode(
        service,
        `${EXTENSION_AUTHORIZATION_CODE_PREFIX}old`,
        CODE_VERIFIER,
        REDIRECT_URI,
      ),
    ).toBeNull();
  });
});

describe('extension bearer lifecycle', () => {
  function credentialService(
    lookup: { error: unknown; data: unknown },
    revokedRows: unknown[] = [{ id: ROW_ID }],
  ) {
    const maybeSingle = vi.fn(async () => Promise.resolve(lookup));
    const lookupIs = vi.fn(() => ({ maybeSingle }));
    const lookupEq = vi.fn(() => ({ is: lookupIs }));
    const selectLookup = vi.fn(() => ({ eq: lookupEq }));

    const selectUpdate = vi.fn(async () => Promise.resolve({ error: null, data: revokedRows }));
    const updateIs = vi.fn(() => ({ select: selectUpdate }));
    const successfulUpdate = Promise.resolve({ error: null });
    const updateEq = vi.fn(() => ({
      is: updateIs,
      then: successfulUpdate.then.bind(successfulUpdate),
    }));
    const update = vi.fn((values: Record<string, string>) => {
      void values;
      return { eq: updateEq };
    });
    const from = vi.fn(() => ({ select: selectLookup, update }));
    return { service: { from } as unknown as Db, update };
  }

  it('resolves an active opaque credential and never sends it to Supabase Auth', async () => {
    const { service, update } = credentialService({
      error: null,
      data: { id: ROW_ID, user_id: USER_ID },
    });
    expect(await userIdFromApiBearer(service, `${EXTENSION_TOKEN_PREFIX}token`)).toBe(USER_ID);
    const lastUsedUpdate = update.mock.calls[0]?.[0];
    expect(Object.keys(lastUsedUpdate ?? {})).toEqual(['last_used_at']);
    expect(typeof lastUsedUpdate?.last_used_at).toBe('string');
  });

  it('rejects missing/revoked opaque credentials', async () => {
    const { service } = credentialService({ error: null, data: null });
    expect(await userIdFromApiBearer(service, `${EXTENSION_TOKEN_PREFIX}missing`)).toBeNull();
  });

  it('keeps accepting a valid legacy JWT during the migration window', async () => {
    const getUser = vi.fn(async () =>
      Promise.resolve({ error: null, data: { user: { id: USER_ID } } }),
    );
    const service = { auth: { getUser } } as unknown as Db;
    expect(await userIdFromApiBearer(service, 'legacy-jwt', LEGACY_API_SUNSET_MS - 1)).toBe(
      USER_ID,
    );
    expect(getUser).toHaveBeenCalledWith('legacy-jwt');
  });

  it('server-enforces the legacy bearer sunset', async () => {
    const getUser = vi.fn();
    const service = { auth: { getUser } } as unknown as Db;
    expect(await userIdFromApiBearer(service, 'legacy-jwt', LEGACY_API_SUNSET_MS)).toBeNull();
    expect(getUser).not.toHaveBeenCalled();
  });

  it('limits the migration-only legacy resolver to JWTs before the cutoff', async () => {
    const getUser = vi.fn(async () =>
      Promise.resolve({ error: null, data: { user: { id: USER_ID } } }),
    );
    const service = { auth: { getUser } } as unknown as Db;
    expect(await userIdFromLegacyBearer(service, 'legacy-jwt', LEGACY_API_SUNSET_MS - 1)).toBe(
      USER_ID,
    );
    expect(
      await userIdFromLegacyBearer(
        service,
        `${EXTENSION_TOKEN_PREFIX}already-current`,
        LEGACY_API_SUNSET_MS - 1,
      ),
    ).toBeNull();
    expect(await userIdFromLegacyBearer(service, 'legacy-jwt', LEGACY_API_SUNSET_MS)).toBeNull();
  });

  it('revokes only an opaque credential and is idempotent when absent', async () => {
    const active = credentialService({ error: null, data: null });
    expect(await revokeExtensionCredential(active.service, `${EXTENSION_TOKEN_PREFIX}token`)).toBe(
      true,
    );
    const revokedUpdate = active.update.mock.calls[0]?.[0];
    expect(Object.keys(revokedUpdate ?? {})).toEqual(['revoked_at']);
    expect(typeof revokedUpdate?.revoked_at).toBe('string');

    const missing = credentialService({ error: null, data: null }, []);
    expect(
      await revokeExtensionCredential(missing.service, `${EXTENSION_TOKEN_PREFIX}missing`),
    ).toBe(false);
    expect(await revokeExtensionCredential(missing.service, 'legacy-jwt')).toBe(false);
  });
});
