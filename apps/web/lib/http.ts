/**
 * Small helpers for the JSON API. Every error is the same typed shape —
 * `{ error: { code, message } }` — so the extension and the site can branch on
 * a stable `code`.
 */

/** A typed API error body. */
export interface ApiErrorBody {
  readonly error: { readonly code: string; readonly message: string };
}

/** Small JSON endpoints never need more than this; game telemetry opts into 2 MB. */
export const MAX_API_JSON_BYTES = 16 * 1024;

export type JsonBodyResult =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly reason: 'invalid-json' | 'payload-too-large' };

/**
 * Read JSON through a byte-bounded stream. Checking after `request.json()` or
 * `request.text()` is too late: a chunked attacker can already force the whole
 * body into memory while omitting Content-Length.
 */
export async function readJsonBody(
  request: Request,
  maxBytes = MAX_API_JSON_BYTES,
): Promise<JsonBodyResult> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    return { ok: false, reason: 'payload-too-large' };
  }
  if (request.body === null) return { ok: false, reason: 'invalid-json' };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const next = await reader.read();
    if (next.done) break;
    total += next.value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return { ok: false, reason: 'payload-too-large' };
    }
    chunks.push(next.value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return { ok: true, value: JSON.parse(new TextDecoder().decode(bytes)) as unknown };
  } catch {
    return { ok: false, reason: 'invalid-json' };
  }
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

/**
 * The client IP for rate-limit keying, read only from Vercel's trusted forwarding
 * header. Generic forwarding headers are attacker-controlled when the app is
 * reached through a misconfigured proxy, so unattributed traffic deliberately
 * collapses into one fail-closed bucket.
 */
export function clientIpFrom(request: Request): string {
  const first = request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim();
  return first !== undefined && first !== '' ? first : 'unknown';
}
