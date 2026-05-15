// supabase/functions/admin-update-order-status/index.ts
// =============================================================================
// Secure server-owned order status transition.
//
// Replaces the two-step browser pattern:
//   ① client → update_order_status_secure RPC
//   ② client → notify-ready-sms → send-sms → Twilio
//
// New single-step pattern:
//   client → this function → DB update + internal SMS (if ready)
//
// The browser says "mark this order ready."
// This function decides whether to send an SMS.
//
// Auth:
//   requireAuth() validates the Supabase JWT (same as notify-ready-sms).
//   profiles.role must be 'admin' or 'staff'. Fail-closed: missing profile
//   or any DB error returns 403.
//
// SMS (ready transition only):
//   Calls send-sms internally via INTERNAL_FUNCTION_KEY.
//   send-sms owns: phone resolution (guest_phone_e164 preferred),
//   sms_log idempotency, rate limit, Twilio dispatch.
//   SMS failure is non-fatal — status update is already committed.
//
// CORS: corsHeaders / handlePreflight from _shared/cors.ts.
// Logging: structured JSON, order_id prefix only, phone never logged.
// =============================================================================

import { requireAuth, AuthError } from '../_shared/auth.ts';
import { corsHeaders, handlePreflight } from '../_shared/cors.ts';
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';

// ─── Constants ────────────────────────────────────────────────────────────────

const VALID_STATUSES = new Set([
  'confirmed',
  'preparing',
  'ready',
  'out_for_delivery',
  'delivered',
  'cancelled',
  'canceled',
] as const);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── Types ────────────────────────────────────────────────────────────────────

type SmsOutcome =
  | { attempted: false }
  | {
      attempted: true;
      sent:      boolean;
      skipped:   boolean;
      reason?:   string;
      sid?:      string;
    };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isValidUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v);
}

function jsonReply(
  body:  unknown,
  status: number,
  cors:  Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  });
}

// ─── Internal SMS dispatch ────────────────────────────────────────────────────
//
// Calls send-sms via INTERNAL_FUNCTION_KEY — the key never leaves the server.
// send-sms handles: guest_phone_e164 preference, customer_phone fallback,
// sms_log idempotency, rate limiting, and Twilio dispatch.
// All errors are caught; result is returned as SmsOutcome, never throws.

async function dispatchReadySms(
  orderId:   string,
  requestId: string,
): Promise<SmsOutcome> {
  const internalKey = Deno.env.get('INTERNAL_FUNCTION_KEY');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');

  if (!internalKey || !supabaseUrl) {
    console.error(JSON.stringify({
      fn:      'admin-update-order-status',
      outcome: 'sms_misconfigured',
      req:     requestId,
      missing: [
        !internalKey && 'INTERNAL_FUNCTION_KEY',
        !supabaseUrl && 'SUPABASE_URL',
      ].filter(Boolean),
    }));
    return { attempted: true, sent: false, skipped: true, reason: 'sms_service_misconfigured' };
  }

  try {
    const res = await fetch(
      `${supabaseUrl.replace(/\/+$/u, '')}/functions/v1/send-sms`,
      {
        method:  'POST',
        headers: {
          'Content-Type':   'application/json',
          'x-internal-key': internalKey,
        },
        body: JSON.stringify({ order_id: orderId, event: 'ready' }),
      },
    );

    const raw: unknown = await res.json().catch(() => ({}));
    const data =
      typeof raw === 'object' && raw !== null
        ? (raw as Record<string, unknown>)
        : {};

    const sent    = data['ok']      === true;
    const skipped = data['skipped'] === true;
    const reason  = typeof data['reason'] === 'string' ? data['reason'] : undefined;
    const sid     = typeof data['sid']    === 'string' ? data['sid']    : undefined;
    const errMsg  = typeof data['error']  === 'string' ? data['error']  : undefined;

    if (!sent && !skipped) {
      console.warn(JSON.stringify({
        fn:              'admin-update-order-status',
        outcome:         'sms_failed',
        req:             requestId,
        order_id_prefix: orderId.slice(0, 8),
        upstream_status: res.status,
        error:           errMsg ?? 'unknown',
      }));
      return {
        attempted: true,
        sent:      false,
        skipped:   false,
        reason:    errMsg ?? 'sms_dispatch_failed',
      };
    }

    return { attempted: true, sent: sent && !skipped, skipped: skipped || !sent, reason, sid };
  } catch (err) {
    console.warn(JSON.stringify({
      fn:              'admin-update-order-status',
      outcome:         'sms_fetch_failed',
      req:             requestId,
      order_id_prefix: orderId.slice(0, 8),
      error:           err instanceof Error ? err.message : String(err),
    }));
    return { attempted: true, sent: false, skipped: true, reason: 'sms_network_error' };
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
  const requestId = (req.headers.get('x-request-id') ?? crypto.randomUUID()).slice(0, 36);

  // ── CORS preflight ──────────────────────────────────────────────────────────
  if (req.method === 'OPTIONS') return handlePreflight(req);

  const cors = corsHeaders(req);
  if (!cors) return new Response('Origin not allowed', { status: 403 });

  // ── Method guard ────────────────────────────────────────────────────────────
  if (req.method !== 'POST') {
    return jsonReply({ ok: false, error: 'Method not allowed' }, 405, cors);
  }

  // ── 1. JWT validation ───────────────────────────────────────────────────────
  let callerId: string;
  try {
    const user = await requireAuth(req);
    callerId = user.id;
  } catch (err) {
    const status  = err instanceof AuthError ? err.status : 401;
    const message = err instanceof Error    ? err.message : 'Unauthorized';
    return jsonReply({ ok: false, error: message }, status, cors);
  }

  // ── 2. Role check — admin or staff ─────────────────────────────────────────
  //
  // requireAdmin() in auth.ts checks only 'admin', which blocks kitchen staff.
  // We query profiles.role directly and allow both 'admin' and 'staff'.
  // Fail-closed: any error or missing/unrecognised role → 403.

  const db = supabaseAdmin();

  const { data: profile, error: profileError } = await db
    .from('profiles')
    .select('role')
    .eq('id', callerId)
    .maybeSingle<{ role: string | null }>();

  if (profileError) {
    console.error(JSON.stringify({
      fn:      'admin-update-order-status',
      outcome: 'role_check_failed',
      req:     requestId,
      error:   profileError.message,
    }));
    return jsonReply({ ok: false, error: 'Unable to verify role' }, 403, cors);
  }

  const role = (profile?.role ?? '').trim().toLowerCase();
  if (role !== 'admin' && role !== 'staff') {
    return jsonReply({ ok: false, error: 'Staff or admin role required' }, 403, cors);
  }

  // ── 3. Parse + validate body ────────────────────────────────────────────────
  let body: unknown;
  try   { body = await req.json(); }
  catch { return jsonReply({ ok: false, error: 'Invalid JSON body' }, 400, cors); }

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return jsonReply({ ok: false, error: 'Body must be a JSON object' }, 400, cors);
  }

  const record    = body as Record<string, unknown>;
  const orderId   = record['order_id'];
  const newStatus = record['new_status'];

  if (!isValidUuid(orderId)) {
    return jsonReply({ ok: false, error: 'order_id must be a valid UUID' }, 400, cors);
  }

  if (typeof newStatus !== 'string' || !VALID_STATUSES.has(newStatus as never)) {
    return jsonReply({
      ok:    false,
      error: `new_status must be one of: ${[...VALID_STATUSES].join(', ')}`,
    }, 400, cors);
  }

  // ── 4. Update order status + fetch updated row ──────────────────────────────
  //
  // Service role bypasses RLS; the auth + role check above is the security gate.
  // Single query: UPDATE ... RETURNING * via .select('*').
  // If maybeSingle() returns null, the order_id was not found.

  const { data: updatedOrder, error: updateError } = await db
    .from('orders')
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', orderId)
    .select('*')
    .maybeSingle();

  if (updateError) {
    console.error(JSON.stringify({
      fn:              'admin-update-order-status',
      outcome:         'update_failed',
      req:             requestId,
      order_id_prefix: orderId.slice(0, 8),
      error:           updateError.message,
    }));
    return jsonReply({ ok: false, error: 'Failed to update order status' }, 500, cors);
  }

  if (!updatedOrder) {
    return jsonReply({ ok: false, error: 'Order not found' }, 404, cors);
  }

  // ── 5. SMS — ready transition only, non-fatal ───────────────────────────────
  //
  // dispatchReadySms calls send-sms internally. send-sms owns all SMS logic:
  //   - prefers guest_phone_e164 when sms_opt_in = true
  //   - falls back to customer_phone
  //   - enforces sms_log idempotency (duplicate calls are safely skipped)
  //   - enforces per-order rate limit
  //   - dispatches via Twilio
  // A failure here never rolls back the order status update.

  const sms: SmsOutcome =
    newStatus === 'ready'
      ? await dispatchReadySms(orderId, requestId)
      : { attempted: false };

  console.log(JSON.stringify({
    fn:              'admin-update-order-status',
    outcome:         'success',
    req:             requestId,
    order_id_prefix: orderId.slice(0, 8),
    caller_prefix:   callerId.slice(0, 8),
    new_status:      newStatus,
    sms_attempted:   sms.attempted,
    sms_sent:        sms.attempted ? sms.sent    : false,
    sms_skipped:     sms.attempted ? sms.skipped : false,
  }));

  return jsonReply({ ok: true, order: updatedOrder, sms }, 200, cors);
});