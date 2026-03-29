// supabase/functions/loyalty-for-order/index.ts
// =============================================================================
// LOYALTY FOR ORDER — V2-First Edge Function (2026) — Sofi’s Restaurant V2
// =============================================================================
// Purpose:
// - Securely return loyalty details for a specific order to the owning user.
// - V2 authoritative: loyalty_accounts + loyalty_ledger.
// - Legacy fallback (optional): loyalty_transactions (V1) included as meta.legacy
//
// Contract:
//   200 { ok:true, loyalty: LoyaltyTxV2|null, account: AccountSnapV2|null, meta:{...} }
//   4xx/5xx { ok:false, error, code, meta }
//
// Security model:
// - Ownership enforced: orders.customer_uid MUST match caller uid.
// - Reads via SERVICE ROLE, but ALWAYS scoped by (user_id + order_id).
// - No secrets/PII logged (no JWTs, emails, phones, addresses).
//
// Notes:
// - Supports multiple deterministic order-link strategies (append-only safe):
//    1) loyalty_ledger.reference_id = orderId
//    2) loyalty_ledger.metadata.order_id = orderId
//    3) loyalty_ledger.idempotency_key includes orderId (award/backfill prefixes)
// - Optional heuristic fallback kept for transitional data only.
// =============================================================================

import {
  createServiceClient,
  createAnonClient,
  readBearerToken,
  type SvcClient,
} from '../_shared/supabase.ts';

// ─────────────────────────────────────────────────────────────
// Config (keep origins/headers stable)
// ─────────────────────────────────────────────────────────────

const CONFIG = {
  MAX_BODY_BYTES: 8_000,
  MAX_ID_LEN: 200,

  // Fail-closed CORS allowlist
  ALLOWED_ORIGINS: [
    'http://localhost:3000',
    'http://localhost:5173',
    'https://sofislegacy.com',
    'https://www.sofislegacy.com',
    'https://sofisrestaurant-enterprise.vercel.app',
  ] as const,

  RATE_HINT_HEADERS: true,
  HIDE_ENUMERATION_DETAILS: true,

  // Optional: expose legacy V1 tx in meta for debugging during migration
  INCLUDE_V1_LEGACY_DEBUG: true,

  // Deterministic idempotency prefixes that may include the order UUID
  // (append-only safe lookup, works even if reference_id/metadata are missing)
  IDEMPOTENCY_PREFIXES: [
    'award:',
    'finalize-backfill:',
    'finalize:',
    'webhook-award:',
    'qr-award:',
  ] as const,

  // Heuristic fallback (temporary): scan recent ledger entries near order.created_at
  HEURISTIC_LEDGER_SCAN_LIMIT: 40,
  HEURISTIC_WINDOW_MS: 10 * 60 * 1000, // 10 minutes

  // Maximum rows we ever return/inspect per request
  MAX_LEDGER_LOOKUPS: 1,
} as const;

const ORIGINS = new Set<string>(CONFIG.ALLOWED_ORIGINS);

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

type JsonRecord = Record<string, unknown>;

type Meta = {
  requestId: string;
  ts: string;

  // Migration visibility (safe)
  v2Found?: boolean;
  matchMethod?: 'reference_id' | 'metadata.order_id' | 'idempotency_key' | 'heuristic' | 'none';
  usedHeuristic?: boolean;

  legacy?: {
    v1Found: boolean;
    // Only include non-sensitive numbers; no PII
    points_delta?: number;
    points_balance?: number;
    created_at?: string;
  };
};

type Fail = { ok: false; error: string; code: string; meta: Meta };

// V2 “per order” view (derived from loyalty_ledger)
type LoyaltyTxV2 = {
  entry_type: 'earn' | 'redeem' | 'bonus' | 'expired' | 'adjustment';
  amount: number; // signed (earn positive, redeem negative)
  balance_after: number;
  tier_at_time: string;
  streak_at_time: number;
  created_at: string;
  source: string;
  reference_id: string | null;
  metadata: unknown | null;
};

// V2 authoritative snapshot
type AccountSnapV2 = {
  balance: number;
  lifetime_earned: number;
  tier: string;
  streak: number;
  updated_at: string;
};

type Ok = {
  ok: true;
  loyalty: LoyaltyTxV2 | null;
  account: AccountSnapV2 | null;
  meta: Meta;
};

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function nowIso(): string {
  return new Date().toISOString();
}

function mkMeta(requestId: string): Meta {
  return { requestId, ts: nowIso() };
}

function isRecord(v: unknown): v is JsonRecord {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// UUID validator
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(v: string): boolean {
  return UUID_RE.test(v);
}

function prefixId(id: string): string {
  return id.slice(0, 8);
}

function makeRequestId(req: Request): string {
  const headerId = (req.headers.get('x-request-id') ?? '').trim();
  if (headerId) return headerId.slice(0, 128);
  try {
    return crypto.randomUUID();
  } catch {
    return `req_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
}

function corsHeaders(req: Request): Record<string, string> | null {
  const origin = (req.headers.get('origin') ?? '').trim();
  if (!origin || !ORIGINS.has(origin)) return null;

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    // keep important headers stable
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, x-application-name, x-request-id, x-idempotency-key',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function withRateHint(headers: Record<string, string>, code: string): Record<string, string> {
  if (!CONFIG.RATE_HINT_HEADERS) return headers;
  if (code === 'AUTH_MISSING' || code === 'AUTH_INVALID')
    return { ...headers, 'X-Auth-Result': code };
  return headers;
}

function json(headers: Record<string, string>, body: Ok | Fail, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...headers,
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

function safeId(v: unknown): string {
  if (typeof v !== 'string') return '';
  const s = v.trim();
  if (!s) return '';
  return s.length > CONFIG.MAX_ID_LEN ? s.slice(0, CONFIG.MAX_ID_LEN) : s;
}

function log(level: 'info' | 'warn' | 'error', event: string, data?: Record<string, unknown>) {
  // Never include JWTs, emails, phones, addresses. Keep it structured.
  const line = JSON.stringify({
    level,
    event,
    service: 'loyalty-for-order',
    ts: nowIso(),
    ...(data ?? {}),
  });

  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

async function authenticateUser(req: Request): Promise<{ userId: string } | null> {
  const token = readBearerToken(req);
  if (!token) return null;

  const anon = createAnonClient(token);
  const { data, error } = await anon.auth.getUser();
  if (error || !data?.user?.id) return null;

  return { userId: data.user.id };
}

async function getOrderOwnerAndCreatedAt(
  db: SvcClient,
  orderId: string,
): Promise<{ ownerId: string | null; createdAt: string | null }> {
  const { data, error } = await db
    .from('orders')
    .select('customer_uid, created_at')
    .eq('id', orderId)
    .maybeSingle();

  if (error || !data) return { ownerId: null, createdAt: null };

  const ownerId = typeof data.customer_uid === 'string' ? data.customer_uid : null;
  const createdAt = typeof data.created_at === 'string' ? data.created_at : null;
  return { ownerId, createdAt };
}

function toAccountSnapV2(row: unknown): AccountSnapV2 | null {
  if (!isRecord(row)) return null;

  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v : '');

  const updated_at = s(row.updated_at);
  if (!updated_at) return null;

  return {
    balance: n(row.balance),
    lifetime_earned: n(row.lifetime_earned),
    tier: s(row.tier) || 'bronze',
    streak: n(row.streak),
    updated_at,
  };
}

function normalizeEntryType(raw: unknown): LoyaltyTxV2['entry_type'] {
  const t = typeof raw === 'string' ? raw.trim().toLowerCase() : '';

  // tolerate multiple naming conventions across migrations
  if (t === 'earn' || t === 'earned') return 'earn';
  if (t === 'redeem' || t === 'redemption') return 'redeem';
  if (t === 'bonus') return 'bonus';
  if (t === 'expired' || t === 'expire') return 'expired';
  return 'adjustment';
}

function toLoyaltyTxV2(row: unknown): LoyaltyTxV2 | null {
  if (!isRecord(row)) return null;

  const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v : '');
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

  const created_at = s(row.created_at);
  if (!created_at) return null;

  return {
    entry_type: normalizeEntryType(row.entry_type),
    amount: n(row.amount),
    balance_after: n(row.balance_after),
    tier_at_time: s(row.tier_at_time) || 'bronze',
    streak_at_time: n(row.streak_at_time),
    created_at,
    source: s(row.source) || 'unknown',
    reference_id: typeof row.reference_id === 'string' ? row.reference_id : null,
    metadata: row.metadata ?? null,
  };
}

// Legacy V1 (debug-only)
function toLegacyDebug(row: unknown): Meta['legacy'] {
  if (!isRecord(row)) return { v1Found: false };

  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
  const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v : undefined);

  const created_at = s(row.created_at);
  return {
    v1Found: Boolean(created_at),
    points_delta: n(row.points_delta),
    points_balance: n(row.points_balance),
    created_at,
  };
}

function safePublicError(code: string): { status: number; message: string } {
  // When hiding enumeration, don’t reveal whether order exists.
  if (code === 'ORDER_NOT_FOUND' && CONFIG.HIDE_ENUMERATION_DETAILS) {
    return { status: 404, message: 'Order not found' };
  }
  const map: Record<string, { status: number; message: string }> = {
    METHOD_NOT_ALLOWED: { status: 405, message: 'Method not allowed' },
    AUTH_MISSING: { status: 401, message: 'Unauthorized' },
    AUTH_INVALID: { status: 401, message: 'Unauthorized' },
    BAD_BODY: { status: 400, message: 'Invalid body' },
    MISSING_ORDER_ID: { status: 400, message: 'Missing order_id' },
    INVALID_ORDER_ID: { status: 400, message: 'Invalid order_id' },
    ORDER_NOT_FOUND: { status: 404, message: 'Order not found or unreadable' },
    FORBIDDEN: { status: 403, message: 'Forbidden' },
    PAYLOAD_TOO_LARGE: { status: 413, message: 'Payload too large' },
    UNSUPPORTED_CONTENT_TYPE: { status: 415, message: 'Content-Type must be application/json' },
    EMPTY_BODY: { status: 400, message: 'Empty body' },
    INVALID_JSON: { status: 400, message: 'Invalid JSON' },
    INTERNAL: { status: 500, message: 'Internal server error' },
  };
  return map[code] ?? { status: 400, message: 'Bad request' };
}

// ─────────────────────────────────────────────────────────────
// V2 Lookup (order-linked, append-only safe)
// ─────────────────────────────────────────────────────────────

async function findV2LedgerForOrder(args: {
  db: SvcClient;
  accountId: string;
  orderId: string;
  orderCreatedAt: string | null;
  requestId: string;
}): Promise<{ loyalty: LoyaltyTxV2 | null; method: Meta['matchMethod'] }> {
  const { db, accountId, orderId, orderCreatedAt, requestId } = args;

  // 1) reference_id (best)
  {
    const r = await db
      .from('loyalty_ledger')
      .select(
        'id, entry_type, amount, balance_after, tier_at_time, streak_at_time, created_at, metadata, source, reference_id',
      )
      .eq('account_id', accountId)
      .eq('reference_id', orderId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const loyalty = r.data ? toLoyaltyTxV2(r.data) : null;
    if (loyalty) return { loyalty, method: 'reference_id' };
  }

  // 2) metadata.order_id (PostgREST JSON path)
  {
    const r = await db
      .from('loyalty_ledger')
      .select(
        'id, entry_type, amount, balance_after, tier_at_time, streak_at_time, created_at, metadata, source, reference_id',
      )
      .eq('account_id', accountId)
      .eq('metadata->>order_id', orderId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const loyalty = r.data ? toLoyaltyTxV2(r.data) : null;
    if (loyalty) return { loyalty, method: 'metadata.order_id' };
  }

  // 3) idempotency_key contains orderId (append-only safe)
  // This is deterministic and avoids brittle “patch after insert”.
  for (const prefix of CONFIG.IDEMPOTENCY_PREFIXES) {
    const key = `${prefix}${orderId}`;

    const r = await db
      .from('loyalty_ledger')
      .select(
        'id, entry_type, amount, balance_after, tier_at_time, streak_at_time, created_at, metadata, source, reference_id, idempotency_key',
      )
      .eq('account_id', accountId)
      .eq('idempotency_key', key)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const loyalty = r.data ? toLoyaltyTxV2(r.data) : null;
    if (loyalty) return { loyalty, method: 'idempotency_key' };
  }

  // 4) Heuristic fallback (temporary):
  // find nearest earn/bonus within window around order.created_at
  if (orderCreatedAt) {
    const scan = await db
      .from('loyalty_ledger')
      .select(
        'id, entry_type, amount, balance_after, tier_at_time, streak_at_time, created_at, metadata, source, reference_id',
      )
      .eq('account_id', accountId)
      .order('created_at', { ascending: false })
      .limit(CONFIG.HEURISTIC_LEDGER_SCAN_LIMIT);

    const rows = Array.isArray(scan.data) ? scan.data : [];
    const orderTs = Date.parse(orderCreatedAt);

    if (Number.isFinite(orderTs) && rows.length) {
      let best: { row: unknown; score: number } | null = null;

      for (const r of rows) {
        if (!isRecord(r)) continue;

        const t = typeof r.created_at === 'string' ? Date.parse(r.created_at) : NaN;
        if (!Number.isFinite(t)) continue;

        const et = normalizeEntryType(r.entry_type);
        if (et !== 'earn' && et !== 'bonus') continue;

        const diff = Math.abs(t - orderTs);
        if (diff > CONFIG.HEURISTIC_WINDOW_MS) continue;

        if (!best || diff < best.score) best = { row: r, score: diff };
      }

      if (best) {
        const loyalty = toLoyaltyTxV2(best.row);
        if (loyalty) {
          log('warn', 'v2_match_heuristic', {
            requestId,
            accountId: prefixId(accountId),
            orderId: prefixId(orderId),
            windowMs: CONFIG.HEURISTIC_WINDOW_MS,
          });
          return { loyalty, method: 'heuristic' };
        }
      }
    }
  }

  return { loyalty: null, method: 'none' };
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
  const requestId = makeRequestId(req);
  const meta = mkMeta(requestId);

  const chBase = corsHeaders(req);
  if (!chBase) return new Response('Origin not allowed', { status: 403 });

  // Preflight
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: chBase });

  if (req.method !== 'POST') {
    const pub = safePublicError('METHOD_NOT_ALLOWED');
    return json(
      chBase,
      { ok: false, error: pub.message, code: 'METHOD_NOT_ALLOWED', meta },
      pub.status,
    );
  }

  // ── Auth
  const auth = await authenticateUser(req);
  if (!auth) {
    const code = readBearerToken(req) ? 'AUTH_INVALID' : 'AUTH_MISSING';
    const ch = withRateHint(chBase, code);
    log('warn', 'auth_failed', { requestId, code });
    const pub = safePublicError(code);
    return json(ch, { ok: false, error: pub.message, code, meta }, pub.status);
  }
  const userId = auth.userId;

  // ── Body
  let body: unknown;
  try {
    body = await readJsonWithLimit(req, CONFIG.MAX_BODY_BYTES);
  } catch (e) {
    const m = e instanceof Error ? e.message : 'BAD_REQUEST';
    const code =
      m === 'PAYLOAD_TOO_LARGE'
        ? 'PAYLOAD_TOO_LARGE'
        : m === 'UNSUPPORTED_CONTENT_TYPE'
          ? 'UNSUPPORTED_CONTENT_TYPE'
          : m === 'EMPTY_BODY'
            ? 'EMPTY_BODY'
            : 'INVALID_JSON';

    const pub = safePublicError(code);
    log('warn', 'bad_request', { requestId, code });
    return json(chBase, { ok: false, error: pub.message, code, meta }, pub.status);
  }

  if (!isRecord(body)) {
    const pub = safePublicError('BAD_BODY');
    log('warn', 'bad_body', { requestId });
    return json(chBase, { ok: false, error: pub.message, code: 'BAD_BODY', meta }, pub.status);
  }

  const orderId = safeId(body.order_id ?? body.orderId);
  if (!orderId) {
    const pub = safePublicError('MISSING_ORDER_ID');
    return json(
      chBase,
      { ok: false, error: pub.message, code: 'MISSING_ORDER_ID', meta },
      pub.status,
    );
  }
  if (!isUuid(orderId)) {
    const pub = safePublicError('INVALID_ORDER_ID');
    return json(
      chBase,
      { ok: false, error: pub.message, code: 'INVALID_ORDER_ID', meta },
      pub.status,
    );
  }

  const db: SvcClient = createServiceClient();

  // ── Ownership
  const { ownerId, createdAt: orderCreatedAt } = await getOrderOwnerAndCreatedAt(db, orderId);

  if (!ownerId) {
    log('warn', 'order_not_found_or_unreadable', {
      requestId,
      userId: prefixId(userId),
      order: prefixId(orderId),
    });
    const pub = safePublicError('ORDER_NOT_FOUND');
    return json(
      chBase,
      { ok: false, error: pub.message, code: 'ORDER_NOT_FOUND', meta },
      pub.status,
    );
  }

  if (ownerId !== userId) {
    log('warn', 'forbidden_order', {
      requestId,
      userId: prefixId(userId),
      order: prefixId(orderId),
    });
    const pub = safePublicError('FORBIDDEN');
    return json(chBase, { ok: false, error: pub.message, code: 'FORBIDDEN', meta }, pub.status);
  }

  // ── Load V2 account + V2 loyalty tx for this order
  try {
    // Account snapshot (V2 authoritative)
    const acctRes = await db
      .from('loyalty_accounts')
      .select('id, balance, lifetime_earned, tier, streak, updated_at')
      .eq('user_id', userId)
      .maybeSingle();

    const account = acctRes.data ? toAccountSnapV2(acctRes.data) : null;

    // If no v2 account, return ok with nulls (user might be new)
    const accountId =
      acctRes.data && isRecord(acctRes.data) && typeof acctRes.data.id === 'string'
        ? acctRes.data.id
        : null;

    let loyalty: LoyaltyTxV2 | null = null;
    let matchMethod: Meta['matchMethod'] = 'none';

    if (accountId) {
      const found = await findV2LedgerForOrder({
        db,
        accountId,
        orderId,
        orderCreatedAt,
        requestId,
      });
      loyalty = found.loyalty;
      matchMethod = found.method;
    }

    // Optional V1 legacy (debug only) — does NOT drive UI
    let legacy: Meta['legacy'] | undefined = undefined;
    if (CONFIG.INCLUDE_V1_LEGACY_DEBUG) {
      const v1 = await db
        .from('loyalty_transactions')
        .select('points_delta, points_balance, created_at')
        .eq('order_id', orderId)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      legacy = v1.data ? toLegacyDebug(v1.data) : { v1Found: false };
    }

    const outMeta: Meta = {
      ...meta,
      v2Found: Boolean(loyalty),
      matchMethod,
      usedHeuristic: matchMethod === 'heuristic' ? true : undefined,
      legacy,
    };

    log('info', 'ok', {
      requestId,
      userId: prefixId(userId),
      order: prefixId(orderId),
      v2Found: Boolean(loyalty),
      matchMethod,
      v1Found: legacy?.v1Found ?? false,
    });

    return json(chBase, { ok: true, loyalty, account, meta: outMeta }, 200);
  } catch (e) {
    log('error', 'handler_crash', {
      requestId,
      userId: prefixId(userId),
      order: prefixId(orderId),
      error: e instanceof Error ? e.message : String(e),
    });

    const pub = safePublicError('INTERNAL');
    return json(chBase, { ok: false, error: pub.message, code: 'INTERNAL', meta }, pub.status);
  }
});
