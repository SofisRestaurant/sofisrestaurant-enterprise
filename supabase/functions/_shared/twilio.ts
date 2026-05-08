// supabase/functions/_shared/twilio.ts
// =============================================================================
// CHANGES IN THIS VERSION:
//
//   [FIX 1] TWILIO_VERIFY_SID → TWILIO_VERIFY_SERVICE_SID.
//
//         getTwilioEnv() was reading Deno.env.get('TWILIO_VERIFY_SID'), but
//         the Supabase secret is named TWILIO_VERIFY_SERVICE_SID (the standard
//         Twilio SID prefix). This mismatch caused verifySid to always be
//         undefined, causing getTwilioEnv() to throw on every invocation.
//
//   [FIX 2] TWILIO_FROM_NUMBER made optional in TwilioEnv.
//
//         getTwilioEnv() required TWILIO_FROM_NUMBER but verify-phone never
//         calls sendSms() — only sendVerifyOtp/checkVerifyOtp, which use the
//         Verify API and do not need a from-number. If the secret is absent
//         from verify-phone's environment, the function crashed before serving
//         any request, producing a bare 500 with no CORS headers (the browser
//         reports this as a CORS error, masking the real cause).
//
//         Fix: fromNumber is now optional in TwilioEnv. getTwilioEnv() no
//         longer validates its presence.
//
//   [FIX 3] getVerifyEnv() — minimal env reader for Verify-only functions.
//
//         verify-phone/index.ts should call getVerifyEnv() instead of
//         getTwilioEnv(). getVerifyEnv() only requires the three env vars
//         the Verify API actually needs (ACCOUNT_SID, AUTH_TOKEN,
//         VERIFY_SERVICE_SID). This eliminates any coupling to SMS-only
//         secrets.
//
//   [FIX 4] Neither getTwilioEnv() nor getVerifyEnv() throws.
//
//         Both functions return a typed result discriminated on .ok. Callers
//         check the result inside the request handler and return a structured
//         JSON error. This prevents uncaught exceptions from escaping Deno.serve()
//         before CORS headers have been written.
//
// Backward compat:
//   getTwilioEnv() return type changed from TwilioEnv (throws) to
//   { ok: true; env: TwilioEnv } | { ok: false; missing: string[] }.
//   Callers that previously wrote `const env = getTwilioEnv()` need to be
//   updated to check .ok first. The only such caller is verify-phone/index.ts,
//   which is updated in this session.
//
//   sendSms / sendVerifyOtp / checkVerifyOtp signatures are UNCHANGED.
// =============================================================================

const E164_RE = /^\+[1-9]\d{6,14}$/;

export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;

  const stripped = raw.trim().replace(/[\s\-\.\(\)]/g, '');

  if (E164_RE.test(stripped)) return stripped;

  const digits = stripped.replace(/\D/g, '');

  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits[0] === '1') return `+${digits}`;
  if (digits.length >= 7 && digits.length <= 15) return `+${digits}`;

  return null;
}

// ─── TwilioEnv ────────────────────────────────────────────────────────────────
//
// fromNumber is optional — it is only required for the Messaging API (sendSms).
// The Verify API (sendVerifyOtp, checkVerifyOtp) does not use it.

export interface TwilioEnv {
  accountSid: string;
  authToken:  string;
  verifySid:  string;
  fromNumber?: string;   // [FIX 2] optional — only needed for sendSms
}

// ─── VerifyEnv ────────────────────────────────────────────────────────────────
//
// Minimal environment for Verify-only functions (verify-phone).
// Three env vars, no fromNumber.

export interface VerifyEnv {
  accountSid: string;
  authToken:  string;
  verifySid:  string;
}

// ─── Env readers — never throw ────────────────────────────────────────────────

type EnvResult<T> =
  | { ok: true;  env: T }
  | { ok: false; missing: string[] };

/**
 * Reads Verify API credentials only.
 * Use this in verify-phone. Does NOT require TWILIO_FROM_NUMBER.
 *
 * Returns { ok: false, missing } instead of throwing so callers can
 * return a structured JSON error before CORS headers are lost.
 */
export function getVerifyEnv(): EnvResult<VerifyEnv> {
  // [FIX 1] Correct env var name: TWILIO_VERIFY_SERVICE_SID
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const authToken  = Deno.env.get('TWILIO_AUTH_TOKEN');
  const verifySid  = Deno.env.get('TWILIO_VERIFY_SERVICE_SID');

  const missing: string[] = [];
  if (!accountSid) missing.push('TWILIO_ACCOUNT_SID');
  if (!authToken)  missing.push('TWILIO_AUTH_TOKEN');
  if (!verifySid)  missing.push('TWILIO_VERIFY_SERVICE_SID');

  if (missing.length > 0) {
    return { ok: false, missing };
  }

  return { ok: true, env: { accountSid: accountSid!, authToken: authToken!, verifySid: verifySid! } };
}

/**
 * Reads full Twilio credentials including fromNumber for Messaging API.
 * Use this in send-sms or any function that calls sendSms().
 *
 * Returns { ok: false, missing } instead of throwing.
 */
export function getTwilioEnv(): EnvResult<TwilioEnv> {
  // [FIX 1] Correct env var name: TWILIO_VERIFY_SERVICE_SID
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const authToken  = Deno.env.get('TWILIO_AUTH_TOKEN');
  const fromNumber = Deno.env.get('TWILIO_FROM_NUMBER');
  const verifySid  = Deno.env.get('TWILIO_VERIFY_SERVICE_SID');

  const missing: string[] = [];
  if (!accountSid) missing.push('TWILIO_ACCOUNT_SID');
  if (!authToken)  missing.push('TWILIO_AUTH_TOKEN');
  if (!fromNumber) missing.push('TWILIO_FROM_NUMBER');
  if (!verifySid)  missing.push('TWILIO_VERIFY_SERVICE_SID');

  if (missing.length > 0) {
    return { ok: false, missing };
  }

  return {
    ok:  true,
    env: { accountSid: accountSid!, authToken: authToken!, fromNumber: fromNumber!, verifySid: verifySid! },
  };
}

// ─── HTTP transport ───────────────────────────────────────────────────────────

async function twilioPost(
  env:  VerifyEnv,
  url:  string,
  body: Record<string, string>,
): Promise<{ ok: boolean; data: Record<string, unknown>; status: number }> {
  const credentials = btoa(`${env.accountSid}:${env.authToken}`);

  const res = await fetch(url, {
    method:  'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type':  'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(body).toString(),
  });

  const data = await res.json().catch(() => ({})) as Record<string, unknown>;
  return { ok: res.ok, data, status: res.status };
}

// ─── Messaging API ────────────────────────────────────────────────────────────

export async function sendSms(args: {
  env:  TwilioEnv;
  to:   string;
  body: string;
}): Promise<{ ok: boolean; sid?: string; error?: string }> {
  const { env, body } = args;

  if (!env.fromNumber) {
    return { ok: false, error: 'sendSms: TWILIO_FROM_NUMBER is required' };
  }

  const normalized = normalizePhone(args.to);
  if (!normalized) return { ok: false, error: `Invalid phone: ${args.to}` };

  const url    = `https://api.twilio.com/2010-04-01/Accounts/${env.accountSid}/Messages.json`;
  const result = await twilioPost(env, url, { To: normalized, From: env.fromNumber, Body: body });

  if (!result.ok) {
    return { ok: false, error: String(result.data?.message ?? `Twilio HTTP ${result.status}`) };
  }

  return { ok: true, sid: String(result.data?.sid ?? '') };
}

// ─── Verify API ───────────────────────────────────────────────────────────────

export async function sendVerifyOtp(args: {
  env:     VerifyEnv;
  to:      string;
  channel: 'sms' | 'whatsapp';
}): Promise<{ ok: boolean; normalizedPhone?: string; status?: string; error?: string }> {
  const { env, channel } = args;

  const normalized = normalizePhone(args.to);
  if (!normalized) return { ok: false, error: 'Invalid phone number' };

  const url    = `https://verify.twilio.com/v2/Services/${env.verifySid}/Verifications`;
  const result = await twilioPost(env, url, { To: normalized, Channel: channel });

  if (!result.ok) return { ok: false, error: String(result.data?.message ?? 'OTP send failed') };

  return { ok: true, normalizedPhone: normalized, status: String(result.data?.status ?? '') };
}

export async function checkVerifyOtp(args: {
  env:  VerifyEnv;
  to:   string;
  code: string;
}): Promise<{ ok: boolean; valid: boolean; normalizedPhone?: string; error?: string }> {
  const { env } = args;

  const normalized = normalizePhone(args.to);
  if (!normalized) return { ok: false, valid: false, error: 'Invalid phone number' };

  const safeCode = args.code.replace(/\D/g, '').slice(0, 8);
  if (!safeCode) return { ok: false, valid: false, error: 'Invalid code format' };

  const url    = `https://verify.twilio.com/v2/Services/${env.verifySid}/VerificationCheck`;
  const result = await twilioPost(env, url, { To: normalized, Code: safeCode });

  if (!result.ok) {
    return { ok: false, valid: false, error: String(result.data?.message ?? 'Check failed') };
  }

  return { ok: true, valid: result.data?.status === 'approved', normalizedPhone: normalized };
}

// ─── SMS templates ────────────────────────────────────────────────────────────

export const SmsTemplates = {
  orderConfirmed: (orderNumber: string, estimatedMinutes = 20) =>
    `✅ Sofi's: Order #${orderNumber} received! Ready in ~${estimatedMinutes} min. We'll text when it's ready.`,

  orderPreparing: (orderNumber: string) =>
    `🍳 Sofi's: Order #${orderNumber} is being prepared. Won't be long!`,

  orderReady: (orderNumber: string) =>
    `🎉 Sofi's: Order #${orderNumber} is READY! Please come to the counter.`,

  orderDelivered: (orderNumber: string) =>
    `✅ Sofi's: Order #${orderNumber} complete. Thanks for dining with us!`,

  orderCancelled: (orderNumber: string) =>
    `❌ Sofi's: Order #${orderNumber} was cancelled. Questions? Call us.`,
} as const;