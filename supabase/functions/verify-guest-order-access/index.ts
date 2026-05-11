// =============================================================================
// supabase/functions/verify-guest-order-access/index.ts
// =============================================================================
// Step 2 of the Find My Order guest order recovery flow.
//
// Accepts: POST { order_number: number | string, contact: string, code: string }
//
// Verifies the 6-digit OTP previously issued by request-guest-order-access.
// On success, returns a stateless HMAC-signed recovery token bound to the
// specific order_id, valid for 4 hours:
//
//   { ok: true, order_id: "...", guest_recovery_token: "expiry:hmac_sig" }
//
// The frontend stores `guest_recovery_token` in sessionStorage under the key
// 'guest_recovery_token' and navigates to /order-status/:order_id.
// get-order-status (step 4 of this feature) accepts this token as a third
// credential path alongside Bearer JWT and checkout_guest_token.
//
// Token format: `${expiry_unix}:${HMAC-SHA256(order_id + ":" + expiry_unix, secret)}`
//   - Self-contained: no DB lookup required at verification time
//   - Bound to a specific order_id: cannot be reused for a different order
//   - Short-lived: 4 hours from issuance
//   - Secret: GUEST_RECOVERY_SECRET env var (≥ 32 chars, distinct from CHECKOUT_CHALLENGE_SECRET)
//
// INVARIANT — ALL code-validation failure paths return the same generic 400.
// The caller cannot distinguish:
//   - Wrong order number       - Wrong contact        - Wrong OTP code
//   - Expired OTP              - Already-consumed OTP - Max attempts reached
//
// Attempt counting:
//   - attempt_count is incremented only on code hash mismatch (not on order
//     lookup failures) — wrong order number does not burn a code attempt.
//   - Rows with attempt_count >= 5 are excluded from the active-code query.
//   - Atomic consume (UPDATE WHERE consumed_at IS NULL, check rows = 1) prevents
//     replay under concurrent requests.
//
// What is NEVER logged or stored:
//   • Raw contact (phone or email)     • Raw OTP code
//   • Issued recovery token            • orders.guest_token
//   • Whether an order was found       • Any Stripe / risk / admin fields
//
// Paired with: ../request-guest-order-access/index.ts  (Step 1)
// Modified in: ../get-order-status/index.ts            (Step 4)
// =============================================================================

import { supabaseAdmin, type AdminClient } from '../_shared/supabaseAdmin.ts';
import { corsHeaders }                      from '../_shared/cors.ts';
import { sha256Hex, signHmac }              from '../_shared/crypto.ts';
import { normalizePhone }                   from '../_shared/twilio.ts';
import {
  asErr,
  log,
  prefix,
  sanitizeRequestId,
} from '../create-checkout/logging.ts';

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_BODY_BYTES = 4_096;
const MAX_ORDER_NUMBER = 99_999_999;

/** Maximum age of a guest order eligible for recovery (mirrors request step). */
const ORDER_LOOKUP_WINDOW_HOURS = 48;

/** Recovery token validity. get-order-status will reject tokens past this. */
const RECOVERY_TOKEN_TTL_SECS = 4 * 60 * 60; // 4 hours

/** OTP is exactly 6 digits. Reject anything that doesn't match after sanitizing. */
const OTP_DIGITS = 6;

/** Maximum failed code attempts per recovery code row before it is locked. */
const MAX_CODE_ATTEMPTS = 5;

// IP rate-limit parameters (guest_rate_limits table — same as request step).
const IP_RATE_WINDOW_MS = 15 * 60 * 1_000;
const IP_RATE_MAX       = 10;
const IP_BLOCK_MS       = 30 * 60 * 1_000;

// ─── Generic failure payload ──────────────────────────────────────────────────
//
// ALL code-validation failure paths return this exact shape.
// It MUST NOT change based on the specific reason for failure.

const INVALID_CODE_BODY = {
  ok:    false as const,
  error: {
    code:    'invalid_or_expired_code',
    message: 'The verification code is incorrect or has expired. Please request a new one.',
  },
} as const;

// ─── Local types ──────────────────────────────────────────────────────────────

type CorsMap     = Record<string, string>;
type ContactKind = 'phone' | 'email';

interface NormalizedContact {
  readonly kind:  ContactKind;
  readonly value: string; // canonical form — never persisted
  readonly hash:  string; // SHA-256(value) — the only form persisted
}

interface RateLimitRow {
  request_count: number;
  window_start:  string;
  blocked_until: string | null;
  overrun_count: number;
}

// ─── Typed accessor for guest_order_recovery_codes ────────────────────────────
//
// database.types.ts does not yet include this table — regenerate to fix permanently:
//   supabase gen types typescript --linked > supabase/functions/_shared/database.types.ts
//
// Uses the identical narrow-cast pattern from verify-phone/challenge-actions.ts
// (checkout_challenges) and request-guest-order-access/index.ts.
// Remove this block once types are regenerated.

interface RecoveryCodeRow {
  id:            string;
  order_id:      string;
  contact_hash:  string;
  code_hash:     string;
  expires_at:    string;
  consumed_at:   string | null;
  attempt_count: number;
  created_at:    string;
}

interface RecoveryCodeInsert {
  order_id:     string;
  contact_hash: string;
  code_hash:    string;
  expires_at:   string;
}

interface RecoveryBuilderResult {
  data:  unknown;
  error: { message: string } | null;
  count: number | null;
}

interface RecoveryQueryBuilder extends PromiseLike<RecoveryBuilderResult> {
  select(cols: string, opts?: { count?: 'exact'; head?: boolean }): RecoveryQueryBuilder;
  update(values: Record<string, unknown>, opts?: { count?: 'exact' }): RecoveryQueryBuilder;
  insert(values: RecoveryCodeInsert): RecoveryQueryBuilder;
  eq(col: string, val: unknown): RecoveryQueryBuilder;
  is(col: string, val: null): RecoveryQueryBuilder;
  gte(col: string, val: string): RecoveryQueryBuilder;
  lt(col: string, val: unknown): RecoveryQueryBuilder;
  order(col: string, opts?: { ascending: boolean }): RecoveryQueryBuilder;
  limit(n: number): RecoveryQueryBuilder;
  maybeSingle(): RecoveryQueryBuilder;
}

function fromRecoveryCodes(db: AdminClient): RecoveryQueryBuilder {
  return (
    db as unknown as {
      from(table: 'guest_order_recovery_codes'): RecoveryQueryBuilder;
    }
  ).from('guest_order_recovery_codes');
}

// ─── Response helpers ─────────────────────────────────────────────────────────

function jsonResp(
  body:      unknown,
  status:    number,
  cors:      CorsMap,
  requestId: string,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type':           'application/json; charset=utf-8',
      'Cache-Control':          'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Request-Id':           requestId,
      ...cors,
    },
  });
}

function errResp(
  code:      string,
  message:   string,
  status:    number,
  cors:      CorsMap,
  requestId: string,
): Response {
  return jsonResp({ ok: false, error: { code, message, requestId } }, status, cors, requestId);
}

/**
 * Generic "code wrong or expired" response.
 * Used on ALL code-validation failures — never reveals the specific reason.
 */
function invalidCodeResp(cors: CorsMap, requestId: string): Response {
  return jsonResp({ ...INVALID_CODE_BODY, requestId }, 400, cors, requestId);
}

// ─── Input helpers ────────────────────────────────────────────────────────────

function parseOrderNumber(v: unknown): number | null {
  let n: number;
  if (typeof v === 'number') {
    n = v;
  } else if (typeof v === 'string') {
    const t = v.trim();
    if (!/^\d{1,8}$/.test(t)) return null;
    n = parseInt(t, 10);
  } else {
    return null;
  }
  if (!Number.isInteger(n) || n <= 0 || n > MAX_ORDER_NUMBER) return null;
  return n;
}

/** Strips non-digits, zero-pads to 6, validates length. Returns null on bad input. */
function sanitizeOtp(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length !== OTP_DIGITS) return null;
  return digits.padStart(OTP_DIGITS, '0');
}

function isPlausibleEmail(s: string): boolean {
  return s.length >= 5 && s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
}

function clientIp(req: Request): string {
  return (
    req.headers.get('CF-Connecting-IP') ??
    req.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ??
    'unknown'
  );
}

/**
 * Constant-time string comparison.
 * Used for code_hash comparison to prevent timing side-channels.
 * Both inputs are expected to be lowercase hex strings of the same length;
 * the early-exit length check on differing lengths is safe since hashes of
 * the same algorithm always produce the same length output.
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// ─── Contact normalization (mirrors request-guest-order-access exactly) ───────

async function resolveContact(raw: string): Promise<NormalizedContact | null> {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 254) return null;

  const phone = normalizePhone(trimmed);
  if (phone !== null) {
    return { kind: 'phone', value: phone, hash: await sha256Hex(phone) };
  }

  const email = trimmed.toLowerCase();
  if (isPlausibleEmail(email)) {
    return { kind: 'email', value: email, hash: await sha256Hex(email) };
  }

  return null;
}

// ─── Recovery secret ──────────────────────────────────────────────────────────

interface SecretOk  { ok: true;  secret: string }
interface SecretErr { ok: false; missing: string }
type SecretResult = SecretOk | SecretErr;

/**
 * Loads GUEST_RECOVERY_SECRET from env.
 * Must be ≥ 32 chars and distinct from CHECKOUT_CHALLENGE_SECRET.
 * Returns { ok: false } rather than throwing — caller handles misconfiguration.
 */
function loadRecoverySecret(): SecretResult {
  const raw = Deno.env.get('GUEST_RECOVERY_SECRET')?.trim();
  if (!raw || raw.length < 32) {
    return { ok: false, missing: 'GUEST_RECOVERY_SECRET (must be ≥ 32 chars)' };
  }
  return { ok: true, secret: raw };
}

// ─── Token issuance ───────────────────────────────────────────────────────────

/**
 * Issues a stateless HMAC-signed recovery token for the given order.
 *
 * Token format: `${expiry_unix}:${sig}`
 *   expiry_unix — decimal Unix seconds, 4 hours from now
 *   sig         — HMAC-SHA256(order_id + ":" + expiry_unix, GUEST_RECOVERY_SECRET)
 *                 lowercase hex, never contains ':'
 *
 * get-order-status verifies by:
 *   1. Split on first ':' → expiry_unix, sig
 *   2. Check expiry_unix > Math.floor(Date.now() / 1000)
 *   3. verifyHmac(order_id + ":" + expiry_unix, sig, GUEST_RECOVERY_SECRET)
 *
 * Binding: the order_id is included in the HMAC message, so this token cannot
 * be reused to access a different order even if the secret is known.
 *
 * The token is returned to the client and NEVER logged or stored server-side.
 */
async function issueRecoveryToken(orderId: string, secret: string): Promise<string> {
  const expiry = Math.floor(Date.now() / 1000) + RECOVERY_TOKEN_TTL_SECS;
  const sig    = await signHmac(`${orderId}:${expiry}`, secret);
  return `${expiry}:${sig}`;
}

// ─── IP rate limiting (mirrors request-guest-order-access exactly) ────────────

async function isIpRateLimited(
  db:        AdminClient,
  ip:        string,
  requestId: string,
): Promise<boolean> {
  const ipHash = await sha256Hex(ip);
  const now    = new Date();
  const nowIso = now.toISOString();

  try {
    const { data: rowRaw } = await db
      .from('guest_rate_limits')
      .select('request_count, window_start, blocked_until, overrun_count')
      .eq('ip_hash', ipHash)
      .maybeSingle();

    const row = rowRaw as RateLimitRow | null;

    if (row !== null) {
      if (row.blocked_until !== null && new Date(row.blocked_until) > now) {
        log('warn', 'verify_guest_order_access_ip_hard_blocked', {
          requestId,
          ip_hash_prefix: ipHash.slice(0, 8),
        });
        return true;
      }

      const windowAge    = now.getTime() - new Date(row.window_start).getTime();
      const windowActive = windowAge <= IP_RATE_WINDOW_MS;

      if (windowActive && row.request_count >= IP_RATE_MAX) {
        const blockedUntil = new Date(now.getTime() + IP_BLOCK_MS).toISOString();
        await db
          .from('guest_rate_limits')
          .update({
            overrun_count: (row.overrun_count ?? 0) + 1,
            blocked_until:  blockedUntil,
            updated_at:     nowIso,
          })
          .eq('ip_hash', ipHash);
        log('warn', 'verify_guest_order_access_ip_rate_limit_applied', {
          requestId,
          ip_hash_prefix: ipHash.slice(0, 8),
          overrun_count:  (row.overrun_count ?? 0) + 1,
        });
        return true;
      }

      const newCount       = windowActive ? row.request_count + 1 : 1;
      const newWindowStart = windowActive ? row.window_start : nowIso;
      await db
        .from('guest_rate_limits')
        .update({
          request_count: newCount,
          window_start:  newWindowStart,
          blocked_until: null,
          updated_at:    nowIso,
        })
        .eq('ip_hash', ipHash);
    } else {
      await db.from('guest_rate_limits').insert({
        ip_hash:       ipHash,
        request_count: 1,
        window_start:  nowIso,
        overrun_count: 0,
        updated_at:    nowIso,
      });
    }

    return false;
  } catch (err) {
    log('warn', 'verify_guest_order_access_ip_rate_check_failed', {
      requestId,
      error: asErr(err),
    });
    return false; // fail open
  }
}

// ─── Order lookup (mirrors request-guest-order-access exactly) ────────────────

/**
 * Finds the UUID of a recent guest order matching order_number + contact.
 * Returns null on any non-match or error — caller returns generic failure.
 *
 * Using customer_uid IS NULL as the guest-order signal (more robust than
 * source='guest' for legacy rows).
 */
async function findGuestOrderId(
  db:          AdminClient,
  orderNumber: number,
  contact:     NormalizedContact,
  requestId:   string,
): Promise<string | null> {
  const cutoff = new Date(
    Date.now() - ORDER_LOOKUP_WINDOW_HOURS * 3_600_000,
  ).toISOString();

  try {
    if (contact.kind === 'phone') {
      const { data, error } = await db
        .from('orders')
        .select('id')
        .eq('order_number', orderNumber)
        .is('customer_uid', null)
        .eq('customer_phone', contact.value)
        .neq('status', 'cancelled')
        .gte('created_at', cutoff)
        .limit(1)
        .maybeSingle();

      if (error) {
        log('error', 'verify_guest_order_access_phone_lookup_error', {
          requestId,
          error: asErr(error),
        });
        return null;
      }
      return (data as { id: string } | null)?.id ?? null;
    }

    // Email: probe guest_email first, then customer_email (two separate queries
    // to avoid PostgREST .or() escaping hazards with arbitrary email chars).

    const { data: byGuestEmail, error: guestEmailErr } = await db
      .from('orders')
      .select('id')
      .eq('order_number', orderNumber)
      .is('customer_uid', null)
      .ilike('guest_email', contact.value)
      .neq('status', 'cancelled')
      .gte('created_at', cutoff)
      .limit(1)
      .maybeSingle();

    if (guestEmailErr) {
      log('error', 'verify_guest_order_access_guest_email_lookup_error', {
        requestId,
        error: asErr(guestEmailErr),
      });
      return null;
    }

    const guestEmailId = (byGuestEmail as { id: string } | null)?.id;
    if (guestEmailId) return guestEmailId;

    const { data: byCustomerEmail, error: customerEmailErr } = await db
      .from('orders')
      .select('id')
      .eq('order_number', orderNumber)
      .is('customer_uid', null)
      .ilike('customer_email', contact.value)
      .neq('status', 'cancelled')
      .gte('created_at', cutoff)
      .limit(1)
      .maybeSingle();

    if (customerEmailErr) {
      log('error', 'verify_guest_order_access_customer_email_lookup_error', {
        requestId,
        error: asErr(customerEmailErr),
      });
      return null;
    }

    return (byCustomerEmail as { id: string } | null)?.id ?? null;
  } catch (err) {
    log('error', 'verify_guest_order_access_lookup_exception', {
      requestId,
      error: asErr(err),
    });
    return null;
  }
}

// ─── Recovery code lookup ─────────────────────────────────────────────────────

/**
 * Finds the most recently issued active recovery code for the given
 * order + contact combination.
 *
 * "Active" means:
 *   - consumed_at IS NULL            (not already spent)
 *   - expires_at > now()             (within 10-minute window)
 *   - attempt_count < MAX_CODE_ATTEMPTS (not locked by failed attempts)
 *
 * Returns null if no qualifying row exists.
 * All errors are swallowed — caller returns generic failure.
 */
async function findActiveRecoveryCode(
  db:          AdminClient,
  orderId:     string,
  contactHash: string,
  requestId:   string,
): Promise<RecoveryCodeRow | null> {
  const nowIso = new Date().toISOString();

  try {
    const result = await fromRecoveryCodes(db)
      .select('id, order_id, code_hash, attempt_count')
      .eq('order_id', orderId)
      .eq('contact_hash', contactHash)
      .is('consumed_at', null)
      .gte('expires_at', nowIso)
      .lt('attempt_count', MAX_CODE_ATTEMPTS)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (result.error) {
      log('error', 'verify_guest_order_access_code_lookup_error', {
        requestId,
        order_id_prefix: prefix(orderId),
        error: asErr(result.error),
      });
      return null;
    }

    return (result.data as RecoveryCodeRow | null) ?? null;
  } catch (err) {
    log('error', 'verify_guest_order_access_code_lookup_exception', {
      requestId,
      error: asErr(err),
    });
    return null;
  }
}

// ─── Attempt increment ────────────────────────────────────────────────────────

/**
 * Increments attempt_count on a recovery code row after a wrong-code submission.
 *
 * Uses the current count from the already-fetched row (Supabase JS SDK does not
 * support SQL expressions in update values). TOCTOU is benign: two concurrent
 * wrong-code requests both increment to the same value; the limit still holds.
 *
 * Failures are logged but do not change the caller's generic error response.
 */
async function incrementAttemptCount(
  db:        AdminClient,
  row:       RecoveryCodeRow,
  requestId: string,
): Promise<void> {
  try {
    const { error } = await fromRecoveryCodes(db)
      .update({ attempt_count: row.attempt_count + 1 })
      .eq('id', row.id);

    if (error) {
      log('warn', 'verify_guest_order_access_attempt_increment_failed', {
        requestId,
        order_id_prefix: prefix(row.order_id),
        error: asErr(error),
      });
    }
  } catch (err) {
    log('warn', 'verify_guest_order_access_attempt_increment_exception', {
      requestId,
      error: asErr(err),
    });
  }
}

// ─── Atomic consume ───────────────────────────────────────────────────────────

/**
 * Atomically marks a recovery code row as consumed.
 *
 * Uses a conditional UPDATE: WHERE id = $id AND consumed_at IS NULL.
 * If count = 1 → this request won, proceed to issue the token.
 * If count = 0 → a concurrent request already consumed the code (replay attack
 *                or double-click); reject with the generic error.
 *
 * Returns true if the consume succeeded (this request won the race).
 */
async function atomicConsume(
  db:        AdminClient,
  rowId:     string,
  orderId:   string,
  requestId: string,
): Promise<boolean> {
  const nowIso = new Date().toISOString();

  try {
    const result = await fromRecoveryCodes(db)
      .update({ consumed_at: nowIso }, { count: 'exact' })
      .eq('id', rowId)
      .is('consumed_at', null); // ensures no row matches if already consumed

    if (result.error) {
      log('error', 'verify_guest_order_access_consume_error', {
        requestId,
        order_id_prefix: prefix(orderId),
        error: asErr(result.error),
      });
      return false;
    }

    const rowsUpdated = result.count ?? 0;

    if (rowsUpdated === 0) {
      // Race: another concurrent request consumed this row first.
      log('warn', 'verify_guest_order_access_consume_race', {
        requestId,
        order_id_prefix: prefix(orderId),
      });
      return false;
    }

    return true;
  } catch (err) {
    log('error', 'verify_guest_order_access_consume_exception', {
      requestId,
      order_id_prefix: prefix(orderId),
      error: asErr(err),
    });
    return false;
  }
}

// ─── Core handler ─────────────────────────────────────────────────────────────

async function handleRequest(
  req:       Request,
  cors:      CorsMap | null,
  requestId: string,
): Promise<Response> {
  // ── Origin gate ────────────────────────────────────────────────────────────
  if (!cors) {
    return new Response(
      JSON.stringify({ ok: false, error: { code: 'origin_not_allowed', message: 'Origin not allowed.' } }),
      { status: 403, headers: { 'Content-Type': 'application/json', Vary: 'Origin' } },
    );
  }

  // ── Method ──────────────────────────────────────────────────────────────────
  if (req.method !== 'POST') {
    return errResp('method_not_allowed', 'Method not allowed.', 405, cors, requestId);
  }

  // ── Content-Type ────────────────────────────────────────────────────────────
  const ct = req.headers.get('content-type')?.toLowerCase() ?? '';
  if (!ct.includes('application/json')) {
    return errResp('unsupported_content_type', 'Content-Type must be application/json.', 415, cors, requestId);
  }

  // ── Body read ────────────────────────────────────────────────────────────────
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

  // ── Validate order_number ───────────────────────────────────────────────────
  const orderNumber = parseOrderNumber(body.order_number);
  if (orderNumber === null) {
    return errResp('invalid_order_number', 'order_number must be a positive integer.', 400, cors, requestId);
  }

  // ── Validate contact ─────────────────────────────────────────────────────────
  const rawContact = body.contact;
  if (typeof rawContact !== 'string' || rawContact.trim().length < 3) {
    return errResp('invalid_contact', 'A valid phone number or email address is required.', 400, cors, requestId);
  }

  const contact = await resolveContact(rawContact);
  if (contact === null) {
    return errResp('invalid_contact', 'A valid phone number or email address is required.', 400, cors, requestId);
  }

  // ── Validate and sanitize code ───────────────────────────────────────────────
  // Strip non-digits, validate exactly 6 digits.
  const otpSanitized = sanitizeOtp(body.code);
  if (otpSanitized === null) {
    return errResp('invalid_code', 'code must be a 6-digit number.', 400, cors, requestId);
  }

  // ── Load recovery secret — fail fast ────────────────────────────────────────
  const secretResult = loadRecoverySecret();
  if (!secretResult.ok) {
    log('error', 'verify_guest_order_access_secret_missing', {
      requestId,
      missing: secretResult.missing,
    });
    return errResp('service_unavailable', 'Service temporarily unavailable.', 503, cors, requestId);
  }
  const secret = secretResult.secret;

  // ── DB client ───────────────────────────────────────────────────────────────
  const db = supabaseAdmin();

  // ── IP rate limit ───────────────────────────────────────────────────────────
  const ip = clientIp(req);
  if (await isIpRateLimited(db, ip, requestId)) {
    return errResp('rate_limited', 'Too many requests. Please try again later.', 429, cors, requestId);
  }

  // ── Hash code immediately ────────────────────────────────────────────────────
  // The raw OTP string is hashed here and never referenced again after this point.
  // All comparisons use codeHash — the raw value goes out of scope.
  const codeHash = await sha256Hex(otpSanitized);
  // otpSanitized is no longer used beyond this point.

  // ── Order lookup ─────────────────────────────────────────────────────────────
  // Verify the caller knows both the order number AND the contact before touching
  // the recovery code table. Wrong order number does NOT increment attempt_count
  // — it is not a code attempt.
  const orderId = await findGuestOrderId(db, orderNumber, contact, requestId);

  if (orderId === null) {
    // Log: contact kind but NOT contact value, order number length but NOT value.
    log('info', 'verify_guest_order_access_order_not_found', {
      requestId,
      order_number_length: String(orderNumber).length,
      contact_kind:        contact.kind,
    });
    return invalidCodeResp(cors, requestId);
  }

  // ── Find active recovery code row ─────────────────────────────────────────────
  const codeRow = await findActiveRecoveryCode(db, orderId, contact.hash, requestId);

  if (codeRow === null) {
    // No active code: expired, already consumed, max attempts, or never issued.
    // All cases are indistinguishable to the caller.
    log('info', 'verify_guest_order_access_no_active_code', {
      requestId,
      order_id_prefix: prefix(orderId),
    });
    return invalidCodeResp(cors, requestId);
  }

  // ── Constant-time code hash comparison ───────────────────────────────────────
  // Both sides are lowercase hex SHA-256 strings (64 chars).
  // constantTimeEqual prevents timing side-channels on the hash comparison.
  if (!constantTimeEqual(codeHash, codeRow.code_hash)) {
    // Wrong code: increment attempt counter, then return generic error.
    // The increment happens AFTER the comparison so the timing difference
    // between "found a row" and "found a row with wrong code" is a single async
    // DB write — acceptable given the attempt limit and IP rate limiting.
    await incrementAttemptCount(db, codeRow, requestId);
    log('info', 'verify_guest_order_access_wrong_code', {
      requestId,
      order_id_prefix:  prefix(orderId),
      attempt_count:    codeRow.attempt_count + 1,
    });
    return invalidCodeResp(cors, requestId);
  }

  // ── Atomic consume ────────────────────────────────────────────────────────────
  // UPDATE WHERE consumed_at IS NULL ensures exactly one concurrent request wins.
  // If count = 0, this code was already consumed (replay attempt or double-click).
  const consumed = await atomicConsume(db, codeRow.id, orderId, requestId);
  if (!consumed) {
    return invalidCodeResp(cors, requestId);
  }

  // ── Issue recovery token ──────────────────────────────────────────────────────
  // Token is generated in memory and returned to the client.
  // It is NEVER logged or stored server-side in any form.
  const recoveryToken = await issueRecoveryToken(orderId, secret);

  log('info', 'verify_guest_order_access_success', {
    requestId,
    order_id_prefix: prefix(orderId),
    contact_kind:    contact.kind,
    // Token is NOT logged — only its existence and the order prefix.
  });

  return jsonResp(
    {
      ok:                   true,
      order_id:             orderId,
      guest_recovery_token: recoveryToken,
    },
    200,
    cors,
    requestId,
  );
}

// ─── Entry point ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
  const cors      = corsHeaders(req);
  const requestId = sanitizeRequestId(req.headers.get('x-request-id'));

  // ── CORS preflight ─────────────────────────────────────────────────────────
  if (req.method === 'OPTIONS') {
    if (!cors) return new Response('Origin not allowed', { status: 403 });
    return new Response(null, { status: 204, headers: cors });
  }

  // ── Outer try/catch ────────────────────────────────────────────────────────
  // Prevents any uncaught exception from escaping Deno.serve() before CORS
  // headers are written. Pattern taken from verify-phone/index.ts.
  try {
    return await handleRequest(req, cors, requestId);
  } catch (err) {
    log('error', 'verify_guest_order_access_unhandled_exception', {
      requestId,
      error: asErr(err),
    });
    const fallback: CorsMap = cors ?? {};
    return new Response(
      JSON.stringify({
        ok:    false,
        error: { code: 'internal_error', message: 'Internal server error.', requestId },
      }),
      {
        status:  500,
        headers: {
          'Content-Type':  'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Request-Id':  requestId,
          ...fallback,
        },
      },
    );
  }
});