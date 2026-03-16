// src/lib/klaviyo/identifyUser.ts
// ─── Klaviyo Profile Identification ──────────────────────────────────────────
//
// Uses the modern Klaviyo REST API:
//   POST https://a.klaviyo.com/api/profiles/
//
// Klaviyo automatically merges profiles with the same email/phone.
// If a profile already exists it is updated (upserted) rather than duplicated.
//
// ⚠️  The old GET /identify?data=base64(...) endpoint is deprecated.
// ─────────────────────────────────────────────────────────────────────────────

import {
  KLAVIYO_API_BASE,
  KLAVIYO_API_REVISION,
  KLAVIYO_PUBLIC_KEY,
} from '@/config/klaviyoConfig';
import type {
  IdentifyUserInput,
  KlaviyoResult,
  KlaviyoErrorResponse,
  KlaviyoProfileAttributes,
} from './types';

// ── identifyUser ──────────────────────────────────────────────────────────────

/**
 * Upsert a profile in Klaviyo. Safe to call from the browser.
 *
 * Use this whenever you know who the user is — after login, after checkout,
 * after a form submission. Klaviyo merges on email/phone automatically.
 *
 * @example
 * await identifyUser({
 *   email:      'guest@example.com',
 *   first_name: 'María',
 *   last_name:  'García',
 *   properties: { loyalty_tier: 'gold', total_orders: 12 },
 * });
 */
export async function identifyUser(
  input: IdentifyUserInput,
): Promise<KlaviyoResult<{ id?: string }>> {
  if (!KLAVIYO_PUBLIC_KEY) {
    if (import.meta.env.DEV) {
      console.warn('[klaviyo:identifyUser] No public key set — profile not sent.', input);
    }
    return {
      ok: false,
      errors: [{ status: 0, code: 'missing_key', title: 'Missing public key', detail: 'VITE_KLAVIYO_PUBLIC_KEY is not configured.' }],
      status: 0,
    };
  }

  // Separate `properties` from core attributes so we don't double-nest
  const { properties, ...coreAttributes } = input as IdentifyUserInput & { properties?: Record<string, unknown> };

  const attributes: KlaviyoProfileAttributes & { properties?: Record<string, unknown> } = {
    ...coreAttributes,
    ...(properties ? { properties } : {}),
  };

  const body = {
    data: {
      type: 'profile',
      attributes,
    },
  };

  try {
    const res = await fetch(`${KLAVIYO_API_BASE}/profiles/`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Accept':        'application/json',
        'revision':      KLAVIYO_API_REVISION,
        'Authorization': `Klaviyo-API-Key ${KLAVIYO_PUBLIC_KEY}`,
      },
      body: JSON.stringify(body),
    });

    // 200 = updated existing profile, 201 = created new profile
    if (res.ok) {
      const json = await res.json().catch(() => ({})) as { data?: { id?: string } };
      return { ok: true, data: { id: json.data?.id } };
    }

    // 409 Conflict = duplicate profile — Klaviyo returns the existing profile ID
    // This is not a real error; treat it as success.
    if (res.status === 409) {
      const json = await res.json().catch(() => ({})) as { errors?: Array<{ meta?: { duplicate_profile_id?: string } }> };
      const duplicateId = json.errors?.[0]?.meta?.duplicate_profile_id;
      return { ok: true, data: { id: duplicateId } };
    }

    const errJson = await res.json().catch(() => ({ errors: [] })) as KlaviyoErrorResponse;
    if (import.meta.env.DEV) {
      console.error('[klaviyo:identifyUser] API error:', errJson);
    }
    return { ok: false, errors: errJson.errors ?? [], status: res.status };

  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    if (import.meta.env.DEV) {
      console.error('[klaviyo:identifyUser] Network error:', detail);
    }
    return {
      ok: false,
      errors: [{ status: 0, code: 'network_error', title: 'Network error', detail }],
      status: 0,
    };
  }
}