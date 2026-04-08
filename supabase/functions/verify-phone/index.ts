// supabase/functions/verify-phone/index.ts

import { createClient } from "@supabase/supabase-js";
import { getTwilioEnv, sendVerifyOtp, checkVerifyOtp, normalizePhone } from "../_shared/twilio.ts";
import { corsHeaders } from "../_shared/cors.ts";

const UUID_RE           = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_SEND_ATTEMPTS = 3;
const WINDOW_MINUTES    = 10;

function jsonResponse(req: Request, body: unknown, status = 200): Response {
  const cors = corsHeaders(req);
  const headers: Record<string, string> = { "Content-Type": "application/json", ...(cors ?? {}) };
  return new Response(JSON.stringify(body), { status, headers });
}

function structuredLog(outcome: string, action: string, detail: Record<string, unknown>): void {
  console.log(JSON.stringify({ ts: new Date().toISOString(), fn: "verify-phone", outcome, action, ...detail }));
}

async function hashPhone(phone: string): Promise<string> {
  const data = new TextEncoder().encode(phone);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    const cors = corsHeaders(req);
    if (!cors) return new Response("Origin not allowed", { status: 403 });
    return new Response(null, { status: 204, headers: cors });
  }
  if (req.method !== "POST") return jsonResponse(req, { ok: false, error: "Method not allowed" }, 405);

  let body: Record<string, unknown>;
  try { body = await req.json() as Record<string, unknown>; }
  catch { return jsonResponse(req, { ok: false, error: "Invalid JSON" }, 400); }

  const twilioEnv   = getTwilioEnv();
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db          = createClient(supabaseUrl, serviceKey);

  // ── SEND OTP ────────────────────────────────────────────────────────────

  if (body.action === "send") {
    const normalized = normalizePhone(typeof body.phone === "string" ? body.phone : "");
    if (!normalized) return jsonResponse(req, { ok: false, error: "Invalid phone number. Use format: +12025551234" }, 400);

    const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString();
    const phoneHash   = await hashPhone(normalized);

    const { count: recentAttempts } = await db
      .from("sms_verify_attempts")
      .select("id", { count: "exact", head: true })
      .eq("phone_hash", phoneHash)
      .gte("created_at", windowStart);

    if ((recentAttempts ?? 0) >= MAX_SEND_ATTEMPTS) {
      structuredLog("rate_limited", "send", { phone_suffix: normalized.slice(-4) });
      return jsonResponse(req, { ok: false, error: `Too many attempts. Please wait ${WINDOW_MINUTES} minutes.` }, 429);
    }

    try {
      await db.from("sms_verify_attempts").insert({ phone_hash: phoneHash, created_at: new Date().toISOString() });
    } catch (e) {
      structuredLog("db_warn", "send", { detail: "attempt_log_failed", error: String(e) });
    }

    const result = await sendVerifyOtp({ env: twilioEnv, to: normalized, channel: "sms" });
    if (!result.ok) {
      structuredLog("failed", "send", { error: result.error, phone_suffix: normalized.slice(-4) });
      return jsonResponse(req, { ok: false, error: result.error ?? "Failed to send code" }, 502);
    }

    structuredLog("sent", "send", { phone_suffix: normalized.slice(-4) });
    return jsonResponse(req, { ok: true, normalizedPhone: result.normalizedPhone, status: result.status });
  }

  // ── CHECK OTP ───────────────────────────────────────────────────────────

  if (body.action === "check") {
    const normalized = normalizePhone(typeof body.phone === "string" ? body.phone : "");
    const code       = typeof body.code === "string" ? body.code.replace(/\D/g, "").slice(0, 8) : "";
    const orderId    = typeof body.order_id === "string" && UUID_RE.test(body.order_id) ? body.order_id : null;

    if (!normalized) return jsonResponse(req, { ok: false, error: "Invalid phone number" }, 400);
    if (!code)       return jsonResponse(req, { ok: false, error: "Code is required" }, 400);

    const result = await checkVerifyOtp({ env: twilioEnv, to: normalized, code });

    if (!result.ok) {
      structuredLog("failed", "check", { error: result.error, phone_suffix: normalized.slice(-4) });
      return jsonResponse(req, { ok: false, valid: false, error: result.error }, 502);
    }
    if (!result.valid) {
      structuredLog("invalid", "check", { phone_suffix: normalized.slice(-4) });
      return jsonResponse(req, { ok: true, valid: false, error: "Incorrect code. Please try again." });
    }

    if (orderId) {
      const { error: updateError } = await db
        .from("orders")
        .update({ customer_phone: result.normalizedPhone ?? normalized, updated_at: new Date().toISOString() })
        .eq("id", orderId);

      if (updateError) {
        structuredLog("db_error", "check", { detail: "customer_phone update failed", order_id: orderId, error: updateError.message });
      } else {
        structuredLog("verified", "check", { order_id: orderId, phone_suffix: normalized.slice(-4) });
      }
    }

    return jsonResponse(req, { ok: true, valid: true });
  }

  return jsonResponse(req, { ok: false, error: `Unknown action: ${body.action}` }, 400);
});