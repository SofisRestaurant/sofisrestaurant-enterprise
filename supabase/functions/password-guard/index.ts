import zxcvbn from "zxcvbn";

/* =========================
   CORS CONFIG
========================= */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

/* =========================
   PASSWORD GUARD
========================= */
Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { status: 405, headers: corsHeaders }
      )
    }

    const { password, email } = await req.json()

    if (!password || !email) {
      return new Response(
        JSON.stringify({ error: "Invalid request" }),
        { status: 400, headers: corsHeaders }
      )
    }

    /* =========================
       ENTROPY CHECK
    ========================= */
    const entropy = password.length * Math.log2(94)
    if (entropy < 50) {
      return new Response(
        JSON.stringify({ error: "Password too weak" }),
        { status: 400, headers: corsHeaders }
      )
    }

    /* =========================
       ZXCVBN STRENGTH CHECK
    ========================= */
    const strength = zxcvbn(password)
    if (strength.score < 3) {
      return new Response(
        JSON.stringify({ error: "Password too weak" }),
        { status: 400, headers: corsHeaders }
      )
    }

    /* =========================
       EMAIL SIMILARITY CHECK
    ========================= */
    const emailPrefix = email.split("@")[0].toLowerCase()
    if (password.toLowerCase().includes(emailPrefix)) {
      return new Response(
        JSON.stringify({ error: "Password too predictable" }),
        { status: 400, headers: corsHeaders }
      )
    }

    /* =========================
       KEYBOARD PATTERN BLOCK
    ========================= */
    const blockedPatterns = [
      "qwerty",
      "asdfgh",
      "zxcvbn",
      "123456",
      "password",
    ]

    if (
      blockedPatterns.some((pattern) =>
        password.toLowerCase().includes(pattern)
      )
    ) {
      return new Response(
        JSON.stringify({ error: "Common password pattern detected" }),
        { status: 400, headers: corsHeaders }
      )
    }

    /* =========================
       BREACH CHECK (HIBP)
    ========================= */
    const encoder = new TextEncoder()
    const sha1Buffer = await crypto.subtle.digest(
      "SHA-1",
      encoder.encode(password)
    )

    const sha1 = Array.from(new Uint8Array(sha1Buffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()

    const prefix = sha1.slice(0, 5)
    const suffix = sha1.slice(5)

    const res = await fetch(
      `https://api.pwnedpasswords.com/range/${prefix}`
    )

    if (!res.ok) {
      return new Response(
        JSON.stringify({ error: "Breach check failed" }),
        { status: 500, headers: corsHeaders }
      )
    }

    const text = await res.text()

    const match = text
      .split("\n")
      .find((line) => line.startsWith(suffix))

    const breachCount = match
      ? parseInt(match.split(":")[1])
      : 0

    if (breachCount > 10) {
      return new Response(
        JSON.stringify({
          error: "Password appears in known data breaches",
        }),
        { status: 400, headers: corsHeaders }
      )
    }

    /* =========================
       SUCCESS
    ========================= */
    return new Response(
      JSON.stringify({ ok: true }),
      {
        status: 200,
        headers: corsHeaders,
      }
    )
  } catch  {
    return new Response(
      JSON.stringify({ error: "Server error" }),
      { status: 500, headers: corsHeaders }
    )
  }
})