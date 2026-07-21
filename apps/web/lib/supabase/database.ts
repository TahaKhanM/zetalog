import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * A deliberately loose `Database` type for the Supabase clients.
 *
 * W2 owns the schema and there is no generated types artifact shared into this
 * stream, so rather than duplicate (and risk drifting from) the real schema, we
 * describe every table/view row as `Record<string, unknown>`. That is enough to
 * make writes type-check (they accept object literals instead of collapsing to
 * `never`, which the fully-`any` client does) while keeping reads untyped on
 * purpose — every read is validated through the zod schemas in `db/rows` before
 * use. This is the boundary contract, not a substitute for it.
 */
type LooseRow = Record<string, unknown>;

interface LooseTable {
  Row: LooseRow;
  Insert: LooseRow;
  Update: LooseRow;
  Relationships: [];
}

interface LooseView {
  Row: LooseRow;
  Relationships: [];
}

/**
 * Same philosophy for `rpc()`: args type-check as object literals, returns
 * stay `unknown` on purpose — every rpc result is zod-validated before use
 * (see `lib/auth-identifier.ts`).
 */
interface LooseFunction {
  Args: LooseRow;
  Returns: unknown;
}

export interface Database {
  public: {
    Tables: Record<string, LooseTable>;
    Views: Record<string, LooseView>;
    Functions: Record<string, LooseFunction>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

/** The Supabase client type used throughout this app. */
export type Db = SupabaseClient<Database>;
