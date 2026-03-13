// src/security/auth/auth.riskEngine.ts
// =============================================================================
// Client-side risk engine (thin client, server-authoritative)
// - Derives REAL Supabase session_id from JWT claim (UUID) (no slice hacks)
// - Caches evaluation w/ TTL + in-flight dedupe
// - Adds safe runtime guards (no `any`, no blind member access)
// - Validates session before sensitive actions via auth-session-validation
// - Fail-open design (network issues never block legitimate users)
// =============================================================================

import { supabase } from '@/lib/supabase/supabaseClient';
import { getDeviceFingerprint } from './auth.deviceFingerprint';
import { requireSessionIdFromAccessToken } from '@/security/auth/sessionId';

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

export type RiskTier = 'low' | 'medium' | 'high' | 'critical';

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
  tier: 'low',
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

const CACHE_TTL_MS = 5 * 60 * 1000;

// ----------------------------------------------------------------------------
// Runtime helpers (safe parsing)
// ----------------------------------------------------------------------------

type UnknownRecord = Record<string, unknown>;

interface FunctionInvokeEnvelope {
  data: unknown;
  error: unknown;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
}

function asBool(value: unknown): boolean {
  return value === true;
}

function asTier(value: unknown): RiskTier {
  return value === 'low' || value === 'medium' || value === 'high' || value === 'critical'
    ? value
    : 'low';
}

function safeAction(action: string): string {
  const normalized = action.slice(0, 64).trim();
  return normalized.length > 0 ? normalized : 'unknown';
}

function asFunctionInvokeEnvelope(value: unknown): FunctionInvokeEnvelope | null {
  if (!isRecord(value) || !('data' in value) || !('error' in value)) {
    return null;
  }

  return {
    data: value.data,
    error: value.error,
  };
}

async function invokeEdge(
  functionName: string,
  accessToken: string,
  body: UnknownRecord,
): Promise<{ data: unknown; error: unknown }> {
  const rawResult: unknown = await supabase.functions.invoke(functionName, {
    body,
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const envelope = asFunctionInvokeEnvelope(rawResult);

  if (envelope === null) {
    return {
      data: null,
      error: new Error(`Invalid response envelope from ${functionName}`),
    };
  }

  return envelope;
}

async function getAccessSession(): Promise<{ accessToken: string; userId: string } | null> {
  const result = await supabase.auth.getSession();
  const data = result.data;
  const error = result.error;

  if (error !== null) {
    return null;
  }

  const session = data.session;

  if (session?.access_token === undefined || session.user?.id === undefined) {
    return null;
  }

  return {
    accessToken: session.access_token,
    userId: session.user.id,
  };
}

function parseRiskEvaluationResponse(raw: unknown): RiskEvaluation {
  if (!isRecord(raw)) {
    return DEFAULT_EVALUATION;
  }

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
  if (!isRecord(raw)) {
    return DEFAULT_VALIDATION;
  }

  return {
    valid: raw.valid === true,
    reason: typeof raw.reason === 'string' ? raw.reason : undefined,
    riskScore: asNumber(raw.riskScore, 0),
    retryAfterMs:
      typeof raw.retryAfterMs === 'number' && Number.isFinite(raw.retryAfterMs)
        ? raw.retryAfterMs
        : undefined,
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

  if (!force && _lastEvaluation !== null && Date.now() - _lastEvalTime < CACHE_TTL_MS) {
    return _lastEvaluation;
  }

  if (_inflightEval !== null) {
    return _inflightEval;
  }

  _inflightEval = (async (): Promise<RiskEvaluation> => {
    try {
      const auth = await getAccessSession();

      if (auth === null) {
        return DEFAULT_EVALUATION;
      }

      const sessionId = requireSessionIdFromAccessToken(auth.accessToken);
      const fingerprintHash = await getDeviceFingerprint();

      const result = await invokeEdge('auth-risk-evaluation', auth.accessToken, {
        fingerprintHash,
        sessionId,
        countryCode: null,
      });

      if (result.error !== null) {
        return DEFAULT_EVALUATION;
      }

      const evaluation = parseRiskEvaluationResponse(result.data);

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
  if (_inflightValidation !== null) {
    return _inflightValidation;
  }

  _inflightValidation = (async (): Promise<SessionValidationResult> => {
    try {
      const auth = await getAccessSession();

      if (auth === null) {
        return { valid: false, reason: 'NO_SESSION', riskScore: 0 };
      }

      const sessionId = requireSessionIdFromAccessToken(auth.accessToken);

      const result = await invokeEdge('auth-session-validation', auth.accessToken, {
        sessionId,
        action: safeAction(action),
      });

      if (result.error !== null) {
        return DEFAULT_VALIDATION;
      }

      return parseSessionValidationResponse(result.data);
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