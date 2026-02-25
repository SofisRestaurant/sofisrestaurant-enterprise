import { supabase } from "@/lib/supabase/supabaseClient"

interface HealthResult {
  ok: boolean
  reason?: string
}

async function checkDatabase(): Promise<HealthResult> {
  try {
    const { error } = await supabase
      .from("orders")
      .select("id")
      .limit(1)

    if (error) return { ok: false, reason: "DB offline" }

    return { ok: true }
  } catch {
    return { ok: false, reason: "DB connection failed" }
  }
}

async function checkAuth(): Promise<HealthResult> {
  try {
    const { error } = await supabase.auth.getSession()
    if (error) return { ok: false, reason: "Auth offline" }

    return { ok: true }
  } catch {
    return { ok: false, reason: "Auth check failed" }
  }
}

export async function runStartupHealthCheck() {
  const checks = await Promise.all([
    checkDatabase(),
    checkAuth(),
  ])

  const failed = checks.find(c => !c.ok)

  return failed ?? { ok: true }
}