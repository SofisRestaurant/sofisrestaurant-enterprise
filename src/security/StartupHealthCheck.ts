import { supabase } from "@/lib/supabase/supabaseClient"

interface HealthResult {
  ok: boolean
  reason?: string
}

export async function runStartupHealthCheck(): Promise<HealthResult> {
  try {
    const { error } = await supabase.rpc("health_ping")

    if (error) {
      if ('status' in error && error.status === 401) {
        return { ok: true }
      }

      return { ok: false, reason: error.message }
    }

    return { ok: true }
  } catch {
    return { ok: false, reason: "network_error" }
  }
}