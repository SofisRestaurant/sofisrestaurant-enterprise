// src/security/auth/auth.riskEngine.ts
// =============================================================================
// Client-side risk engine (thin client, server-authoritative)
// - Derives REAL Supabase session_id from JWT claim (UUID) (no slice hacks)
// - Caches evaluation w/ TTL + in-flight dedupe
// - Adds safe runtime guards (no `any`, no blind member access)
// - Validates session before sensitive actions via auth-session-validation
// - Fail-open design (network issues never block legitimate users)
// =============================================================================

import { supabase } from "@/lib/supabase/supabaseClient";
import { getDeviceFingerprint } from "./auth.deviceFingerprint";
import { requireSessionIdFromAccessToken } from "@/security/auth/sessionId";

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

export type RiskTier = "low" | "medium" | "high" | "critical";

export interface RiskEvaluation {
  riskScore: number;
  tier: RiskTier;
  requiresDeviceTrust: boolean;
  requiresMfa: boolean;
  requiresStepUp: boolean;
  isLockedOut: boolean;
}

export interface SessionValidationResult {
  valid: boolean;
  reason?: string;
  riskScore: number;
  retryAfterMs?: number;
  requiresDeviceTrust?: boolean;
  requiresMfa?: boolean;
}

// ----------------------------------------------------------------------------
// Defaults (fail-open stance)
// ----------------------------------------------------------------------------

const DEFAULT_EVALUATION: RiskEvaluation = {
  riskScore: 0,
  tier: "low",
  requiresDeviceTrust: false,
  requiresMfa: false,
  requiresStepUp: false,
  isLockedOut: false,
};

const DEFAULT_VALIDATION: SessionValidationResult = {
  valid: true,
  riskScore: 0,
};

// ----------------------------------------------------------------------------
// Cache + in-flight dedupe
// ----------------------------------------------------------------------------

let _lastEvaluation: RiskEvaluation | null = null;
let _lastEvalTime = 0;

let _inflightEval: Promise<RiskEvaluation> | null = null;
let _inflightValidation: Promise<SessionValidationResult> | null = null;

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ----------------------------------------------------------------------------
// Runtime helpers (safe parsing)
// ----------------------------------------------------------------------------

type UnknownRecord = Record<string, unknown>;

function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asNumber(v: unknown, fallback = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

function asBool(v: unknown): boolean {
  return v === true;
}

function asTier(v: unknown): RiskTier {
  return v === "low" || v === "medium" || v === "high" || v === "critical" ? v : "low";
}

function safeAction(action: string): string {
  // Keep it bounded; server has allowlist anyway
  return String(action ?? "").slice(0, 64).trim() || "unknown";
}

async function getAccessSession(): Promise<{ accessToken: string; userId: string } | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;

  const session = data.session;
  if (!session?.access_token || !session.user?.id) return null;

  return { accessToken: session.access_token, userId: session.user.id };
}

function parseRiskEvaluationResponse(raw: unknown): RiskEvaluation {
  if (!isRecord(raw)) return DEFAULT_EVALUATION;

  return {
    riskScore: asNumber(raw.riskScore, 0),
    tier: asTier(raw.tier),
    requiresDeviceTrust: asBool(raw.requiresDeviceTrust),
    requiresMfa: asBool(raw.requiresMfa),
    requiresStepUp: asBool(raw.requiresStepUp),
    isLockedOut: asBool(raw.isLockedOut),
  };
}

function parseSessionValidationResponse(raw: unknown): SessionValidationResult {
  if (!isRecord(raw)) return DEFAULT_VALIDATION;

  return {
    valid: raw.valid === true,
    reason: typeof raw.reason === "string" ? raw.reason : undefined,
    riskScore: asNumber(raw.riskScore, 0),
    retryAfterMs: typeof raw.retryAfterMs === "number" && Number.isFinite(raw.retryAfterMs) ? raw.retryAfterMs : undefined,
    requiresDeviceTrust: raw.requiresDeviceTrust === true ? true : undefined,
    requiresMfa: raw.requiresMfa === true ? true : undefined,
  };
}

// ----------------------------------------------------------------------------
// Public API
// ----------------------------------------------------------------------------

/**
 * Evaluate risk for the current authenticated session.
 * Call after login, and optionally before sensitive actions.
 *
 * Fail-open: if the edge function fails, returns DEFAULT_EVALUATION.
 */
export async function evaluateRisk(opts?: { force?: boolean }): Promise<RiskEvaluation> {
  const force = opts?.force === true;

  if (!force && _lastEvaluation && Date.now() - _lastEvalTime < CACHE_TTL_MS) {
    return _lastEvaluation;
  }

  if (_inflightEval) return _inflightEval;

  _inflightEval = (async () => {
    try {
      const auth = await getAccessSession();
      if (!auth) return DEFAULT_EVALUATION;

      const sessionId = requireSessionIdFromAccessToken(auth.accessToken); // ✅ real UUID from JWT claim
      const fingerprintHash = await getDeviceFingerprint();

      const { data, error } = await supabase.functions.invoke("auth-risk-evaluation", {
        body: {
          fingerprintHash,
          sessionId,
          // In prod, server should require CF-IPCountry; client doesn't send it.
          countryCode: null,
        },
        headers: { Authorization: `Bearer ${auth.accessToken}` },
      });

      if (error) return DEFAULT_EVALUATION;

      const evaluation = parseRiskEvaluationResponse(data);

      _lastEvaluation = evaluation;
      _lastEvalTime = Date.now();

      return evaluation;
    } catch {
      return DEFAULT_EVALUATION;
    } finally {
      _inflightEval = null;
    }
  })();

  return _inflightEval;
}

/**
 * Validate session integrity before sensitive actions.
 * Server decides if step-up/MFA/device-trust is required.
 *
 * Fail-open: if network fails, returns valid:true (but riskScore=0).
 */
export async function validateSession(action: string): Promise<SessionValidationResult> {
  // Dedupe simultaneous validations (e.g., multiple components firing)
  if (_inflightValidation) return _inflightValidation;

  _inflightValidation = (async () => {
    try {
      const auth = await getAccessSession();
      if (!auth) return { valid: false, reason: "NO_SESSION", riskScore: 0 };

      const sessionId = requireSessionIdFromAccessToken(auth.accessToken);

      const { data, error } = await supabase.functions.invoke("auth-session-validation", {
        body: {
          sessionId,
          action: safeAction(action),
        },
        headers: { Authorization: `Bearer ${auth.accessToken}` },
      });

      // Fail-open on network failures
      if (error) return DEFAULT_VALIDATION;

      return parseSessionValidationResponse(data);
    } catch {
      return DEFAULT_VALIDATION;
    } finally {
      _inflightValidation = null;
    }
  })();

  return _inflightValidation;
}

/**
 * Clear cache (call on logout, or when auth state changes)
 */
export function clearRiskCache(): void {
  _lastEvaluation = null;
  _lastEvalTime = 0;
  _inflightEval = null;
  _inflightValidation = null;
}