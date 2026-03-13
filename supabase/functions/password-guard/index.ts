// supabase/functions/password-guard/index.ts
// =============================================================================
// PASSWORD GUARD — PRODUCTION HARDENED (2026)
// =============================================================================
// - Strict CORS allowlist (fail-closed)
// - Bounded JSON parsing (DoS safe)
// - Timeout + UA header for HIBP
// - Rate limit (per IP) to avoid being used as a breach-proxy
// - Response uses stable codes (no info leaks by default)
// =============================================================================

import zxcvbn from 'zxcvbn';

const ALLOWED_ORIGINS = [
  'https://sofislegacy.com',
  'https://www.sofislegacy.com',
  'https://sofisrestaurant.netlify.app',
  'http://localhost:3000',
  'http://localhost:5173',
] as const;

const CONFIG = {
  MAX_BODY_BYTES: 6_000,
  HIBP_TIMEOUT_MS: 4_000,
  // If password appears more than this many times, reject
  HIBP_REJECT_AT: 1, // set to 10 if you want less strict
  // Rate limit this endpoint (per IP) to prevent abuse
  MAX_REQ_PER_MIN_IP: 30,
} as const;

type JsonRecord = Record<string, unknown>;

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed =
    origin && (ALLOWED_ORIGINS as readonly string[]).includes(origin) ? origin : 'null';
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, x-application-name, x-request-id, x-idempotency-key',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

function isRecord(v: unknown): v is JsonRecord {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function pickClientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const ip = xff.split(',')[0]?.trim();
    if (ip) return ip;
  }
  const cf = req.headers.get('cf-connecting-ip')?.trim();
  if (cf) return cf;
  const realIp = req.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;
  return 'unknown';
}

async function readJsonLimited(req: Request, maxBytes: number): Promise<unknown> {
  const ct = req.headers.get('content-type') ?? '';
  if (!ct.toLowerCase().includes('application/json')) return null;

  const len = req.headers.get('content-length');
  if (len) {
    const n = Number(len);
    if (Number.isFinite(n) && n > maxBytes) throw new Error('BODY_TOO_LARGE');
  }

  const text = await req.text();
  if (text.length > maxBytes) throw new Error('BODY_TOO_LARGE');
  if (!text.trim()) return null;

  try {
    return JSON.parse(text);
  } catch {
    throw new Error('BAD_JSON');
  }
}

function asString(v: unknown, max = 500): string {
  if (typeof v !== 'string') return '';
  const s = v.trim();
  return s.length > max ? s.slice(0, max) : s;
}

function sha1HexUpper(input: string): Promise<string> {
  const encoder = new TextEncoder();
  return crypto.subtle.digest('SHA-1', encoder.encode(input)).then((buf) =>
    Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase(),
  );
}

function entropyBits(password: string): number {
  // Rough upper-bound estimate. We still rely on zxcvbn + HIBP.
  return password.length * Math.log2(94);
}

function normalizeEmailPrefix(email: string): string {
  const at = email.indexOf('@');
  const prefix = at >= 0 ? email.slice(0, at) : email;
  return prefix.toLowerCase();
}

function containsCommonPatterns(pwLower: string): boolean {
  const blocked = ['qwerty', 'asdfgh', 'zxcvbn', '123456', 'password'];
  return blocked.some((p) => pwLower.includes(p));
}

function ok(headers: Record<string, string>) {
  return json({ ok: true }, 200, headers);
}

function reject(headers: Record<string, string>, code: string) {
  // Production: keep message generic, return code for UI
  return json({ ok: false, code, error: 'Password rejected' }, 400, headers);
}

async function hibpRangeLookup(sha1Upper: string): Promise<number> {
  const prefix = sha1Upper.slice(0, 5);
  const suffix = sha1Upper.slice(5);

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), CONFIG.HIBP_TIMEOUT_MS);

  try {
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      method: 'GET',
      signal: ac.signal,
      headers: {
        // HIBP asks for a user agent; helpful for debugging + compliance
        'User-Agent': 'sofis-restaurant-v2-password-guard',
        'Add-Padding': 'true', // helps privacy against response-size attacks
      },
    });

    if (!res.ok) throw new Error('HIBP_FETCH_FAILED');

    const text = await res.text();
    // Each line: SUFFIX:COUNT
    for (const line of text.split('\n')) {
      const [suf, cnt] = line.trim().split(':');
      if (suf === suffix) {
        const n = Number(cnt);
        return Number.isFinite(n) ? n : 0;
      }
    }
    return 0;
  } finally {
    clearTimeout(t);
  }
}

// In-memory rate limiter (Edge instance-local; good enough to prevent abuse storms).
// If you want global, back it by a table like checkout_rate_limits.
const rateMap = new Map<string, { windowStart: number; count: number }>();

function rateLimitOrNull(ip: string): string | null {
  const now = Date.now();
  const windowMs = 60_000;
  const entry = rateMap.get(ip);

  if (!entry || now - entry.windowStart >= windowMs) {
    rateMap.set(ip, { windowStart: now, count: 1 });
    return null;
  }

  entry.count += 1;
  if (entry.count > CONFIG.MAX_REQ_PER_MIN_IP) return 'RATE_LIMITED';
  return null;
}

Deno.serve(async (req) => {
  const headers = corsHeaders(req.headers.get('origin'));

  if (req.method === 'OPTIONS') return new Response('ok', { status: 204, headers });
  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405, headers);

  const ip = pickClientIp(req);
  const rl = rateLimitOrNull(ip);
  if (rl) return json({ ok: false, error: 'Too many requests' }, 429, headers);

  let raw: unknown;
  try {
    raw = await readJsonLimited(req, CONFIG.MAX_BODY_BYTES);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'BAD_REQUEST';
    if (msg === 'BODY_TOO_LARGE') return json({ ok: false, error: 'Body too large' }, 413, headers);
    return json({ ok: false, error: 'Invalid JSON' }, 400, headers);
  }

  if (!isRecord(raw)) return json({ ok: false, error: 'Invalid request' }, 400, headers);

  const password = asString(raw.password, 500);
  const email = asString(raw.email, 500);

  if (!password || !email) return json({ ok: false, error: 'Invalid request' }, 400, headers);

  const pwLower = password.toLowerCase();

  // 1) Entropy guard (lightweight)
  if (entropyBits(password) < 50) return reject(headers, 'LOW_ENTROPY');

  // 2) zxcvbn
  const strength = zxcvbn(password, [email, normalizeEmailPrefix(email)]);
  if (strength.score < 3) return reject(headers, 'ZXCVBN_WEAK');

  // 3) Email similarity (simple)
  const emailPrefix = normalizeEmailPrefix(email);
  if (emailPrefix && emailPrefix.length >= 3 && pwLower.includes(emailPrefix)) {
    return reject(headers, 'CONTAINS_EMAIL');
  }

  // 4) Common patterns
  if (containsCommonPatterns(pwLower)) return reject(headers, 'COMMON_PATTERN');

  // 5) HIBP k-anonymity check (timeout protected)
  try {
    const sha1 = await sha1HexUpper(password);
    const breachCount = await hibpRangeLookup(sha1);

    if (breachCount >= CONFIG.HIBP_REJECT_AT) {
      return reject(headers, 'PWNED_PASSWORD');
    }
  } catch {
    // If HIBP is down, fail-open or fail-closed?
    // Production recommendation: FAIL-OPEN to avoid blocking signups.
    // You can change to reject(headers,"HIBP_UNAVAILABLE") if you prefer fail-closed.
  }

  return ok(headers);
});
