import { userIdFromCookies } from '@/lib/auth';
import { serverEnv } from '@/lib/env.server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';

import { handleAvatarDelete, handleAvatarPost, type AvatarDeps } from './handler';

export const dynamic = 'force-dynamic';

const BUCKET = 'avatars';

/**
 * `POST/DELETE /api/profile/avatar` (CO-6). Core logic lives in ./handler;
 * this file wires the service-role storage write (one object per user, upsert)
 * and the `profiles.avatar_url` column, stamping a version query so browsers
 * never show a stale cached picture after a change.
 */
function realDeps(): AvatarDeps {
  const service = createServiceClient();
  return {
    authenticate: async () => userIdFromCookies(await createClient()),
    storeAvatar: async (userId, bytes, contentType) => {
      const { error: uploadError } = await service.storage
        .from(BUCKET)
        .upload(userId, bytes, { upsert: true, contentType });
      if (uploadError !== null) throw new Error(`avatar upload: ${uploadError.message}`);
      const base = serverEnv().NEXT_PUBLIC_SUPABASE_URL;
      const url = `${base}/storage/v1/object/public/${BUCKET}/${userId}?v=${String(Date.now())}`;
      const { error: updateError } = await service
        .from('profiles')
        .update({ avatar_url: url })
        .eq('id', userId);
      if (updateError !== null) throw new Error(`avatar url update: ${updateError.message}`);
      return url;
    },
    removeAvatar: async (userId) => {
      const { error: removeError } = await service.storage.from(BUCKET).remove([userId]);
      if (removeError !== null) throw new Error(`avatar remove: ${removeError.message}`);
      const { error: updateError } = await service
        .from('profiles')
        .update({ avatar_url: null })
        .eq('id', userId);
      if (updateError !== null) throw new Error(`avatar url clear: ${updateError.message}`);
    },
  };
}

export async function POST(request: Request): Promise<Response> {
  return handleAvatarPost(request, realDeps());
}

export async function DELETE(): Promise<Response> {
  return handleAvatarDelete(realDeps());
}
