/**
 * Share one in-flight invocation of an async operation. While a call is
 * pending, every additional call returns the SAME promise; once it settles
 * (either way), the next call starts a fresh flight.
 *
 * Used to serialise the sync drain (message triggers + the retry alarm can
 * coincide) and the token refresh (concurrent 401s must not race two exchanges
 * — Supabase refresh tokens are single-use, so a duplicate exchange would
 * invalidate the session).
 */
export function singleFlight<T>(operation: () => Promise<T>): () => Promise<T> {
  let inFlight: Promise<T> | null = null;
  return () => {
    inFlight ??= operation().finally(() => {
      inFlight = null;
    });
    return inFlight;
  };
}
