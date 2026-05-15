// supabase/functions/admin-update-order-status/index.ts
// =============================================================================
// Secure server-owned order status transition.
//
// WHY createAnonClient(jwt) FOR THE RPC — NOT supabaseAdmin():
//   update_order_status_secure (or a trigger it fires) reads auth.uid() to
//   write staff_action_logs.staff_id. The service role sets auth.uid() = null
//   in Postgres → NOT NULL constraint violation → 500.
//   createAnonClient(jwt) forwards the staff member's JWT as the Authorization
//   header. PostgREST parses the JWT and sets session claims so auth.uid()
//   resolves to the staff member's UUID. Auth + role are already verified
//   above — using the user-context client here is intentional and correct.
//
// WHY supabaseAdmin() FOR THE SELECT:
//   After the RPC commits the update we need SELECT * to return the full order
//   row to the frontend. Service role is safe for reads and bypasses RLS cleanly.
//
// SMS:
//   dispatchReadySms covers guest opt-in orders (customer_phone = null,
//   guest_phone_e164 set). The DB trigger notify_order_status_change handles
//   orders with customer_phone via pg_net. sms_log unique index on
//   (order_id, event) prevents duplicate sends when both paths run.
//   SMS failure is always non-fatal — the committed status update is returned.
//
// CORS:  corsHeaders / handlePreflight from _shared/cors.ts.
// LOG:   structured JSON, 8-char prefixes for IDs, phone never logged.
// =============================================================================

import { requireAuth, AuthError }            from '../_shared/auth.ts';
import { corsHeaders, handlePreflight }      from '../_shared/cors.ts';
import { supabaseAdmin }                     from '../_shared/supabaseAdmin.ts';
import { createAnonClient, readBearerToken } from '../_shared/supabase.ts';

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
  body:   unknown,
  status: number,
  cors:   Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  });
}

// ─── Internal SMS dispatch ────────────────────────────────────────────────────
//
// Calls send-sms via INTERNAL_FUNCTION_KEY — never exposed to the browser.
// send-sms owns: guest_phone_e164 preference, customer_phone fallback,
// sms_log idempotency, rate limiting, Twilio dispatch.
// All errors caught; returns SmsOutcome — never throws.
// Phone value is never logged here.

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
      return { attempted: true, sent: false, skipped: false, reason: errMsg ?? 'sms_dispatch_failed' };
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

  // Read JWT from headers BEFORE body is consumed.
  // Headers are always available; this cannot conflict with req.json() later.
  // Needed in step 4 to create the user-context client.
  const jwt = readBearerToken(req);

  // ── CORS ───────────────────────────────────────────────────────────────────
  if (req.method === 'OPTIONS') return handlePreflight(req);

  const cors = corsHeaders(req);
  if (!cors) return new Response('Origin not allowed', { status: 403 });

  // ── Method ─────────────────────────────────────────────────────────────────
  if (req.method !== 'POST') {
    return jsonReply({ ok: false, error: 'Method not allowed' }, 405, cors);
  }

  // ── Step 1: Validate JWT ────────────────────────────────────────────────────
  let callerId: string;
  try {
    const user = await requireAuth(req);
    callerId = user.id;
  } catch (err) {
    const status  = err instanceof AuthError ? err.status : 401;
    const message = err instanceof Error    ? err.message : 'Unauthorized';
    return jsonReply({ ok: false, error: message }, status, cors);
  }

  // requireAuth succeeded so jwt is guaranteed non-null; guard for TypeScript.
  if (!jwt) {
    return jsonReply({ ok: false, error: 'Missing bearer token' }, 401, cors);
  }

  // ── Step 2: Role check — admin or staff ─────────────────────────────────────
  //
  // is_admin() RPC checks email LIKE '%@sofisrestaurant.com', not profiles.role.
  // Kitchen staff don't have that email domain and would be blocked.
  // We query profiles.role directly for 'admin' | 'staff'. Fail-closed.

  const svcDb = supabaseAdmin();

  const { data: profile, error: profileError } = await svcDb
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

  // ── Step 3: Parse + validate body ───────────────────────────────────────────
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

  // ── Step 4: Update via user-context RPC ─────────────────────────────────────
  //
  // createAnonClient(jwt) — NOT supabaseAdmin() — because:
  //   The RPC or a trigger it fires inserts into staff_action_logs using
  //   auth.uid() for the staff_id column. Service role = auth.uid() null =
  //   NOT NULL violation = 500. The user-context client forwards the JWT so
  //   Postgres auth.uid() returns the authenticated staff member's UUID.

  const userClient = createAnonClient(jwt);

  const { error: rpcError } = await userClient
    .rpc('update_order_status_secure', {
      order_id:   orderId,
      new_status: newStatus,
    });

  if (rpcError) {
    console.error(JSON.stringify({
      fn:              'admin-update-order-status',
      outcome:         'rpc_failed',
      req:             requestId,
      order_id_prefix: orderId.slice(0, 8),
      error:           rpcError.message,
    }));
    return jsonReply({ ok: false, error: 'Failed to update order status' }, 500, cors);
  }

  // ── Step 5: Fetch full updated row via service role ──────────────────────────
  //
  // The RPC return shape is not guaranteed SELECT *.
  // Fetch the full row so the frontend can sync local state without a second trip.

  const { data: updatedOrder, error: fetchError } = await svcDb
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .maybeSingle();

  if (fetchError || !updatedOrder) {
    console.error(JSON.stringify({
      fn:              'admin-update-order-status',
      outcome:         'fetch_failed_post_rpc',
      req:             requestId,
      order_id_prefix: orderId.slice(0, 8),
      error:           fetchError?.message ?? 'row not found',
    }));
    // RPC committed — return success with minimal order so frontend knows
    // the update went through even if the SELECT failed.
    return jsonReply({
      ok:    true,
      order: { id: orderId, status: newStatus },
      sms:   { attempted: false },
      warn:  'fetch_failed',
    }, 200, cors);
  }

  // ── Step 6: SMS — ready transition only, non-fatal ──────────────────────────
  //
  // dispatchReadySms covers guest opt-in orders (customer_phone IS NULL,
  // guest_phone_e164 set). The DB trigger covers customer_phone orders via
  // pg_net. sms_log unique index prevents duplicate sends either way.
  // SMS failure never rolls back the committed status update.

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