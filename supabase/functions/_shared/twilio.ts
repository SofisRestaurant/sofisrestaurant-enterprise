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

export interface TwilioEnv {
  accountSid: string;
  authToken:  string;
  fromNumber: string;
  verifySid:  string;
}

export function getTwilioEnv(): TwilioEnv {
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const authToken  = Deno.env.get('TWILIO_AUTH_TOKEN');
  const fromNumber = Deno.env.get('TWILIO_FROM_NUMBER');
  const verifySid  = Deno.env.get('TWILIO_VERIFY_SID');

  if (!accountSid || !authToken || !fromNumber || !verifySid) {
    throw new Error('twilio: missing required environment variables');
  }

  return { accountSid, authToken, fromNumber, verifySid };
}


async function twilioPost(
  env:  TwilioEnv,
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

export async function sendSms(args: {
  env:  TwilioEnv;
  to:   string;
  body: string;
}): Promise<{ ok: boolean; sid?: string; error?: string }> {
  const { env, body } = args;

  const normalized = normalizePhone(args.to);
  if (!normalized) return { ok: false, error: `Invalid phone: ${args.to}` };

  const url = `https://api.twilio.com/2010-04-01/Accounts/${env.accountSid}/Messages.json`;
  const result = await twilioPost(env, url, { To: normalized, From: env.fromNumber, Body: body });

  if (!result.ok) {
    return { ok: false, error: String(result.data?.message ?? `Twilio HTTP ${result.status}`) };
  }

  return { ok: true, sid: String(result.data?.sid ?? '') };
}

export async function sendVerifyOtp(args: {
  env:     TwilioEnv;
  to:      string;
  channel: 'sms' | 'whatsapp';
}): Promise<{ ok: boolean; normalizedPhone?: string; status?: string; error?: string }> {
  const { env, channel } = args;

  const normalized = normalizePhone(args.to);
  if (!normalized) return { ok: false, error: 'Invalid phone number' };

  const url = `https://verify.twilio.com/v2/Services/${env.verifySid}/Verifications`;
  const result = await twilioPost(env, url, { To: normalized, Channel: channel });

  if (!result.ok) return { ok: false, error: String(result.data?.message ?? 'OTP send failed') };

  // Return normalized phone so the caller can store the canonical form
  return { ok: true, normalizedPhone: normalized, status: String(result.data?.status ?? '') };
}

export async function checkVerifyOtp(args: {
  env:  TwilioEnv;
  to:   string;
  code: string;
}): Promise<{ ok: boolean; valid: boolean; normalizedPhone?: string; error?: string }> {
  const { env } = args;

  const normalized = normalizePhone(args.to);
  if (!normalized) return { ok: false, valid: false, error: 'Invalid phone number' };

  const safeCode = args.code.replace(/\D/g, '').slice(0, 8);
  if (!safeCode) return { ok: false, valid: false, error: 'Invalid code format' };

  const url = `https://verify.twilio.com/v2/Services/${env.verifySid}/VerificationCheck`;
  const result = await twilioPost(env, url, { To: normalized, Code: safeCode });

  if (!result.ok) {
    return { ok: false, valid: false, error: String(result.data?.message ?? 'Check failed') };
  }

  return { ok: true, valid: result.data?.status === 'approved', normalizedPhone: normalized };
}


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