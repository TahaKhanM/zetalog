import { createHash, randomBytes } from 'node:crypto';

import { z } from 'zod';

import { userIdFromBearer } from './auth';
import { pkceChallengeSchema, pkceVerifierSchema } from './extension-oauth';
import type { Db } from './supabase/database';

// Server-only tripwire: this module creates and hashes bearer credentials.
if (typeof window !== 'undefined')
  throw new Error('lib/extension-auth.ts must never load in a client bundle');

export const EXTENSION_TOKEN_PREFIX = 'zlx_';
export const EXTENSION_AUTHORIZATION_CODE_PREFIX = 'zla_';
export const AUTHORIZATION_CODE_TTL_MS = 5 * 60 * 1000;
export const GAME_START_WINDOW_MS = 10 * 60 * 1000;
export const LEGACY_API_SUNSET_MS = Date.parse('2026-11-04T00:00:00.000Z');

const credentialRowSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
});

const returnedUserSchema = z.union([z.uuid(), z.array(z.uuid()), z.null()]);

/** SHA-256 is sufficient here because every secret has 256 bits of entropy. */
export function hashExtensionSecret(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}

function randomSecret(prefix: string): string {
  return `${prefix}${randomBytes(32).toString('base64url')}`;
}

/**
 * Create a short-lived authorization code bound to the extension's S256 PKCE
 * challenge. The raw code exists only in the redirect; the database retains
 * its SHA-256 digest, never the redeemable value.
 */
export async function createExtensionAuthorizationCode(
  service: Db,
  userId: string,
  codeChallenge: string,
  redirectUri: string,
  nowMs = Date.now(),
): Promise<string> {
  const parsedChallenge = pkceChallengeSchema.safeParse(codeChallenge);
  if (!parsedChallenge.success)
    throw new Error('createExtensionAuthorizationCode: invalid code challenge');
  const code = randomSecret(EXTENSION_AUTHORIZATION_CODE_PREFIX);
  const { error } = await service.from('extension_authorization_codes').insert({
    code_hash: hashExtensionSecret(code),
    user_id: userId,
    code_challenge: parsedChallenge.data,
    redirect_uri: redirectUri,
    created_at: new Date(nowMs).toISOString(),
    expires_at: new Date(nowMs + AUTHORIZATION_CODE_TTL_MS).toISOString(),
  });
  if (error !== null) throw new Error(`createExtensionAuthorizationCode: ${error.message}`);
  return code;
}

/** Create a revocable, extension-owned credential without sharing a web session. */
export async function createExtensionCredential(
  service: Db,
  userId: string,
  nowMs = Date.now(),
): Promise<string> {
  const token = randomSecret(EXTENSION_TOKEN_PREFIX);
  const { error } = await service.from('extension_credentials').insert({
    user_id: userId,
    token_hash: hashExtensionSecret(token),
    created_at: new Date(nowMs).toISOString(),
    last_used_at: new Date(nowMs).toISOString(),
  });
  if (error !== null) throw new Error(`createExtensionCredential: ${error.message}`);
  return token;
}

/** Bind an online game to a server-issued nonce without delaying page capture. */
export async function createGameChallenge(
  service: Db,
  userId: string,
  nowMs = Date.now(),
): Promise<{ challengeId: string; nonce: string }> {
  const nonce = randomSecret('zlc_');
  const result = await service
    .from('game_challenges')
    .insert({
      user_id: userId,
      nonce_hash: hashExtensionSecret(nonce),
      issued_at: new Date(nowMs).toISOString(),
      start_expires_at: new Date(nowMs + GAME_START_WINDOW_MS).toISOString(),
    })
    .select('id')
    .single();
  if (result.error !== null) throw new Error(`createGameChallenge: ${result.error.message}`);
  const row = z.object({ id: z.uuid() }).parse(result.data);
  return { challengeId: row.id, nonce };
}

/** Atomically consume a one-time code after verifying its S256 PKCE verifier. */
export async function redeemExtensionAuthorizationCode(
  service: Db,
  code: string,
  codeVerifier: string,
  redirectUri: string,
  nowMs = Date.now(),
): Promise<{ credential: string; userId: string } | null> {
  if (!code.startsWith(EXTENSION_AUTHORIZATION_CODE_PREFIX)) return null;
  const parsedVerifier = pkceVerifierSchema.safeParse(codeVerifier);
  if (!parsedVerifier.success) return null;
  const credential = randomSecret(EXTENSION_TOKEN_PREFIX);
  const result = await service.rpc('redeem_extension_authorization_code', {
    p_code_hash: hashExtensionSecret(code),
    p_code_verifier: parsedVerifier.data,
    p_redirect_uri: redirectUri,
    p_token_hash: hashExtensionSecret(credential),
    p_now: new Date(nowMs).toISOString(),
  });
  if (result.error !== null)
    throw new Error(`redeemExtensionAuthorizationCode: ${result.error.message}`);
  const parsed = returnedUserSchema.parse(result.data);
  const userId = Array.isArray(parsed) ? (parsed[0] ?? null) : parsed;
  return userId === null ? null : { credential, userId };
}

/** Resolve either a new extension token or a legacy Supabase bearer token. */
export async function userIdFromApiBearer(
  service: Db,
  token: string,
  nowMs = Date.now(),
): Promise<string | null> {
  if (!token.startsWith(EXTENSION_TOKEN_PREFIX))
    return nowMs < LEGACY_API_SUNSET_MS ? userIdFromBearer(service, token) : null;

  const result = await service
    .from('extension_credentials')
    .select('id, user_id')
    .eq('token_hash', hashExtensionSecret(token))
    .is('revoked_at', null)
    .maybeSingle();
  if (result.error !== null || result.data === null) return null;
  const row = credentialRowSchema.parse(result.data);

  // Authentication must not fail merely because this best-effort activity
  // timestamp could not be written. It is lifecycle metadata, not the guard.
  void Promise.resolve(
    service
      .from('extension_credentials')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', row.id),
  ).catch(() => undefined);
  return row.user_id;
}

/** Legacy migration is accepted only during the explicit server-side window. */
export async function userIdFromLegacyBearer(
  service: Db,
  token: string,
  nowMs = Date.now(),
): Promise<string | null> {
  if (token.startsWith(EXTENSION_TOKEN_PREFIX) || nowMs >= LEGACY_API_SUNSET_MS) return null;
  return userIdFromBearer(service, token);
}

/** Revoke exactly the presented extension credential. */
export async function revokeExtensionCredential(service: Db, token: string): Promise<boolean> {
  if (!token.startsWith(EXTENSION_TOKEN_PREFIX)) return false;
  const result = await service
    .from('extension_credentials')
    .update({ revoked_at: new Date().toISOString() })
    .eq('token_hash', hashExtensionSecret(token))
    .is('revoked_at', null)
    .select('id');
  if (result.error !== null) throw new Error(`revokeExtensionCredential: ${result.error.message}`);
  return z.array(z.object({ id: z.uuid() })).parse(result.data).length > 0;
}
