// supabase/functions/auth-risk-evaluation/index.ts
// =============================================================================
// Computes a risk score for the current session and stores it in auth_risk_scores.
// Called immediately after login, before any sensitive action.
//
// POST /auth-risk-evaluation
// Body: {
//   fingerprintHash:  string,   // SHA-256 of client fingerprint
//   sessionId:        string,   // Supabase session ID
//   countryCode?:     string,   // 2-letter ISO from client (verify via CF header)
// }
//
// Returns: RiskResult + session meta
// =============================================================================

import { requireAuth, serviceClient, AuthError } from '../_shared/auth.ts';
import { handlePreflight, ok, err, clientIp }    from '../_shared/http.ts';
import { computeRiskScore, isUnusualTime }        from '../_shared/riskScore.ts';

const FINGERPRINT_RE = /^[0-9a-f]{64}$/i;

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

  let body: { fingerprintHash: string; sessionId: string; countryCode?: string };
  try {
    body = await req.json();
  } catch {
    return err(req, 'INVALID_BODY', 'Request body must be valid JSON');
  }

  if (!FINGERPRINT_RE.test(body.fingerprintHash ?? '')) {
    return err(req, 'INVALID_FINGERPRINT', 'fingerprintHash must be 64 hex chars');
  }

  if (!body.sessionId) {
    return err(req, 'MISSING_SESSION', 'sessionId is required');
  }

  const db  = serviceClient();
  const ip  = clientIp(req);
  // Cloudflare sets this header reliably — trust it over client-provided value
  const countryCode = req.headers.get('CF-IPCountry') ?? body.countryCode ?? null;

  // ── Gather signals in parallel ──────────────────────────────────────────────
  const [deviceResult, recentLoginsResult, lockoutResult, recentFailuresResult] =
    await Promise.all([
      // Is this device trusted?
      db.from('device_trust')
        .select('id')
        .eq('user_id', user.id)
        .eq('fingerprint_hash', body.fingerprintHash)
        .eq('is_revoked', false)
        .maybeSingle(),

      // Last 30 login hours (for unusual-time detection)
      db.from('auth_audit_log')
        .select('created_at')
        .eq('user_id', user.id)
        .eq('event_type', 'login_success')
        .order('created_at', { ascending: false })
        .limit(30),

      // Active lockout?
      db.from('account_lockouts')
        .select('email')
        .eq('email', user.email ?? '')
        .maybeSingle(),

      // Recent login failures in last 15 minutes
      db.from('login_attempts')
        .select('id')
        .eq('email', user.email ?? '')
        .eq('success', false)
        .gte('created_at', new Date(Date.now() - 15 * 60 * 1000).toISOString()),
    ]);

  // ── Geo mismatch — compare country to last 5 sessions ──────────────────────
  let geoMismatch = false;
  if (countryCode) {
    const { data: recentSessions } = await db
      .from('auth_sessions_meta')
      .select('country_code')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(5);

    const knownCountries = new Set(recentSessions?.map(s => s.country_code).filter(Boolean));
    // Only flag mismatch if we have established history (>= 2 sessions with country data)
    if (knownCountries.size >= 2 && !knownCountries.has(countryCode)) {
      geoMismatch = true;
    }
  }

  // ── Compute score ───────────────────────────────────────────────────────────
  const recentLoginHours = (recentLoginsResult.data ?? []).map(
    row => new Date(row.created_at).getUTCHours(),
  );

  const result = computeRiskScore({
    deviceUnknown:      !deviceResult.data,
    geoMismatch,
    rapidAttempts:      (recentFailuresResult.data?.length ?? 0) >= 3,
    unusualTime:        isUnusualTime(new Date().getUTCHours(), recentLoginHours),
    passwordMismatches: Math.min(recentFailuresResult.data?.length ?? 0, 5),
  });

  // ── Upsert risk score ───────────────────────────────────────────────────────
  await db.from('auth_risk_scores').upsert({
    user_id:             user.id,
    session_id:          body.sessionId,
    risk_score:          result.score,
    device_unknown_pts:  result.breakdown.deviceUnknownPts,
    geo_mismatch_pts:    result.breakdown.geoMismatchPts,
    rapid_attempts_pts:  result.breakdown.rapidAttemptsPts,
    unusual_time_pts:    result.breakdown.unusualTimePts,
    pw_mismatch_pts:     result.breakdown.pwMismatchPts,
    requires_device_trust: result.requiresDeviceTrust,
    requires_mfa:          result.requiresMfa,
    requires_step_up:      result.requiresStepUp,
    evaluated_at:          new Date().toISOString(),
    expires_at:            new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  }, { onConflict: 'session_id' });

  // ── Upsert session meta ─────────────────────────────────────────────────────
  await db.from('auth_sessions_meta').upsert({
    user_id:           user.id,
    session_id:        body.sessionId,
    device_trust_id:   deviceResult.data?.id ?? null,
    ip_address:        ip,
    country_code:      countryCode,
    is_trusted_device: !!deviceResult.data,
    risk_score:        result.score,
    last_active_at:    new Date().toISOString(),
  }, { onConflict: 'session_id' });

  // ── Audit log if high risk ─────────────────────────────────────────────────
  if (result.tier === 'high' || result.tier === 'critical') {
    await db.from('auth_audit_log').insert({
      user_id:    user.id,
      event_type: 'suspicious_activity',
      ip_address: ip,
      risk_score: result.score,
      event_data: {
        tier:     result.tier,
        breakdown: result.breakdown,
        geo:       countryCode,
      },
    });
  }

  // Return score + requirements to client (no breakdown exposed)
  return ok(req, {
    riskScore:           result.score,
    tier:                result.tier,
    requiresDeviceTrust: result.requiresDeviceTrust,
    requiresMfa:         result.requiresMfa,
    requiresStepUp:      result.requiresStepUp,
    isLockedOut:         !!lockoutResult.data,
  });
});