import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/supabaseClient';

export interface SessionManagerOptions {
  onExpire: () => void;
  onRefresh: (session: Session) => void;
}

/**
 * Handles automatic Supabase session refresh
 * Refreshes 5 minutes before expiration.
 */
export class SessionManager {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly options: SessionManagerOptions;
  private readonly REFRESH_BUFFER_MS = 5 * 60 * 1000;

  constructor(options: SessionManagerOptions) {
    this.options = options;
  }

  start(session: Session): void {
    this.stop();

    if (session.expires_at === undefined || session.expires_at === null) {
      return;
    }

    const expiresAtMs = session.expires_at * 1000;
    const now = Date.now();
    const refreshAt = expiresAtMs - now - this.REFRESH_BUFFER_MS;

    if (refreshAt <= 0) {
      void this.refreshNow();
      return;
    }

    this.timer = setTimeout(() => {
      void this.refreshNow();
    }, refreshAt);
  }

  stop(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private async refreshNow(): Promise<void> {
    try {
      const { data, error } = await supabase.auth.refreshSession();

      if (error !== null || data.session === null) {
        this.options.onExpire();
        return;
      }

      this.options.onRefresh(data.session);
    } catch {
      this.options.onExpire();
    }
  }
}