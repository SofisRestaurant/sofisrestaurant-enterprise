import { supabase } from '@/lib/supabase/supabaseClient'

/**
 * Row returned from health_ping() RPC
 * Must match SQL return table definition exactly
 */
export interface HealthPingRow {
  status: string
  server_time: string // timestamptz comes back as ISO string
}

export interface StartupHealthResult {
  ok: boolean
  timestamp?: string
  reason?: string
}

/**
 * Runs strict backend health check.
 * - Enforces exactly one row via .single()
 * - Fully typed
 * - No unsafe casts
 */
export async function runStartupHealthCheck(): Promise<StartupHealthResult> {
  try {
    const { data, error } = await supabase
      .rpc('health_ping')
      .returns<HealthPingRow[]>()
      .single()

    if (error) {
      return {
        ok: false,
        reason: error.message,
      }
    }

    return {
      ok: true,
      timestamp: data.server_time,
    }
  } catch {
    return {
      ok: false,
      reason: 'network_error',
    }
  }
}