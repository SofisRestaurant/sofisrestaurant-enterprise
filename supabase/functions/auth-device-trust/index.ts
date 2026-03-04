// supabase/functions/auth-device-trust/index.ts
// =============================================================================
// AUTH DEVICE TRUST — Enterprise Hardened (2026)
// ----------------------------------------------------------------------------
// POST /auth-device-trust
// Body: { action: 'check' | 'register' | 'revoke', fingerprintHash: string, label?: string }
//
// Standards:
// - JWT required (requireAuth)
// - fingerprintHash validated (64 hex chars)
// - Writes via service role (server-trusted)
// - Fail-closed CORS via shared handlePreflight()
// - Real byte-limited JSON parsing (does NOT trust Content-Length)
// - Idempotent register + safe revoke
// - Best-effort audit logging (never blocks response)
// - No background DB updates without catching errors
// - No `any`
// =============================================================================

import { requireAuth, serviceClient, AuthError } from "../_shared/auth.ts";
import { handlePreflight, ok, err, clientIp } from "../_shared/http.ts";
import type { Database, Json } from "../_shared/database.types.ts";

const CONFIG = {
  MAX_BODY_BYTES: 5_000, // tiny payload only
  MAX_LABEL_LEN: 100,
  FP_MAX_LEN: 128,
} as const;

const FINGERPRINT_RE = /^[0-9a-f]{64}$/i;

type Action = "check" | "register" | "revoke";

type JsonRecord = Record<string, unknown>;

function isRecord(v: unknown): v is JsonRecord {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isAction(v: unknown): v is Action {
  return v === "check" || v === "register" || v === "revoke";
}

function asString(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

function nowIso(): string {
  return new Date().toISOString();
}

// Hard-limit JSON parsing (real bytes, not Content-Length)
async function readJsonWithLimit(req: Request, maxBytes: number): Promise<unknown> {
  const ct = (req.headers.get("content-type") ?? "").toLowerCase();
  if (!ct.includes("application/json")) throw new Error("UNSUPPORTED_CONTENT_TYPE");

  const ab = await req.arrayBuffer();
  if (ab.byteLength > maxBytes) throw new Error("PAYLOAD_TOO_LARGE");

  const text = new TextDecoder().decode(ab);
  if (!text.trim()) throw new Error("EMPTY_BODY");

  try {
    return JSON.parse(text);
  } catch {
    throw new Error("INVALID_JSON");
  }
}

// Convert unknown → Json safely (no `any`)
function toJson(v: unknown): Json | null {
  if (v === null) return null;
  try {
    return JSON.parse(JSON.stringify(v)) as Json;
  } catch {
    return null;
  }
}

type Db = ReturnType<typeof serviceClient>;
type AuthAuditInsert = Database["public"]["Tables"]["auth_audit_log"]["Insert"];

async function audit(
  db: Db,
  row: {
    user_id: string | null;
    event_type: string;
    ip_address: string | null;
    risk_score?: number | null;
    device_id?: string | null;
    event_data?: Json | null;
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
    await db.from("auth_audit_log").insert(payload);
  } catch {
    // best-effort; never block
  }
}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return err(req, "METHOD_NOT_ALLOWED", "Method not allowed", 405);
  }

  // ── Auth ────────────────────────────────────────────────────────────────
  let user: { id: string; email: string | null };
  try {
    user = await requireAuth(req);
  } catch (e) {
    if (e instanceof AuthError) return err(req, e.code, e.message, e.status);
    return err(req, "AUTH_ERROR", "Authentication failed", 401);
  }

  const db = serviceClient();
  const ip = clientIp(req);

  // ── Parse body (real byte limit) ─────────────────────────────────────────
  let raw: unknown;
  try {
    raw = await readJsonWithLimit(req, CONFIG.MAX_BODY_BYTES);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "INVALID_BODY";
    if (msg === "PAYLOAD_TOO_LARGE") return err(req, "PAYLOAD_TOO_LARGE", "Payload too large", 413);
    if (msg === "UNSUPPORTED_CONTENT_TYPE") {
      return err(req, "UNSUPPORTED_MEDIA_TYPE", "Content-Type must be application/json", 415);
    }
    if (msg === "EMPTY_BODY") return err(req, "INVALID_BODY", "Request body cannot be empty", 400);
    return err(req, "INVALID_BODY", "Request body must be valid JSON", 400);
  }

  if (!isRecord(raw)) {
    return err(req, "INVALID_BODY", "Request body must be a JSON object", 400);
  }

  const action = raw.action;
  const fingerprintHash = asString(raw.fingerprintHash, CONFIG.FP_MAX_LEN);
  const label = asString(raw.label, CONFIG.MAX_LABEL_LEN);

  if (!isAction(action)) {
    return err(req, "INVALID_ACTION", "action must be one of: check, register, revoke", 400);
  }

  if (!fingerprintHash || !FINGERPRINT_RE.test(fingerprintHash)) {
    return err(req, "INVALID_FINGERPRINT", "fingerprintHash must be 64 hex chars", 400);
  }

  // ────────────────────────────────────────────────────────────────────────
  // CHECK
  // ────────────────────────────────────────────────────────────────────────
  if (action === "check") {
    const { data, error } = await db
      .from("device_trust")
      .select("id, trusted_at, trust_label, last_seen_at, is_revoked")
      .eq("user_id", user.id)
      .eq("fingerprint_hash", fingerprintHash)
      .maybeSingle();

    if (error) return err(req, "DB_ERROR", "Failed to check device trust", 500);

    const trusted = !!data && data.is_revoked !== true;

    // Best-effort last_seen update
    if (trusted && data?.id) {
      try {
        await db.from("device_trust").update({ last_seen_at: nowIso() }).eq("id", data.id);
      } catch {
        // ignore
      }
    }

    await audit(db, {
      user_id: user.id,
      event_type: "device_trust_check",
      ip_address: ip,
      event_data: toJson({ trusted }),
    });

    return ok(req, {
      trusted,
      trustedAt: trusted ? data?.trusted_at ?? null : null,
      trustLabel: trusted ? data?.trust_label ?? null : null,
      lastSeenAt: trusted ? data?.last_seen_at ?? null : null,
    });
  }

  // ────────────────────────────────────────────────────────────────────────
  // REVOKE (idempotent, explicit)
  // ────────────────────────────────────────────────────────────────────────
  if (action === "revoke") {
    const { data: row, error: readErr } = await db
      .from("device_trust")
      .select("id, is_revoked")
      .eq("user_id", user.id)
      .eq("fingerprint_hash", fingerprintHash)
      .maybeSingle();

    if (readErr) return err(req, "DB_ERROR", "Failed to revoke device trust", 500);

    if (!row) {
      await audit(db, {
        user_id: user.id,
        event_type: "device_trust_revoke_not_found",
        ip_address: ip,
        event_data: toJson({ fingerprint_present: true }),
      });
      return ok(req, { revoked: false, reason: "not_found" });
    }

    if (row.is_revoked === true) {
      return ok(req, { revoked: true, alreadyRevoked: true });
    }

    const { error: updErr } = await db
      .from("device_trust")
      .update({ is_revoked: true, revoked_at: nowIso() })
      .eq("id", row.id);

    if (updErr) return err(req, "DB_ERROR", "Failed to revoke device trust", 500);

    await audit(db, {
      user_id: user.id,
      event_type: "device_trust_revoked",
      ip_address: ip,
      device_id: row.id,
      event_data: toJson({}),
    });

    return ok(req, { revoked: true, alreadyRevoked: false });
  }

  // ────────────────────────────────────────────────────────────────────────
  // REGISTER (idempotent; does NOT silently re-trust revoked devices)
  // ────────────────────────────────────────────────────────────────────────
  const { data: existing, error: exErr } = await db
    .from("device_trust")
    .select("id, is_revoked, trusted_at")
    .eq("user_id", user.id)
    .eq("fingerprint_hash", fingerprintHash)
    .maybeSingle();

  if (exErr) return err(req, "DB_ERROR", "Failed to check existing device trust", 500);

  if (existing?.is_revoked === true) {
    await audit(db, {
      user_id: user.id,
      event_type: "device_trust_register_blocked_revoked",
      ip_address: ip,
      device_id: existing.id ?? null,
      event_data: toJson({}),
    });
    return err(req, "DEVICE_REVOKED", "This device has been revoked and cannot be re-trusted", 403);
  }

  if (existing?.id) {
    // Idempotent: already trusted
    return ok(req, { trusted: true, created: false, trustedAt: existing.trusted_at ?? null });
  }

  const ts = nowIso();
  const { data: inserted, error: insErr } = await db
    .from("device_trust")
    .insert({
      user_id: user.id,
      fingerprint_hash: fingerprintHash,
      trust_label: label ?? null,
      trusted_at: ts,
      last_seen_at: ts,
      ip_at_trust: ip,
      is_revoked: false,
    })
    .select("id, trusted_at")
    .single();

  if (insErr) return err(req, "TRUST_FAILED", "Failed to register device trust", 500);

  await audit(db, {
    user_id: user.id,
    event_type: "device_trust_granted",
    ip_address: ip,
    device_id: inserted.id,
    event_data: toJson({ label: label ?? null }),
  });

  return ok(req, { trusted: true, created: true, trustedAt: inserted.trusted_at }, 201);
});