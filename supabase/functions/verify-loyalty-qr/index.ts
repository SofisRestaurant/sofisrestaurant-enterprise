// supabase/functions/verify-loyalty-qr/index.ts
// =============================================================================
// VERIFY LOYALTY QR — Enterprise / Production Hardened (2026)
// ----------------------------------------------------------------------------
// Purpose:
// - Admin-only endpoint to resolve a customer's loyalty account via loyalty_public_id
//
// Upgrades:
// - Fail-closed CORS (403 if origin not allowlisted)
// - Body size guard (DoS hardening)
// - Strict JSON parsing + runtime guards (no `any`)
// - Single service client instance (no repeated createServiceClient())
// - Auth split: anon client validates JWT identity (RLS), service client verifies admin role
// - Structured logs (no secrets)
// =============================================================================

import { createAnonClient, createServiceClient, type SvcClient } from '../_shared/supabase.ts';

// ─────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────
const CONFIG = {
  MAX_BODY_BYTES: 5_000, // tiny payload expected
} as const;

const ALLOWED_ORIGINS = [
  'https://sofislegacy.com',
  'https://www.sofislegacy.com',
  'https://sofisrestaurant-enterprise.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000',
] as const;

// ✅ FIX: include x-request-id (and keep x-idempotency-key allowed across your app)
const ALLOWED_HEADERS =
  'authorization, x-client-info, apikey, content-type, x-application-name, x-request-id, x-idempotency-key';

const ALLOWED_METHODS = 'POST, OPTIONS';

// ─────────────────────────────────────────────────────────────
// CORS (fail-closed)
// ─────────────────────────────────────────────────────────────
function isAllowedOrigin(origin: string): origin is (typeof ALLOWED_ORIGINS)[number] {
  return (ALLOWED_ORIGINS as readonly string[]).includes(origin);
}

function getCors(req: Request): Record<string, string> | null {
  const origin = req.headers.get('origin') ?? '';
  if (!origin || !isAllowedOrigin(origin)) return null;

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': ALLOWED_HEADERS,
    'Access-Control-Allow-Methods': ALLOWED_METHODS,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

// ─────────────────────────────────────────────────────────────
// Response helper
// ─────────────────────────────────────────────────────────────
function json(cors: Record<string, string>, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

// ─────────────────────────────────────────────────────────────
// Logging
// ─────────────────────────────────────────────────────────────
function log(level: 'info' | 'warn' | 'error', event: string, data?: Record<string, unknown>) {
  const entry = JSON.stringify({
    level,
    event,
    service: 'verify-loyalty-qr',
    ts: new Date().toISOString(),
    ...(data ?? {}),
  });
  if (level === 'error') console.error(entry);
  else if (level === 'warn') console.warn(entry);
  else console.log(entry);
}

// ─────────────────────────────────────────────────────────────
// Runtime guards
// ─────────────────────────────────────────────────────────────
type JsonRecord = Record<string, unknown>;

function isRecord(v: unknown): v is JsonRecord {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asString(v: unknown, max = 200): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

function isValidUUID(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

// ─────────────────────────────────────────────────────────────
// Auth (admin)
// ─────────────────────────────────────────────────────────────
type AdminAuth =
  | { ok: true; adminId: string }
  | { ok: false; status: 401 | 403; reason: 'missing_bearer' | 'invalid_token' | 'not_admin' };

function readBearer(req: Request): string | null {
  const raw = req.headers.get('authorization') ?? req.headers.get('Authorization');
  if (!raw) return null;
  const m = raw.trim().match(/^bearer\s+(.+)$/i);
  const token = m?.[1]?.trim();
  return token ? token : null;
}

async function requireAdmin(req: Request, svc: SvcClient): Promise<AdminAuth> {
  const token = readBearer(req);
  if (!token) return { ok: false, status: 401, reason: 'missing_bearer' };

  // 1) Identify caller using anon client + JWT (RLS enforced)
  const anon = createAnonClient(token);
  const { data: authData, error: authErr } = await anon.auth.getUser();

  const userId = authData?.user?.id ?? null;
  if (authErr || !userId) return { ok: false, status: 401, reason: 'invalid_token' };

  // 2) Verify admin role using service client (bypasses RLS)
  const { data: profile, error: profErr } = await svc
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();

  if (profErr || !profile || profile.role !== 'admin') {
    return { ok: false, status: 403, reason: 'not_admin' };
  }

  return { ok: true, adminId: userId };
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  const requestId = (req.headers.get('x-request-id') ?? '').trim() || crypto.randomUUID();
  const cors = getCors(req);

  if (!cors) return new Response('Origin not allowed', { status: 403 });

  // Preflight
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  if (req.method !== 'POST') {
    return json(cors, { error: 'Method not allowed', requestId }, 405);
  }

  // Body size guard (best-effort)
  const len = Number(req.headers.get('content-length') ?? '0');
  if (len && Number.isFinite(len) && len > CONFIG.MAX_BODY_BYTES) {
    log('warn', 'payload_too_large', { requestId, len, max: CONFIG.MAX_BODY_BYTES });
    return json(cors, { error: 'Payload too large', requestId }, 413);
  }

  const svc = createServiceClient();

  // Auth
  const auth = await requireAdmin(req, svc);
  if (!auth.ok) {
    log('warn', 'auth_failed', { requestId, reason: auth.reason, status: auth.status });
    return json(cors, { error: 'Unauthorized', requestId }, auth.status);
  }

  // Parse JSON
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(cors, { error: 'Invalid JSON', requestId }, 400);
  }

  if (!isRecord(body)) {
    return json(cors, { error: 'Invalid request payload', requestId }, 400);
  }

  const loyaltyPublicId = asString(body.loyalty_public_id, 64);
  if (!loyaltyPublicId || !isValidUUID(loyaltyPublicId)) {
    return json(cors, { error: 'Invalid loyalty_public_id format', requestId }, 400);
  }

  // Lookup profile by public id
  const { data: profile, error: profileError } = await svc
    .from('profiles')
    .select('id, full_name')
    .eq('loyalty_public_id', loyaltyPublicId)
    .maybeSingle();

  if (profileError) {
    log('error', 'profile_lookup_failed', { requestId, msg: profileError.message });
    return json(cors, { error: 'Internal server error', requestId }, 500);
  }

  if (!profile) {
    return json(cors, { error: 'Customer not found', requestId }, 404);
  }

  // Lookup loyalty account (view)
  const { data: account, error: accountError } = await svc
    .from('v2_account_summary')
    .select('id, balance, lifetime_earned, tier, streak')
    .eq('user_id', profile.id)
    .maybeSingle();

  if (accountError) {
    log('error', 'account_lookup_failed', { requestId, msg: accountError.message });
    return json(cors, { error: 'Internal server error', requestId }, 500);
  }

  if (!account) {
    return json(cors, { error: 'Loyalty account not found', requestId }, 404);
  }

  log('info', 'verify_ok', {
    requestId,
    adminId: auth.adminId,
    profileId: profile.id,
    accountId: account.id,
  });

  return json(
    cors,
    {
      requestId,
      account_id: account.id,
      profile_id: profile.id,
      full_name: profile.full_name ?? null,
      balance: account.balance,
      lifetime_earned: account.lifetime_earned,
      tier: account.tier,
      streak: account.streak,
    },
    200,
  );
});
