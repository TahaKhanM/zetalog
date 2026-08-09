import { type Result } from '@zetalog/shared';
import { z } from 'zod';

import { type ApiError } from './api.js';

/**
 * Stored only in `browser.storage.local`, whose access level the background
 * worker restricts to trusted extension contexts before this store is used.
 */
export const PENDING_REVOCATIONS_KEY = 'zl:v1:pending-revocations';

/** Minimal storage surface needed to retain an unlink while the device is offline. */
export interface PendingRevocationStorage {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

/** An explicit credential revoker, supplied by the API client. */
export type CredentialRevoker = (token: string) => Promise<Result<null, ApiError>>;

const pendingTokenSchema = z.string().min(1);

/**
 * Durable unlink revocations. A local unlink is immediate, but an opaque
 * extension credential must remain here until the server has either revoked it
 * or confirmed it is already unusable. This covers offline and 5xx unlinks
 * without retaining a signed-in session or exposing any UI friction.
 */
export interface PendingRevocationStore {
  /** Add a credential once; callers may enqueue the same token repeatedly. */
  enqueue(token: string): Promise<void>;
  /** Attempt every retained credential and forget terminal results only. */
  retry(revoke: CredentialRevoker): Promise<void>;
  /** Test/diagnostic read; production callers need only enqueue and retry. */
  read(): Promise<readonly string[]>;
}

export function createPendingRevocationStore(
  area: PendingRevocationStorage,
): PendingRevocationStore {
  // `storage.local` offers no compare-and-swap. Serialize only each
  // read-modify-write mutation (not the network request itself), so two rapid
  // unlinks cannot overwrite one another and unlink remains responsive.
  let mutationTail: Promise<void> = Promise.resolve();

  function mutate<T>(operation: () => Promise<T>): Promise<T> {
    const next = mutationTail.then(operation, operation);
    mutationTail = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  async function read(): Promise<readonly string[]> {
    const raw = await area.get(PENDING_REVOCATIONS_KEY);
    const value = raw[PENDING_REVOCATIONS_KEY];
    if (!Array.isArray(value)) return [];
    const valid = value.flatMap((candidate) => {
      const parsed = pendingTokenSchema.safeParse(candidate);
      return parsed.success ? [parsed.data] : [];
    });
    return [...new Set(valid)];
  }

  async function remove(tokens: ReadonlySet<string>): Promise<void> {
    // Read afresh so an unlink that arrives while a retry is in flight is not
    // accidentally dropped along with an older terminal credential.
    await mutate(async () => {
      const current = await read();
      await area.set({
        [PENDING_REVOCATIONS_KEY]: current.filter((token) => !tokens.has(token)),
      });
    });
  }

  return {
    read,

    async enqueue(token) {
      await mutate(async () => {
        const current = await read();
        if (current.includes(token)) return;
        await area.set({ [PENDING_REVOCATIONS_KEY]: [...current, token] });
      });
    },

    async retry(revoke) {
      const terminal = new Set<string>();
      for (const token of await read()) {
        const result = await revoke(token);
        // `revokeCredential` represents 200, 401, and 404 as success. A
        // network failure and every 5xx result remain durable for the next
        // service-worker start or retry alarm.
        if (result.ok) terminal.add(token);
      }
      if (terminal.size > 0) await remove(terminal);
    },
  };
}
