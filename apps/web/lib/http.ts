/**
 * Small helpers for the JSON API. Every error is the same typed shape —
 * `{ error: { code, message } }` — so the extension and the site can branch on
 * a stable `code` (spec §5, brief "API routes").
 */

/** A typed API error body. */
export interface ApiErrorBody {
  readonly error: { readonly code: string; readonly message: string };
}

/** A JSON response with an explicit status and optional extra headers. */
export function apiJson(status: number, body: unknown, headers?: HeadersInit): Response {
  return Response.json(body, { status, ...(headers ? { headers } : {}) });
}

/** A typed error response: `{ error: { code, message } }` at `status`. */
export function apiError(
  status: number,
  code: string,
  message: string,
  headers?: HeadersInit,
): Response {
  return apiJson(status, { error: { code, message } } satisfies ApiErrorBody, headers);
}

/** The bearer token from an `Authorization: Bearer <jwt>` header, or null. */
export function readBearerToken(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (header === null) return null;
  const match = /^Bearer (.+)$/.exec(header);
  return match?.[1] ?? null;
}
