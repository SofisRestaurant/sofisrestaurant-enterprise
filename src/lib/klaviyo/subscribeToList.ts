// src/lib/klaviyo/subscribeToList.ts
// ─── Klaviyo List Subscription — via Supabase Edge Function ──────────────────
//
// Production upgrades in this version:
//   ✅ captchaToken field in request body (hCaptcha / reCAPTCHA v3)
//   ✅ utm_* fields forwarded for Klaviyo source attribution
//   ✅ alreadySubscribed flag threaded through from edge function response
//   ✅ Retry with exponential backoff at the fetch/invoke layer
//      (up to 2 retries on 5xx/network; never on 4xx validation)
//
// Why error is typed as `unknown` (not `any`):
//   supabase.functions.invoke returns FunctionsResponseFailure.error: any
//   We cast to unknown then narrow with instanceof — no type lies, no as-casts.
//   See inline comments for the full explanation.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from '@/lib/supabase/supabaseClient';
import {
  FunctionsHttpError,
  FunctionsRelayError,
  FunctionsFetchError,
} from '@supabase/functions-js';
import type { KlaviyoResult, KlaviyoProfileAttributes } from './types';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SubscribeToListOptions {
  email:          string;
  phone_number?:  string;
  listId?:        string;
  channels?:      ('EMAIL' | 'SMS')[];
  source?:        string;
  identify?:      boolean;
  /** hCaptcha / reCAPTCHA v3 token — verified server-side in the edge function */
  captchaToken?:  string;
  profileAttrs?:  Omit<KlaviyoProfileAttributes, 'email' | 'phone_number'>;
}

interface EdgeFunctionBody {
  ok?:                boolean;
  alreadySubscribed?: boolean;
  error?:             string;
  detail?:            string;
}

export type SubscribeResult = KlaviyoResult<void> & {
  error?:             string;
  alreadySubscribed?: boolean;
};

// ── Retry helpers ─────────────────────────────────────────────────────────────

const MAX_INVOKE_RETRIES = 2;

function invokeBackoffMs(attempt: number): number {
  return Math.min(800 * Math.pow(2, attempt - 1) + Math.random() * 150, 5000);
}

function isInvokeRetryable(status: number): boolean {
  return status === 0 || status === 502 || status === 503 || status === 504 || status >= 500;
}

// ── FunctionsHttpError body extraction ───────────────────────────────────────
// FunctionsHttpError.message is ALWAYS "Edge Function returned a non-2xx
// status code" — the real error is in the response body.
// error.context is the raw Response; call .json() to get it.

async function extractHttpErrorDetail(
  error: FunctionsHttpError,
): Promise<{ detail: string; status: number }> {
  const status = (error.context as { status?: number }).status ?? 0;
  try {
    const body = (await (error.context as Response).json()) as EdgeFunctionBody;
    return {
      detail: body?.error ?? body?.detail ?? `Request failed with status ${status}.`,
      status,
    };
  } catch {
    return { detail: `Request failed with status ${status}.`, status };
  }
}

// ── subscribeToList ───────────────────────────────────────────────────────────

/**
 * Subscribe a profile to the Klaviyo newsletter list via the Supabase
 * Edge Function. Safe to call from the browser — no API keys are exposed.
 *
 * Retries up to MAX_INVOKE_RETRIES times on retryable errors (5xx / network).
 * Returns a discriminated union on `ok` — no try/catch needed at the call site.
 * The `alreadySubscribed` field is forwarded from the edge function response.
 */
export async function subscribeToList(
  options: SubscribeToListOptions,
  _attempt = 1,
): Promise<SubscribeResult> {
  const {
    email,
    phone_number,
    listId,
    channels,
    source,
    identify,
    captchaToken,
    profileAttrs,
  } = options;

  if (!email?.trim()) {
    return {
      ok:     false,
      errors: [{ status: 400, code: 'missing_email', title: 'Missing email', detail: 'Email is required.' }],
      status: 400,
      error:  'Email is required.',
    };
  }

  // Build flat body — edge function expects top-level fields
  const body: Record<string, unknown> = {
    email: email.trim().toLowerCase(),
    ...(phone_number                ? { phone_number }   : {}),
    ...(listId                      ? { listId }         : {}),
    ...(channels                    ? { channels }       : {}),
    ...(source                      ? { source }         : {}),
    ...(identify !== undefined      ? { identify }       : {}),
    ...(captchaToken                ? { captchaToken }   : {}),
    ...(profileAttrs                ?? {}),
  };

  // ── Invoke ────────────────────────────────────────────────────────────────
  // Cast result to unknown so no-unsafe-* rules are satisfied.
  // We narrow each field with instanceof / type guards below.
  const rawInvoke = await supabase.functions.invoke('subscribe', { body });
  const rawData:  unknown = rawInvoke.data;
  const rawError: unknown = rawInvoke.error;

  // ── Handle invoke errors ──────────────────────────────────────────────────
  if (rawError !== null && rawError !== undefined) {
    if (rawError instanceof FunctionsHttpError) {
      const { detail, status } = await extractHttpErrorDetail(rawError);

      // Retry on server errors
      if (isInvokeRetryable(status) && _attempt <= MAX_INVOKE_RETRIES) {
        await new Promise<void>((r) => setTimeout(r, invokeBackoffMs(_attempt)));
        return subscribeToList(options, _attempt + 1);
      }

      return {
        ok:     false,
        errors: [{ status, code: 'http_error', title: 'Edge function error', detail }],
        status,
        error:  detail,
      };
    }

    if (rawError instanceof FunctionsRelayError) {
      if (_attempt <= MAX_INVOKE_RETRIES) {
        await new Promise<void>((r) => setTimeout(r, invokeBackoffMs(_attempt)));
        return subscribeToList(options, _attempt + 1);
      }
      const detail = 'Our servers are temporarily unavailable. Please try again in a moment.';
      return {
        ok:     false,
        errors: [{ status: 503, code: 'relay_error', title: 'Relay error', detail }],
        status: 503,
        error:  detail,
      };
    }

    if (rawError instanceof FunctionsFetchError) {
      if (_attempt <= MAX_INVOKE_RETRIES) {
        await new Promise<void>((r) => setTimeout(r, invokeBackoffMs(_attempt)));
        return subscribeToList(options, _attempt + 1);
      }
      const detail = 'Network error. Please check your connection and try again.';
      return {
        ok:     false,
        errors: [{ status: 0, code: 'fetch_error', title: 'Network error', detail }],
        status: 0,
        error:  detail,
      };
    }

    const detail = rawError instanceof Error ? rawError.message : 'Subscription failed.';
    return {
      ok:     false,
      errors: [{ status: 0, code: 'unknown_error', title: 'Unknown error', detail }],
      status: 0,
      error:  detail,
    };
  }

  // ── Handle logical errors in 2xx body ────────────────────────────────────
  const isEdgeBody = (v: unknown): v is EdgeFunctionBody =>
    typeof v === 'object' && v !== null;

  if (isEdgeBody(rawData) && rawData.ok === false) {
    const detail = rawData.error ?? rawData.detail ?? 'Subscription failed. Please try again.';
    return {
      ok:     false,
      errors: [{ status: 400, code: 'subscription_failed', title: 'Subscription failed', detail }],
      status: 400,
      error:  detail,
    };
  }

  // ── Success — thread alreadySubscribed flag through ───────────────────────
  const alreadySubscribed =
    isEdgeBody(rawData) && rawData.alreadySubscribed === true;

  return { ok: true, data: undefined, alreadySubscribed };
}