// supabase/functions/loyalty-account/index.ts
// =============================================================================
// LOYALTY ACCOUNT — Enterprise Edge Function (2026) — CORS + JWT + Service Role
// =============================================================================

import {
  createAnonClient,
  createServiceClient,
  readBearerToken,
  type SvcClient,
} from '../_shared/supabase.ts';

// ─────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────

const CONFIG = {
  SERVICE: 'loyalty-account',
  MAX_BODY_BYTES: 6_000,
  LEDGER_LIMIT: 50,

  ALLOWED_ORIGINS: [
    'http://localhost:3000',
    'http://localhost:5173',
    'https://sofislegacy.com',
    'https://www.sofislegacy.com',
    'https://sofisrestaurant.netlify.app',
  ] as const,

  REQUEST_ID_HEADER: 'x-request-id',
} as const;

const ORIGINS = new Set<string>(CONFIG.ALLOWED_ORIGINS);

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

type JsonRecord = Record<string, unknown>;

type Meta = {
  requestId: string;
  ts: string;
};

type LoyaltyAccountOut = {
  id: string;
  balance: number;
  lifetime_earned: number;
  tier: string;
  streak: number;
  status: string;
  last_activity: string | null;
  last_award_at: string | null;
  last_redeem_at: string | null;
  updated_at: string;
};

type ProfileOut = {
  loyalty_public_id: string | null;
  full_name: string | null;
};

type LedgerRow = {
  id: string;
  entry_type: string;
  amount: number;
  balance_after: number;
  tier_at_time: string;
  streak_at_time: number;
  created_at: string;
  metadata: unknown;
  source: string;
  reference_id: string | null;
};

type Ok = {
  ok: true;
  meta: Meta;
  account: LoyaltyAccountOut | null;
  profile: ProfileOut | null;
  ledger: LedgerRow[];
};

type Fail = {
  ok: false;
  meta: Meta;
  error: { code: string; message: string };
};

type Envelope = Ok | Fail;

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function nowIso(): string {
  return new Date().toISOString();
}

function makeRequestId(req: Request): string {
  const h = (req.headers.get(CONFIG.REQUEST_ID_HEADER) ?? '').trim();
  if (h) return h.slice(0, 128);
  try {
    return crypto.randomUUID();
  } catch {
    return `req_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
}

function mkMeta(requestId: string): Meta {
  return { requestId, ts: nowIso() };
}

function isRecord(v: unknown): v is JsonRecord {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asStr(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function asNum(v: unknown, fallback = 0): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function asNullableStr(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : null;
}

function corsHeaders(req: Request): Record<string, string> | null {
  const origin = (req.headers.get('origin') ?? '').trim();
  if (!origin || !ORIGINS.has(origin)) return null;

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, x-application-name, x-request-id, x-idempotency-key',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(cors: Record<string, string>, body: Envelope, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

function fail(
  cors: Record<string, string>,
  meta: Meta,
  code: string,
  message: string,
  status: number,
): Response {
  // No secrets in logs.
  console.warn(
    JSON.stringify({
      level: status >= 500 ? 'error' : 'warn',
      service: CONFIG.SERVICE,
      event: 'fail',
      code,
      status,
      requestId: meta.requestId,
      ts: meta.ts,
    }),
  );

  return json(cors, { ok: false, meta, error: { code, message } }, status);
}

/**
 * Read JSON body with strict byte cap.
 * Accepts empty body — treat as {} (Supabase invoke sometimes sends none).
 */
async function readJsonWithLimit(req: Request, maxBytes: number): Promise<JsonRecord> {
  const ct = (req.headers.get('content-type') ?? '').toLowerCase();

  // If there is no JSON content-type, allow ONLY when body is empty.
  if (!ct.includes('application/json')) {
    const ab0 = await req.arrayBuffer();
    if (ab0.byteLength === 0) return {};
    throw new Error('UNSUPPORTED_CONTENT_TYPE');
  }

  const ab = await req.arrayBuffer();
  if (ab.byteLength > maxBytes) throw new Error('PAYLOAD_TOO_LARGE');
  if (ab.byteLength === 0) return {};

  const text = new TextDecoder().decode(ab);
  if (!text.trim()) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new Error('INVALID_JSON');
  }

  if (!isRecord(parsed)) throw new Error('BAD_BODY');
  return parsed;
}

async function authenticate(req: Request): Promise<{ userId: string } | null> {
  const token = readBearerToken(req);
  if (!token) return null;

  const anon = createAnonClient(token);
  const { data, error } = await anon.auth.getUser();

  if (error || !data?.user?.id) return null;
  return { userId: data.user.id };
}

// ─────────────────────────────────────────────────────────────
// Normalizers (schema drift safe, no any)
// ─────────────────────────────────────────────────────────────

function normalizeAccount(row: unknown): LoyaltyAccountOut | null {
  if (!isRecord(row)) return null;

  const id = asStr(row.id, '');
  if (!id) return null;

  return {
    id,
    balance: asNum(row.balance, 0),
    lifetime_earned: asNum(row.lifetime_earned, 0),
    tier: asStr(row.tier, 'bronze'),
    streak: asNum(row.streak, 0),
    status: asStr(row.status, 'active'),
    last_activity: asNullableStr(row.last_activity),
    last_award_at: asNullableStr(row.last_award_at),
    last_redeem_at: asNullableStr(row.last_redeem_at),
    updated_at: asStr(row.updated_at, nowIso()),
  };
}

function normalizeProfile(row: unknown): ProfileOut | null {
  if (!isRecord(row)) return null;

  return {
    loyalty_public_id: asNullableStr(row.loyalty_public_id),
    full_name: asNullableStr(row.full_name),
  };
}

function normalizeLedger(rows: unknown): LedgerRow[] {
  if (!Array.isArray(rows)) return [];

  const out: LedgerRow[] = [];

  for (const r of rows) {
    if (!isRecord(r)) continue;

    const id = asStr(r.id, '');
    const created_at = asStr(r.created_at, '');
    if (!id || !created_at) continue;

    out.push({
      id,
      entry_type: asStr(r.entry_type, 'adjusted'),
      amount: asNum(r.amount, 0),
      balance_after: asNum(r.balance_after, 0),
      tier_at_time: asStr(r.tier_at_time, 'bronze'),
      streak_at_time: asNum(r.streak_at_time, 0),
      created_at,
      metadata: r.metadata ?? null,
      source: asStr(r.source, 'unknown'),
      reference_id: asNullableStr(r.reference_id),
    });
  }

  return out;
}

// ─────────────────────────────────────────────────────────────
// DB loader (service role)
// ─────────────────────────────────────────────────────────────

async function loadLoyaltyBundle(
  db: SvcClient,
  userId: string,
): Promise<{
  account: LoyaltyAccountOut | null;
  profile: ProfileOut | null;
  ledger: LedgerRow[];
}> {
  const [acctRes, profRes] = await Promise.all([
    db
      .from('loyalty_accounts')
      .select(
        'id,balance,lifetime_earned,tier,streak,status,last_activity,last_award_at,last_redeem_at,updated_at',
      )
      .eq('user_id', userId)
      .maybeSingle(),
    db.from('profiles').select('loyalty_public_id,full_name').eq('id', userId).maybeSingle(),
  ]);

  const account = normalizeAccount(acctRes.data ?? null);
  const profile = normalizeProfile(profRes.data ?? null);

  if (!account?.id) return { account, profile, ledger: [] };

  const ledRes = await db
    .from('loyalty_ledger')
    .select(
      'id,entry_type,amount,balance_after,tier_at_time,streak_at_time,created_at,metadata,source,reference_id',
    )
    .eq('account_id', account.id)
    .order('created_at', { ascending: false })
    .limit(CONFIG.LEDGER_LIMIT);

  const ledger = normalizeLedger(ledRes.data ?? []);

  return { account, profile, ledger };
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const requestId = makeRequestId(req);
  const meta = mkMeta(requestId);

  const cors = corsHeaders(req);
  if (!cors) return new Response('Origin not allowed', { status: 403 });

  // ✅ Preflight BEFORE auth
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  if (req.method !== 'POST') {
    return fail(cors, meta, 'METHOD_NOT_ALLOWED', 'Method not allowed', 405);
  }

  // Optional body
  try {
    await readJsonWithLimit(req, CONFIG.MAX_BODY_BYTES);
  } catch (e) {
    const m = e instanceof Error ? e.message : 'BAD_REQUEST';

    if (m === 'PAYLOAD_TOO_LARGE') {
      return fail(cors, meta, 'PAYLOAD_TOO_LARGE', 'Payload too large', 413);
    }
    if (m === 'UNSUPPORTED_CONTENT_TYPE') {
      return fail(
        cors,
        meta,
        'UNSUPPORTED_CONTENT_TYPE',
        'Content-Type must be application/json',
        415,
      );
    }
    if (m === 'INVALID_JSON' || m === 'BAD_BODY') {
      return fail(cors, meta, 'INVALID_BODY', 'Invalid request body', 400);
    }

    return fail(cors, meta, 'INVALID_BODY', 'Invalid request body', 400);
  }

  // Auth
  const auth = await authenticate(req);
  if (!auth?.userId) {
    return fail(cors, meta, 'AUTH_INVALID', 'Unauthorized', 401);
  }

  try {
    const db = createServiceClient();
    const { account, profile, ledger } = await loadLoyaltyBundle(db, auth.userId);

    const out: Ok = {
      ok: true,
      meta,
      account,
      profile,
      ledger,
    };

    return json(cors, out, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);

    console.error(
      JSON.stringify({
        level: 'error',
        service: CONFIG.SERVICE,
        event: 'crash',
        requestId,
        ts: meta.ts,
        error: msg,
      }),
    );

    return fail(cors, meta, 'INTERNAL', 'Internal server error', 500);
  }
});
