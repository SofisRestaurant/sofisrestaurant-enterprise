// supabase/functions/login-guard/index.ts
// =============================================================================
// LOGIN GUARD — Production Ready (2026, Senior Hardened)
// =============================================================================
// What this does:
// - Fail-closed CORS allowlist (no wildcard)
// - Strict, byte-limited JSON parsing (does NOT trust Content-Length)
// - Normalizes + validates email/password length
// - Best-effort trusted client IP extraction (CF first, then XFF)
// - Per-IP minute throttle via login_attempts (head count)
// - IP block table enforcement (ip_blocks)
// - Email lockout escalation (account_lockouts)
// - Performs auth via anon-key client: auth.signInWithPassword()
// - Always logs login_attempts (best-effort)
// - Optional: writes password_fingerprints + password_attempts (best-effort)
// - Never leaks whether an email exists (generic failures)
//
// Tables expected (your schema shows these exist):
// - public.login_attempts (id, email, ip, user_agent, success, created_at)
// - public.ip_blocks (ip, reason, blocked_until, created_at)
// - public.account_lockouts (email, failed_attempts, locked_until, updated_at)
// - public.password_fingerprints (fingerprint, created_at)   (NOTE: no updated_at in your schema dump)
// - public.password_attempts (ip_address, attempts, last_attempt) (NOTE: column is last_attempt, not last_attempt_at)
// - public.fraud_logs (metadata jsonb)  (optional: best-effort signal)
//
// IMPORTANT:
// - Do not store raw password anywhere.
// - Avoid logging raw email in fraud logs if you want minimal PII.
// =============================================================================

import { createAnonKeyClient, createServiceClient } from "../_shared/supabase.ts";
import type { Database, Json } from "../_shared/database.types.ts";
import { toJson } from "../_shared/json.ts";

// ─────────────────────────────────────────────────────────────
// CORS allowlist (fail-closed)
// ─────────────────────────────────────────────────────────────

const ALLOWED_ORIGINS = [
  "https://sofislegacy.com",
  "https://www.sofislegacy.com",
  "https://sofisrestaurant.netlify.app",
  "http://localhost:3000",
  "http://localhost:5173",
] as const;

function corsHeaders(req: Request): Record<string, string> | null {
  const origin = req.headers.get("origin") ?? "";
  const ok = (ALLOWED_ORIGINS as readonly string[]).includes(origin);
  if (!ok) return null;

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-application-name, x-request-id, x-idempotency-key",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

// ─────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────

const CONFIG = {
  MAX_BODY_BYTES: 6_000,
  EMAIL_MAX: 320,
  PASS_MAX: 200,
  UA_MAX: 400,

  // per-IP throttles
  MAX_PER_MIN_IP: 20,

  // IP block escalation
  FAIL_WINDOW_MIN: 15,
  IP_FAILS_TO_BLOCK: 10,
  IP_BLOCK_MINUTES: 60,

  // account lock escalation
  LOCK_THRESHOLDS: [
    { at: 5, ms: 5 * 60_000 },
    { at: 6, ms: 15 * 60_000 },
    { at: 7, ms: 30 * 60_000 },
    { at: 8, ms: 2 * 60 * 60_000 },
  ] as const,
} as const;

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

type Db = ReturnType<typeof createServiceClient>;

type LoginAttemptInsert = Database["public"]["Tables"]["login_attempts"]["Insert"];
type AccountLockoutUpsert = Database["public"]["Tables"]["account_lockouts"]["Insert"];
type IpBlockUpsert = Database["public"]["Tables"]["ip_blocks"]["Insert"];
type PasswordAttemptUpsert = Database["public"]["Tables"]["password_attempts"]["Insert"];
type PasswordFingerprintUpsert = Database["public"]["Tables"]["password_fingerprints"]["Insert"];

type JsonRecord = Record<string, unknown>;

type LoginBody = {
  email: string;
  password: string;
};

// ─────────────────────────────────────────────────────────────
// Response helpers
// ─────────────────────────────────────────────────────────────

function respondJson(headers: Record<string, string>, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

// Never leak “email exists” via message differences:
const GENERIC_FAIL = { error: "Invalid credentials" } as const;

function nowIso(): string {
  return new Date().toISOString();
}

// ─────────────────────────────────────────────────────────────
// Safe parsing / validation (no any)
// ─────────────────────────────────────────────────────────────

function isRecord(v: unknown): v is JsonRecord {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asTrimmedString(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  const s = v.trim();
  if (!s) return "";
  return s.length > max ? s.slice(0, max) : s;
}

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

function isEmailLike(email: string): boolean {
  if (!email) return false;
  if (email.length > CONFIG.EMAIL_MAX) return false;
  const at = email.indexOf("@");
  if (at <= 0) return false;
  if (at === email.length - 1) return false;
  return true;
}

async function readJsonWithByteLimit(req: Request, maxBytes: number): Promise<unknown> {
  const ct = (req.headers.get("content-type") ?? "").toLowerCase();
  if (!ct.includes("application/json")) throw new Error("UNSUPPORTED_MEDIA_TYPE");

  const ab = await req.arrayBuffer();
  if (ab.byteLength > maxBytes) throw new Error("BODY_TOO_LARGE");

  const text = new TextDecoder().decode(ab);
  if (!text.trim()) throw new Error("EMPTY_BODY");

  try {
    return JSON.parse(text);
  } catch {
    throw new Error("BAD_JSON");
  }
}

function parseLoginBody(raw: unknown): LoginBody | null {
  if (!isRecord(raw)) return null;

  const email = normalizeEmail(asTrimmedString(raw.email, CONFIG.EMAIL_MAX));
  const password = asTrimmedString(raw.password, CONFIG.PASS_MAX);

  if (!isEmailLike(email)) return null;
  if (!password) return null;

  return { email, password };
}

// ─────────────────────────────────────────────────────────────
// IP + fingerprint
// ─────────────────────────────────────────────────────────────

function pickClientIp(req: Request): string {
  const cf = req.headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;

  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const ip = xff.split(",")[0]?.trim();
    if (ip) return ip;
  }

  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  return "unknown";
}

function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  return crypto.subtle.digest("SHA-256", data).then((buf) =>
    Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  );
}

async function createFingerprint(ip: string, userAgent: string): Promise<string> {
  // Real await = lint satisfied + correct crypto usage
  return await sha256Hex(`${ip}|${userAgent}`);
}

// ─────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────

function lockDurationMs(failedAttempts: number): number {
  let dur = 0;
  for (const rule of CONFIG.LOCK_THRESHOLDS) {
    if (failedAttempts >= rule.at) dur = rule.ms;
  }
  return dur;
}

async function bestEffort(task: () => Promise<unknown>): Promise<void> {
  try {
    await task();
  } catch {
    // ignore
  }
}

// ─────────────────────────────────────────────────────────────
// DB helpers
// ─────────────────────────────────────────────────────────────

async function countAttemptsInLastMinute(db: Db, ip: string, sinceIso: string): Promise<number> {
  const { count, error } = await db
    .from("login_attempts")
    .select("id", { count: "exact", head: true })
    .eq("ip", ip)
    .gte("created_at", sinceIso);

  if (error) return 0;
  return count ?? 0;
}

async function isIpBlocked(db: Db, ip: string, now: Date): Promise<boolean> {
  const { data, error } = await db
    .from("ip_blocks")
    .select("blocked_until")
    .eq("ip", ip)
    .maybeSingle();

  if (error || !data?.blocked_until) return false;
  return new Date(data.blocked_until) > now;
}

async function getAccountLock(
  db: Db,
  email: string,
  now: Date,
): Promise<{ locked: boolean; failedAttempts: number }> {
  const { data, error } = await db
    .from("account_lockouts")
    .select("failed_attempts, locked_until")
    .eq("email", email)
    .maybeSingle();

  if (error || !data) return { locked: false, failedAttempts: 0 };

  const lockedUntil = data.locked_until ? new Date(data.locked_until) : null;
  const locked = !!(lockedUntil && lockedUntil > now);

  const failedAttempts =
    typeof data.failed_attempts === "number" && Number.isFinite(data.failed_attempts)
      ? data.failed_attempts
      : 0;

  return { locked, failedAttempts };
}

async function upsertAccountLock(db: Db, email: string, failedAttempts: number, now: Date): Promise<void> {
  const dur = lockDurationMs(failedAttempts);
  const lockedUntil = dur ? new Date(now.getTime() + dur).toISOString() : null;

  const payload: AccountLockoutUpsert = {
    email,
    failed_attempts: failedAttempts,
    locked_until: lockedUntil,
    updated_at: now.toISOString(),
  };

  await db.from("account_lockouts").upsert(payload, { onConflict: "email" });
}

async function resetAccountLock(db: Db, email: string): Promise<void> {
  await db.from("account_lockouts").delete().eq("email", email);
}

async function blockIp(db: Db, ip: string, untilIso: string, reason: string): Promise<void> {
  const payload: IpBlockUpsert = {
    ip,
    reason,
    blocked_until: untilIso,
    // created_at is nullable + default now(); OK to omit.
  };

  await db.from("ip_blocks").upsert(payload, { onConflict: "ip" });
}

async function countIpFailuresInWindow(db: Db, ip: string, sinceIso: string): Promise<number> {
  const { count, error } = await db
    .from("login_attempts")
    .select("id", { count: "exact", head: true })
    .eq("ip", ip)
    .eq("success", false)
    .gte("created_at", sinceIso);

  if (error) return 0;
  return count ?? 0;
}

// password_attempts schema (your dump):
// - ip_address (pk), attempts, last_attempt
async function updatePasswordAttempts(db: Db, ip: string, success: boolean, now: Date): Promise<void> {
  const nowIsoStr = now.toISOString();

  if (success) {
    const payload: PasswordAttemptUpsert = {
      ip_address: ip,
      attempts: 0,
      last_attempt: nowIsoStr,
    };
    await db.from("password_attempts").upsert(payload, { onConflict: "ip_address" });
    return;
  }

  const { data } = await db
    .from("password_attempts")
    .select("attempts")
    .eq("ip_address", ip)
    .maybeSingle();

  const prev = typeof data?.attempts === "number" && Number.isFinite(data.attempts) ? data.attempts : 0;
  const next = Math.min(prev + 1, 10_000);

  const payload: PasswordAttemptUpsert = {
    ip_address: ip,
    attempts: next,
    last_attempt: nowIsoStr,
  };

  await db.from("password_attempts").upsert(payload, { onConflict: "ip_address" });
}

// password_fingerprints schema (your dump):
// - fingerprint (pk), created_at
async function upsertFingerprint(db: Db, fingerprint: string, now: Date): Promise<void> {
  const payload: PasswordFingerprintUpsert = {
    fingerprint,
    created_at: now.toISOString(),
  };
  await db.from("password_fingerprints").upsert(payload, { onConflict: "fingerprint" });
}

async function logAttempt(db: Db, row: LoginAttemptInsert): Promise<void> {
  await db.from("login_attempts").insert(row);
}

// Optional: best-effort fraud log on IP block
async function logFraudIpBlock(
  db: Db,
  params: { ip: string; fingerprint: string; windowMinutes: number },
): Promise<void> {
  // fraud_logs.metadata is jsonb → must be Json
  const metadata: Json = toJson(
    {
      ip: params.ip,
      fingerprint: params.fingerprint,
      window_minutes: params.windowMinutes,
      source: "login-guard",
    },
    {}, // fallback object
  );

  await db.from("fraud_logs").insert({
    reason: "ip_auto_block_login_guard",
    stripe_total: 0,
    created_at: nowIso(),
    metadata,
    // user_id is nullable and we don't have it here (pre-auth) → omit
  });
}

// ─────────────────────────────────────────────────────────────
// Handler
// ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  if (!cors) return new Response("Origin not allowed", { status: 403 });

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return respondJson(cors, { error: "Method not allowed" }, 405);

  // Parse bounded JSON
  let parsed: LoginBody | null = null;
  try {
    const raw = await readJsonWithByteLimit(req, CONFIG.MAX_BODY_BYTES);
    parsed = parseLoginBody(raw);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "BAD_REQUEST";
    if (msg === "UNSUPPORTED_MEDIA_TYPE") {
      return respondJson(cors, { error: "Content-Type must be application/json" }, 415);
    }
    if (msg === "BODY_TOO_LARGE") return respondJson(cors, { error: "Payload too large" }, 413);
    return respondJson(cors, { error: "Invalid request" }, 400);
  }

  if (!parsed) return respondJson(cors, { error: "Invalid request" }, 400);

  const { email, password } = parsed;

  const ip = pickClientIp(req);
  const userAgent = asTrimmedString(req.headers.get("user-agent") ?? "unknown", CONFIG.UA_MAX);

  const now = new Date();
  const nowIsoStr = now.toISOString();

  const svc = createServiceClient();
  const anon = createAnonKeyClient();

  // 1) Per-IP minute throttle
  const minuteAgoIso = new Date(now.getTime() - 60_000).toISOString();
  const perMin = await countAttemptsInLastMinute(svc, ip, minuteAgoIso);
  if (perMin >= CONFIG.MAX_PER_MIN_IP) {
    return respondJson(cors, { error: "Too many requests. Slow down." }, 429);
  }

  // 2) IP hard block check
  const blocked = await isIpBlocked(svc, ip, now);
  if (blocked) return respondJson(cors, { error: "Too many attempts. Please wait." }, 429);

  // 3) Email lockout check
  const lock = await getAccountLock(svc, email, now);
  if (lock.locked) {
    return respondJson(cors, { error: "Too many attempts. Please wait." }, 423);
  }

  // 4) Attempt login via Supabase Auth (anon-key)
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  const success = !error && !!data?.session;

  // 5) Always log the attempt (best-effort)
  await bestEffort(() =>
    logAttempt(svc, {
      email,
      ip,
      user_agent: userAgent,
      success,
      created_at: nowIsoStr,
    }),
  );

  // 6) Optional: fingerprint + password_attempts (best-effort)
  const fingerprint = await createFingerprint(ip, userAgent);
  await bestEffort(() => upsertFingerprint(svc, fingerprint, now));
  await bestEffort(() => updatePasswordAttempts(svc, ip, success, now));

  // 7) If fail: increment account lockouts + potentially block IP
  if (!success) {
    const newFailedAttempts = Math.min(lock.failedAttempts + 1, 10_000);
    await bestEffort(() => upsertAccountLock(svc, email, newFailedAttempts, now));

    const windowIso = new Date(now.getTime() - CONFIG.FAIL_WINDOW_MIN * 60_000).toISOString();
    const ipFails = await countIpFailuresInWindow(svc, ip, windowIso);

    if (ipFails >= CONFIG.IP_FAILS_TO_BLOCK) {
      const blockUntil = new Date(now.getTime() + CONFIG.IP_BLOCK_MINUTES * 60_000).toISOString();
      await bestEffort(() => blockIp(svc, ip, blockUntil, "Auto IP block (login failures)"));
      await bestEffort(() =>
        logFraudIpBlock(svc, { ip, fingerprint, windowMinutes: CONFIG.FAIL_WINDOW_MIN }),
      );

      return respondJson(cors, { error: "Too many attempts. Please wait." }, 429);
    }

    return respondJson(cors, GENERIC_FAIL, 401);
  }

  // 8) On success: reset account lock (best-effort) and return session
  await bestEffort(() => resetAccountLock(svc, email));

  // Only return what the client needs (session contains tokens)
  return respondJson(cors, { session: data.session }, 200);
});