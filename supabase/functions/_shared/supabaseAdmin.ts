// PATH: supabase/functions/_shared/supabaseAdmin.ts
// =============================================================================
// ADMIN CLIENT — Server-Only Supabase Admin Abstraction (2026)
// =============================================================================
//
// PURPOSE
//   Single authoritative source for the privileged Supabase client inside Edge
//   Functions. All privileged DB access must go through this module.
//
// SECURITY CONTRACT
//   ✅ Server-only — never imported by frontend code
//   ✅ Uses SUPABASE_SECRET_KEYS.default first — current Supabase key format
//   ✅ Keeps SUPABASE_SECRET_KEY + SUPABASE_SERVICE_ROLE_KEY fallbacks temporarily
//   ✅ Fails fast at call time with clear errors
//   ✅ Carries X-Edge-Role: service-admin header for audit traceability
//
// KEY RESOLUTION ORDER
//   1. SUPABASE_SECRET_KEYS.default       current Supabase JSON dictionary
//   2. SUPABASE_SECRET_KEY                old transitional single-key name
//   3. SUPABASE_SERVICE_ROLE_KEY          legacy deprecated fallback
//
// ⚠️ DO NOT import this file from any src/ frontend module.
// =============================================================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types.ts';

export type AdminClient = SupabaseClient<Database>;

type SecretKeyDictionary = Record<string, string>;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function resolveUrl(): string {
  const url = Deno.env.get('SUPABASE_URL')?.trim();

  if (!url) {
    throw new Error('[supabaseAdmin] Missing required env var: SUPABASE_URL');
  }

  return url;
}

function readSecretKeysDictionary(): string | null {
  const raw = Deno.env.get('SUPABASE_SECRET_KEYS')?.trim();

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as SecretKeyDictionary;
    const key = parsed.default?.trim();

    if (key) {
      return key;
    }

    console.warn(
      JSON.stringify({
        level: 'warn',
        source: 'supabaseAdmin',
        message:
          'SUPABASE_SECRET_KEYS is set but does not contain a non-empty default key.',
      }),
    );

    return null;
  } catch {
    console.warn(
      JSON.stringify({
        level: 'warn',
        source: 'supabaseAdmin',
        message:
          'SUPABASE_SECRET_KEYS is set but is not valid JSON. Expected JSON dictionary with a default key.',
      }),
    );

    return null;
  }
}

function readSingleKey(name: string): string | null {
  const key = Deno.env.get(name)?.trim();
  return key || null;
}

function resolveAdminKey(): string {
  const secretKeysDefault = readSecretKeysDictionary();

  if (secretKeysDefault) {
    return secretKeysDefault;
  }

  const transitional = readSingleKey('SUPABASE_SECRET_KEY');

  if (transitional) {
    console.warn(
      JSON.stringify({
        level: 'warn',
        source: 'supabaseAdmin',
        message:
          'Using SUPABASE_SECRET_KEY fallback. Prefer SUPABASE_SECRET_KEYS.default.',
      }),
    );

    return transitional;
  }

  const legacy = readSingleKey('SUPABASE_SERVICE_ROLE_KEY');

  if (legacy) {
    console.warn(
      JSON.stringify({
        level: 'warn',
        source: 'supabaseAdmin',
        message:
          'Using deprecated SUPABASE_SERVICE_ROLE_KEY fallback. Migrate to SUPABASE_SECRET_KEYS.default.',
      }),
    );

    return legacy;
  }

  throw new Error(
    '[supabaseAdmin] Missing Supabase admin key. Expected SUPABASE_SECRET_KEYS.default, SUPABASE_SECRET_KEY, or SUPABASE_SERVICE_ROLE_KEY.',
  );
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function supabaseAdmin(): AdminClient {
  const url = resolveUrl();
  const key = resolveAdminKey();

  return createClient<Database>(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        'X-Application-Name': 'sofis-edge',
        'X-Edge-Role': 'service-admin',
      },
    },
  });
}

export type { Database };