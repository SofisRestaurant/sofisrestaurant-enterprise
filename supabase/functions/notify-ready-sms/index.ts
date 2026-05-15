// supabase/functions/notify-ready-sms/index.ts
// =============================================================================
// Thin authenticated wrapper around send-sms for the order-ready event.
//
// Security model:
//   - Caller must present a valid Supabase JWT (kitchen staff or admin).
//   - INTERNAL_FUNCTION_KEY is resolved server-side and never sent to the
//     browser. The upstream send-sms function requires it.
//   - Only the "ready" event is accepted; all other event strings are rejected
//     before any network call is made.
//   - send-sms is idempotent (sms_log check), so duplicate calls are safe.
//
// Auth: requireAuth from _shared/auth.ts (any authenticated Supabase user).
//   Kitchen staff are authenticated but are not necessarily platform admins,
//   so requireAdmin would incorrectly block them. requireAuth enforces a valid
//   server-validated JWT while leaving role gating to the RLS / RPC layer.
//
// CORS: corsHeaders from _shared/cors.ts (shared allowlist + env override).
// =============================================================================

import { requireAuth, AuthError } from '../_shared/auth.ts';
import { corsHeaders, handlePreflight } from '../_shared/cors.ts';

// ─── Constants ────────────────────────────────────────────────────────────────

const ALLOWED_EVENT = 'ready' as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function jsonReply(
  body: unknown,
  status: number,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
  // ── CORS preflight ──────────────────────────────────────────────────────────
  if (req.method === 'OPTIONS') {
    return handlePreflight(req);
  }

  const cors = corsHeaders(req);
  if (!cors) {
    return new Response('Origin not allowed', { status: 403 });
  }

  // ── Method guard ────────────────────────────────────────────────────────────
  if (req.method !== 'POST') {
    return jsonReply({ ok: false, error: 'Method not allowed' }, 405, cors);
  }

  // ── Auth — any authenticated Supabase user (staff or admin) ────────────────
  let callerId: string;
  try {
    const user = await requireAuth(req);
    callerId = user.id;
  } catch (err) {
    const status = err instanceof AuthError ? err.status : 401;
    const message = err instanceof Error ? err.message : 'Unauthorized';
    return jsonReply({ ok: false, error: message }, status, cors);
  }

  // ── Parse body ──────────────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonReply({ ok: false, error: 'Invalid JSON body' }, 400, cors);
  }

  if (
    typeof body !== 'object' ||
    body === null ||
    Array.isArray(body)
  ) {
    return jsonReply({ ok: false, error: 'Body must be a JSON object' }, 400, cors);
  }

  const record = body as Record<string, unknown>;
  const orderId = record['order_id'];
  const event   = record['event'];

  if (typeof orderId !== 'string' || orderId.trim().length === 0) {
    return jsonReply({ ok: false, error: 'order_id is required and must be a string' }, 400, cors);
  }

  if (event !== ALLOWED_EVENT) {
    return jsonReply(
      { ok: false, error: `Only the "${ALLOWED_EVENT}" event is accepted by this endpoint` },
      400,
      cors,
    );
  }

  // ── Resolve env ─────────────────────────────────────────────────────────────
  const internalKey = Deno.env.get('INTERNAL_FUNCTION_KEY');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');

  if (!internalKey || !supabaseUrl) {
    console.error(JSON.stringify({
      fn:      'notify-ready-sms',
      outcome: 'misconfigured',
      missing: [!internalKey && 'INTERNAL_FUNCTION_KEY', !supabaseUrl && 'SUPABASE_URL'].filter(Boolean),
    }));
    return jsonReply({ ok: false, error: 'Service misconfigured' }, 503, cors);
  }

  // ── Forward to send-sms ─────────────────────────────────────────────────────
  const sendSmsUrl = `${supabaseUrl}/functions/v1/send-sms`;

  let upstreamStatus: number;
  let upstreamBody: unknown;

  try {
    const upstream = await fetch(sendSmsUrl, {
      method:  'POST',
      headers: {
        'Content-Type':   'application/json',
        'x-internal-key': internalKey,
      },
      body: JSON.stringify({ order_id: orderId.trim(), event: ALLOWED_EVENT }),
    });

    upstreamStatus = upstream.status;
    upstreamBody   = await upstream.json().catch(() => ({ ok: false, error: 'upstream parse failed' }));
  } catch (err) {
    console.error(JSON.stringify({
      fn:       'notify-ready-sms',
      outcome:  'upstream_fetch_failed',
      order_id: orderId.slice(0, 8),
      caller:   callerId.slice(0, 8),
      error:    err instanceof Error ? err.message : String(err),
    }));
    return jsonReply({ ok: false, error: 'SMS dispatch failed' }, 502, cors);
  }

  // Log outcome (orderId prefix only — never log the full phone).
  console.log(JSON.stringify({
    fn:              'notify-ready-sms',
    outcome:         'forwarded',
    order_id_prefix: orderId.slice(0, 8),
    caller_prefix:   callerId.slice(0, 8),
    upstream_status: upstreamStatus,
  }));

  return new Response(JSON.stringify(upstreamBody), {
    status:  upstreamStatus,
    headers: { 'Content-Type': 'application/json', ...cors },
  });
});