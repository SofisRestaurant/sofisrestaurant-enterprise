// src/security/auth/auth.riskEngine.ts
// =============================================================================
// Client-side risk evaluation — calls auth-risk-evaluation edge function
// and interprets the result to drive UI friction decisions.
//
// This is intentionally thin. All risk computation happens server-side.
// The client only sends signals and reacts to the returned score.
// =============================================================================

import { supabase } from '@/lib/supabase/supabaseClient';
import { getDeviceFingerprint } from './auth.deviceFingerprint';

export interface RiskEvaluation {
  riskScore:           number;
  tier:                'low' | 'medium' | 'high' | 'critical';
  requiresDeviceTrust: boolean;
  requiresMfa:         boolean;
  requiresStepUp:      boolean;
  isLockedOut:         boolean;
}

const DEFAULT_EVALUATION: RiskEvaluation = {
  riskScore:           0,
  tier:                'low',
  requiresDeviceTrust: false,
  requiresMfa:         false,
  requiresStepUp:      false,
  isLockedOut:         false,
};

/** Cache the last evaluation to avoid redundant edge function calls */
let _lastEvaluation: RiskEvaluation | null = null;
let _lastEvalTime   = 0;
const CACHE_TTL_MS  = 5 * 60 * 1000; // 5 minutes

/**
 * Evaluate risk for the current session.
 * Call this immediately after login and before high-sensitivity actions.
 *
 * Returns DEFAULT_EVALUATION (low risk) if the edge function fails —
 * fail open on risk evaluation so auth is never blocked by a network error.
 */
export async function evaluateRisk(): Promise<RiskEvaluation> {
  // Return cached result if fresh
  if (_lastEvaluation && Date.now() - _lastEvalTime < CACHE_TTL_MS) {
    return _lastEvaluation;
  }

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token || !session.user) return DEFAULT_EVALUATION;

    const fingerprint = await getDeviceFingerprint();

    const { data, error } = await supabase.functions.invoke('auth-risk-evaluation', {
      body: {
        fingerprintHash: fingerprint,
        sessionId:       session.access_token.slice(-36), // use token tail as session ID proxy
        countryCode:     null, // CF-IPCountry set server-side; we don't trust client value
      },
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    if (error || !data) return DEFAULT_EVALUATION;

    const evaluation: RiskEvaluation = {
      riskScore:           Number(data.riskScore          ?? 0),
      tier:                data.tier                      ?? 'low',
      requiresDeviceTrust: Boolean(data.requiresDeviceTrust),
      requiresMfa:         Boolean(data.requiresMfa),
      requiresStepUp:      Boolean(data.requiresStepUp),
      isLockedOut:         Boolean(data.isLockedOut),
    };

    _lastEvaluation = evaluation;
    _lastEvalTime   = Date.now();
    return evaluation;
  } catch {
    // Network failure → fail open (don't block login)
    return DEFAULT_EVALUATION;
  }
}

/** Validate a session before a sensitive action */
export async function validateSession(action: string): Promise<{
  valid: boolean;
  reason?: string;
  riskScore: number;
}> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      return { valid: false, reason: 'NO_SESSION', riskScore: 0 };
    }

    const { data, error } = await supabase.functions.invoke('auth-session-validation', {
      body: {
        sessionId: session.access_token.slice(-36),
        action,
      },
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    if (error || !data) {
      // Network failure on validation → allow but log
      return { valid: true, riskScore: 0 };
    }

    return {
      valid:     Boolean(data.valid),
      reason:    data.reason,
      riskScore: Number(data.riskScore ?? 0),
    };
  } catch {
    return { valid: true, riskScore: 0 };
  }
}

/** Reset cached evaluation (call on logout) */
export function clearRiskCache(): void {
  _lastEvaluation = null;
  _lastEvalTime   = 0;
}