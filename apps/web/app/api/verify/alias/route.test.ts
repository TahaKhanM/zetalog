import { describe, expect, it, vi } from 'vitest';

import { handleAliasDelete, type AliasDeleteDeps } from './handler';

function deps(over: Partial<AliasDeleteDeps> = {}): AliasDeleteDeps {
  return {
    authenticate: vi.fn(async () => Promise.resolve('user-1')),
    removeAlias: vi.fn(async () => Promise.resolve()),
    ...over,
  };
}

describe('DELETE /api/verify/alias', () => {
  it('returns 401 when not signed in', async () => {
    const removeAlias = vi.fn(async () => Promise.resolve());
    const response = await handleAliasDelete(
      deps({ authenticate: vi.fn(async () => Promise.resolve(null)), removeAlias }),
    );
    expect(response.status).toBe(401);
    expect(removeAlias).not.toHaveBeenCalled();
  });

  it('removes the alias for the signed-in user and returns 200', async () => {
    const removeAlias = vi.fn(async () => Promise.resolve());
    const response = await handleAliasDelete(deps({ removeAlias }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(removeAlias).toHaveBeenCalledWith('user-1');
  });
});
