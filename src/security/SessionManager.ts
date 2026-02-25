import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase/supabaseClient'

export interface SessionManagerOptions {
  onExpire: () => void
  onRefresh: (session: Session) => void
}

/**
 * Handles automatic Supabase session refresh
 * Refreshes 5 minutes before expiration.
 */
export class SessionManager {
  private timer: ReturnType<typeof setTimeout> | null = null
  private readonly options: SessionManagerOptions
  private readonly REFRESH_BUFFER_MS = 5 * 60 * 1000 // 5 minutes

  constructor(options: SessionManagerOptions) {
    this.options = options
  }

  start(session: Session) {
    this.stop()

    if (!session.expires_at) return

    const expiresAtMs = session.expires_at * 1000
    const now = Date.now()

    const refreshAt = expiresAtMs - now - this.REFRESH_BUFFER_MS

    // If already near expiry, refresh immediately
    if (refreshAt <= 0) {
      this.refreshNow()
      return
    }

    this.timer = setTimeout(() => {
      this.refreshNow()
    }, refreshAt)
  }

  stop() {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  private async refreshNow() {
    try {
      const { data, error } = await supabase.auth.refreshSession()

      if (error || !data.session) {
        this.options.onExpire()
        return
      }

      this.options.onRefresh(data.session)
    } catch {
      this.options.onExpire()
    }
  }
}