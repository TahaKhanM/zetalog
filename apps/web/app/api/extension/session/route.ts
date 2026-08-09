import { revokeExtensionCredential } from '@/lib/extension-auth';
import { apiError, apiJson, readBearerToken } from '@/lib/http';
import { createServiceClient } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS });
}

/** Revoke the current installation's credential during Unlink. */
export async function DELETE(request: Request): Promise<Response> {
  const bearer = readBearerToken(request);
  if (bearer === null) return apiError(401, 'unauthorized', 'Missing bearer token.', CORS);
  const revoked = await revokeExtensionCredential(createServiceClient(), bearer);
  if (!revoked) return apiError(404, 'not-found', 'Extension session not found.', CORS);
  return apiJson(200, { revoked: true }, CORS);
}
