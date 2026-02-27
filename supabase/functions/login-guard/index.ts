import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
  "authorization, x-client-info, apikey, content-type, x-application-name",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  })
}

async function createFingerprint(ip: string, userAgent: string) {
  const data = new TextEncoder().encode(ip + "|" + userAgent)
  const hashBuffer = await crypto.subtle.digest("SHA-256", data)
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("")
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const payload = await req.json()
    const { email, password } = payload ?? {}

    if (!email || !password) {
      return json({ error: "Invalid request" }, 400)
    }

    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      "unknown"

    const userAgent = req.headers.get("user-agent") || "unknown"
    const now = new Date()

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )

    /* ======================================================
       1️⃣ GLOBAL RATE THROTTLE (20 per minute per IP)
    ====================================================== */

    const { count: minuteCount } = await supabase
      .from("login_attempts")
      .select("*", { count: "exact", head: true })
      .eq("ip", ip)
      .gte(
        "created_at",
        new Date(now.getTime() - 60 * 1000).toISOString()
      )

    if ((minuteCount || 0) >= 20) {
      return json({ error: "Too many requests. Slow down." }, 429)
    }

    /* ======================================================
       2️⃣ IP BLOCK CHECK
    ====================================================== */

    const { data: ipBlock } = await supabase
      .from("ip_blocks")
      .select("blocked_until")
      .eq("ip", ip)
      .maybeSingle()

    if (ipBlock?.blocked_until && new Date(ipBlock.blocked_until) > now) {
      return json({ error: "IP temporarily blocked." }, 429)
    }

    /* ======================================================
       3️⃣ ACCOUNT LOCK CHECK
    ====================================================== */

    const { data: accountLock } = await supabase
      .from("account_lockouts")
      .select("failed_attempts, locked_until")
      .eq("email", email)
      .maybeSingle()

    if (
      accountLock?.locked_until &&
      new Date(accountLock.locked_until) > now
    ) {
      return json({ error: "Account temporarily locked." }, 423)
    }

    /* ======================================================
       4️⃣ ATTEMPT LOGIN
    ====================================================== */

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    const success = !error

    await supabase.from("login_attempts").insert({
      email,
      ip,
      user_agent: userAgent,
      success,
    })

    /* ======================================================
       5️⃣ PASSWORD ATTEMPTS TABLE (IP-level tracking)
    ====================================================== */

    await supabase.from("password_attempts").upsert({
      ip_address: ip,
      attempts: success
        ? 0
        : 1,
      last_attempt: now.toISOString(),
    }, { onConflict: "ip_address" })

    /* ======================================================
       6️⃣ FINGERPRINT STORE
    ====================================================== */

    const fingerprint = await createFingerprint(ip, userAgent)
    await supabase.from("password_fingerprints").upsert({
      fingerprint,
    })

    /* ======================================================
       7️⃣ FAILED LOGIN LOGIC
    ====================================================== */

    if (error) {
      const newAttempts = (accountLock?.failed_attempts || 0) + 1

      let lockDuration = 0
      if (newAttempts >= 8) lockDuration = 2 * 60 * 60 * 1000
      else if (newAttempts === 7) lockDuration = 30 * 60 * 1000
      else if (newAttempts === 6) lockDuration = 15 * 60 * 1000
      else if (newAttempts === 5) lockDuration = 5 * 60 * 1000

      await supabase.from("account_lockouts").upsert({
        email,
        failed_attempts: newAttempts,
        locked_until: lockDuration
          ? new Date(now.getTime() + lockDuration).toISOString()
          : null,
        updated_at: now.toISOString(),
      })

      /* ---------- IP ESCALATION ---------- */

      const { count: ipFails } = await supabase
        .from("login_attempts")
        .select("*", { count: "exact", head: true })
        .eq("ip", ip)
        .eq("success", false)
        .gte(
          "created_at",
          new Date(now.getTime() - 15 * 60 * 1000).toISOString()
        )

      if ((ipFails || 0) >= 10) {
        const blockUntil = new Date(
          now.getTime() + 60 * 60 * 1000
        ).toISOString()

        await supabase.from("ip_blocks").upsert({
          ip,
          reason: "Auto IP block",
          blocked_until: blockUntil,
        })

        await supabase.from("fraud_logs").insert({
          reason: "IP auto block triggered",
          metadata: {
            email,
            ip,
            timestamp: now.toISOString(),
          },
        })

        return json({ error: "IP blocked." }, 429)
      }

      return json({ error: "Invalid credentials" }, 401)
    }

    /* ======================================================
       8️⃣ SUCCESS → RESET LOCK
    ====================================================== */

    await supabase
      .from("account_lockouts")
      .delete()
      .eq("email", email)

    return json({ session: data.session }, 200)

  } catch (err) {
    console.error("Login guard fatal error:", err)
    return json({ error: "Server error" }, 500)
  }
})