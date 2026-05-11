// =============================================================================
// supabase/functions/request-guest-order-access/index.ts
// =============================================================================
// Step 1 of the Find My Order guest order recovery flow.
//
// Accepts: POST { order_number: number | string, contact: string }
//   where contact is a phone number (E.164 or local US format) or email address.
//
// INVARIANT — this function NEVER reveals whether an order exists or whether
// a contact matched. ALL non-error paths return the same generic 200 payload.
// An attacker who submits a valid order_number with the wrong contact receives
// an identical response to one who submits a non-existent order_number.
//
// Internal flow (all branches converge on the same generic success response):
//   1. Parse and validate inputs (order_number, contact)
//   2. Normalize contact → canonical form + SHA-256 hash
//   3. Rate-limit by IP  (guest_rate_limits table  → 429 on breach)
//   4. Rate-limit by contact hash  (recovery_codes count → silent 200 on breach)
//   5. Look up a matching recent guest order  (silent on miss)
//   6. Guard: max active codes already issued for this order  (silent 200)
//   7. Generate a cryptographically random 6-digit OTP
//   8. Store SHA-256(otp) in guest_order_recovery_codes — raw OTP never stored
//   9. Deliver via Twilio Verify SMS (phone) or skip silently (email – no sender yet)
//  10. Return generic success
//
// What is NEVER logged or stored:
//   • Raw contact value (phone or email)          • Raw OTP code
//   • orders.guest_token                          • Any Stripe IDs / risk fields
//   • Whether an order was found                  • Sensitive order contents
//
// Paired with: ../verify-guest-order-access/index.ts
// =============================================================================

import { supabaseAdmin, type AdminClient } from '../_shared/supabaseAdmin.ts';
import { corsHeaders }                      from '../_shared/cors.ts';
import { sha256Hex }                        from '../_shared/crypto.ts';
import {
  getVerifyEnv,
  normalizePhone,
  sendVerifyOtp,
  type VerifyEnv,
} from '../_shared/twilio.ts';
import {
  asErr,
  log,
  prefix,
  sanitizeRequestId,
} from '../create-checkout/logging.ts';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Maximum request body in bytes. */
const MAX_BODY_BYTES = 4_096;

/** Upper bound for order_number (int4 range; UI zero-pads to 4 digits). */
const MAX_ORDER_NUMBER = 99_999_999;

/** How long each issued OTP is valid. Sets expires_at in the DB. */
const OTP_TTL_MS = 10 * 60 * 1_000; // 10 minutes

/**
 * Maximum age of a guest order that can be recovered.
 * Orders older than this are considered resolved — guests should contact support.
 */
const ORDER_LOOKUP_WINDOW_HOURS = 48;

// IP rate-limit parameters (guest_rate_limits table).
const IP_RATE_WINDOW_MS = 15 * 60 * 1_000; // 15-minute rolling window
const IP_RATE_MAX       = 10;               // max requests per window
const IP_BLOCK_MS       = 30 * 60 * 1_000; // block duration after overrun

/** Max OTP codes issued per contact hash within one OTP_TTL window. */
const CONTACT_RATE_MAX = 3;

/** Max simultaneous active (unconsumed + unexpired) codes per order. */
const MAX_ACTIVE_CODES_PER_ORDER = 3;

// ─── Generic success payload ──────────────────────────────────────────────────
//
// ALL non-error paths return this exact shape. It MUST NOT change based on
// whether an order was found, a contact matched, or a code was delivered.

const GENERIC_OK = {
  ok:      true  as const,
  message: 'If we found your order, we sent you a verification code. Check your messages.',
} as const;

// ─── Local types ──────────────────────────────────────────────────────────────

type CorsMap    = Record<string, string>;
type ContactKind = 'phone' | 'email';

interface NormalizedContact {
  readonly kind:  ContactKind;
  /** E.164 for phone; lowercase-trimmed for email. Raw value — never persisted. */
  readonly value: string;
  /** SHA-256(value) — the only form stored in the database. */
  readonly hash:  string;
}

interface RateLimitRow {
  request_count: number;
  window_start:  string;
  blocked_until: string | null;
  overrun_count: number;
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

/** Returns the invariant generic success response. */
function okResp(cors: CorsMap, requestId: string): Response {
  return jsonResp(GENERIC_OK, 200, cors, requestId);
}

// ─── Input helpers ────────────────────────────────────────────────────────────

/**
 * Parses order_number from an integer or numeric string.
 * Accepts zero-padded display formats ("0042" → 42).
 */
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

/** Minimal RFC-5321 email plausibility check — not exhaustive; rejects garbage. */
function isPlausibleEmail(s: string): boolean {
  return (
    s.length >= 5 &&
    s.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)
  );
}

/** Extracts client IP, preferring Cloudflare's header over X-Forwarded-For. */
function clientIp(req: Request): string {
  return (
    req.headers.get('CF-Connecting-IP') ??
    req.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ??
    'unknown'
  );
}

/** Cryptographically random 6-digit OTP, always zero-padded to 6 characters. */
function generateOtp(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(buf[0] % 1_000_000).padStart(6, '0');
}

// ─── Contact normalization ────────────────────────────────────────────────────

/**
 * Normalizes raw contact input to a canonical form and computes its SHA-256 hash.
 *
 * Phone takes priority: if normalizePhone() succeeds the contact is treated as
 * a phone regardless of whether the string also resembles an email.
 *
 * Returns null if the input cannot be recognized as either a phone or email.
 * The raw value is used only in memory during this function — it is never
 * written to the database or emitted in a log line.
 */
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

// ─── IP rate limiting ─────────────────────────────────────────────────────────

/**
 * Checks and updates the IP-based rate limit in the guest_rate_limits table.
 *
 * Returns true  → caller MUST return HTTP 429 (hard block, no order data leaked).
 * Returns false → request is within limits; increment recorded.
 *
 * Fails open on DB errors — a transient DB failure should not block a legitimate
 * user from recovering access to their order.
 */
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
      // ── Hard block active ──────────────────────────────────────────────
      if (row.blocked_until !== null && new Date(row.blocked_until) > now) {
        log('warn', 'request_guest_order_access_ip_hard_blocked', {
          requestId,
          ip_hash_prefix: ipHash.slice(0, 8),
        });
        return true;
      }

      const windowAge    = now.getTime() - new Date(row.window_start).getTime();
      const windowActive = windowAge <= IP_RATE_WINDOW_MS;

      // ── Window active and limit reached → apply block ──────────────────
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
        log('warn', 'request_guest_order_access_ip_rate_limit_applied', {
          requestId,
          ip_hash_prefix: ipHash.slice(0, 8),
          overrun_count:  (row.overrun_count ?? 0) + 1,
        });
        return true;
      }

      // ── Within limits → increment (or reset if window expired) ─────────
      const newCount       = windowActive ? row.request_count + 1 : 1;
      const newWindowStart = windowActive ? row.window_start : nowIso;
      await db
        .from('guest_rate_limits')
        .update({
          request_count: newCount,
          window_start:  newWindowStart,
          blocked_until: null, // clear any stale block once window resets
          updated_at:    nowIso,
        })
        .eq('ip_hash', ipHash);
    } else {
      // ── First request from this IP ──────────────────────────────────────
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
    log('warn', 'request_guest_order_access_ip_rate_check_failed', {
      requestId,
      error: asErr(err),
    });
    return false; // fail open
  }
}

// ─── Contact rate limiting ────────────────────────────────────────────────────

/**
 * Counts how many recovery codes have been issued for this contact hash within
 * the active OTP window (OTP_TTL_MS).
 *
 * Returns true  → silent 200 (NOT 429) — returning a distinct status code would
 *                 reveal to an attacker that this contact was recently used in a
 *                 recovery attempt.
 * Returns false → within limit; proceed.
 *
 * Fails open on DB errors.
 */
async function isContactRateLimited(
  db:          AdminClient,
  contactHash: string,
  requestId:   string,
): Promise<boolean> {
  const windowStart = new Date(Date.now() - OTP_TTL_MS).toISOString();

  try {
    const { count, error } = await db
      .from('guest_order_recovery_codes')
      .select('id', { count: 'exact', head: true })
      .eq('contact_hash', contactHash)
      .gte('created_at', windowStart);

    if (error) {
      log('warn', 'request_guest_order_access_contact_rate_check_failed', {
        requestId,
        error: asErr(error),
      });
      return false;
    }

    if ((count ?? 0) >= CONTACT_RATE_MAX) {
      log('info', 'request_guest_order_access_contact_rate_limited', {
        requestId,
        contact_hash_prefix: contactHash.slice(0, 8),
      });
      return true;
    }

    return false;
  } catch (err) {
    log('warn', 'request_guest_order_access_contact_rate_exception', {
      requestId,
      error: asErr(err),
    });
    return false;
  }
}

// ─── Order lookup ─────────────────────────────────────────────────────────────

/**
 * Looks for a recent guest order matching the given order_number and contact.
 *
 * Returns the order UUID on a confirmed match; null on any non-match or error.
 * All lookup errors are swallowed — the caller MUST return the generic success
 * response regardless of this return value.
 *
 * Guest-order signal: customer_uid IS NULL (more robust than source='guest'
 * for legacy rows that predate the source column constraint).
 *
 * Email matching uses two separate .ilike() queries (guest_email, then
 * customer_email) rather than a PostgREST .or() filter to avoid any escaping
 * hazard with arbitrary email characters such as '+' or unusual TLD strings.
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
        log('error', 'request_guest_order_access_phone_lookup_error', {
          requestId,
          error: asErr(error),
        });
        return null;
      }

      return (data as { id: string } | null)?.id ?? null;
    }

    // ── Email path: probe guest_email first, then customer_email ───────────
    // ilike without wildcards = case-insensitive exact match.

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
      log('error', 'request_guest_order_access_guest_email_lookup_error', {
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
      log('error', 'request_guest_order_access_customer_email_lookup_error', {
        requestId,
        error: asErr(customerEmailErr),
      });
      return null;
    }

    return (byCustomerEmail as { id: string } | null)?.id ?? null;
  } catch (err) {
    log('error', 'request_guest_order_access_lookup_exception', {
      requestId,
      error: asErr(err),
    });
    return null;
  }
}

// ─── Code management ──────────────────────────────────────────────────────────

/**
 * Returns true if this order already has MAX_ACTIVE_CODES_PER_ORDER
 * simultaneously active (unconsumed + not yet expired) recovery codes.
 *
 * This prevents an attacker who knows an order_id from flooding the table.
 * Fails closed (returns false = not limited) on errors to avoid blocking
 * the legitimate owner.
 */
async function isOrderCodeLimitReached(
  db:        AdminClient,
  orderId:   string,
  requestId: string,
): Promise<boolean> {
  const nowIso = new Date().toISOString();

  try {
    const { count, error } = await db
      .from('guest_order_recovery_codes')
      .select('id', { count: 'exact', head: true })
      .eq('order_id', orderId)
      .is('consumed_at', null)
      .gte('expires_at', nowIso);

    if (error) {
      log('warn', 'request_guest_order_access_code_limit_check_failed', {
        requestId,
        order_id_prefix: prefix(orderId),
        error: asErr(error),
      });
      return false;
    }

    return (count ?? 0) >= MAX_ACTIVE_CODES_PER_ORDER;
  } catch (err) {
    log('warn', 'request_guest_order_access_code_limit_exception', {
      requestId,
      error: asErr(err),
    });
    return false;
  }
}

/**
 * Inserts a new recovery code row. The raw OTP is hashed before any DB call —
 * it is never written to disk in any form.
 * Returns true on a successful insert.
 */
async function storeRecoveryCode(
  db:        AdminClient,
  orderId:   string,
  contact:   NormalizedContact,
  otp:       string,
  requestId: string,
): Promise<boolean> {
  // Hash the OTP before any I/O — the raw value is only in JS memory.
  const codeHash  = await sha256Hex(otp);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString();

  const { error } = await db.from('guest_order_recovery_codes').insert({
    order_id:     orderId,
    contact_hash: contact.hash,   // SHA-256(canonical contact) — never raw
    code_hash:    codeHash,        // SHA-256(otp string)         — never raw
    expires_at:   expiresAt,
  });

  if (error) {
    log('error', 'request_guest_order_access_store_failed', {
      requestId,
      order_id_prefix: prefix(orderId),
      error: asErr(error),
    });
    return false;
  }

  return true;
}

// ─── OTP delivery ──────────────────────────────────────────────────────────────

/**
 * Delivers the OTP to the verified contact via the appropriate channel.
 *
 * Phone → Twilio Verify SMS.
 * Email → Not yet implemented (no transactional email sender available).
 *         Logs at info level, returns without error.
 *
 * Delivery failures are logged but do not change the caller's response.
 * A stored-but-undelivered code expires harmlessly after OTP_TTL_MS.
 *
 * NEVER logs: the raw OTP, the full phone number, or any sensitive field.
 * Only the last 4 digits of a phone number are logged for traceability.
 */
async function deliverOtp(
  twilioEnv: VerifyEnv,
  contact:   NormalizedContact,
  requestId: string,
): Promise<void> {
  if (contact.kind !== 'phone') {
    // Email delivery requires a transactional email sender (e.g. Resend, SES).
    // Not available in this deployment. The stored code will expire unused;
    // the guest will receive the generic success message but no code.
    // Wire up an email sender here and add 'email' to the channel dispatch.
    log('info', 'request_guest_order_access_email_delivery_not_implemented', {
      requestId,
    });
    return;
  }

  const result = await sendVerifyOtp({
    env:     twilioEnv,
    to:      contact.value,
    channel: 'sms',
  });

  if (!result.ok) {
    // Delivery failure: logged for ops visibility. The generic response is
    // still returned — the guest may retry, and the next attempt will
    // re-send because the existing code is still unconsumed.
    log('warn', 'request_guest_order_access_sms_delivery_failed', {
      requestId,
      phone_suffix: contact.value.slice(-4), // last 4 digits only
      error:        result.error ?? 'unknown',
    });
  } else {
    log('info', 'request_guest_order_access_sms_sent', {
      requestId,
      phone_suffix: contact.value.slice(-4),
    });
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
    return errResp(
      'unsupported_content_type',
      'Content-Type must be application/json.',
      415,
      cors,
      requestId,
    );
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
    return errResp(
      'invalid_order_number',
      'order_number must be a positive integer.',
      400,
      cors,
      requestId,
    );
  }

  // ── Validate and normalize contact ──────────────────────────────────────────
  const rawContact = body.contact;
  if (typeof rawContact !== 'string' || rawContact.trim().length < 3) {
    return errResp(
      'invalid_contact',
      'A valid phone number or email address is required.',
      400,
      cors,
      requestId,
    );
  }

  const contact = await resolveContact(rawContact);
  if (contact === null) {
    return errResp(
      'invalid_contact',
      'A valid phone number or email address is required.',
      400,
      cors,
      requestId,
    );
  }

  // ── Twilio env — load early to catch misconfigured deployments ──────────────
  // Loaded before any DB work so a missing secret surfaces on the first request
  // rather than only after the order has been looked up.
  // Misconfiguration returns generic success (no order data leaked).
  const twilioResult = getVerifyEnv();
  if (!twilioResult.ok) {
    log('error', 'request_guest_order_access_twilio_env_missing', {
      requestId,
      missing: twilioResult.missing,
    });
    // Return generic: ops must fix the secret, but guests are not exposed to
    // a server-config leak. Stored codes from other attempts remain valid.
    return okResp(cors, requestId);
  }
  const twilioEnv = twilioResult.env;

  // ── DB client ───────────────────────────────────────────────────────────────
  const db = supabaseAdmin();

  // ── IP rate limit ───────────────────────────────────────────────────────────
  // Returning 429 here is safe — it reveals only that *this IP* is rate-limited,
  // not anything about order data.
  const ip = clientIp(req);
  const ipBlocked = await isIpRateLimited(db, ip, requestId);
  if (ipBlocked) {
    return errResp(
      'rate_limited',
      'Too many requests. Please try again later.',
      429,
      cors,
      requestId,
    );
  }

  // ── Contact rate limit (SILENT) ─────────────────────────────────────────────
  // Returns generic 200 — NOT 429 — to avoid revealing that this contact was
  // used in a recent recovery attempt (which would be a mild oracle).
  const contactLimited = await isContactRateLimited(db, contact.hash, requestId);
  if (contactLimited) {
    return okResp(cors, requestId);
  }

  // ── Order lookup ────────────────────────────────────────────────────────────
  // null means no match (or a DB error). Either way: generic success.
  // The response MUST NOT branch visibly on this value.
  const orderId = await findGuestOrderId(db, orderNumber, contact, requestId);

  if (orderId === null) {
    // Log at info level for ops visibility. The log line must not contain
    // the contact value or any field that could help correlate to a real order.
    log('info', 'request_guest_order_access_no_match', {
      requestId,
      order_number_length: String(orderNumber).length, // length only, never value
      contact_kind:        contact.kind,
    });
    return okResp(cors, requestId);
  }

  // ── Active-code flood guard ──────────────────────────────────────────────────
  // Prevents a caller who has discovered an order_id from flooding the codes
  // table. Silent 200 — does not reveal that the order exists.
  const codeLimitReached = await isOrderCodeLimitReached(db, orderId, requestId);
  if (codeLimitReached) {
    log('info', 'request_guest_order_access_code_limit_reached', {
      requestId,
      order_id_prefix: prefix(orderId),
    });
    return okResp(cors, requestId);
  }

  // ── Generate OTP ─────────────────────────────────────────────────────────────
  // Generated in memory only. Never logged. Hashed before any DB write.
  const otp = generateOtp();

  // ── Persist hashed OTP ───────────────────────────────────────────────────────
  const stored = await storeRecoveryCode(db, orderId, contact, otp, requestId);
  if (!stored) {
    // DB write failed — do not attempt delivery. Return generic response;
    // the guest can retry, which will attempt a fresh INSERT.
    return okResp(cors, requestId);
  }

  // ── Deliver OTP ──────────────────────────────────────────────────────────────
  // Awaited so that delivery errors are logged before the response is sent.
  // Delivery failure does not change the response — generic success always.
  await deliverOtp(twilioEnv, contact, requestId);

  log('info', 'request_guest_order_access_complete', {
    requestId,
    order_id_prefix: prefix(orderId),
    contact_kind:    contact.kind,
    // For phones: last 4 digits only — never the full number.
    phone_suffix:    contact.kind === 'phone' ? contact.value.slice(-4) : null,
  });

  return okResp(cors, requestId);
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
    log('error', 'request_guest_order_access_unhandled_exception', {
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