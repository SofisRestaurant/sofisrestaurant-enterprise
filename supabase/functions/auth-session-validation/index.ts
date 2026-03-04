// supabase/functions/auth-session-validation/index.ts
// =============================================================================
// AUTH SESSION VALIDATION — Production Ready (2026, Senior Hardened)
// =============================================================================
// Purpose:
//   Validate session integrity before sensitive actions.
//   - JWT required (requireAuth)
//   - sessionId must be UUID (matches DB: auth_sessions_meta.session_id uuid)
//   - Fail-closed if session meta missing (prevents guessing)
//   - Cooldown table prevents spamming per session/action (auth_session_validation_cooldowns)
//   - High-sensitivity actions require fresh risk eval (default 15m, configurable)
//   - Prod-only requires CF-IPCountry header (APP_ENV=production or NODE_ENV=production)
//
// Notes (fixes applied):
//   - ✅ No stray top-level DB code (no "Cannot find name user/db")
//   - ✅ audit() uses typed Insert payload (no Record<string, unknown>)
//   - ✅ event_data uses Json (via toJson helper)
//   - ✅ err() is called with <= 4 args (matches your shared http.ts signature)
//   - ✅ No `any`
// =============================================================================

import { requireAuth, serviceClient, AuthError } from "../_shared/auth.ts";
import { handlePreflight, ok, err, clientIp } from "../_shared/http.ts";
import type { SvcClient } from "../_shared/supabase.ts";
import type { Database, Json } from "../_shared/database.types.ts";
import { toJson } from "../_shared/json.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

const CONFIG = {
  MAX_BODY_BYTES: 10_000, // 10KB
  SESSION_ID_MAX_LEN: 64,

  // Risk freshness window (high sensitivity actions)
  RISK_FRESH_MS_DEFAULT: 15 * 60 * 1000, // 15 minutes

  // Cooldown per (user_id, session_id, action)
  COOLDOWN_MS: 2_000,

  // SessionId hardening (UUID v1-v5)
  SESSION_ID_RE: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
} as const;

// Strict allowlist of actions (keep in sync with frontend)
const ACTIONS = [
  "checkout",
  "redeem_loyalty",
  "change_password",
  "change_email",
  "delete_account",
  "place_order",
  "finalize_order",
  "profile_update",
] as const;

type Action = (typeof ACTIONS)[number];

// Actions that require a *fresh* risk evaluation (not just cached score)
const HIGH_SENSITIVITY_ACTIONS: ReadonlySet<Action> = new Set([
  "checkout",
  "redeem_loyalty",
  "change_password",
  "change_email",
  "delete_account",
]);

// ─────────────────────────────────────────────────────────────────────────────
// Small utils (no `any`)
// ─────────────────────────────────────────────────────────────────────────────

type JsonRecord = Record<string, unknown>;

function isRecord(v: unknown): v is JsonRecord {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isProd(): boolean {
  const a = (Deno.env.get("APP_ENV") ?? "").trim().toLowerCase();
  const n = (Deno.env.get("NODE_ENV") ?? "").trim().toLowerCase();
  return a === "production" || n === "production";
}

function readBodySize(req: Request): number {
  const raw = req.headers.get("content-length");
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) ? n : 0;
}

function asString(v: unknown, max = 256): string {
  if (typeof v !== "string") return "";
  const s = v.trim();
  if (!s) return "";
  return s.length > max ? s.slice(0, max) : s;
}

function isAction(v: unknown): v is Action {
  return typeof v === "string" && (ACTIONS as readonly string[]).includes(v);
}

function safeDateMs(v: unknown): number | null {
  if (typeof v !== "string" || !v) return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
}

function getFreshWindowMs(): number {
  const raw = (Deno.env.get("RISK_FRESH_MS") ?? "").trim();
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : CONFIG.RISK_FRESH_MS_DEFAULT;
}

function parseBody(raw: unknown): { sessionId: string; action: Action } | null {
  if (!isRecord(raw)) return null;

  const sessionId = asString(raw.sessionId ?? raw.session_id, CONFIG.SESSION_ID_MAX_LEN);
  const action = raw.action;

  if (!sessionId || !CONFIG.SESSION_ID_RE.test(sessionId)) return null;
  if (!isAction(action)) return null;

  return { sessionId, action };
}

// ─────────────────────────────────────────────────────────────────────────────
// Audit (best effort — never throws, fully typed)
// ─────────────────────────────────────────────────────────────────────────────

type AuditInsert = Database["public"]["Tables"]["auth_audit_log"]["Insert"];

async function audit(
  db: SvcClient,
  params: {
    userId: string | null;
    eventType: string;
    ipAddress: string | null;
    riskScore?: number | null;
    deviceId?: string | null;
    eventData?: Json | null;
    createdAtIso?: string;
  },
): Promise<void> {
  const row: AuditInsert = {
    user_id: params.userId,
    event_type: params.eventType,
    ip_address: params.ipAddress,
    risk_score: params.riskScore ?? null,
    device_id: params.deviceId ?? null,
    event_data: params.eventData ?? null,
    created_at: params.createdAtIso ?? new Date().toISOString(),
  };

  try {
    await db.from("auth_audit_log").insert(row);
  } catch {
    // best-effort only
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cooldown (anti-spam) — table exists: auth_session_validation_cooldowns
// PK/unique: (user_id, session_id, action)
// ─────────────────────────────────────────────────────────────────────────────

async function enforceCooldown(
  db: SvcClient,
  userId: string,
  sessionId: string,
  action: Action,
): Promise<{ allowed: true; retryAfterMs: 0 } | { allowed: false; retryAfterMs: number }> {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  const { data, error } = await db
    .from("auth_session_validation_cooldowns")
    .select("last_seen_at")
    .eq("user_id", userId)
    .eq("session_id", sessionId)
    .eq("action", action)
    .maybeSingle();

  if (error) {
    // Fail closed if cooldown table breaks (this endpoint is a security gate)
    throw new Error(`Cooldown read failed: ${error.message}`);
  }

  const lastMs = safeDateMs(data?.last_seen_at ?? null);
  if (lastMs !== null && now - lastMs < CONFIG.COOLDOWN_MS) {
    return { allowed: false, retryAfterMs: CONFIG.COOLDOWN_MS - (now - lastMs) };
  }

  const { error: upErr } = await db
    .from("auth_session_validation_cooldowns")
    .upsert(
      { user_id: userId, session_id: sessionId, action, last_seen_at: nowIso },
      { onConflict: "user_id,session_id,action" },
    );

  if (upErr) {
    throw new Error(`Cooldown upsert failed: ${upErr.message}`);
  }

  return { allowed: true, retryAfterMs: 0 };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return err(req, "METHOD_NOT_ALLOWED", "Method not allowed", 405);
  }

  // Body size guard (best-effort, Content-Length may be missing/incorrect)
  const len = readBodySize(req);
  if (len > CONFIG.MAX_BODY_BYTES) {
    return err(req, "PAYLOAD_TOO_LARGE", "Payload too large", 413);
  }

  // Auth
  let user: { id: string; email?: string | null };
  try {
    user = await requireAuth(req);
  } catch (e) {
    if (e instanceof AuthError) return err(req, e.code, e.message, e.status);
    return err(req, "AUTH_ERROR", "Authentication failed", 401);
  }

  // Prod-only: require Cloudflare country header
  if (isProd()) {
    const cf = req.headers.get("CF-IPCountry");
    if (!cf || !cf.trim()) {
      return err(req, "MISSING_CF_COUNTRY", "Missing CF-IPCountry header", 400);
    }
  }

  // Parse body
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return err(req, "INVALID_BODY", "Request body must be valid JSON", 400);
  }

  const body = parseBody(raw);
  if (!body) {
    return err(req, "BAD_REQUEST", "Invalid request payload", 400);
  }

  const db: SvcClient = serviceClient();
  const ip = clientIp(req);

  // Cooldown anti-spam
  try {
    const cool = await enforceCooldown(db, user.id, body.sessionId, body.action);
    if (!cool.allowed) {
      return ok(req, {
        valid: false,
        reason: "COOLDOWN",
        retryAfterMs: cool.retryAfterMs,
        riskScore: 0,
      });
    }
  } catch (e) {
    // Fail closed (security gate)
    return err(req, "COOLDOWN_ERROR", e instanceof Error ? e.message : "Cooldown error", 503);
  }

  // Load session meta (fail-closed if missing)
  const { data: sessionMeta, error: metaErr } = await db
    .from("auth_sessions_meta")
    .select("invalidated_at, invalidation_reason, is_trusted_device")
    .eq("session_id", body.sessionId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (metaErr) {
    return err(req, "DB_ERROR", "Failed to load session meta", 500);
  }

  if (!sessionMeta) {
    await audit(db, {
      userId: user.id,
      eventType: "suspicious_activity",
      ipAddress: ip,
      riskScore: 100,
      eventData: toJson(
        { reason: "session_meta_missing", action: body.action, sessionId: body.sessionId },
        {},
      ),
    });

    return ok(req, {
      valid: false,
      reason: "SESSION_UNKNOWN",
      riskScore: 100,
    });
  }

  // Invalidated session gate
  if (sessionMeta.invalidated_at) {
    await audit(db, {
      userId: user.id,
      eventType: "suspicious_activity",
      ipAddress: ip,
      riskScore: 100,
      eventData: toJson(
        {
          reason: "invalidated_session_used",
          action: body.action,
          sessionId: body.sessionId,
          invalidation_reason: sessionMeta.invalidation_reason ?? null,
        },
        {},
      ),
    });

    return ok(req, {
      valid: false,
      reason: "SESSION_INVALIDATED",
      riskScore: 100,
    });
  }

  // Fetch current risk score row
  const { data: riskRow, error: riskErr } = await db
    .from("auth_risk_scores")
    .select("risk_score, requires_step_up, requires_mfa, expires_at, evaluated_at")
    .eq("session_id", body.sessionId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (riskErr) {
    return err(req, "DB_ERROR", "Failed to load risk score", 500);
  }

  const currentScore = Number(riskRow?.risk_score ?? 0);

  // Determine freshness
  const nowMs = Date.now();
  const evalMs = safeDateMs(riskRow?.evaluated_at ?? null);
  const expMs = safeDateMs(riskRow?.expires_at ?? null);
  const freshWindowMs = getFreshWindowMs();

  const isFresh =
    evalMs !== null
      ? nowMs - evalMs <= freshWindowMs
      : expMs !== null
        ? expMs > nowMs
        : false;

  // High-sensitivity actions require a fresh risk evaluation
  if (HIGH_SENSITIVITY_ACTIONS.has(body.action) && !isFresh) {
    return ok(req, {
      valid: false,
      reason: "RISK_EVALUATION_REQUIRED",
      riskScore: currentScore,
      requiresDeviceTrust: !sessionMeta.is_trusted_device,
    });
  }

  // Step-up required
  if (riskRow?.requires_step_up) {
    return ok(req, {
      valid: false,
      reason: "STEP_UP_REQUIRED",
      riskScore: currentScore,
      requiresMfa: !!riskRow.requires_mfa,
    });
  }

  // Update last_active_at (best-effort)
  await audit(db, {
    userId: user.id,
    eventType: "session_validated",
    ipAddress: ip,
    riskScore: currentScore,
    eventData: toJson({ action: body.action, sessionId: body.sessionId }, {}),
  });

  try {
    await db
      .from("auth_sessions_meta")
      .update({ last_active_at: new Date().toISOString() })
      .eq("session_id", body.sessionId)
      .eq("user_id", user.id);
  } catch {
    // ignore
  }

  return ok(req, {
    valid: true,
    riskScore: currentScore,
    isTrustedDevice: !!sessionMeta.is_trusted_device,
  });
});