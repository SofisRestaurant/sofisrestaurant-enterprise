// supabase/functions/auth-device-trust/index.ts
// =============================================================================
// Device trust registration + lookup
//
// POST /auth-device-trust
// Body: { action: 'check' | 'register', fingerprintHash: string, label?: string }
//
// check    → is this device trusted for this user?
// register → mark this device as trusted
//
// Security:
//   • JWT required — only authenticated users
//   • fingerprintHash must be a valid 64-char hex string (SHA-256)
//   • Trust registration writes via service_role (not user JWT)
//   • Audit log written on every action
// =============================================================================

import { requireAuth, serviceClient, AuthError } from '../_shared/auth.ts';
import { handlePreflight, ok, err, clientIp }    from '../_shared/http.ts';

const FINGERPRINT_RE = /^[0-9a-f]{64}$/i;

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  // ── Auth ────────────────────────────────────────────────────────────────────
  let user;
  try {
    user = await requireAuth(req);
  } catch (e) {
    if (e instanceof AuthError) return err(req, e.code, e.message, e.status);
    return err(req, 'AUTH_ERROR', 'Authentication failed', 401);
  }

  // ── Parse body ──────────────────────────────────────────────────────────────
  let body: { action: string; fingerprintHash: string; label?: string };
  try {
    body = await req.json();
  } catch {
    return err(req, 'INVALID_BODY', 'Request body must be valid JSON');
  }

  const { action, fingerprintHash, label } = body;

  if (!['check', 'register'].includes(action)) {
    return err(req, 'INVALID_ACTION', 'action must be check or register');
  }

  if (!FINGERPRINT_RE.test(fingerprintHash ?? '')) {
    return err(req, 'INVALID_FINGERPRINT', 'fingerprintHash must be 64 hex chars (SHA-256)');
  }

  const db  = serviceClient();
  const ip  = clientIp(req);

  // ── CHECK ───────────────────────────────────────────────────────────────────
  if (action === 'check') {
    const { data, error } = await db
      .from('device_trust')
      .select('id, trusted_at, trust_label, last_seen_at')
      .eq('user_id', user.id)
      .eq('fingerprint_hash', fingerprintHash)
      .eq('is_revoked', false)
      .maybeSingle();

    if (error) {
      return err(req, 'DB_ERROR', 'Failed to check device trust', 500);
    }

    // Update last_seen_at silently (non-blocking — don't await)
    if (data?.id) {
      db.from('device_trust')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('id', data.id)
        .then(() => {});
    }

    await db.from('auth_audit_log').insert({
      user_id:    user.id,
      event_type: 'login_success',
      ip_address: ip,
      event_data: { action: 'device_check', trusted: !!data },
    });

    return ok(req, {
      trusted:     !!data,
      trustedAt:   data?.trusted_at ?? null,
      trustLabel:  data?.trust_label ?? null,
      lastSeenAt:  data?.last_seen_at ?? null,
    });
  }

  // ── REGISTER ────────────────────────────────────────────────────────────────
  // Check for existing (including revoked — don't allow re-trusting a revoked device silently)
  const { data: existing } = await db
    .from('device_trust')
    .select('id, is_revoked')
    .eq('user_id', user.id)
    .eq('fingerprint_hash', fingerprintHash)
    .maybeSingle();

  if (existing?.is_revoked) {
    return err(req, 'DEVICE_REVOKED', 'This device has been revoked and cannot be re-trusted', 403);
  }

  if (existing && !existing.is_revoked) {
    // Already trusted — idempotent success
    return ok(req, { trusted: true, created: false });
  }

  const { data: inserted, error: insertError } = await db
    .from('device_trust')
    .insert({
      user_id:          user.id,
      fingerprint_hash: fingerprintHash,
      trust_label:      label?.slice(0, 100) ?? null,
      ip_at_trust:      ip,
    })
    .select('id, trusted_at')
    .single();

  if (insertError) {
    return err(req, 'TRUST_FAILED', 'Failed to register device trust', 500);
  }

  await db.from('auth_audit_log').insert({
    user_id:    user.id,
    event_type: 'device_trust_granted',
    ip_address: ip,
    device_id:  inserted.id,
    event_data: { label: label ?? null },
  });

  return ok(req, { trusted: true, created: true, trustedAt: inserted.trusted_at }, 201);
});