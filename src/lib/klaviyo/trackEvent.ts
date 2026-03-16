// src/lib/klaviyo/trackEvent.ts
// ─── Klaviyo Event Tracking ───────────────────────────────────────────────────
//
// Uses the modern Klaviyo REST API:
//   POST https://a.klaviyo.com/api/events/
//
// ⚠️  The old GET /track?data=base64(...) endpoint is deprecated and will
//     be removed. This implementation uses the JSON:API-spec POST endpoint.
//
// Auth: Public key via 'Authorization: Klaviyo-API-Key pk_xxx' header.
//       This is safe to call from the browser — the public key is not secret.
// ─────────────────────────────────────────────────────────────────────────────

import {
  KLAVIYO_API_BASE,
  KLAVIYO_API_REVISION,
  KLAVIYO_PUBLIC_KEY,
} from '@/config/klaviyoConfig';
import type {
  KlaviyoEventInput,
  KlaviyoResult,
  KlaviyoErrorResponse,
} from './types';

// ── Internal request shape (JSON:API) ─────────────────────────────────────────

interface EventRequestBody {
  data: {
    type: 'event';
    attributes: {
      metric: { data: { type: 'metric'; attributes: { name: string; service?: string } } };
      profile: { data: { type: 'profile'; attributes: Record<string, unknown> } };
      properties?: Record<string, unknown>;
      value?: number;
      time?: string;
      unique_id?: string;
    };
  };
}

// ── trackEvent ────────────────────────────────────────────────────────────────

/**
 * Send a behavioural event to Klaviyo.
 *
 * @example
 * await trackEvent({
 *   metric:     { name: KlaviyoEvents.ORDER_PLACED },
 *   profile:    { email: 'guest@example.com' },
 *   properties: { order_id: order.id, value: order.amount_total / 100 },
 *   value:      order.amount_total / 100,
 * });
 */
export async function trackEvent(
  input: KlaviyoEventInput,
): Promise<KlaviyoResult<void>> {
  if (!KLAVIYO_PUBLIC_KEY) {
    if (import.meta.env.DEV) {
      console.warn('[klaviyo:trackEvent] No public key set — event not sent.', input);
    }
    return { ok: false, errors: [{ status: 0, code: 'missing_key', title: 'Missing public key', detail: 'VITE_KLAVIYO_PUBLIC_KEY is not configured.' }], status: 0 };
  }

  const body: EventRequestBody = {
    data: {
      type: 'event',
      attributes: {
        metric: {
          data: {
            type: 'metric',
            attributes: {
              name: input.metric.name,
              ...(input.metric.service ? { service: input.metric.service } : {}),
            },
          },
        },
        profile: {
          data: {
            type: 'profile',
            attributes: input.profile as Record<string, unknown>,
          },
        },
        ...(input.properties    ? { properties: input.properties } : {}),
        ...(input.value != null ? { value: input.value }          : {}),
        ...(input.time          ? { time: input.time }            : {}),
        ...(input.unique_id     ? { unique_id: input.unique_id }  : {}),
      },
    },
  };

  try {
    const res = await fetch(`${KLAVIYO_API_BASE}/events/`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Accept':        'application/json',
        'revision':      KLAVIYO_API_REVISION,
        'Authorization': `Klaviyo-API-Key ${KLAVIYO_PUBLIC_KEY}`,
      },
      body: JSON.stringify(body),
    });

    // 202 Accepted = success (Klaviyo processes events asynchronously)
    if (res.status === 202 || res.ok) {
      return { ok: true, data: undefined };
    }

    // Parse JSON:API error envelope
    const errJson = await res.json().catch(() => ({ errors: [] })) as KlaviyoErrorResponse;
    if (import.meta.env.DEV) {
      console.error('[klaviyo:trackEvent] API error:', errJson);
    }
    return { ok: false, errors: errJson.errors ?? [], status: res.status };

  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    if (import.meta.env.DEV) {
      console.error('[klaviyo:trackEvent] Network error:', detail);
    }
    return {
      ok: false,
      errors: [{ status: 0, code: 'network_error', title: 'Network error', detail }],
      status: 0,
    };
  }
}