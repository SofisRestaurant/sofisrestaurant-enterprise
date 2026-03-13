// supabase/functions/award-loyalty-qr/index.ts
// =============================================================================
// AWARD LOYALTY QR — Enterprise Grade (2026) • V2 Admin-Only (Append-Only Safe)
// =============================================================================
// Purpose:
// - Admin-only endpoint to award V2 loyalty points after verifying a QR scan flow.
// - Uses v2_award_points (loyalty_ledger + loyalty_accounts) with strong idempotency.
// - ✅ Append-only compatible: NO updates to loyalty_ledger.
// - ✅ If scan_id is provided: link ledger row at INSERT time via
//   v2_award_points(..., p_reference_id := scan_id).
//
// Security / hardening:
// - Fail-closed CORS allowlist (403 if origin not allowlisted)
// - Strict JSON parsing + body size caps + content-type gate
// - Strict UUID validation, amount clamping, and minimum amount guard
// - Admin auth: anon JWT validates caller identity; service role verifies admin role
// - Optional: REQUIRE_SCAN_ID (recommended true in production)
// - Optional: GEO restriction hooks (header-based; real enforcement should be at CDN/WAF)
//
// Request (JSON):
//   { account_id: string(uuid), amount_cents: number, scan_id?: string(uuid) }
//
// Response:
//   200 -> { ok:true, result, meta }
//   4xx/5xx -> { ok:false, error:{code,message}, meta }
//
// Notes:
// - QR awards are NOT orders. reference_id is set to scan_id (if provided) for traceability.
// - Do NOT log JWTs, emails, phones, addresses.
// =============================================================================

import { createAnonClient, createServiceClient, type SvcClient } from '../_shared/supabase.ts';

// ─────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────

const CONFIG = {
  MAX_BODY_BYTES: 6_000,
  MAX_AWARD_AMOUNT_CENTS: 500_000, // $5,000 safety cap
  MIN_AWARD_AMOUNT_CENTS: 100, // $1 minimum

  // Fail-closed CORS allowlist
  ALLOWED_ORIGINS: [
    'https://sofislegacy.com',
    'https://www.sofislegacy.com',
    'https://sofisrestaurant.netlify.app',
    'http://localhost:3000',
    'http://localhost:5173',
  ] as const,

  // ✅ Recommended: set true in production so every award is traceable + truly idempotent
  REQUIRE_SCAN_ID: false,

  // Defense-in-depth: basic method allowlist
  ALLOWED_METHODS: 'POST, OPTIONS',

  // Optional (soft) geo: only works if your edge/CDN forwards a country header.
  // Real geo enforcement should be done at Cloudflare/WAF for reliability.
  ENABLE_GEO_GUARD: false,
  ALLOWED_COUNTRIES: ['US'] as const,
  GEO_COUNTRY_HEADERS: ['cf-ipcountry', 'x-vercel-ip-country', 'x-country'] as const,

  // Observability: return requestId always
  RETURN_REQUEST_ID: true,
} as const;

const ORIGINS = new Set<string>(CONFIG.ALLOWED_ORIGINS);
const ALLOWED_HEADERS =
  'authorization, apikey, content-type, x-client-info, x-application-name, x-request-id, x-idempotency-key';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

type JsonRecord = Record<string, unknown>;

type Ok = {
  ok: true;
  result: unknown;
  meta: {
    requestId: string;
    ts: string;
    adminId: string;
    accountId: string;
    scanId: string | null;
    idempotencyKey: string;
  };
};

type Fail = {
  ok: false;
  error: { code: string; message: string };
  meta: { requestId: string; ts: string };
};

type AdminAuth =
  | { ok: true; adminId: string }
  | { ok: false; status: 401 | 403; code: 'AUTH_MISSING' | 'AUTH_INVALID' | 'AUTH_FORBIDDEN' };

// ─────────────────────────────────────────────────────────────
// Utils
// ─────────────────────────────────────────────────────────────

function nowIso(): string {
  return new Date().toISOString();
}

function isRecord(v: unknown): v is JsonRecord {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isUuid(v: string): boolean {
  return UUID_RE.test(v);
}

function makeRequestId(req: Request): string {
  const h = (req.headers.get('x-request-id') ?? '').trim();
  if (h) return h.slice(0, 128);
  try {
    return crypto.randomUUID();
  } catch {
    return `req_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
}

function prefix(id: string | null | undefined, n = 8): string | null {
  if (!id) return null;
  return id.slice(0, n);
}

function clampAmountCents(v: unknown): number {
  const n =
    typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' ? Number(v) : NaN;
  const c = Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
  return Math.min(c, CONFIG.MAX_AWARD_AMOUNT_CENTS);
}

function readBearer(req: Request): string | null {
  const raw = req.headers.get('authorization') ?? req.headers.get('Authorization');
  if (!raw) return null;
  const m = raw.trim().match(/^bearer\s+(.+)$/i);
  const token = m?.[1]?.trim();
  return token ? token : null;
}

function corsHeaders(req: Request): Record<string, string> | null {
  const origin = (req.headers.get('origin') ?? '').trim();
  if (!origin || !ORIGINS.has(origin)) return null;

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': ALLOWED_HEADERS,
    'Access-Control-Allow-Methods': CONFIG.ALLOWED_METHODS,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function respond(headers: Record<string, string>, body: Ok | Fail, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function log(level: 'info' | 'warn' | 'error', event: string, data?: Record<string, unknown>) {
  // Never include JWTs, emails, phones, addresses.
  const line = JSON.stringify({
    level,
    event,
    service: 'award-loyalty-qr',
    ts: nowIso(),
    ...(data ?? {}),
  });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

async function readJsonWithLimit(req: Request, maxBytes: number): Promise<unknown> {
  const ct = (req.headers.get('content-type') ?? '').toLowerCase();
  if (!ct.includes('application/json')) throw new Error('UNSUPPORTED_CONTENT_TYPE');

  const ab = await req.arrayBuffer();
  if (ab.byteLength > maxBytes) throw new Error('PAYLOAD_TOO_LARGE');

  const text = new TextDecoder().decode(ab);
  if (!text.trim()) throw new Error('EMPTY_BODY');

  try {
    return JSON.parse(text);
  } catch {
    throw new Error('INVALID_JSON');
  }
}

function getCountry(req: Request): string | null {
  for (const h of CONFIG.GEO_COUNTRY_HEADERS) {
    const v = (req.headers.get(h) ?? '').trim();
    if (v) return v.toUpperCase();
  }
  return null;
}

function geoAllowed(req: Request): boolean {
  if (!CONFIG.ENABLE_GEO_GUARD) return true;
  const c = getCountry(req);
  if (!c) return false; // fail-closed if enabled but header missing
  return (CONFIG.ALLOWED_COUNTRIES as readonly string[]).includes(c);
}

// ─────────────────────────────────────────────────────────────
// Auth: anon validates JWT, service verifies admin
// ─────────────────────────────────────────────────────────────

async function requireAdmin(req: Request, svc: SvcClient): Promise<AdminAuth> {
  const token = readBearer(req);
  if (!token) return { ok: false, status: 401, code: 'AUTH_MISSING' };

  // 1) Validate JWT + get userId (server-validated via Supabase)
  const anon = createAnonClient(token);
  const { data, error } = await anon.auth.getUser();
  const userId = data?.user?.id ?? null;

  if (error || !userId) return { ok: false, status: 401, code: 'AUTH_INVALID' };

  // 2) Verify admin role (service role, bypasses RLS)
  const { data: profile, error: profErr } = await svc
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();

  const role = typeof profile?.role === 'string' ? profile.role.toLowerCase() : '';
  if (profErr || !profile || role !== 'admin')
    return { ok: false, status: 403, code: 'AUTH_FORBIDDEN' };

  return { ok: true, adminId: userId };
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const requestId = makeRequestId(req);
  const metaBase = { requestId, ts: nowIso() };

  const cors = corsHeaders(req);
  if (!cors) return new Response('Origin not allowed', { status: 403 });

  // Preflight
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  // Method gate
  if (req.method !== 'POST') {
    return respond(
      cors,
      {
        ok: false,
        error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' },
        meta: metaBase,
      },
      405,
    );
  }

  // Optional geo guard (defense in depth)
  if (!geoAllowed(req)) {
    log('warn', 'geo_blocked', { requestId, country: getCountry(req) });
    return respond(
      cors,
      { ok: false, error: { code: 'GEO_BLOCKED', message: 'Not allowed' }, meta: metaBase },
      403,
    );
  }

  // Parse JSON safely
  let body: unknown;
  try {
    body = await readJsonWithLimit(req, CONFIG.MAX_BODY_BYTES);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'BAD_REQUEST';
    const code =
      msg === 'PAYLOAD_TOO_LARGE'
        ? 'PAYLOAD_TOO_LARGE'
        : msg === 'UNSUPPORTED_CONTENT_TYPE'
          ? 'UNSUPPORTED_CONTENT_TYPE'
          : msg === 'EMPTY_BODY'
            ? 'EMPTY_BODY'
            : 'INVALID_JSON';

    const status =
      code === 'PAYLOAD_TOO_LARGE' ? 413 : code === 'UNSUPPORTED_CONTENT_TYPE' ? 415 : 400;
    return respond(
      cors,
      { ok: false, error: { code, message: 'Invalid request payload' }, meta: metaBase },
      status,
    );
  }

  if (!isRecord(body)) {
    return respond(
      cors,
      {
        ok: false,
        error: { code: 'BAD_BODY', message: 'Body must be a JSON object' },
        meta: metaBase,
      },
      400,
    );
  }

  const accountId = typeof body.account_id === 'string' ? body.account_id.trim() : '';
  const scanId = typeof body.scan_id === 'string' ? body.scan_id.trim() : null;
  const amountCents = clampAmountCents(body.amount_cents);

  if (!accountId || !isUuid(accountId)) {
    return respond(
      cors,
      {
        ok: false,
        error: { code: 'INVALID_ACCOUNT_ID', message: 'Invalid account_id' },
        meta: metaBase,
      },
      400,
    );
  }
  if (scanId && !isUuid(scanId)) {
    return respond(
      cors,
      { ok: false, error: { code: 'INVALID_SCAN_ID', message: 'Invalid scan_id' }, meta: metaBase },
      400,
    );
  }
  if (CONFIG.REQUIRE_SCAN_ID && !scanId) {
    return respond(
      cors,
      {
        ok: false,
        error: { code: 'SCAN_ID_REQUIRED', message: 'scan_id is required' },
        meta: metaBase,
      },
      400,
    );
  }
  if (amountCents < CONFIG.MIN_AWARD_AMOUNT_CENTS) {
    return respond(
      cors,
      {
        ok: false,
        error: { code: 'AMOUNT_TOO_SMALL', message: 'Amount too small' },
        meta: metaBase,
      },
      400,
    );
  }

  // Service role client (single instance per request)
  const svc = createServiceClient();

  // Admin auth
  const auth = await requireAdmin(req, svc);
  if (!auth.ok) {
    const msg = auth.code === 'AUTH_FORBIDDEN' ? 'Forbidden' : 'Unauthorized';
    log('warn', 'auth_failed', { requestId, code: auth.code });
    return respond(
      cors,
      { ok: false, error: { code: auth.code, message: msg }, meta: metaBase },
      auth.status,
    );
  }

  const adminId = auth.adminId;

  // Ensure account exists (clean errors)
  const { data: acct, error: acctErr } = await svc
    .from('loyalty_accounts')
    .select('id')
    .eq('id', accountId)
    .maybeSingle();

  if (acctErr) {
    log('error', 'account_lookup_failed', {
      requestId,
      accountId: prefix(accountId),
      code: acctErr.code ?? null,
    });
    return respond(
      cors,
      {
        ok: false,
        error: { code: 'DB_ACCOUNT_LOOKUP', message: 'Failed to verify account' },
        meta: metaBase,
      },
      500,
    );
  }
  if (!acct?.id) {
    return respond(
      cors,
      {
        ok: false,
        error: { code: 'ACCOUNT_NOT_FOUND', message: 'Account not found' },
        meta: metaBase,
      },
      404,
    );
  }

  // Deterministic idempotency:
  // - If scanId exists: perfect idempotency per scan
  // - Else: bucket by day (prevents accidental rapid double-awards), but scanId is strongly recommended
  const dayBucket = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
  const idempotencyKey = scanId
    ? `qr-award:${scanId}`
    : `qr-award:${adminId}:${accountId}:${amountCents}:${dayBucket}`;

  try {
    const rpcArgsBase = {
      p_account_id: accountId,
      p_admin_id: adminId,
      p_amount_cents: amountCents,
      p_idempotency_key: idempotencyKey,
    };

    // ✅ Append-only safe:
    // If scanId exists, call 5-arg overload to set reference_id=scanId at INSERT time.
    const { data: awardRaw, error: awardErr } = scanId
      ? await svc.rpc('v2_award_points', { ...rpcArgsBase, p_reference_id: scanId })
      : await svc.rpc('v2_award_points', rpcArgsBase);

    if (awardErr) {
      // Don't leak internals to client
      log('warn', 'v2_award_points_failed', {
        requestId,
        adminId: prefix(adminId),
        accountId: prefix(accountId),
        scanId: scanId ? prefix(scanId) : null,
        code: awardErr.code ?? null,
      });

      return respond(
        cors,
        { ok: false, error: { code: 'AWARD_FAILED', message: 'Award failed' }, meta: metaBase },
        500,
      );
    }

    const result = Array.isArray(awardRaw) ? (awardRaw[0] ?? null) : (awardRaw ?? null);

    log('info', 'award_ok', {
      requestId,
      adminId: prefix(adminId),
      accountId: prefix(accountId),
      scanId: scanId ? prefix(scanId) : null,
      idem: idempotencyKey.slice(0, 64),
    });

    const out: Ok = {
      ok: true,
      result,
      meta: {
        requestId,
        ts: nowIso(),
        adminId,
        accountId,
        scanId,
        idempotencyKey,
      },
    };

    return respond(cors, out, 200);
  } catch (e) {
    log('error', 'award_crash', {
      requestId,
      adminId: prefix(adminId),
      accountId: prefix(accountId),
      scanId: scanId ? prefix(scanId) : null,
      error: e instanceof Error ? e.message : String(e),
    });

    return respond(
      cors,
      { ok: false, error: { code: 'INTERNAL', message: 'Internal server error' }, meta: metaBase },
      500,
    );
  }
});
