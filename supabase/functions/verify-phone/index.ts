// PATH: supabase/functions/verify-phone/index.ts
// =============================================================================
// CHANGES IN THIS VERSION:
//
//   [FIX] Dispatch issue_challenge_token action to challenge-actions.ts.
//
//         Previously the function only handled 'send' and 'check' actions.
//         Every call with action: 'issue_challenge_token' fell through to
//         the final "Unknown action" 400 response. challenge-actions.ts was
//         implemented but never wired in, making challenge token issuance
//         impossible.
//
//         Fix: import issueChallengeToken from challenge-actions.ts and add
//         a dispatch block. Response uses snake_case challenge_token key to
//         match the frontend contract in challengeClient.ts.
//
// All existing 'send' and 'check' logic is unchanged.
// Prior security fixes preserved:
//   [FIX 1] Ownership check runs before idempotency guard.
//   [FIX 2] Idempotency guard uses !== 'required' (not an allowlist).
// =============================================================================

import { supabaseAdmin }                                                from '../_shared/supabaseAdmin.ts';
import { getTwilioEnv, sendVerifyOtp, checkVerifyOtp, normalizePhone } from '../_shared/twilio.ts';
import { corsHeaders }                                                  from '../_shared/cors.ts';
import {
  issueChallengeToken as handleIssueChallengeToken,
} from './challenge-actions.ts';

const UUID_RE           = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_SEND_ATTEMPTS = 3;
const WINDOW_MINUTES    = 10;

function jsonResponse(req: Request, body: unknown, status = 200): Response {
  const cors    = corsHeaders(req);
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(cors ?? {}) };
  return new Response(JSON.stringify(body), { status, headers });
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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    const cors = corsHeaders(req);
    if (!cors) return new Response('Origin not allowed', { status: 403 });
    return new Response(null, { status: 204, headers: cors });
  }
  if (req.method !== 'POST') return jsonResponse(req, { ok: false, error: 'Method not allowed' }, 405);

  let body: Record<string, unknown>;
  try { body = await req.json() as Record<string, unknown>; }
  catch { return jsonResponse(req, { ok: false, error: 'Invalid JSON' }, 400); }

  const twilioEnv = getTwilioEnv();
  const db        = supabaseAdmin();

  // ── SEND OTP ────────────────────────────────────────────────────────────

  if (body.action === 'send') {
    const normalized = normalizePhone(typeof body.phone === 'string' ? body.phone : '');
    if (!normalized) return jsonResponse(req, { ok: false, error: 'Invalid phone number. Use format: +12025551234' }, 400);

    const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString();
    const phoneHash   = await hashPhone(normalized);

    const { count: recentAttempts } = await db
      .from('sms_verify_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('phone_hash', phoneHash)
      .gte('created_at', windowStart);

    if ((recentAttempts ?? 0) >= MAX_SEND_ATTEMPTS) {
      structuredLog('rate_limited', 'send', { phone_suffix: normalized.slice(-4) });
      return jsonResponse(req, { ok: false, error: `Too many attempts. Please wait ${WINDOW_MINUTES} minutes.` }, 429);
    }

    try {
      await db.from('sms_verify_attempts').insert({ phone_hash: phoneHash, created_at: new Date().toISOString() });
    } catch (e) {
      structuredLog('db_warn', 'send', { detail: 'attempt_log_failed', error: String(e) });
    }

    const result = await sendVerifyOtp({ env: twilioEnv, to: normalized, channel: 'sms' });
    if (!result.ok) {
      structuredLog('failed', 'send', { error: result.error, phone_suffix: normalized.slice(-4) });
      return jsonResponse(req, { ok: false, error: result.error ?? 'Failed to send code' }, 502);
    }

    structuredLog('sent', 'send', { phone_suffix: normalized.slice(-4) });
    return jsonResponse(req, { ok: true, normalizedPhone: result.normalizedPhone, status: result.status });
  }

  // ── CHECK OTP ───────────────────────────────────────────────────────────

  if (body.action === 'check') {
    const normalized = normalizePhone(typeof body.phone === 'string' ? body.phone : '');
    const code       = typeof body.code === 'string' ? body.code.replace(/\D/g, '').slice(0, 8) : '';
    const orderId    = typeof body.order_id === 'string' && UUID_RE.test(body.order_id) ? body.order_id : null;
    const guestToken = typeof body.guest_token === 'string' && body.guest_token.trim().length > 0
      ? body.guest_token.trim()
      : null;

    if (!normalized) return jsonResponse(req, { ok: false, error: 'Invalid phone number' }, 400);
    if (!code)       return jsonResponse(req, { ok: false, error: 'Code is required' }, 400);

    const result = await checkVerifyOtp({ env: twilioEnv, to: normalized, code });

    if (!result.ok) {
      structuredLog('failed', 'check', { error: result.error, phone_suffix: normalized.slice(-4) });
      return jsonResponse(req, { ok: false, valid: false, error: result.error }, 502);
    }
    if (!result.valid) {
      structuredLog('invalid', 'check', { phone_suffix: normalized.slice(-4) });
      return jsonResponse(req, { ok: true, valid: false, error: 'Incorrect code. Please try again.' });
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
        return jsonResponse(req, { ok: true, valid: true });
      }

      // [FIX 1] Ownership check runs FIRST.
      const phoneOwned  = phonesMatch(normalized, orderRow.customer_phone);
      const guestOwned  = guestToken !== null && guestToken === orderRow.guest_token;
      const ownershipOk = phoneOwned || guestOwned;

      if (!ownershipOk) {
        structuredLog('ownership_failed', 'check', {
          order_id:         orderId,
          phone_suffix:     normalized.slice(-4),
          has_guest_token:  guestToken !== null,
          stored_phone_set: orderRow.customer_phone !== null,
        });
        return jsonResponse(req, { ok: true, valid: true });
      }

      // [FIX 2] Idempotency guard.
      if (orderRow.verification_status !== 'required') {
        structuredLog('skipped', 'check', {
          detail:              'no_write_needed',
          order_id:            orderId,
          verification_status: orderRow.verification_status,
        });
        return jsonResponse(req, { ok: true, valid: true });
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
        structuredLog('verified', 'check', {
          order_id:     orderId,
          phone_suffix: normalized.slice(-4),
        });
      }
    }

    return jsonResponse(req, { ok: true, valid: true });
  }

  // ── ISSUE CHALLENGE TOKEN ────────────────────────────────────────────────
  //
  // [FIX] This block was missing. challenge-actions.ts was implemented but
  // never dispatched. Every call with action: 'issue_challenge_token' fell
  // through to the "Unknown action" 400 response below.
  //
  // Response key is snake_case `challenge_token` to match the frontend
  // contract in challengeClient.ts (data.challenge_token).

  if (body.action === 'issue_challenge_token') {
    const result = await handleIssueChallengeToken({
      body,
      db,
      twilioEnv,
      log: structuredLog,
    });

    if (!result.ok) {
      const responseBody: Record<string, unknown> = { ok: false, error: result.error };
      // Propagate valid: false so the frontend can distinguish wrong-code
      // errors (show "Incorrect code") from service errors (show generic message).
      if ('valid' in result && result.valid === false) {
        responseBody['valid'] = false;
      }
      return jsonResponse(req, responseBody, result.httpStatus);
    }

    return jsonResponse(req, { ok: true, challenge_token: result.challenge_token });
  }

  return jsonResponse(req, { ok: false, error: `Unknown action: ${body.action}` }, 400);
});