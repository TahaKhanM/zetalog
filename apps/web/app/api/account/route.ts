import { z } from 'zod';

import { userIdFromCookies } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

import { handleAccountDelete } from './handler';

export const dynamic = 'force-dynamic';

/**
 * `DELETE /api/account` — authenticated, explicitly confirmed account erasure.
 * The database function deletes auth.users so current website and extension
 * independent extension credentials are revoked in the same transaction as app data.
 */
export async function DELETE(request: Request): Promise<Response> {
  const service = createServiceClient();
  return handleAccountDelete(request, {
    authenticate: async () => userIdFromCookies(await createClient()),
    deleteAccount: async (userId) => {
      const { data, error } = await service.rpc('delete_account_and_data', { p_user_id: userId });
      if (error !== null) throw new Error(`delete_account_and_data: ${error.message}`);
      return z.boolean().parse(data);
    },
  });
}
