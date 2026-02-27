// supabase/functions/auth-session-validation/index.ts
// =============================================================================
// Session integrity validation — called before sensitive actions.
// Validates JWT, checks session hasn't been invalidated, checks risk score.
//
// POST /auth-session-validation
// Body: { sessionId: string, action: string }
//
// Returns: { valid: boolean, reason?: string, riskScore: number }
//
// Used by: checkout, order placement, loyalty redemption, profile changes
// =============================================================================

import { requireAuth, serviceClient, AuthError } from '../_shared/auth.ts';
import { handlePreflight, ok, err, clientIp }    from '../_shared/http.ts';

// Actions that require a fresh risk evaluation (not just cached score)
const HIGH_SENSITIVITY_ACTIONS = new Set([
  'checkout',
  'redeem_loyalty',
  'change_password',
  'change_email',
  'delete_account',
]);

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  let user;
  try {
    user = await requireAuth(req);
  } catch (e) {
    if (e instanceof AuthError) return err(req, e.code, e.message, e.status);
    return err(req, 'AUTH_ERROR', 'Authentication failed', 401);
  }

  let body: { sessionId: string; action: string };
  try {
    body = await req.json();
  } catch {
    return err(req, 'INVALID_BODY', 'Request body must be valid JSON');
  }

  if (!body.sessionId) return err(req, 'MISSING_SESSION', 'sessionId required');
  if (!body.action)    return err(req, 'MISSING_ACTION',  'action required');

  const db = serviceClient();
  const ip = clientIp(req);

  // ── Check session isn't invalidated ─────────────────────────────────────────
  const { data: sessionMeta } = await db
    .from('auth_sessions_meta')
    .select('invalidated_at, invalidation_reason, risk_score, is_trusted_device')
    .eq('session_id', body.sessionId)
    .eq('user_id', user.id)    // must match — prevents session ID guessing
    .maybeSingle();

  if (sessionMeta?.invalidated_at) {
    await db.from('auth_audit_log').insert({
      user_id:    user.id,
      event_type: 'suspicious_activity',
      ip_address: ip,
      event_data: {
        reason:    'invalidated_session_used',
        action:    body.action,
        sessionId: body.sessionId,
      },
    });

    return ok(req, {
      valid:     false,
      reason:    'SESSION_INVALIDATED',
      riskScore: 100,
    });
  }

  // ── Fetch current risk score ─────────────────────────────────────────────────
  const { data: riskScore } = await db
    .from('auth_risk_scores')
    .select('risk_score, requires_step_up, requires_mfa, expires_at')
    .eq('session_id', body.sessionId)
    .eq('user_id', user.id)
    .maybeSingle();

  const riskExpired = !riskScore || new Date(riskScore.expires_at) < new Date();
  const currentScore = riskScore?.risk_score ?? 0;

  // High-sensitivity actions require a fresh (< 15 min) risk evaluation
  if (HIGH_SENSITIVITY_ACTIONS.has(body.action) && riskExpired) {
    return ok(req, {
      valid:               false,
      reason:              'RISK_EVALUATION_REQUIRED',
      riskScore:           currentScore,
      requiresDeviceTrust: !sessionMeta?.is_trusted_device,
    });
  }

  // Step-up required
  if (riskScore?.requires_step_up) {
    return ok(req, {
      valid:         false,
      reason:        'STEP_UP_REQUIRED',
      riskScore:     currentScore,
      requiresMfa:   riskScore.requires_mfa,
    });
  }

  // Update last_active_at (non-blocking)
  db.from('auth_sessions_meta')
    .update({ last_active_at: new Date().toISOString() })
    .eq('session_id', body.sessionId)
    .then(() => {});

  return ok(req, {
    valid:           true,
    riskScore:       currentScore,
    isTrustedDevice: sessionMeta?.is_trusted_device ?? false,
  });
});