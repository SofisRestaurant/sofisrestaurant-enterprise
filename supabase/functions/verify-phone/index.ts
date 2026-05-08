// PATH: supabase/functions/verify-phone/index.ts
// =============================================================================
// CHANGES IN THIS VERSION:
//
//   [FIX 1] getVerifyEnv() replaces getTwilioEnv().
//
//         getTwilioEnv() required TWILIO_FROM_NUMBER and read TWILIO_VERIFY_SID.
//         verify-phone never calls sendSms(), so TWILIO_FROM_NUMBER is irrelevant.
//         TWILIO_VERIFY_SID was wrong — the secret is named TWILIO_VERIFY_SERVICE_SID.
//         Both bugs caused getTwilioEnv() to throw on every request.
//
//   [FIX 2] CORS-safe global try/catch.
//
//         getTwilioEnv() was called at the top of the handler before any
//         response was constructed. If it threw, the exception escaped
//         Deno.serve() before CORS headers were written. The browser reported
//         this as a CORS error, masking the real crash.
//
//         Fix: wrap the entire handler body in try/catch. The catch block
//         emits a structured JSON error with CORS headers regardless of what
//         threw. No exception can escape to Deno.serve().
//
//   [FIX 3] Env loading moved inside the handler.
//
//         getVerifyEnv() is now called inside the handler and returns
//         { ok: false, missing } instead of throwing. If env is missing,
//         the handler returns a 503 with a clear error message and full
//         CORS headers. No crash, no silent failure, no masked CORS error.
//
// All existing 'send', 'check', and 'issue_challenge_token' logic is unchanged.
// Prior security fixes preserved:
//   [FIX 1] Ownership check runs before idempotency guard.
//   [FIX 2] Idempotency guard uses !== 'required' (not an allowlist).
// =============================================================================

import { supabaseAdmin }                                from '../_shared/supabaseAdmin.ts';
import { getVerifyEnv, sendVerifyOtp, checkVerifyOtp, normalizePhone } from '../_shared/twilio.ts';
import { corsHeaders }                                  from '../_shared/cors.ts';
import {
  issueChallengeToken as handleIssueChallengeToken,
} from './challenge-actions.ts';

const UUID_RE           = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_SEND_ATTEMPTS = 3;
const WINDOW_MINUTES    = 10;

// ─── Response helpers ─────────────────────────────────────────────────────────

function makeHeaders(cors: Record<string, string> | null): Record<string, string> {
  return { 'Content-Type': 'application/json', ...(cors ?? {}) };
}

function jsonResponse(
  cors:   Record<string, string> | null,
  body:   unknown,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), { status, headers: makeHeaders(cors) });
}

function structuredLog(outcome: string, action: string, detail: Record<string, unknown>): void {
  console.log(JSON.stringify({ ts: new Date().toISOString(), fn: 'verify-phone', outcome, action, ...detail }));
}

async function hashPhone(phone: string): Promise<string> {
  const data = new TextEncoder().encode(phone);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ─── Ownership helpers ────────────────────────────────────────────────────────

function phonesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const na = normalizePhone(a);
  const nb = normalizePhone(b);
  return na !== null && nb !== null && na === nb;
}

// ─── Order row type (only columns we need) ────────────────────────────────────

interface OrderVerifyRow {
  id:                  string;
  customer_phone:      string | null;
  guest_token:         string | null;
  verification_status: string | null;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
  // Resolve CORS headers first — needed by every response path including errors.
  const cors = corsHeaders(req);

  // CORS preflight — must be handled before env loading.
  if (req.method === 'OPTIONS') {
    if (!cors) return new Response('Origin not allowed', { status: 403 });
    return new Response(null, { status: 204, headers: cors });
  }

  // [FIX 2] Wrap ALL handler logic in try/catch.
  // Any uncaught exception returns a structured JSON 500 with CORS headers.
  // No exception can escape to Deno.serve() and strip CORS from the response.
  try {
    return await handleRequest(req, cors);
  } catch (err) {
    structuredLog('unhandled_exception', 'handler', {
      error: err instanceof Error ? err.message : String(err),
    });
    return jsonResponse(cors, { ok: false, error: 'Internal server error' }, 500);
  }
});

// ─── handleRequest ────────────────────────────────────────────────────────────

async function handleRequest(
  req:  Request,
  cors: Record<string, string> | null,
): Promise<Response> {
  if (req.method !== 'POST') {
    return jsonResponse(cors, { ok: false, error: 'Method not allowed' }, 405);
  }

  // [FIX 1] + [FIX 3] Load Verify-only env inside handler — never throws.
  // getVerifyEnv() reads only ACCOUNT_SID, AUTH_TOKEN, VERIFY_SERVICE_SID.
  // TWILIO_FROM_NUMBER is not required here.
  const envResult = getVerifyEnv();
  if (!envResult.ok) {
    structuredLog('config_error', 'handler', { missing: envResult.missing });
    return jsonResponse(
      cors,
      { ok: false, error: `Verification service is not configured (missing: ${envResult.missing.join(', ')})` },
      503,
    );
  }
  const twilioEnv = envResult.env;

  const db = supabaseAdmin();

  let body: Record<string, unknown>;
  try {
    body = await req.json() as Record<string, unknown>;
  } catch {
    return jsonResponse(cors, { ok: false, error: 'Invalid JSON' }, 400);
  }

  // ── SEND OTP ────────────────────────────────────────────────────────────

  if (body.action === 'send') {
    const normalized = normalizePhone(typeof body.phone === 'string' ? body.phone : '');
    if (!normalized) {
      return jsonResponse(cors, { ok: false, error: 'Invalid phone number. Use format: +12025551234' }, 400);
    }

    const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString();
    const phoneHash   = await hashPhone(normalized);

    const { count: recentAttempts } = await db
      .from('sms_verify_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('phone_hash', phoneHash)
      .gte('created_at', windowStart);

    if ((recentAttempts ?? 0) >= MAX_SEND_ATTEMPTS) {
      structuredLog('rate_limited', 'send', { phone_suffix: normalized.slice(-4) });
      return jsonResponse(
        cors,
        { ok: false, error: `Too many attempts. Please wait ${WINDOW_MINUTES} minutes.` },
        429,
      );
    }

    try {
      await db.from('sms_verify_attempts').insert({
        phone_hash: phoneHash,
        created_at: new Date().toISOString(),
      });
    } catch (e) {
      structuredLog('db_warn', 'send', { detail: 'attempt_log_failed', error: String(e) });
    }

    const result = await sendVerifyOtp({ env: twilioEnv, to: normalized, channel: 'sms' });
    if (!result.ok) {
      structuredLog('failed', 'send', { error: result.error, phone_suffix: normalized.slice(-4) });
      return jsonResponse(cors, { ok: false, error: result.error ?? 'Failed to send code' }, 502);
    }

    structuredLog('sent', 'send', { phone_suffix: normalized.slice(-4) });
    return jsonResponse(cors, { ok: true, normalizedPhone: result.normalizedPhone, status: result.status });
  }

  // ── CHECK OTP ───────────────────────────────────────────────────────────

  if (body.action === 'check') {
    const normalized = normalizePhone(typeof body.phone === 'string' ? body.phone : '');
    const code       = typeof body.code === 'string' ? body.code.replace(/\D/g, '').slice(0, 8) : '';
    const orderId    = typeof body.order_id === 'string' && UUID_RE.test(body.order_id)
      ? body.order_id
      : null;
    const guestToken = typeof body.guest_token === 'string' && body.guest_token.trim().length > 0
      ? body.guest_token.trim()
      : null;

    if (!normalized) return jsonResponse(cors, { ok: false, error: 'Invalid phone number' }, 400);
    if (!code)       return jsonResponse(cors, { ok: false, error: 'Code is required' }, 400);

    const result = await checkVerifyOtp({ env: twilioEnv, to: normalized, code });

    if (!result.ok) {
      structuredLog('failed', 'check', { error: result.error, phone_suffix: normalized.slice(-4) });
      return jsonResponse(cors, { ok: false, valid: false, error: result.error }, 502);
    }
    if (!result.valid) {
      structuredLog('invalid', 'check', { phone_suffix: normalized.slice(-4) });
      return jsonResponse(cors, { ok: true, valid: false, error: 'Incorrect code. Please try again.' });
    }

    if (orderId) {
      const { data: orderRow, error: fetchError } = await db
        .from('orders')
        .select('id, customer_phone, guest_token, verification_status')
        .eq('id', orderId)
        .maybeSingle<OrderVerifyRow>();

      if (fetchError || !orderRow) {
        structuredLog('db_warn', 'check', {
          detail:   'order_not_found_for_update',
          order_id: orderId,
          error:    fetchError?.message ?? 'no row',
        });
        return jsonResponse(cors, { ok: true, valid: true });
      }

      // Ownership check runs FIRST.
      const phoneOwned  = phonesMatch(normalized, orderRow.customer_phone);
      const guestOwned  = guestToken !== null && guestToken === orderRow.guest_token;

      if (!phoneOwned && !guestOwned) {
        structuredLog('ownership_failed', 'check', {
          order_id:         orderId,
          phone_suffix:     normalized.slice(-4),
          has_guest_token:  guestToken !== null,
          stored_phone_set: orderRow.customer_phone !== null,
        });
        return jsonResponse(cors, { ok: true, valid: true });
      }

      // Idempotency guard — skip update if already verified.
      if (orderRow.verification_status !== 'required') {
        structuredLog('skipped', 'check', {
          detail:              'no_write_needed',
          order_id:            orderId,
          verification_status: orderRow.verification_status,
        });
        return jsonResponse(cors, { ok: true, valid: true });
      }

      const now = new Date().toISOString();
      const { error: updateError } = await db
        .from('orders')
        .update({
          customer_phone:      result.normalizedPhone ?? normalized,
          verification_status: 'verified',
          verified_at:         now,
          updated_at:          now,
        })
        .eq('id', orderId);

      if (updateError) {
        structuredLog('db_error', 'check', {
          detail:   'order_verification_update_failed',
          order_id: orderId,
          error:    updateError.message,
        });
      } else {
        structuredLog('verified', 'check', { order_id: orderId, phone_suffix: normalized.slice(-4) });
      }
    }

    return jsonResponse(cors, { ok: true, valid: true });
  }

  // ── ISSUE CHALLENGE TOKEN ────────────────────────────────────────────────

  if (body.action === 'issue_challenge_token') {
    const result = await handleIssueChallengeToken({
      body,
      db,
      twilioEnv,
      log: structuredLog,
    });

    if (!result.ok) {
      const responseBody: Record<string, unknown> = { ok: false, error: result.error };
      if ('valid' in result && result.valid === false) {
        responseBody['valid'] = false;
      }
      return jsonResponse(cors, responseBody, result.httpStatus);
    }

    return jsonResponse(cors, { ok: true, challenge_token: result.challenge_token });
  }

  return jsonResponse(cors, { ok: false, error: `Unknown action: ${body.action}` }, 400);
}