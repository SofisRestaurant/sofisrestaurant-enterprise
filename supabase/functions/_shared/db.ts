// supabase/functions/_shared/db.ts
// =============================================================================
// Typed DB helpers for Edge Functions
// - Ensures public schema table names are correct at compile-time
// =============================================================================

import type { SvcClient } from './supabase.ts';
import type { Database } from './database.types.ts';

type PublicTable = keyof Database['public']['Tables'];
type PublicView = keyof Database['public']['Views'];

export function fromPublic<T extends PublicTable>(db: SvcClient, table: T) {
  return db.from(table);
}

export function fromPublicView<V extends PublicView>(db: SvcClient, view: V) {
  return db.from(view);
}
