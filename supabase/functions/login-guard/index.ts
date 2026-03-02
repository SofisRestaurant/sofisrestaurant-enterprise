// supabase/functions/login-guard/index.ts
// =============================================================================
// LOGIN GUARD — hardened, clean separation:
//   - anonKeyClient for auth.signInWithPassword
//   - svc for DB tables + logging + blocks
// =============================================================================

import {
  createAnonKeyClient,
  createServiceClient,
} from "../_shared/supabase.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-application-name",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function asString(v: unknown, max = 320): string {
  return String(v ?? "").slice(0, max).trim();
}

async function createFingerprint(ip: string, userAgent: string) {
  const data = new TextEncoder().encode(ip + "|" + userAgent);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const payload = (await req.json()) as Record<string, unknown>;
    const email = asString(payload.email, 320).toLowerCase();
    const password = asString(payload.password, 200);

    if (!email || !password || !email.includes("@")) {
      return json({ error: "Invalid request" }, 400);
    }

    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      "unknown";

    const userAgent = req.headers.get("user-agent") || "unknown";
    const now = new Date();

    // ✅ DB (privileged) client for rate limits + logging
    const svc = createServiceClient();

    // ✅ Auth (anon) client for login
    const anonKeyClient = createAnonKeyClient();

    /* ======================================================
       1️⃣ GLOBAL RATE THROTTLE (20 per minute per IP)
    ====================================================== */
    const { count: minuteCount } = await svc
      .from("login_attempts")
      .select("id", { count: "exact", head: true })
      .eq("ip", ip)
      .gte("created_at", new Date(now.getTime() - 60_000).toISOString());

    if ((minuteCount ?? 0) >= 20) {
      return json({ error: "Too many requests. Slow down." }, 429);
    }

    /* ======================================================
       2️⃣ IP BLOCK CHECK
    ====================================================== */
    const { data: ipBlock } = await svc
      .from("ip_blocks")
      .select("blocked_until")
      .eq("ip", ip)
      .maybeSingle();

    if (ipBlock?.blocked_until && new Date(ipBlock.blocked_until) > now) {
      return json({ error: "IP temporarily blocked." }, 429);
    }

    /* ======================================================
       3️⃣ ACCOUNT LOCK CHECK
    ====================================================== */
    const { data: accountLock } = await svc
      .from("account_lockouts")
      .select("failed_attempts, locked_until")
      .eq("email", email)
      .maybeSingle();

    if (accountLock?.locked_until && new Date(accountLock.locked_until) > now) {
      return json({ error: "Account temporarily locked." }, 423);
    }

    /* ======================================================
       4️⃣ ATTEMPT LOGIN (ANON KEY CLIENT)
    ====================================================== */
    const { data, error } = await anonKeyClient.auth.signInWithPassword({
      email,
      password,
    });

    const success = !error;

    // Always log attempt (service client)
    await svc.from("login_attempts").insert({
      email,
      ip,
      user_agent: userAgent,
      success,
      created_at: now.toISOString(),
    });

    /* ======================================================
       5️⃣ PASSWORD ATTEMPTS TABLE (IP-level tracking)
    ====================================================== */
    await svc.from("password_attempts").upsert(
      {
        ip_address: ip,
        attempts: success ? 0 : 1,
        last_attempt_at: now.toISOString(),
      },
      { onConflict: "ip_address" },
    );

    /* ======================================================
       6️⃣ FINGERPRINT STORE
    ====================================================== */
    const fingerprint = await createFingerprint(ip, userAgent);
    await svc.from("password_fingerprints").upsert(
      { fingerprint, updated_at: now.toISOString() },
      { onConflict: "fingerprint" },
    );

    /* ======================================================
       7️⃣ FAILED LOGIN LOGIC
    ====================================================== */
    if (error) {
      const newAttempts = (accountLock?.failed_attempts ?? 0) + 1;

      let lockDuration = 0;
      if (newAttempts >= 8) lockDuration = 2 * 60 * 60 * 1000;
      else if (newAttempts === 7) lockDuration = 30 * 60 * 1000;
      else if (newAttempts === 6) lockDuration = 15 * 60 * 1000;
      else if (newAttempts === 5) lockDuration = 5 * 60 * 1000;

      await svc.from("account_lockouts").upsert(
        {
          email,
          failed_attempts: newAttempts,
          locked_until: lockDuration ? new Date(now.getTime() + lockDuration).toISOString() : null,
          updated_at: now.toISOString(),
        },
        { onConflict: "email" },
      );

      // IP escalation: failures in last 15 minutes
      const { count: ipFails } = await svc
        .from("login_attempts")
        .select("id", { count: "exact", head: true })
        .eq("ip", ip)
        .eq("success", false)
        .gte("created_at", new Date(now.getTime() - 15 * 60_000).toISOString());

      if ((ipFails ?? 0) >= 10) {
        const blockUntil = new Date(now.getTime() + 60 * 60_000).toISOString();

        await svc.from("ip_blocks").upsert(
          {
            ip,
            reason: "Auto IP block",
            blocked_until: blockUntil,
            updated_at: now.toISOString(),
          },
          { onConflict: "ip" },
        );

        await svc.from("fraud_logs").insert({
          reason: "IP auto block triggered",
          created_at: now.toISOString(),
          metadata: {
            email,
            ip,
            timestamp: now.toISOString(),
          },
        });

        return json({ error: "IP blocked." }, 429);
      }

      return json({ error: "Invalid credentials" }, 401);
    }

    /* ======================================================
       8️⃣ SUCCESS → RESET LOCK
    ====================================================== */
    await svc.from("account_lockouts").delete().eq("email", email);

    // Return session (you can also return user, access_token, etc.)
    return json({ session: data.session }, 200);

  } catch (e) {
    console.error("Login guard fatal error:", e);
    return json({ error: "Server error" }, 500);
  }
});