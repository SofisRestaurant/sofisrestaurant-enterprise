// =============================================================================
// supabase/functions/get-guest-order-summary/index.ts
// =============================================================================
// Low-friction guest order status lookup.
// No auth token, no OTP, no recovery token issued.
//
// Accepts:
//   POST { order_number: number | string, email: string }
//
// Returns on match:
//   { ok: true, found: true, order: { ...safe fields... } }
//
// Returns on no match:
//   { ok: true, found: false }
//
// Returns on bad input:
//   HTTP 400 { ok: false, error: { code, message, requestId } }
//
// Returns on rate limit:
//   HTTP 429
//
// Security contract:
//   - Does NOT return order id.
//   - Does NOT return customer email.
//   - Does NOT return phone.
//   - Does NOT return totals.
//   - Does NOT return Stripe IDs.
//   - Does NOT return cart items.
//   - Does NOT return notes.
//   - Does NOT issue any token.
//   - Does NOT write to sessionStorage.
//   - Does NOT require Supabase Auth.
//   - No database schema change required.
//
// Anti-enumeration:
//   - Wrong order number, wrong email, old order, no order, and DB lookup errors
//     all return: HTTP 200 { ok: true, found: false }.
//   - Only invalid input and rate limits return distinct errors.
//
// Email matching:
//   - Input email is trimmed + lowercased.
//   - Query uses escaped ILIKE with no wildcard characters.
//   - This gives case-insensitive exact matching without allowing `%` or `_`
//     to act as wildcards.
//
// Safe returned fields only:
//   order_number, status, payment_status, fulfillment_type,
//   pickup_time, created_at, updated_at
// =============================================================================

import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { sha256Hex } from '../_shared/crypto.ts';

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_BODY_BYTES = 4_096;
const MAX_ORDER_NUMBER = 99_999_999;

// 7 days is reasonable because this endpoint returns only limited safe fields.
const ORDER_LOOKUP_WINDOW_HOURS = 168;

// IP rate limit.
const IP_RATE_WINDOW_MS = 15 * 60 * 1_000; // 15 minutes
const IP_RATE_MAX = 10;
const IP_BLOCK_MS = 30 * 60 * 1_000; // 30 minutes

const SAFE_SELECT_COLUMNS = [
  'order_number',
  'status',
  'payment_status',
  'fulfillment_type',
  'pickup_time',
  'created_at',
  'updated_at',
].join(', ');

// Keep broad enough to match common existing order payment states.
// If your database only uses "paid", this still works.
const ACCEPTED_PAYMENT_STATUSES = ['paid', 'succeeded', 'complete', 'completed'];

// ─── Types ────────────────────────────────────────────────────────────────────

type CorsMap = Record<string, string>;
type AdminClient = ReturnType<typeof supabaseAdmin>;

interface RateLimitRow {
  request_count: number;
  window_start: string;
  blocked_until: string | null;
  overrun_count: number | null;
}

export interface SafeOrderSummary {
  order_number: number;
  status: string;
  payment_status: string;
  fulfillment_type: string | null;
  pickup_time: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Logging helpers ──────────────────────────────────────────────────────────

function asErr(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: err.stack,
    };
  }

  return {
    message: String(err),
  };
}

function log(
  level: 'info' | 'warn' | 'error',
  event: string,
  meta: Record<string, unknown> = {},
): void {
  const payload = {
    level,
    event,
    ...meta,
  };

  if (level === 'error') {
    console.error(JSON.stringify(payload));
    return;
  }

  if (level === 'warn') {
    console.warn(JSON.stringify(payload));
    return;
  }

  console.log(JSON.stringify(payload));
}

function sanitizeRequestId(raw: string | null): string {
  const value = raw?.trim() ?? '';

  if (/^[a-zA-Z0-9._:-]{8,120}$/.test(value)) {
    return value;
  }

  try {
    return crypto.randomUUID();
  } catch {
    return `req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

// ─── Response helpers ─────────────────────────────────────────────────────────

function jsonResp(
  body: unknown,
  status: number,
  cors: CorsMap,
  requestId: string,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Request-Id': requestId,
      ...cors,
    },
  });
}

function errResp(
  code: string,
  message: string,
  status: number,
  cors: CorsMap,
  requestId: string,
): Response {
  return jsonResp(
    {
      ok: false,
      error: {
        code,
        message,
        requestId,
      },
    },
    status,
    cors,
    requestId,
  );
}

function notFoundResp(cors: CorsMap, requestId: string): Response {
  return jsonResp({ ok: true, found: false }, 200, cors, requestId);
}

// ─── Input helpers ────────────────────────────────────────────────────────────

function parseOrderNumber(value: unknown): number | null {
  let parsed: number;

  if (typeof value === 'number') {
    parsed = value;
  } else if (typeof value === 'string') {
    const trimmed = value.trim();

    if (!/^\d{1,8}$/.test(trimmed)) {
      return null;
    }

    parsed = Number.parseInt(trimmed, 10);
  } else {
    return null;
  }

  if (!Number.isInteger(parsed)) {
    return null;
  }

  if (parsed <= 0 || parsed > MAX_ORDER_NUMBER) {
    return null;
  }

  return parsed;
}

function normalizeEmail(raw: string): string | null {
  const normalized = raw.trim().toLowerCase();

  if (normalized.length < 5 || normalized.length > 254) {
    return null;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalized)) {
    return null;
  }

  return normalized;
}

/**
 * Escape special ILIKE wildcard characters.
 * This prevents `%` and `_` from becoming pattern wildcards.
 */
function escapeIlikePattern(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('%', '\\%')
    .replaceAll('_', '\\_');
}

function clientIp(req: Request): string {
  return (
    req.headers.get('CF-Connecting-IP') ??
    req.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ??
    req.headers.get('X-Real-IP') ??
    'unknown'
  );
}

function safeString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function safeNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function safeOrderNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

// ─── IP rate limiting ─────────────────────────────────────────────────────────

async function isIpRateLimited(
  db: AdminClient,
  ip: string,
  requestId: string,
): Promise<boolean> {
  const ipHash = await sha256Hex(ip);
  const now = new Date();
  const nowIso = now.toISOString();

  try {
    const { data: rowRaw, error: selectError } = await db
      .from('guest_rate_limits')
      .select('request_count, window_start, blocked_until, overrun_count')
      .eq('ip_hash', ipHash)
      .maybeSingle();

    if (selectError) {
      log('warn', 'get_guest_order_summary_rate_select_failed', {
        requestId,
        error: asErr(selectError),
      });
      return false;
    }

    const row = rowRaw as RateLimitRow | null;

    if (row) {
      if (row.blocked_until && new Date(row.blocked_until) > now) {
        log('warn', 'get_guest_order_summary_ip_blocked', {
          requestId,
          ip_hash_prefix: ipHash.slice(0, 8),
        });
        return true;
      }

      const windowStartMs = new Date(row.window_start).getTime();
      const windowAgeMs = now.getTime() - windowStartMs;
      const windowActive = Number.isFinite(windowAgeMs) && windowAgeMs <= IP_RATE_WINDOW_MS;

      if (windowActive && row.request_count >= IP_RATE_MAX) {
        const blockedUntil = new Date(now.getTime() + IP_BLOCK_MS).toISOString();

        const { error: blockError } = await db
          .from('guest_rate_limits')
          .update({
            overrun_count: (row.overrun_count ?? 0) + 1,
            blocked_until: blockedUntil,
            updated_at: nowIso,
          })
          .eq('ip_hash', ipHash);

        if (blockError) {
          log('warn', 'get_guest_order_summary_rate_block_update_failed', {
            requestId,
            error: asErr(blockError),
          });
        }

        log('warn', 'get_guest_order_summary_rate_limited', {
          requestId,
          ip_hash_prefix: ipHash.slice(0, 8),
        });

        return true;
      }

      const nextCount = windowActive ? row.request_count + 1 : 1;
      const nextWindowStart = windowActive ? row.window_start : nowIso;

      const { error: updateError } = await db
        .from('guest_rate_limits')
        .update({
          request_count: nextCount,
          window_start: nextWindowStart,
          blocked_until: null,
          updated_at: nowIso,
        })
        .eq('ip_hash', ipHash);

      if (updateError) {
        log('warn', 'get_guest_order_summary_rate_update_failed', {
          requestId,
          error: asErr(updateError),
        });
      }

      return false;
    }

    const { error: insertError } = await db.from('guest_rate_limits').insert({
      ip_hash: ipHash,
      request_count: 1,
      window_start: nowIso,
      overrun_count: 0,
      blocked_until: null,
      updated_at: nowIso,
    });

    if (insertError) {
      log('warn', 'get_guest_order_summary_rate_insert_failed', {
        requestId,
        error: asErr(insertError),
      });
    }

    return false;
  } catch (err) {
    log('warn', 'get_guest_order_summary_rate_exception', {
      requestId,
      error: asErr(err),
    });

    // Fail open. A transient rate-limit storage issue should not block customers.
    return false;
  }
}

// ─── Order lookup ─────────────────────────────────────────────────────────────

async function findGuestOrderSummary(
  db: AdminClient,
  orderNumber: number,
  normalizedEmail: string,
  requestId: string,
): Promise<SafeOrderSummary | null> {
  const cutoffIso = new Date(
    Date.now() - ORDER_LOOKUP_WINDOW_HOURS * 60 * 60 * 1_000,
  ).toISOString();

  const escapedEmailPattern = escapeIlikePattern(normalizedEmail);

  try {
    let query = db
      .from('orders')
      .select(SAFE_SELECT_COLUMNS)
      .eq('order_number', orderNumber)
      .is('customer_uid', null)
      .ilike('customer_email', escapedEmailPattern)
      .gte('created_at', cutoffIso)
      .order('created_at', { ascending: false })
      .limit(1);

    // Do not exclude canceled orders. A customer should be able to see if the
    // order was canceled. Only require a confirmed payment-like status if present.
    query = query.in('payment_status', ACCEPTED_PAYMENT_STATUSES);

    const { data, error } = await query.maybeSingle();

    if (error) {
      log('error', 'get_guest_order_summary_db_error', {
        requestId,
        error: asErr(error),
      });
      return null;
    }

    if (!data) {
      return null;
    }

    const row = data as unknown as Record<string, unknown>;

    return {
      order_number: safeOrderNumber(row.order_number),
      status: safeString(row.status, 'unknown'),
      payment_status: safeString(row.payment_status, 'unknown'),
      fulfillment_type: safeNullableString(row.fulfillment_type),
      pickup_time: safeNullableString(row.pickup_time),
      created_at: safeString(row.created_at),
      updated_at: safeString(row.updated_at),
    };
  } catch (err) {
    log('error', 'get_guest_order_summary_lookup_exception', {
      requestId,
      error: asErr(err),
    });

    return null;
  }
}

// ─── Core handler ─────────────────────────────────────────────────────────────

async function handleRequest(
  req: Request,
  cors: CorsMap | null,
  requestId: string,
): Promise<Response> {
  if (!cors) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: {
          code: 'origin_not_allowed',
          message: 'Origin not allowed.',
          requestId,
        },
      }),
      {
        status: 403,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Request-Id': requestId,
          Vary: 'Origin',
        },
      },
    );
  }

  if (req.method !== 'POST') {
    return errResp('method_not_allowed', 'Method not allowed.', 405, cors, requestId);
  }

  const contentType = req.headers.get('content-type')?.toLowerCase() ?? '';

  if (!contentType.includes('application/json')) {
    return errResp(
      'unsupported_content_type',
      'Content-Type must be application/json.',
      415,
      cors,
      requestId,
    );
  }

  let rawBody: unknown;

  try {
    const buffer = await req.arrayBuffer();

    if (buffer.byteLength === 0) {
      return errResp('empty_body', 'Request body is required.', 400, cors, requestId);
    }

    if (buffer.byteLength > MAX_BODY_BYTES) {
      return errResp('body_too_large', 'Request body too large.', 413, cors, requestId);
    }

    rawBody = JSON.parse(new TextDecoder().decode(buffer));
  } catch {
    return errResp('invalid_json', 'Invalid JSON.', 400, cors, requestId);
  }

  if (typeof rawBody !== 'object' || rawBody === null || Array.isArray(rawBody)) {
    return errResp('invalid_body', 'Body must be a JSON object.', 400, cors, requestId);
  }

  const body = rawBody as Record<string, unknown>;

  const orderNumber = parseOrderNumber(body.order_number);

  if (orderNumber === null) {
    return errResp(
      'invalid_order_number',
      'Enter a valid order number.',
      400,
      cors,
      requestId,
    );
  }

  if (typeof body.email !== 'string') {
    return errResp('invalid_email', 'Enter a valid email address.', 400, cors, requestId);
  }

  const normalizedEmail = normalizeEmail(body.email);

  if (normalizedEmail === null) {
    return errResp('invalid_email', 'Enter a valid email address.', 400, cors, requestId);
  }

  const db = supabaseAdmin();
  const ip = clientIp(req);

  if (await isIpRateLimited(db, ip, requestId)) {
    return errResp(
      'rate_limited',
      'Too many attempts. Please try again later.',
      429,
      cors,
      requestId,
    );
  }

  const summary = await findGuestOrderSummary(db, orderNumber, normalizedEmail, requestId);

  if (summary === null) {
    log('info', 'get_guest_order_summary_not_found', {
      requestId,
      order_number_digits: String(orderNumber).length,
    });

    return notFoundResp(cors, requestId);
  }

  log('info', 'get_guest_order_summary_found', {
    requestId,
    status: summary.status,
    payment_status: summary.payment_status,
  });

  return jsonResp(
    {
      ok: true,
      found: true,
      order: summary,
    },
    200,
    cors,
    requestId,
  );
}

// ─── Entry point ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
  const cors = corsHeaders(req);
  const requestId = sanitizeRequestId(req.headers.get('x-request-id'));

  if (req.method === 'OPTIONS') {
    if (!cors) {
      return new Response('Origin not allowed', {
        status: 403,
        headers: {
          'X-Request-Id': requestId,
          Vary: 'Origin',
        },
      });
    }

    return new Response(null, {
      status: 204,
      headers: {
        ...cors,
        'Cache-Control': 'no-store',
        'X-Request-Id': requestId,
      },
    });
  }

  try {
    return await handleRequest(req, cors, requestId);
  } catch (err) {
    log('error', 'get_guest_order_summary_unhandled_exception', {
      requestId,
      error: asErr(err),
    });

    const fallbackCors = cors ?? {};

    return new Response(
      JSON.stringify({
        ok: false,
        error: {
          code: 'internal_error',
          message: 'Internal server error.',
          requestId,
        },
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
          'X-Request-Id': requestId,
          ...fallbackCors,
        },
      },
    );
  }
});