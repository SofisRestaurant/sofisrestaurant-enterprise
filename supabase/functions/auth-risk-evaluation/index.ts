// supabase/functions/auth-risk-evaluation/index.ts
// =============================================================================
// AUTH RISK EVALUATION — Enterprise Hardened (2026 PRO)
// =============================================================================
// ✅ Senior hardening:
// - Real byte-limited JSON parsing
// - Strict runtime validation (no `any`)
// - UUID session_id enforced
// - Edge-country required in prod (CF/Vercel/Fly/generic)
// - Rate-limit per session w/ session→user ownership guard
// - Best-effort telemetry (never bricks flow)
// - Minimal PII (never store fingerprint in audit log)
// - Uses generated Database types for correct table names + payload shapes
// =============================================================================

import { requireAuth, serviceClient, AuthError } from '../_shared/auth.ts';
import { handlePreflight, ok, err, clientIp } from '../_shared/http.ts';
import { computeRiskScore, isUnusualTime } from '../_shared/riskScore.ts';

import type { Database, Json } from '../_shared/database.types.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Database type helpers
// ─────────────────────────────────────────────────────────────────────────────

type Db = ReturnType<typeof serviceClient>;

type Table<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T];

// Partial type matching the columns actually selected in the geo-mismatch block
type SessionMetaPartial = Pick<Table<'auth_sessions_meta'>['Row'], 'country_code' | 'created_at'>;

type RateLimitRow = Table<'auth_risk_rate_limits'>['Row'];
type DeviceTrustRow = Table<'device_trust'>['Row'];
type AuthAuditInsert = Table<'auth_audit_log'>['Insert'];

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

const CONFIG = {
  MAX_BODY_BYTES: 6_000,

  MAX_SESSION_ID_LEN: 64,
  MAX_FP_LEN: 128,

  RL_WINDOW_MINUTES: 5,
  RL_MAX_ATTEMPTS: 12,
  RL_BLOCK_MINUTES: 10,

  RECENT_LOGIN_LIMIT: 30,
  RECENT_SESSIONS_COUNTRY_LIMIT: 5,
  RECENT_FAIL_WINDOW_MS: 15 * 60 * 1000,
  RAPID_FAIL_THRESHOLD: 3,
  MAX_PW_MISMATCHES: 5,

  RISK_TTL_MS: 60 * 60 * 1000,
  REQUIRE_EDGE_COUNTRY_IN_PROD: true,
} as const;

const FINGERPRINT_RE = /^[0-9a-f]{64}$/i;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COUNTRY_RE = /^[A-Z]{2}$/;

type JsonRecord = Record<string, unknown>;

function isRecord(v: unknown): v is JsonRecord {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function nowIso(): string {
  return new Date().toISOString();
}

function isProd(): boolean {
  const env = (Deno.env.get('APP_ENV') ?? Deno.env.get('NODE_ENV') ?? 'development')
    .trim()
    .toLowerCase();
  return env === 'production';
}

function asString(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  const s = v.trim();
  if (!s) return '';
  return s.length > max ? s.slice(0, max) : s;
}

function normalizeCountry(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim().toUpperCase();
  if (s.length !== 2) return null;
  return COUNTRY_RE.test(s) ? s : null;
}

function makeRequestId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `req_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
}

function safeDateMs(v: string | null): number | null {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
}

async function readJsonWithLimit(req: Request, maxBytes: number): Promise<unknown> {
  const ct = (req.headers.get('content-type') ?? '').toLowerCase();
  if (!ct.includes('application/json')) throw new Error('UNSUPPORTED_CONTENT_TYPE');

  const ab = await req.arrayBuffer();
  if (ab.byteLength > maxBytes) throw new Error('PAYLOAD_TOO_LARGE');

  const text = new TextDecoder().decode(ab);
  if (!text.trim()) throw new Error('EMPTY_BODY');

  try {
    return JSON.parse(text);
  } catch {
    throw new Error('INVALID_JSON');
  }
}

function pickEdgeCountry(req: Request): string | null {
  const cf = normalizeCountry(req.headers.get('CF-IPCountry'));
  if (cf) return cf;

  const vercel = normalizeCountry(req.headers.get('x-vercel-ip-country'));
  if (vercel) return vercel;

  const fly = normalizeCountry(req.headers.get('fly-client-country'));
  if (fly) return fly;

  const generic = normalizeCountry(req.headers.get('x-country'));
  if (generic) return generic;

  return null;
}

/**
 * Convert JSON-safe records into Json.
 * If the object contains non-JSON values (Date, Error, undefined), JSON.stringify will strip/convert.
 */
function toJson(v: unknown): Json | null {
  if (v === null) return null;
  try {
    return JSON.parse(JSON.stringify(v)) as Json;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Best-effort audit logging (NEVER blocks flow)
// Table columns: id, user_id, event_type, ip_address, risk_score, device_id, event_data, created_at
// No request_id column → embed requestId inside event_data.
// ─────────────────────────────────────────────────────────────────────────────

async function audit(
  db: Db,
  row: {
    user_id: string | null;
    event_type: string;
    ip_address: string | null;
    risk_score: number | null;
    device_id: string | null;
    event_data: Json | null;
    created_at?: string;
  },
): Promise<void> {
  const payload: AuthAuditInsert = {
    user_id: row.user_id ?? null,
    event_type: row.event_type,
    ip_address: row.ip_address ?? null,
    risk_score: row.risk_score ?? null,
    device_id: row.device_id ?? null,
    event_data: row.event_data ?? null,
    created_at: row.created_at ?? nowIso(),
  };

  try {
    await db.from('auth_audit_log').insert(payload);
  } catch {
    // swallow
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Rate limit per session + ownership guard
// ─────────────────────────────────────────────────────────────────────────────

async function checkCooldown(
  db: Db,
  userId: string,
  sessionId: string,
  requestId: string,
  ip: string | null,
): Promise<{ blocked: boolean; blockedUntil: string | null }> {
  const nowMs = Date.now();
  const windowStartMs = nowMs - CONFIG.RL_WINDOW_MINUTES * 60_000;

  const { data, error } = await db
    .from('auth_risk_rate_limits')
    .select('session_id,user_id,attempts,last_attempt_at,blocked_until')
    .eq('session_id', sessionId)
    .maybeSingle();

  if (error) {
    await audit(db, {
      user_id: userId,
      event_type: 'rate_limit_table_error',
      ip_address: ip,
      risk_score: null,
      device_id: null,
      event_data: toJson({ requestId, table: 'auth_risk_rate_limits', error: error.message }),
    });
    // Fail-open: risk eval should not brick login
    return { blocked: false, blockedUntil: null };
  }

  const row = (data ?? null) as RateLimitRow | null;

  // Ownership guard: sessionId should not hop users
  if (row?.user_id && row.user_id !== userId) {
    const blockedUntil = new Date(nowMs + 60_000).toISOString();

    await audit(db, {
      user_id: userId,
      event_type: 'suspicious_activity',
      ip_address: ip,
      risk_score: 100,
      device_id: null,
      event_data: toJson({
        requestId,
        reason: 'session_id_owner_mismatch',
        session_id: sessionId,
      }),
    });

    return { blocked: true, blockedUntil };
  }

  const blockedUntilMs = safeDateMs(row?.blocked_until ?? null);
  if (blockedUntilMs !== null && blockedUntilMs > nowMs) {
    return { blocked: true, blockedUntil: new Date(blockedUntilMs).toISOString() };
  }

  const lastAttemptMs = safeDateMs(row?.last_attempt_at ?? null);
  const prevAttempts = Number.isFinite(row?.attempts ?? NaN) ? (row?.attempts ?? 0) : 0;

  const attempts = lastAttemptMs === null || lastAttemptMs < windowStartMs ? 1 : prevAttempts + 1;

  const blocked = attempts > CONFIG.RL_MAX_ATTEMPTS;
  const newBlockedUntil = blocked
    ? new Date(nowMs + CONFIG.RL_BLOCK_MINUTES * 60_000).toISOString()
    : null;

  const { error: upErr } = await db.from('auth_risk_rate_limits').upsert(
    {
      session_id: sessionId,
      user_id: userId,
      attempts,
      last_attempt_at: new Date(nowMs).toISOString(),
      blocked_until: newBlockedUntil,
    },
    { onConflict: 'session_id' },
  );

  if (upErr) {
    await audit(db, {
      user_id: userId,
      event_type: 'rate_limit_upsert_failed',
      ip_address: ip,
      risk_score: null,
      device_id: null,
      event_data: toJson({ requestId, session_id: sessionId, error: upErr.message }),
    });
    // Fail-open
    return { blocked: false, blockedUntil: null };
  }

  return { blocked, blockedUntil: newBlockedUntil };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  const requestId = req.headers.get('x-request-id')?.trim() || makeRequestId();

  if (req.method !== 'POST') {
    return err(req, 'METHOD_NOT_ALLOWED', `Method not allowed (requestId: ${requestId})`, 405);
  }

  // Auth (server-validated JWT)
  let user: { id: string; email: string | null };
  try {
    user = await requireAuth(req);
  } catch (e) {
    if (e instanceof AuthError) {
      return err(req, e.code, `${e.message} (requestId: ${requestId})`, e.status);
    }
    return err(req, 'AUTH_ERROR', `Authentication failed (requestId: ${requestId})`, 401);
  }

  const db = serviceClient();
  const ip = clientIp(req);

  // Parse body (hard limit)
  let raw: unknown;
  try {
    raw = await readJsonWithLimit(req, CONFIG.MAX_BODY_BYTES);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'INVALID_BODY';

    if (msg === 'PAYLOAD_TOO_LARGE') {
      return err(req, 'PAYLOAD_TOO_LARGE', `Payload too large (requestId: ${requestId})`, 413);
    }
    if (msg === 'UNSUPPORTED_CONTENT_TYPE') {
      return err(
        req,
        'UNSUPPORTED_MEDIA_TYPE',
        `Content-Type must be application/json (requestId: ${requestId})`,
        415,
      );
    }
    if (msg === 'EMPTY_BODY') {
      return err(req, 'INVALID_BODY', `Empty request body (requestId: ${requestId})`, 400);
    }
    return err(req, 'INVALID_BODY', `Invalid JSON body (requestId: ${requestId})`, 400);
  }

  if (!isRecord(raw)) {
    return err(req, 'INVALID_BODY', `Body must be a JSON object (requestId: ${requestId})`, 400);
  }

  const fingerprintHash = asString(raw.fingerprintHash, CONFIG.MAX_FP_LEN);
  const sessionId = asString(raw.sessionId, CONFIG.MAX_SESSION_ID_LEN);
  const clientCountry = normalizeCountry(raw.countryCode);

  if (!FINGERPRINT_RE.test(fingerprintHash)) {
    return err(
      req,
      'INVALID_FINGERPRINT',
      `fingerprintHash must be 64 hex chars (requestId: ${requestId})`,
      400,
    );
  }

  if (!UUID_RE.test(sessionId)) {
    return err(req, 'INVALID_SESSION', `sessionId must be UUID (requestId: ${requestId})`, 400);
  }

  // Edge country required in prod
  const edgeCountry = pickEdgeCountry(req);
  if (isProd() && CONFIG.REQUIRE_EDGE_COUNTRY_IN_PROD && !edgeCountry) {
    await audit(db, {
      user_id: user.id,
      event_type: 'missing_edge_country_header',
      ip_address: ip,
      risk_score: null,
      device_id: null,
      event_data: toJson({ requestId, session_id: sessionId }),
    });

    return err(
      req,
      'MISSING_GEO_HEADER',
      `Missing edge country header (requestId: ${requestId})`,
      400,
    );
  }

  const countryCode = edgeCountry ?? clientCountry ?? null;

  // Rate-limit per session
  const rl = await checkCooldown(db, user.id, sessionId, requestId, ip);
  if (rl.blocked) {
    await audit(db, {
      user_id: user.id,
      event_type: 'auth_risk_rate_limited',
      ip_address: ip,
      risk_score: null,
      device_id: null,
      event_data: toJson({ requestId, session_id: sessionId, blocked_until: rl.blockedUntil }),
    });

    return err(
      req,
      'RATE_LIMITED',
      `Too many requests. Please wait. (requestId: ${requestId})`,
      429,
    );
  }

  // ── Gather signals (best-effort) ───────────────────────────────────────────

  const failSinceIso = new Date(Date.now() - CONFIG.RECENT_FAIL_WINDOW_MS).toISOString();

  const settled = await Promise.allSettled([
    db
      .from('device_trust')
      .select('id')
      .eq('user_id', user.id)
      .eq('fingerprint_hash', fingerprintHash)
      .eq('is_revoked', false)
      .maybeSingle(),

    db
      .from('auth_audit_log')
      .select('created_at')
      .eq('user_id', user.id)
      .eq('event_type', 'login_success')
      .order('created_at', { ascending: false })
      .limit(CONFIG.RECENT_LOGIN_LIMIT),

    db
      .from('account_lockouts')
      .select('email, locked_until')
      .eq('email', user.email ?? '')
      .maybeSingle(),

    db
      .from('login_attempts')
      .select('id')
      .eq('email', user.email ?? '')
      .eq('success', false)
      .gte('created_at', failSinceIso),
  ] as const);

  const deviceRes = settled[0].status === 'fulfilled' ? settled[0].value : null;
  const loginsRes = settled[1].status === 'fulfilled' ? settled[1].value : null;
  const lockoutRes = settled[2].status === 'fulfilled' ? settled[2].value : null;
  const failuresRes = settled[3].status === 'fulfilled' ? settled[3].value : null;

  const deviceTrustId = (deviceRes?.data as Pick<DeviceTrustRow, 'id'> | null)?.id ?? null;
  const deviceUnknown = !deviceTrustId;

  const recentLoginHours = (loginsRes?.data ?? [])
    .map((row) => safeDateMs(row.created_at ?? null))
    .filter((t): t is number => t !== null)
    .map((t) => new Date(t).getUTCHours());

  const recentFailures = failuresRes?.data?.length ?? 0;

  // Geo mismatch: flag if current country is not in the user's recent session history
  let geoMismatch = false;
  if (countryCode) {
    try {
      const { data: recentSessions, error: sessErr } = await db
        .from('auth_sessions_meta')
        .select('country_code, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(CONFIG.RECENT_SESSIONS_COUNTRY_LIMIT);

      if (!sessErr) {
        const sessions = (recentSessions ?? []) as SessionMetaPartial[];
        const known = new Set(
          sessions
            .map((s) => (typeof s.country_code === 'string' ? s.country_code.toUpperCase() : ''))
            .filter(Boolean),
        );

        // Flag mismatch if user has any prior sessions and none are from this country
        if (known.size >= 1 && !known.has(countryCode)) geoMismatch = true;
      }
    } catch {
      geoMismatch = false;
    }
  }

  // ── Score ─────────────────────────────────────────────────────────────────

  const result = computeRiskScore({
    deviceUnknown,
    geoMismatch,
    rapidAttempts: recentFailures >= CONFIG.RAPID_FAIL_THRESHOLD,
    unusualTime: isUnusualTime(new Date().getUTCHours(), recentLoginHours),
    passwordMismatches: Math.min(recentFailures, CONFIG.MAX_PW_MISMATCHES),
  });

  const evaluatedAt = nowIso();
  const expiresAt = new Date(Date.now() + CONFIG.RISK_TTL_MS).toISOString();

  // ── Persist (best-effort) ─────────────────────────────────────────────────

  try {
    await db.from('auth_risk_scores').upsert(
      {
        user_id: user.id,
        session_id: sessionId,
        risk_score: result.score,
        device_unknown_pts: result.breakdown.deviceUnknownPts,
        geo_mismatch_pts: result.breakdown.geoMismatchPts,
        rapid_attempts_pts: result.breakdown.rapidAttemptsPts,
        unusual_time_pts: result.breakdown.unusualTimePts,
        pw_mismatch_pts: result.breakdown.pwMismatchPts,
        requires_device_trust: result.requiresDeviceTrust,
        requires_mfa: result.requiresMfa,
        requires_step_up: result.requiresStepUp,
        evaluated_at: evaluatedAt,
        expires_at: expiresAt,
      } satisfies Table<'auth_risk_scores'>['Insert'],
      { onConflict: 'session_id' },
    );
  } catch {
    // swallow
  }

  try {
    await db.from('auth_sessions_meta').upsert(
      {
        user_id: user.id,
        session_id: sessionId,
        device_trust_id: deviceTrustId,
        ip_address: ip,
        country_code: countryCode,
        is_trusted_device: !!deviceTrustId,
        risk_score: result.score,
        last_active_at: evaluatedAt,
      } satisfies Table<'auth_sessions_meta'>['Insert'],
      { onConflict: 'session_id' },
    );
  } catch {
    // swallow
  }

  if (result.tier === 'high' || result.tier === 'critical') {
    await audit(db, {
      user_id: user.id,
      event_type: 'suspicious_activity',
      ip_address: ip,
      risk_score: result.score,
      device_id: deviceTrustId,
      event_data: toJson({
        requestId,
        tier: result.tier,
        session_id: sessionId,
        country: countryCode,
      }),
      created_at: evaluatedAt,
    });
  }

  const isLockedOut = !!lockoutRes?.data;

  return ok(req, {
    requestId,
    evaluatedAt,
    expiresAt,
    riskScore: result.score,
    tier: result.tier,
    requiresDeviceTrust: result.requiresDeviceTrust,
    requiresMfa: result.requiresMfa,
    requiresStepUp: result.requiresStepUp,
    isLockedOut,
  });
});