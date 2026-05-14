// supabase/functions/login-guard/index.ts
// =============================================================================
// LOGIN GUARD - Email-only preflight guard for OTP / magic-link login
// =============================================================================
//
// Purpose:
// - Protect your email login / OTP / magic-link flow before the client requests
//   a login email or code.
// - This function does NOT verify a password.
// - This function does NOT create a Supabase session.
// - It only answers: "Is this email login attempt allowed right now?"
//
// Hardened features:
// - Fail-closed CORS allowlist
// - Strict POST-only endpoint
// - Strict application/json check
// - Byte-limited JSON parsing without trusting Content-Length
// - Email normalization and validation
// - Trusted client IP extraction
// - User-Agent length limiting
// - Per-IP minute throttle
// - Existing IP block enforcement
// - Existing email lockout enforcement
// - Request fingerprint hashing
// - Best-effort login attempt logging
// - Best-effort fraud logging on suspicious activity
// - No raw password handling
// - No fake auth success
// - No email-existence leak
// - No any
//
// Expected tables:
// - public.login_attempts
// - public.ip_blocks
// - public.account_lockouts
// - public.password_fingerprints
// - public.password_attempts
// - public.fraud_logs
//
// Note:
// The password_* tables are kept as legacy risk telemetry tables because your
// schema already has them. They are used here as request/fingerprint counters,
// not as password storage.
//
// Important:
// This guard only enforces existing account lockouts. It does not create or
// increment email lockouts because this endpoint does not know whether an OTP
// or magic-link verification actually failed. Lockout increments belong in the
// OTP/code verification function.
// =============================================================================

import { createServiceClient } from '../_shared/supabase.ts';
import type { Database, Json } from '../_shared/database.types.ts';
import { toJson } from '../_shared/json.ts';

// ─────────────────────────────────────────────────────────────
// CORS allowlist
// ─────────────────────────────────────────────────────────────

const ALLOWED_ORIGINS = [
  'https://sofislegacy.com',
  'https://www.sofislegacy.com',
  'https://sofisrestaurant-enterprise.vercel.app',
  'http://localhost:3000',
  'http://localhost:5173',
] as const;

function corsHeaders(req: Request): Record<string, string> | null {
  const origin = req.headers.get('origin') ?? '';
  const ok = (ALLOWED_ORIGINS as readonly string[]).includes(origin);

  if (!ok) {
    return null;
  }

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, x-application-name, x-request-id, x-idempotency-key',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function withSecurityHeaders(
  cors: Record<string, string>,
  requestId: string,
): Record<string, string> {
  return {
    ...cors,
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Request-Id': requestId,
  };
}

// ─────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────

const CONFIG = {
  MAX_BODY_BYTES: 2_000,
  EMAIL_MAX: 320,
  UA_MAX: 400,
  IP_MAX: 128,

  MAX_PER_MIN_IP: 20,

  FAIL_WINDOW_MIN: 15,
  IP_FAILS_TO_BLOCK: 10,
  IP_BLOCK_MINUTES: 60,
} as const;

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

type Db = ReturnType<typeof createServiceClient>;

type LoginAttemptInsert = Database['public']['Tables']['login_attempts']['Insert'];
type IpBlockUpsert = Database['public']['Tables']['ip_blocks']['Insert'];
type PasswordAttemptUpsert = Database['public']['Tables']['password_attempts']['Insert'];
type PasswordFingerprintUpsert =
  Database['public']['Tables']['password_fingerprints']['Insert'];

type JsonRecord = Record<string, unknown>;

type LoginBody = {
  email: string;
};

type GuardDenyReason =
  | 'bad_origin'
  | 'method_not_allowed'
  | 'unsupported_media_type'
  | 'body_too_large'
  | 'invalid_body'
  | 'invalid_email'
  | 'ip_rate_limited'
  | 'ip_blocked'
  | 'email_locked'
  | 'ip_auto_blocked';

type ParseErrorCode =
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'BODY_TOO_LARGE'
  | 'EMPTY_BODY'
  | 'BAD_JSON';

// ─────────────────────────────────────────────────────────────
// Response helpers
// ─────────────────────────────────────────────────────────────

function respondJson(
  headers: Record<string, string>,
  requestId: string,
  body: unknown,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: withSecurityHeaders(headers, requestId),
  });
}

function nowIso(): string {
  return new Date().toISOString();
}

function createRequestId(req: Request): string {
  const incoming = req.headers.get('x-request-id')?.trim();

  if (incoming && incoming.length <= 100) {
    return incoming;
  }

  try {
    return crypto.randomUUID();
  } catch {
    return `login_guard_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
}

// ─────────────────────────────────────────────────────────────
// Safe parsing / validation
// ─────────────────────────────────────────────────────────────

function isRecord(v: unknown): v is JsonRecord {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asTrimmedString(v: unknown, max: number): string {
  if (typeof v !== 'string') {
    return '';
  }

  const s = v.trim();

  if (!s) {
    return '';
  }

  return s.length > max ? s.slice(0, max) : s;
}

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

function isEmailLike(email: string): boolean {
  if (!email) return false;
  if (email.length > CONFIG.EMAIL_MAX) return false;

  const at = email.indexOf('@');
  const lastAt = email.lastIndexOf('@');

  if (at <= 0) return false;
  if (at !== lastAt) return false;
  if (at === email.length - 1) return false;

  const domain = email.slice(at + 1);
  if (!domain.includes('.')) return false;
  if (domain.startsWith('.') || domain.endsWith('.')) return false;

  return true;
}

async function readJsonWithByteLimit(req: Request, maxBytes: number): Promise<unknown> {
  const contentType = (req.headers.get('content-type') ?? '').toLowerCase();

  if (!contentType.includes('application/json')) {
    throw new Error('UNSUPPORTED_MEDIA_TYPE' satisfies ParseErrorCode);
  }

  const buffer = await req.arrayBuffer();

  if (buffer.byteLength > maxBytes) {
    throw new Error('BODY_TOO_LARGE' satisfies ParseErrorCode);
  }

  const text = new TextDecoder().decode(buffer);

  if (!text.trim()) {
    throw new Error('EMPTY_BODY' satisfies ParseErrorCode);
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error('BAD_JSON' satisfies ParseErrorCode);
  }
}

function parseLoginBody(raw: unknown): LoginBody | null {
  if (!isRecord(raw)) {
    return null;
  }

  const email = normalizeEmail(asTrimmedString(raw.email, CONFIG.EMAIL_MAX));

  if (!isEmailLike(email)) {
    return null;
  }

  return { email };
}

// ─────────────────────────────────────────────────────────────
// IP + fingerprint
// ─────────────────────────────────────────────────────────────

function clampHeaderValue(raw: string, max: number): string {
  const clean = raw.trim();
  return clean.length > max ? clean.slice(0, max) : clean;
}

function pickClientIp(req: Request): string {
  const cf = req.headers.get('cf-connecting-ip')?.trim();
  if (cf) return clampHeaderValue(cf, CONFIG.IP_MAX);

  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return clampHeaderValue(first, CONFIG.IP_MAX);
  }

  const realIp = req.headers.get('x-real-ip')?.trim();
  if (realIp) return clampHeaderValue(realIp, CONFIG.IP_MAX);

  return 'unknown';
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);

  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function createFingerprint(ip: string, userAgent: string): Promise<string> {
  return await sha256Hex(`${ip}|${userAgent}`);
}

async function createEmailHash(email: string): Promise<string> {
  return await sha256Hex(email);
}

// ─────────────────────────────────────────────────────────────
// Utility helpers
// ─────────────────────────────────────────────────────────────

async function bestEffort(task: () => Promise<unknown>): Promise<void> {
  try {
    await task();
  } catch {
    // Best-effort logging must never break the login flow.
  }
}

// ─────────────────────────────────────────────────────────────
// DB helpers
// ─────────────────────────────────────────────────────────────

async function countAttemptsInLastMinute(
  db: Db,
  ip: string,
  sinceIso: string,
): Promise<number> {
  const { count, error } = await db
    .from('login_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('ip', ip)
    .gte('created_at', sinceIso);

  if (error) {
    return 0;
  }

  return count ?? 0;
}

async function isIpBlocked(db: Db, ip: string, now: Date): Promise<boolean> {
  const { data, error } = await db
    .from('ip_blocks')
    .select('blocked_until')
    .eq('ip', ip)
    .maybeSingle();

  if (error || !data?.blocked_until) {
    return false;
  }

  return new Date(data.blocked_until) > now;
}

async function getAccountLock(
  db: Db,
  email: string,
  now: Date,
): Promise<{ locked: boolean; failedAttempts: number }> {
  const { data, error } = await db
    .from('account_lockouts')
    .select('failed_attempts, locked_until')
    .eq('email', email)
    .maybeSingle();

  if (error || !data) {
    return { locked: false, failedAttempts: 0 };
  }

  const lockedUntil = data.locked_until ? new Date(data.locked_until) : null;
  const locked = Boolean(lockedUntil && lockedUntil > now);

  const failedAttempts =
    typeof data.failed_attempts === 'number' && Number.isFinite(data.failed_attempts)
      ? data.failed_attempts
      : 0;

  return { locked, failedAttempts };
}

async function blockIp(
  db: Db,
  ip: string,
  untilIso: string,
  reason: string,
): Promise<void> {
  const payload: IpBlockUpsert = {
    ip,
    reason,
    blocked_until: untilIso,
  };

  await db.from('ip_blocks').upsert(payload, { onConflict: 'ip' });
}

async function countIpFailuresInWindow(
  db: Db,
  ip: string,
  sinceIso: string,
): Promise<number> {
  const { count, error } = await db
    .from('login_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('ip', ip)
    .eq('success', false)
    .gte('created_at', sinceIso);

  if (error) {
    return 0;
  }

  return count ?? 0;
}

async function updateRiskAttemptCounter(
  db: Db,
  ip: string,
  success: boolean,
  now: Date,
): Promise<void> {
  const nowIsoStr = now.toISOString();

  if (success) {
    const payload: PasswordAttemptUpsert = {
      ip_address: ip,
      attempts: 0,
      last_attempt: nowIsoStr,
    };

    await db.from('password_attempts').upsert(payload, { onConflict: 'ip_address' });
    return;
  }

  const { data } = await db
    .from('password_attempts')
    .select('attempts')
    .eq('ip_address', ip)
    .maybeSingle();

  const previous =
    typeof data?.attempts === 'number' && Number.isFinite(data.attempts)
      ? data.attempts
      : 0;

  const next = Math.min(previous + 1, 10_000);

  const payload: PasswordAttemptUpsert = {
    ip_address: ip,
    attempts: next,
    last_attempt: nowIsoStr,
  };

  await db.from('password_attempts').upsert(payload, { onConflict: 'ip_address' });
}

async function upsertFingerprint(
  db: Db,
  fingerprint: string,
  now: Date,
): Promise<void> {
  const payload: PasswordFingerprintUpsert = {
    fingerprint,
    created_at: now.toISOString(),
  };

  await db.from('password_fingerprints').upsert(payload, { onConflict: 'fingerprint' });
}

async function logAttempt(db: Db, row: LoginAttemptInsert): Promise<void> {
  await db.from('login_attempts').insert(row);
}

async function logGuardEvent(
  db: Db,
  params: {
    reason: GuardDenyReason;
    ip: string;
    emailHash?: string;
    fingerprint?: string;
    requestId: string;
  },
): Promise<void> {
  const metadata: Json = toJson(
    {
      reason: params.reason,
      ip: params.ip,
      email_hash: params.emailHash ?? null,
      fingerprint: params.fingerprint ?? null,
      request_id: params.requestId,
      source: 'login-guard',
    },
    {},
  );

  await db.from('fraud_logs').insert({
    reason: `login_guard_${params.reason}`,
    stripe_total: 0,
    created_at: nowIso(),
    metadata,
  });
}

async function recordDeniedAttempt(
  db: Db,
  params: {
    email: string;
    ip: string;
    userAgent: string;
    nowIsoStr: string;
    reason: GuardDenyReason;
    requestId: string;
    fingerprint?: string;
  },
): Promise<void> {
  await bestEffort(() =>
    logAttempt(db, {
      email: params.email,
      ip: params.ip,
      user_agent: params.userAgent,
      success: false,
      created_at: params.nowIsoStr,
    }),
  );

  const emailHash = await createEmailHash(params.email);

  await bestEffort(() =>
    logGuardEvent(db, {
      reason: params.reason,
      ip: params.ip,
      emailHash,
      fingerprint: params.fingerprint,
      requestId: params.requestId,
    }),
  );
}

// ─────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const requestId = createRequestId(req);
  const cors = corsHeaders(req);

  if (!cors) {
    return new Response('Origin not allowed', {
      status: 403,
      headers: {
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'X-Request-Id': requestId,
        Vary: 'Origin',
      },
    });
  }

  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: withSecurityHeaders(cors, requestId),
    });
  }

  if (req.method !== 'POST') {
    return respondJson(cors, requestId, { error: 'Method not allowed' }, 405);
  }

  let parsed: LoginBody | null;

  try {
    const raw = await readJsonWithByteLimit(req, CONFIG.MAX_BODY_BYTES);
    parsed = parseLoginBody(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'BAD_REQUEST';

    if (message === 'UNSUPPORTED_MEDIA_TYPE') {
      return respondJson(cors, requestId, { error: 'Content-Type must be application/json' }, 415);
    }

    if (message === 'BODY_TOO_LARGE') {
      return respondJson(cors, requestId, { error: 'Payload too large' }, 413);
    }

    return respondJson(cors, requestId, { error: 'Invalid request' }, 400);
  }

  if (!parsed) {
    return respondJson(cors, requestId, { error: 'Invalid request' }, 400);
  }

  const { email } = parsed;
  const ip = pickClientIp(req);
  const userAgent = asTrimmedString(req.headers.get('user-agent') ?? 'unknown', CONFIG.UA_MAX);

  const now = new Date();
  const nowIsoStr = now.toISOString();

  const svc = createServiceClient();
  const fingerprint = await createFingerprint(ip, userAgent);

  await bestEffort(() => upsertFingerprint(svc, fingerprint, now));

  const minuteAgoIso = new Date(now.getTime() - 60_000).toISOString();
  const perMinuteAttempts = await countAttemptsInLastMinute(svc, ip, minuteAgoIso);

  if (perMinuteAttempts >= CONFIG.MAX_PER_MIN_IP) {
    await recordDeniedAttempt(svc, {
      email,
      ip,
      userAgent,
      nowIsoStr,
      reason: 'ip_rate_limited',
      requestId,
      fingerprint,
    });

    await bestEffort(() => updateRiskAttemptCounter(svc, ip, false, now));

    return respondJson(cors, requestId, { error: 'Too many requests. Please wait.' }, 429);
  }

  const blocked = await isIpBlocked(svc, ip, now);

  if (blocked) {
    await recordDeniedAttempt(svc, {
      email,
      ip,
      userAgent,
      nowIsoStr,
      reason: 'ip_blocked',
      requestId,
      fingerprint,
    });

    await bestEffort(() => updateRiskAttemptCounter(svc, ip, false, now));

    return respondJson(cors, requestId, { error: 'Too many attempts. Please wait.' }, 429);
  }

  const lock = await getAccountLock(svc, email, now);

  if (lock.locked) {
    await recordDeniedAttempt(svc, {
      email,
      ip,
      userAgent,
      nowIsoStr,
      reason: 'email_locked',
      requestId,
      fingerprint,
    });

    await bestEffort(() => updateRiskAttemptCounter(svc, ip, false, now));

    return respondJson(cors, requestId, { error: 'Too many attempts. Please wait.' }, 423);
  }

  const windowIso = new Date(now.getTime() - CONFIG.FAIL_WINDOW_MIN * 60_000).toISOString();
  const ipFailures = await countIpFailuresInWindow(svc, ip, windowIso);

  if (ipFailures >= CONFIG.IP_FAILS_TO_BLOCK) {
    const blockUntil = new Date(now.getTime() + CONFIG.IP_BLOCK_MINUTES * 60_000).toISOString();

    await bestEffort(() => blockIp(svc, ip, blockUntil, 'Auto IP block from login guard'));
    await recordDeniedAttempt(svc, {
      email,
      ip,
      userAgent,
      nowIsoStr,
      reason: 'ip_auto_blocked',
      requestId,
      fingerprint,
    });

    await bestEffort(() => updateRiskAttemptCounter(svc, ip, false, now));

    return respondJson(cors, requestId, { error: 'Too many attempts. Please wait.' }, 429);
  }

  await bestEffort(() =>
    logAttempt(svc, {
      email,
      ip,
      user_agent: userAgent,
      // success=true means this guard allowed the preflight request.
      // It does NOT mean the user authenticated successfully.
      success: true,
      created_at: nowIsoStr,
    }),
  );

  await bestEffort(() => updateRiskAttemptCounter(svc, ip, true, now));

  return respondJson(
    cors,
    requestId,
    {
      ok: true,
      requestId,
    },
    200,
  );
});