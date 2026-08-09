import { err, ok } from '@zetalog/shared';
import { describe, expect, it } from 'vitest';

import {
  PENDING_REVOCATIONS_KEY,
  createPendingRevocationStore,
  type PendingRevocationStorage,
} from './pending-revocations.js';

function fakeArea(initial: Record<string, unknown> = {}): PendingRevocationStorage & {
  data: Record<string, unknown>;
} {
  const data = { ...initial };
  return {
    data,
    get: (key) => Promise.resolve(key in data ? { [key]: data[key] } : {}),
    set: (items) => {
      Object.assign(data, items);
      return Promise.resolve();
    },
  };
}

describe('createPendingRevocationStore', () => {
  it('deduplicates credentials and retains only transient failures for retry', async () => {
    const area = fakeArea();
    const pending = createPendingRevocationStore(area);
    await pending.enqueue('zlx_network');
    await pending.enqueue('zlx_done');
    await pending.enqueue('zlx_network');

    const attempted: string[] = [];
    await pending.retry((token) => {
      attempted.push(token);
      return Promise.resolve(
        token === 'zlx_done' ? ok(null) : err({ kind: 'server', status: 503 }),
      );
    });

    expect(attempted).toEqual(['zlx_network', 'zlx_done']);
    expect(await pending.read()).toEqual(['zlx_network']);
    expect(area.data[PENDING_REVOCATIONS_KEY]).toEqual(['zlx_network']);
  });

  it('keeps a credential enqueued during a retry, even when an older token completes', async () => {
    const area = fakeArea({ [PENDING_REVOCATIONS_KEY]: ['zlx_old'] });
    const pending = createPendingRevocationStore(area);
    await pending.retry(async (token) => {
      await pending.enqueue('zlx_new');
      return token === 'zlx_old' ? ok(null) : err({ kind: 'network' });
    });

    expect(await pending.read()).toEqual(['zlx_new']);
  });

  it('preserves both credentials when two unlinks enqueue concurrently', async () => {
    const pending = createPendingRevocationStore(fakeArea());
    await Promise.all([pending.enqueue('zlx_first'), pending.enqueue('zlx_second')]);
    expect(await pending.read()).toEqual(['zlx_first', 'zlx_second']);
  });

  it('ignores malformed entries without losing valid pending credentials', async () => {
    const pending = createPendingRevocationStore(
      fakeArea({ [PENDING_REVOCATIONS_KEY]: ['zlx_ok', 3] }),
    );
    expect(await pending.read()).toEqual(['zlx_ok']);
  });
});
