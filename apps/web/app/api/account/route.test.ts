import { describe, expect, it, vi } from 'vitest';

import { handleAccountDelete, type AccountDeleteDeps } from './handler';

function request(body: unknown): Request {
  return new Request('http://localhost/api/account', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function deps(over: Partial<AccountDeleteDeps> = {}): AccountDeleteDeps {
  return {
    authenticate: vi.fn(async () => Promise.resolve('user-1')),
    deleteAccount: vi.fn(async () => Promise.resolve(true)),
    ...over,
  };
}

describe('DELETE /api/account', () => {
  it('requires authentication', async () => {
    const response = await handleAccountDelete(
      request({ confirmation: 'DELETE' }),
      deps({ authenticate: vi.fn(async () => Promise.resolve(null)) }),
    );
    expect(response.status).toBe(401);
  });

  it('requires an explicit destructive confirmation', async () => {
    const deleteAccount = vi.fn(async () => Promise.resolve(true));
    const response = await handleAccountDelete(
      request({ confirmation: 'no' }),
      deps({ deleteAccount }),
    );
    expect(response.status).toBe(400);
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it('deletes the authenticated account and returns 200', async () => {
    const deleteAccount = vi.fn(async () => Promise.resolve(true));
    const response = await handleAccountDelete(
      request({ confirmation: 'DELETE' }),
      deps({ deleteAccount }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(deleteAccount).toHaveBeenCalledWith('user-1');
  });
});
