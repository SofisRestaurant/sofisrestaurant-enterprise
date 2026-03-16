// supabase/functions/subscribe/index.ts
// ─── Klaviyo Newsletter Subscription — Production Edge Function ───────────────
//
// Endpoint:  POST /functions/v1/subscribe
// Runtime:   Deno (Supabase Edge Functions)
// Revision:  Klaviyo REST API 2026-01-15
//
// Production features:
//   ✅ hCaptcha server-side verification (CAPTCHA / bot protection)
//   ✅ Strict RFC 5321 email validation (beyond basic regex)
//   ✅ Rate limiting per IP — 5 req/min sliding window via Deno KV
//   ✅ Idempotency key on Klaviyo subscribe call (prevents duplicate jobs on retry)
//   ✅ Sentry error reporting (via fetch — no SDK needed in Deno)
//   ✅ UTM params stored in Klaviyo profile properties
//   ✅ alreadySubscribed pre-flight detection (GET /api/profiles/)
//   ✅ Detailed structured logging for all error paths
//
// Response shape:
//   200  { ok: true,  alreadySubscribed: false }  — new subscription
//   200  { ok: true,  alreadySubscribed: true  }  — profile was already subscribed
//   400  { ok: false, error: string }              — validation / captcha error
//   429  { ok: false, error: string }              — rate limited
//   500  { ok: false, error: string }              — Klaviyo / server error
//
// Required env vars:
//   KLAVIYO_PRIVATE_KEY   — server-side private key (sk_...)
//   KLAVIYO_LIST_ID       — default newsletter list ID
//
// Optional env vars:
//   KLAVIYO_API_REVISION  — defaults to '2026-01-15'
//   APP_NAME              — custom_source attribution label
//   ALLOWED_ORIGIN        — CORS origin (default '*')
//   HCAPTCHA_SECRET       — hCaptcha secret key; if set, captcha is required
//   HCAPTCHA_MIN_SCORE    — minimum hCaptcha score 0–1 (default 0.5)
//   SENTRY_DSN            — Sentry DSN for error reporting (optional)
//   RATE_LIMIT_MAX        — max requests per window per IP (default 5)
//   RATE_LIMIT_WINDOW_SEC — sliding window in seconds (default 60)
//
// Deploy:
//   supabase functions deploy subscribe --no-verify-jwt
// ─────────────────────────────────────────────────────────────────────────────

// Deno.serve is built-in (Deno 1.35+, all Supabase runtimes).

// ── Constants ─────────────────────────────────────────────────────────────────

const KLAVIYO_API_BASE     = 'https://a.klaviyo.com/api';
const KLAVIYO_API_REVISION = Deno.env.get('KLAVIYO_API_REVISION') ?? '2026-01-15';
const KLAVIYO_PRIVATE_KEY  = Deno.env.get('KLAVIYO_PRIVATE_KEY')  ?? '';
const KLAVIYO_LIST_ID      = Deno.env.get('KLAVIYO_LIST_ID')      ?? '';
const APP_NAME             = Deno.env.get('APP_NAME')             ?? "Sofi's Restaurant";
const ALLOWED_ORIGIN       = Deno.env.get('ALLOWED_ORIGIN')       ?? '*';
const HCAPTCHA_SECRET      = Deno.env.get('HCAPTCHA_SECRET')      ?? '';
const HCAPTCHA_MIN_SCORE   = Number(Deno.env.get('HCAPTCHA_MIN_SCORE') ?? '0.5');
const SENTRY_DSN           = Deno.env.get('SENTRY_DSN')           ?? '';
const RATE_LIMIT_MAX       = Number(Deno.env.get('RATE_LIMIT_MAX')        ?? '5');
const RATE_LIMIT_WINDOW_S  = Number(Deno.env.get('RATE_LIMIT_WINDOW_SEC') ?? '60');

// ── Types ─────────────────────────────────────────────────────────────────────

interface RequestBody {
  email:          string;
  first_name?:    string;
  last_name?:     string;
  phone_number?:  string;
  listId?:        string;
  channels?:      ('EMAIL' | 'SMS')[];
  source?:        string;
  identify?:      boolean;
  captchaToken?:  string;
  properties?:    Record<string, unknown>;
  // UTM parameters
  utm_source?:    string;
  utm_medium?:    string;
  utm_campaign?:  string;
  utm_content?:   string;
  utm_term?:      string;
}

interface KlaviyoErrorEnvelope {
  errors?: Array<{ detail?: string; title?: string; code?: string }>;
}

// ── CORS ──────────────────────────────────────────────────────────────────────

function corsHeaders(origin: string): Record<string, string> {
  return {
    'Access-Control-Allow-Origin':  origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age':       '86400',
  };
}

function jsonResp(body: unknown, status: number, origin: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  });
}

// ── Sentry error reporting ────────────────────────────────────────────────────

async function reportToSentry(
  error:   unknown,
  context: Record<string, unknown> = {},
): Promise<void> {
  if (!SENTRY_DSN) return;
  try {
    // Parse DSN: https://<key>@<host>/<project_id>
    const url  = new URL(SENTRY_DSN);
    const key  = url.username;
    const host = url.hostname;
    const proj = url.pathname.replace('/', '');

    const envelope = JSON.stringify({
      exception: {
        values: [{
          type:  error instanceof Error ? error.constructor.name : 'Error',
          value: error instanceof Error ? error.message : String(error),
          mechanism: { type: 'generic', handled: false },
        }],
      },
      extra: context,
      environment: Deno.env.get('DENO_DEPLOYMENT_ID') ? 'production' : 'development',
      platform:    'javascript',
    });

    await fetch(`https://${host}/api/${proj}/store/`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'X-Sentry-Auth': `Sentry sentry_version=7,sentry_key=${key}`,
      },
      body: envelope,
    }).catch(() => {/* Sentry reporting is best-effort */});
  } catch {/* Never throw from error reporter */}
}

// ── Rate limiting (Deno KV sliding window) ────────────────────────────────────

let kv: Deno.Kv | null = null;

async function getKv(): Promise<Deno.Kv | null> {
  if (kv) return kv;
  try {
    kv = await Deno.openKv();
    return kv;
  } catch {
    // Deno KV not available in this environment — skip rate limiting
    return null;
  }
}

/**
 * Sliding window rate limiter using Deno KV.
 * Stores a sorted list of request timestamps per IP.
 * Returns true if the request is allowed, false if rate limited.
 */
async function checkRateLimit(ip: string): Promise<boolean> {
  const db = await getKv();
  if (!db) return true; // KV unavailable — allow all

  const key = ['rate_limit', 'newsletter', ip];
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_S * 1000;

  const entry = await db.get<number[]>(key);
  const timestamps = (entry.value ?? []).filter((t) => t > windowStart);

  if (timestamps.length >= RATE_LIMIT_MAX) {
    return false; // Rate limited
  }

  timestamps.push(now);
  // TTL: window size + buffer so old entries are cleaned up automatically
  await db.set(key, timestamps, { expireIn: (RATE_LIMIT_WINDOW_S + 10) * 1000 });
  return true;
}

// ── hCaptcha verification ─────────────────────────────────────────────────────

/**
 * Verifies a client-side hCaptcha token server-side.
 * Only runs when HCAPTCHA_SECRET is configured.
 * If not configured, captcha is skipped (useful for local dev).
 *
 * Returns null on success, or an error string on failure.
 */
async function verifyCaptcha(token: string | undefined): Promise<string | null> {
  if (!HCAPTCHA_SECRET) return null; // CAPTCHA not configured — skip

  if (!token?.trim()) {
    return 'Please complete the CAPTCHA verification.';
  }

  try {
    const body = new URLSearchParams({
      secret:   HCAPTCHA_SECRET,
      response: token,
    });

    const res = await fetch('https://hcaptcha.com/siteverify', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    body.toString(),
    });

    const data = await res.json() as {
      success:    boolean;
      score?:     number;
      'error-codes'?: string[];
    };

    if (!data.success) {
      console.warn('[subscribe] hCaptcha failed:', data['error-codes']);
      return 'CAPTCHA verification failed. Please try again.';
    }

    // Score check (hCaptcha enterprise provides a score 0–1; basic does not)
    if (typeof data.score === 'number' && data.score < HCAPTCHA_MIN_SCORE) {
      console.warn('[subscribe] hCaptcha score too low:', data.score);
      return 'CAPTCHA verification failed. Please try again.';
    }

    return null; // Verified
  } catch (err) {
    // CAPTCHA service unreachable — fail open in development, fail closed in prod
    const isProd = !!Deno.env.get('DENO_DEPLOYMENT_ID');
    if (isProd) {
      return 'CAPTCHA verification temporarily unavailable. Please try again.';
    }
    console.warn('[subscribe] hCaptcha service error (ignored in dev):', err);
    return null;
  }
}

// ── Email validation ──────────────────────────────────────────────────────────

/**
 * Strict RFC 5321 email validation.
 * The basic regex alone allows invalid addresses like:
 *   user.@domain.com, user..name@domain, user@domain (no TLD)
 * This function catches those edge cases.
 */
const EMAIL_FULL_RE =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;

function validateEmail(email: string): string | null {
  if (!email)                                          return 'email is required.';
  if (email.length > 254)                              return 'Email address is too long.';
  const [local, ...rest] = email.split('@');
  const domain = rest.join('@');
  if (!local || !domain)                               return 'Please enter a valid email address.';
  if (local.length > 64)                               return 'Email address is too long.';
  if (local.startsWith('.') || local.endsWith('.'))    return 'Please enter a valid email address.';
  if (local.includes('..'))                            return 'Please enter a valid email address.';
  if (!EMAIL_FULL_RE.test(email))                      return 'Please enter a valid email address.';
  return null;
}

// ── Request validation ────────────────────────────────────────────────────────

function validateBody(
  body: unknown,
): { valid: true; data: RequestBody } | { valid: false; error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { valid: false, error: 'Request body must be a JSON object.' };
  }

  const b = body as Record<string, unknown>;

  if (typeof b.email !== 'string' || !b.email.trim()) {
    return { valid: false, error: 'email is required.' };
  }

  const email = b.email.trim().toLowerCase();
  const emailError = validateEmail(email);
  if (emailError) return { valid: false, error: emailError };

  if (b.channels !== undefined) {
    if (!Array.isArray(b.channels) || b.channels.some((c) => c !== 'EMAIL' && c !== 'SMS')) {
      return { valid: false, error: 'channels must be an array of "EMAIL" and/or "SMS".' };
    }
    if (b.channels.includes('SMS') && !b.phone_number) {
      return { valid: false, error: 'phone_number is required when channels includes "SMS".' };
    }
  }

  const str = (k: string) => typeof b[k] === 'string' ? (b[k] as string).trim().slice(0, 255) : undefined;

  return {
    valid: true,
    data: {
      email,
      first_name:    str('first_name'),
      last_name:     str('last_name'),
      phone_number:  str('phone_number'),
      listId:        str('listId'),
      channels:      Array.isArray(b.channels) ? b.channels as ('EMAIL' | 'SMS')[] : undefined,
      source:        str('source'),
      identify:      typeof b.identify === 'boolean' ? b.identify : true,
      captchaToken:  str('captchaToken'),
      properties:    b.properties && typeof b.properties === 'object' && !Array.isArray(b.properties)
        ? b.properties as Record<string, unknown> : undefined,
      // UTM fields — sanitised and capped at 255 chars each
      utm_source:    str('utm_source'),
      utm_medium:    str('utm_medium'),
      utm_campaign:  str('utm_campaign'),
      utm_content:   str('utm_content'),
      utm_term:      str('utm_term'),
    },
  };
}

// ── Klaviyo: check existing subscription ─────────────────────────────────────

async function isAlreadySubscribed(email: string): Promise<boolean> {
  try {
    const url = new URL(`${KLAVIYO_API_BASE}/profiles/`);
    url.searchParams.set('filter', `equals(email,"${email}")`);
    url.searchParams.set('fields[profile]', 'subscriptions');

    const res = await fetch(url.toString(), {
      method:  'GET',
      headers: {
        'Accept':        'application/json',
        'revision':      KLAVIYO_API_REVISION,
        'Authorization': `Klaviyo-API-Key ${KLAVIYO_PRIVATE_KEY}`,
      },
    });

    if (!res.ok) return false;

    const body = await res.json() as {
      data?: Array<{ attributes?: { subscriptions?: { email?: { marketing?: { consent?: string } } } } }>
    };

    return body.data?.[0]?.attributes?.subscriptions?.email?.marketing?.consent === 'SUBSCRIBED';
  } catch {
    return false; // Pre-flight is best-effort
  }
}

// ── Klaviyo: subscribe to list ────────────────────────────────────────────────

async function klaviyoSubscribe(
  data:      RequestBody,
  listId:    string,
  idempKey:  string,
): Promise<void> {
  const channels = data.channels ?? ['EMAIL'];

  // subscriptions must be an OBJECT keyed by lowercase channel name
  // ❌ [{ channel: 'EMAIL', marketing: { consent: 'SUBSCRIBED' } }]
  // ✅ { email: { marketing: { consent: 'SUBSCRIBED' } } }
  const subscriptions: Record<string, { marketing: { consent: string } }> =
    Object.fromEntries(
      channels.map((ch) => [ch.toLowerCase(), { marketing: { consent: 'SUBSCRIBED' } }]),
    );

  // Collect UTM params into profile properties
  const utmProperties: Record<string, string> = {};
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const) {
    if (data[key]) utmProperties[key] = data[key] as string;
  }

  const profileAttributes: Record<string, unknown> = {
    email:        data.email,
    ...(data.phone_number ? { phone_number: data.phone_number } : {}),
    ...(data.first_name   ? { first_name:   data.first_name }   : {}),
    ...(data.last_name    ? { last_name:    data.last_name }     : {}),
    properties: {
      ...(data.properties ?? {}),
      ...utmProperties,
    },
    subscriptions,
  };

  const body = {
    data: {
      type: 'profile-subscription-bulk-create-job',
      attributes: {
        custom_source: data.source ?? data.utm_source ?? APP_NAME,
        profiles: {
          data: [{ type: 'profile', attributes: profileAttributes }],
        },
      },
      relationships: {
        list: { data: { type: 'list', id: listId } },
      },
    },
  };

  const res = await fetch(`${KLAVIYO_API_BASE}/profile-subscription-bulk-create-jobs/`, {
    method:  'POST',
    headers: {
      'Content-Type':       'application/json',
      'Accept':             'application/json',
      'revision':           KLAVIYO_API_REVISION,
      'Authorization':      `Klaviyo-API-Key ${KLAVIYO_PRIVATE_KEY}`,
      // Idempotency key prevents duplicate jobs when the client retries
      'Idempotency-Key':    idempKey,
    },
    body: JSON.stringify(body),
  });

  if (res.status === 202) return;

  const errJson = await res.json().catch(() => ({ errors: [] })) as KlaviyoErrorEnvelope;
  throw new Error(errJson.errors?.[0]?.detail ?? `Klaviyo error ${res.status}`);
}

// ── Klaviyo: upsert profile ───────────────────────────────────────────────────

async function klaviyoIdentify(data: RequestBody): Promise<void> {
  const utmProperties: Record<string, string> = {};
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const) {
    if (data[key]) utmProperties[key] = data[key] as string;
  }

  const attributes: Record<string, unknown> = {
    email:      data.email,
    ...(data.phone_number ? { phone_number: data.phone_number } : {}),
    ...(data.first_name   ? { first_name:   data.first_name }   : {}),
    ...(data.last_name    ? { last_name:    data.last_name }     : {}),
    properties: { ...(data.properties ?? {}), ...utmProperties },
  };

  const res = await fetch(`${KLAVIYO_API_BASE}/profiles/`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Accept':        'application/json',
      'revision':      KLAVIYO_API_REVISION,
      'Authorization': `Klaviyo-API-Key ${KLAVIYO_PRIVATE_KEY}`,
    },
    body: JSON.stringify({ data: { type: 'profile', attributes } }),
  });

  if (res.ok || res.status === 409) return;

  const errJson = await res.json().catch(() => ({ errors: [] })) as KlaviyoErrorEnvelope;
  // Best-effort — log but never throw
  console.error('[subscribe] klaviyoIdentify failed (non-fatal):', errJson.errors?.[0]?.detail ?? res.status);
}

// ── Request handler ───────────────────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get('Origin') ?? ALLOWED_ORIGIN;

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  if (req.method !== 'POST') {
    return jsonResp({ ok: false, error: 'Method not allowed. Use POST.' }, 405, origin);
  }

  // ── Config guard ────────────────────────────────────────────────────────────
  if (!KLAVIYO_PRIVATE_KEY || !KLAVIYO_LIST_ID) {
    console.error('[subscribe] KLAVIYO_PRIVATE_KEY or KLAVIYO_LIST_ID is not set');
    return jsonResp({ ok: false, error: 'Server configuration error.' }, 500, origin);
  }

  // ── Rate limiting ────────────────────────────────────────────────────────────
  const ip =
    req.headers.get('CF-Connecting-IP') ??
    req.headers.get('X-Real-IP') ??
    req.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ??
    'unknown';

  const allowed = await checkRateLimit(ip);
  if (!allowed) {
    console.warn('[subscribe] Rate limited:', ip);
    return jsonResp(
      { ok: false, error: 'Too many requests. Please wait a moment and try again.' },
      429,
      origin,
    );
  }

  // ── Parse + validate ─────────────────────────────────────────────────────────
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return jsonResp({ ok: false, error: 'Invalid JSON body.' }, 400, origin);
  }

  const validation = validateBody(rawBody);
  if (!validation.valid) {
    return jsonResp({ ok: false, error: validation.error }, 400, origin);
  }

  const { data } = validation;
  const listId   = data.listId || KLAVIYO_LIST_ID;

  // ── hCaptcha verification ─────────────────────────────────────────────────────
  const captchaError = await verifyCaptcha(data.captchaToken);
  if (captchaError) {
    return jsonResp({ ok: false, error: captchaError }, 400, origin);
  }

  // ── Already-subscribed pre-flight ─────────────────────────────────────────────
  const alreadySubscribed = await isAlreadySubscribed(data.email);
  if (alreadySubscribed) {
    return jsonResp({ ok: true, alreadySubscribed: true }, 200, origin);
  }

  // ── Idempotency key ───────────────────────────────────────────────────────────
  // Stable per (email + listId) so client retries of the same subscription
  // don't create duplicate Klaviyo jobs.
  const encoder   = new TextEncoder();
  const hashBytes = await crypto.subtle.digest(
    'SHA-256',
    encoder.encode(`subscribe:${data.email}:${listId}`),
  );
  const idempKey = Array.from(new Uint8Array(hashBytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  // ── Subscribe + identify ──────────────────────────────────────────────────────
  try {
    await klaviyoSubscribe(data, listId, idempKey);

    if (data.identify !== false) {
      await klaviyoIdentify(data);
    }

    return jsonResp({ ok: true, alreadySubscribed: false }, 200, origin);

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Subscription failed.';
    console.error('[subscribe] Klaviyo error:', message);

    // Report to Sentry for monitoring
    await reportToSentry(err, {
      email:   data.email.replace(/(?<=.).+(?=@)/, '***'), // redact email local part
      listId,
      source:  data.source,
      attempt: 'server',
    });

    return jsonResp({ ok: false, error: message }, 500, origin);
  }
});