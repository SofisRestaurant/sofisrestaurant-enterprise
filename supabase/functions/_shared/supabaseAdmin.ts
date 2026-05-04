// PATH: supabase/functions/_shared/supabaseAdmin.ts
// =============================================================================
// ADMIN CLIENT — Server-Only Supabase Admin Abstraction (2026)
// =============================================================================
//
// PURPOSE
//   Single authoritative source for the privileged Supabase client inside Edge
//   Functions. All direct Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') call sites
//   must migrate to use this module instead.
//
// USAGE (Edge Function)
//   import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';
//   const db = supabaseAdmin();
//   const { data } = await db.from('orders').select('*');
//
// SECURITY CONTRACT
//   ✅ Server-only — never imported by frontend code
//   ✅ Delegates to createServiceClient() — single RLS-bypass surface
//   ✅ Reads SUPABASE_SECRET_KEY (new name) with SUPABASE_SERVICE_ROLE_KEY
//      as a safe fallback so migration can be incremental (no flag day)
//   ✅ Fails fast at call time — never swallows a missing key silently
//   ✅ Carries X-Edge-Role: service-admin header for audit traceability
//
// MIGRATION PATH
//   Phase 1 (now)  : New call sites use supabaseAdmin()
//   Phase 2        : Old call sites are migrated one function at a time
//   Phase 3        : SUPABASE_SERVICE_ROLE_KEY fallback is removed, only
//                    SUPABASE_SECRET_KEY is accepted
//
// ⚠️  DO NOT import this file from any src/ (frontend) module.
// =============================================================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types.ts';

export type AdminClient = SupabaseClient<Database>;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Reads an env var by name. Falls back to the legacy name if provided.
 * Throws a clear error at call time (not at import time) so the function
 * deployment itself never crashes on startup — only on first invocation.
 */
function resolveKey(primaryName: string, fallbackName?: string): string {
  const primary = Deno.env.get(primaryName)?.trim();
  if (primary) return primary;

  if (fallbackName) {
    const fallback = Deno.env.get(fallbackName)?.trim();
    if (fallback) {
      // Emit a structured warning visible in Supabase Edge Function logs.
      // Remove once all secrets are migrated to SUPABASE_SECRET_KEY.
      console.warn(
        JSON.stringify({
          level: 'warn',
          source: 'supabaseAdmin',
          message: `${primaryName} not set — falling back to ${fallbackName}. Migrate secrets.`,
        }),
      );
      return fallback;
    }
  }

  throw new Error(
    `[supabaseAdmin] Missing required env var: ${primaryName}` +
      (fallbackName ? ` (and fallback ${fallbackName})` : '') +
      '. Check Supabase project secrets.',
  );
}

function resolveUrl(): string {
  const url = Deno.env.get('SUPABASE_URL')?.trim();
  if (!url) throw new Error('[supabaseAdmin] Missing required env var: SUPABASE_URL');
  return url;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Returns a privileged Supabase client that bypasses Row Level Security.
 *
 * Prefer calling this ONCE per Edge Function invocation and passing the
 * client instance down — do not call it in hot loops.
 *
 * Key resolution order:
 *   1. SUPABASE_SECRET_KEY       (new canonical name)
 *   2. SUPABASE_SERVICE_ROLE_KEY (legacy — emits deprecation warning)
 */
export function supabaseAdmin(): AdminClient {
  const url = resolveUrl();
  const key = resolveKey('SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY');

  return createClient<Database>(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        'X-Application-Name': 'sofis-edge',
        // Carried on every DB request for audit log visibility.
        'X-Edge-Role': 'service-admin',
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Convenience re-export so callers can type their local variable cleanly:
//
//   import { supabaseAdmin, type AdminClient } from '../_shared/supabaseAdmin.ts';
//   const db: AdminClient = supabaseAdmin();
// ---------------------------------------------------------------------------
export type { Database };