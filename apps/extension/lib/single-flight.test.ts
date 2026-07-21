import { describe, expect, it } from 'vitest';

import { singleFlight } from './single-flight.js';

/** A manually-resolvable promise plus its settlers. */
function deferred<T>(): {
  promise: Promise<T>;
  resolve: (v: T) => void;
  reject: (e: Error) => void;
} {
  let resolve!: (v: T) => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('singleFlight', () => {
  it('shares one in-flight invocation between concurrent callers', async () => {
    let calls = 0;
    const gate = deferred<number>();
    const run = singleFlight(() => {
      calls += 1;
      return gate.promise;
    });

    const first = run();
    const second = run();
    gate.resolve(7);

    expect(await Promise.all([first, second])).toEqual([7, 7]);
    expect(calls).toBe(1);
  });

  it('invokes again once the previous flight has settled', async () => {
    let calls = 0;
    const run = singleFlight(() => {
      calls += 1;
      return Promise.resolve(calls);
    });

    expect(await run()).toBe(1);
    expect(await run()).toBe(2);
    expect(calls).toBe(2);
  });

  it('propagates a rejection to every concurrent caller and then resets', async () => {
    let calls = 0;
    const gate = deferred<never>();
    const run = singleFlight(() => {
      calls += 1;
      return calls === 1 ? gate.promise : Promise.resolve(1 as never);
    });

    const first = run();
    const second = run();
    gate.reject(new Error('boom'));

    await expect(first).rejects.toThrow('boom');
    await expect(second).rejects.toThrow('boom');
    await expect(run()).resolves.toBe(1); // a fresh flight after failure
    expect(calls).toBe(2);
  });
});
