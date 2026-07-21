import { z } from 'zod';

import { apiError, apiJson } from '@/lib/http';

/**
 * The testable core of `POST /api/admin/games/[id]` (spec §5): an admin resolves
 * a quarantined game — approve → accepted (ranks), reject → rejected (audit).
 */

const bodySchema = z.object({ action: z.enum(['approve', 'reject']) });

/** Injected dependencies for the core handler. */
export interface AdminActionDeps {
  authenticate: () => Promise<string | null>;
  isAdmin: (userId: string) => Promise<boolean>;
  /** Update a quarantined game's status; resolves true iff a row changed. */
  setGameStatus: (gameId: string, status: 'accepted' | 'rejected') => Promise<boolean>;
}

export async function handleAdminAction(
  request: Request,
  gameId: string,
  deps: AdminActionDeps,
): Promise<Response> {
  const userId = await deps.authenticate();
  if (userId === null) {
    return apiError(401, 'unauthorized', 'Sign in.');
  }
  if (!(await deps.isAdmin(userId))) {
    return apiError(403, 'forbidden', 'Admins only.');
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, 'bad-request', 'Request body must be JSON.');
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, 'bad-request', 'action must be "approve" or "reject".');
  }

  const status = parsed.data.action === 'approve' ? 'accepted' : 'rejected';
  const changed = await deps.setGameStatus(gameId, status);
  if (!changed) {
    return apiError(404, 'not-found', 'No quarantined game with that id.');
  }
  return apiJson(200, { ok: true, status });
}
