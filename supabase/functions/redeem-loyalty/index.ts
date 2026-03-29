// supabase/functions/redeem-loyalty/index.ts
// =============================================================================
// REDEEM LOYALTY — Enterprise / Production Hardened (2026)
// =============================================================================
// Admin-only redemption via RPC: v2_redeem_points
//
// Fixes:
// - ✅ CORS truly fail-closed
// - ✅ Includes x-request-id in allowed headers
// - ✅ Normalizes RPC output (array/object) into ONE stable response shape
// - ✅ Always returns: { ok, new_balance, was_duplicate, meta }
// =============================================================================

import { createServiceClient, createAnonClient, type SvcClient } from '../_shared/supabase.ts';
import type { Database } from '../_shared/database.types.ts';

const CONFIG = {
  MAX_BODY_BYTES: 10_000,
  MAX_POINTS: 1_000_000,
  ALLOWED_ORIGINS: [
    'https://sofislegacy.com',
    'https://www.sofislegacy.com',
    'https://sofisrestaurant-enterprise.vercel.app',
    'http://localhost:3000',
    'http://localhost:5173',
  ] as const,
} as const;

const ORIGINS = new Set<string>(CONFIG.ALLOWED_ORIGINS);

const ALLOWED_HEADERS =
  'authorization, apikey, x-client-info, content-type, x-application-name, x-request-id, x-idempotency-key';
const ALLOWED_METHODS = 'POST, OPTIONS';

type JsonRecord = Record<string, unknown>;
function isRecord(v: unknown): v is JsonRecord {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isUuid(v: string): boolean {
  return UUID_RE.test(v);
}

function nowIso(): string {
  return new Date().toISOString();
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

function log(level: 'info' | 'warn' | 'error', event: string, data?: Record<string, unknown>) {
  const entry = JSON.stringify({
    level,
    event,
    service: 'redeem-loyalty',
    ts: nowIso(),
    ...(data ?? {}),
  });
  if (level === 'error') console.error(entry);
  else if (level === 'warn') console.warn(entry);
  else console.log(entry);
}

function cors(req: Request): Record<string, string> | null {
  const origin = (req.headers.get('origin') ?? '').trim();
  if (!origin || !ORIGINS.has(origin)) return null;

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': ALLOWED_HEADERS,
    'Access-Control-Allow-Methods': ALLOWED_METHODS,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(corsHeaders: Record<string, string>, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
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

function readBearer(req: Request): string | null {
  const raw = req.headers.get('authorization') ?? req.headers.get('Authorization') ?? '';
  const m = raw.trim().match(/^bearer\s+(.+)$/i);
  const token = m?.[1]?.trim();
  return token ? token : null;
}

async function requireAdmin(req: Request, svc: SvcClient): Promise<string | null> {
  const token = readBearer(req);
  if (!token) return null;

  const anon = createAnonClient(token);
  const { data, error } = await anon.auth.getUser();
  const userId = data?.user?.id ?? null;
  if (error || !userId) return null;

  const { data: profile, error: profErr } = await svc
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();

  if (profErr || !profile) return null;
  if (String(profile.role).toLowerCase() !== 'admin') return null;

  return userId;
}

function asString(v: unknown, max = 200): string {
  const s = typeof v === 'string' ? v.trim() : '';
  if (!s) return '';
  return s.length > max ? s.slice(0, max) : s;
}

function asInt(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function fnv1a32(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

type RedeemRow =
  Database['public']['Functions']['v2_redeem_points']['Returns'][number];

function normalizeRedeemRow(raw: unknown): RedeemRow | null {
  const row = Array.isArray(raw) ? raw[0] : raw;
  return isRecord(row) ? (row as RedeemRow) : null;
}

Deno.serve(async (req) => {
  const requestId = makeRequestId(req);
  const ch = cors(req);
  if (!ch) return new Response('Origin not allowed', { status: 403 });

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: ch });
  if (req.method !== 'POST') {
    return json(
      ch,
      { ok: false, error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED', meta: { requestId } },
      405,
    );
  }

  const svc = createServiceClient();

  const adminId = await requireAdmin(req, svc);
  if (!adminId) {
    return json(
      ch,
      { ok: false, error: 'Unauthorized', code: 'UNAUTHORIZED', meta: { requestId } },
      401,
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await readJsonWithLimit(req, CONFIG.MAX_BODY_BYTES);
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

    return json(
      ch,
      { ok: false, error: 'Invalid request payload', code, meta: { requestId } },
      status,
    );
  }

  if (!isRecord(rawBody)) {
    return json(
      ch,
      { ok: false, error: 'Invalid request payload', code: 'BAD_REQUEST', meta: { requestId } },
      400,
    );
  }

  const accountId = asString(rawBody.account_id, 128);
  const pointsRaw = rawBody.points ?? rawBody.points_to_redeem;
  const points = clampInt(asInt(pointsRaw, 0), 1, CONFIG.MAX_POINTS);

  if (!accountId || !isUuid(accountId)) {
    return json(
      ch,
      { ok: false, error: 'Invalid account_id', code: 'INVALID_ACCOUNT', meta: { requestId } },
      400,
    );
  }
  if (!Number.isFinite(points) || points <= 0) {
    return json(
      ch,
      { ok: false, error: 'Invalid points', code: 'INVALID_POINTS', meta: { requestId } },
      400,
    );
  }

  const clientIdem = asString(req.headers.get('x-idempotency-key'), 180);
  const idem = clientIdem || `redeem:${fnv1a32(`${adminId}:${accountId}:${points}`)}`;

  const referenceId = crypto.randomUUID();

  try {
    const { data, error } = await svc.rpc('v2_redeem_points', {
      p_account_id: accountId,
      p_amount: points,
      p_admin_id: adminId,
      p_reference_id: referenceId,
      p_idempotency_key: idem,
    });

    if (error) {
      log('warn', 'redeem_rpc_failed', {
        requestId,
        code: error.code ?? null,
        adminId: adminId.slice(0, 8),
        accountId: accountId.slice(0, 8),
        points,
      });

      return json(
        ch,
        { ok: false, error: 'Redeem failed', code: 'REDEEM_FAILED', meta: { requestId } },
        400,
      );
    }

    const normalized = normalizeRedeemRow(data);
    if (!normalized) {
      log('warn', 'redeem_bad_shape', { requestId });
      return json(
        ch,
        { ok: false, error: 'Invalid response shape', code: 'BAD_RESPONSE', meta: { requestId } },
        500,
      );
    }

    return json(ch, {
      ok: true,
      new_balance: normalized.new_balance,
      was_duplicate: normalized.was_duplicate,
      reference_id: referenceId,
      meta: { requestId, ts: nowIso(), account_id: accountId, points },
    });
  } catch (e) {
    log('error', 'redeem_crashed', {
      requestId,
      error: e instanceof Error ? e.message : String(e),
    });
    return json(
      ch,
      { ok: false, error: 'Internal server error', code: 'INTERNAL', meta: { requestId } },
      500,
    );
  }
});
