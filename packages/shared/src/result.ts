/**
 * A typed success-or-failure value. Fallible domain operations return this
 * instead of throwing.
 */
export type Result<T, E> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

/** Wrap a success value. */
export function ok<T>(value: T): { readonly ok: true; readonly value: T } {
  return { ok: true, value };
}

/** Wrap a failure value. */
export function err<E>(error: E): { readonly ok: false; readonly error: E } {
  return { ok: false, error };
}
