import { extensionOAuthRedirectUris } from '@/lib/env.server';

import { handleLinkStatus, LINK_STATUS_CORS_HEADERS } from './handler';

export const dynamic = 'force-dynamic';

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: LINK_STATUS_CORS_HEADERS });
}

export function GET(request: Request): Response {
  return handleLinkStatus(request, extensionOAuthRedirectUris());
}
