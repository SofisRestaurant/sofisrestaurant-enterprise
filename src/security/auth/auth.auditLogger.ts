// src/security/auth/auth.auditLogger.ts
// =============================================================================
// Client-side audit logger — sends auth events to the edge for DB insertion.
//
// Design:
//   • Fire-and-forget. Client never awaits audit log writes.
//   • Failures are silently swallowed — audit logging must never block UX.
//   • Events are batched with a short delay to avoid redundant writes.
//   • Raw user data (email, IP) is never sent from the client — the edge
//     function derives IP from the request, email from the JWT.
// =============================================================================

import { supabase } from '@/lib/supabase/supabaseClient';
import { getDeviceFingerprint, getUserAgentHash } from './auth.deviceFingerprint';

export type AuditEventType =
  | 'login_success'
  | 'login_failure'
  | 'logout'
  | 'signup'
  | 'password_reset_request'
  | 'password_reset_complete'
  | 'magic_link_sent'
  | 'device_trust_granted'
  | 'session_refreshed'
  | 'mfa_challenge'
  | 'mfa_success'
  | 'mfa_failure'
  | 'suspicious_activity';

interface AuditPayload {
  eventType: AuditEventType;
  eventData?: Record<string, unknown>;
}

/** Flush queue immediately (called on logout to ensure last event is captured) */
let pendingFlush: ReturnType<typeof setTimeout> | null = null;
const queue: AuditPayload[] = [];

async function flush(): Promise<void> {
  if (queue.length === 0) {
    return;
  }

  const events = queue.splice(0);

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (session?.access_token == null) {
      return;
    }

    const [fingerprint, uaHash] = await Promise.all([
      getDeviceFingerprint(),
      getUserAgentHash(),
    ]);

    await supabase.functions.invoke('auth-device-trust', {
      body: {
        action: '_audit_batch',
        events,
        fingerprintHash: fingerprint,
        uaHash,
      },
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });
  } catch {
    // Silent — never block UX on audit failures
  }
}

/**
 * Log an auth event.
 * Events are queued and flushed together after a 300ms debounce
 * to prevent multiple rapid events from causing multiple edge calls.
 */
export function logAuthEvent(
  type: AuditEventType,
  data?: Record<string, unknown>,
): void {
  queue.push({ eventType: type, eventData: data ?? {} });

  if (pendingFlush !== null) {
    clearTimeout(pendingFlush);
  }

  pendingFlush = setTimeout(() => {
    pendingFlush = null;
    void flush();
  }, 300);
}

/** Call on logout — flush any pending events synchronously */
export async function flushAndClear(): Promise<void> {
  if (pendingFlush !== null) {
    clearTimeout(pendingFlush);
    pendingFlush = null;
  }

  await flush();
}