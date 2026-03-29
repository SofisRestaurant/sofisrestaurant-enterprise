// supabase/functions/promo-validate/index.ts
// =============================================================================
// PROMO VALIDATE — PRODUCTION HARDENED (2026)
// =============================================================================
// - Strict CORS allowlist (fail-closed)
// - JWT required
// - Uses anon client for caller identity (RLS enforced)
// - Uses service client for promo + usage reads (server-only validation)
// - Body size limit + strict runtime validation (no unsafe access)
// - Clean, deterministic responses (no secret leakage)
// =============================================================================

import { createAnonClient, createServiceClient } from '../_shared/supabase.ts';

// ─────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────

const ALLOWED_ORIGINS = [
  'https://sofislegacy.com',
  'https://www.sofislegacy.com',
  'https://sofisrestaurant-enterprise.vercel.app',
  'http://localhost:3000',
  'http://localhost:5173',
] as const;

const CONFIG = {
  MAX_BODY_BYTES: 10_000, // 10KB
  CODE_MAX_LEN: 50,
  MAX_CART_TOTAL_CENTS: 50_000_000, // $500,000 hard UI cap
  MAX_SAFE_PERCENT: 70, // lightweight UI safety gate
} as const;

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

type JsonRecord = Record<string, unknown>;

type RawBody = {
  code?: unknown;
  cartTotalCents?: unknown;
};

type PromoRow = {
  id: string;
  type: string | null;
  value: number | null;
  active: boolean | null;
  starts_at: string | null;
  ends_at: string | null;
  expires_at: string | null;
  max_uses: number | null;
  per_user_limit: number | null;
  min_order_cents: number | null;
};

type SmartRow = {
  type: string | null;
  value: number | null;
};

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function isRecord(v: unknown): v is JsonRecord {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed =
    origin && (ALLOWED_ORIGINS as readonly string[]).includes(origin) ? origin : 'null';
  return {
    'Access-Control-Allow-Origin': allowed, // fail-closed
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, x-application-name, x-request-id, x-idempotency-key',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

function asString(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  const s = v.trim();
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

function readBearer(req: Request): string | null {
  const raw = req.headers.get('authorization') ?? req.headers.get('Authorization') ?? '';
  const m = raw.trim().match(/^bearer\s+(.+)$/i);
  const token = m?.[1]?.trim();
  return token ? token : null;
}

function dateMs(v: string | null): number | null {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const headers = corsHeaders(req.headers.get('origin'));

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  if (req.method !== 'POST') {
    return json({ valid: false, reason: 'Method not allowed' }, 405, headers);
  }

  // 1) AUTH REQUIRED (JWT)
  const jwt = readBearer(req);
  if (!jwt) return json({ valid: false, reason: 'Unauthorized' }, 401, headers);

  const anon = createAnonClient(jwt);
  const { data: authData, error: authErr } = await anon.auth.getUser();
  if (authErr || !authData?.user) {
    return json({ valid: false, reason: 'Unauthorized' }, 401, headers);
  }
  const userId = authData.user.id;

  // 2) PARSE INPUT (bounded)
  let raw: unknown;
  try {
    raw = await readJsonLimited(req, CONFIG.MAX_BODY_BYTES);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'BAD_REQUEST';
    const reason = msg === 'BODY_TOO_LARGE' ? 'Body too large' : 'Invalid JSON';
    return json({ valid: false, reason }, 400, headers);
  }

  if (!isRecord(raw)) {
    return json({ valid: false, reason: 'Invalid request payload' }, 400, headers);
  }

  const body = raw as RawBody;
  const codeRaw = asString(body.code, CONFIG.CODE_MAX_LEN);
  const cartTotalCents = clampInt(asInt(body.cartTotalCents, 0), 0, CONFIG.MAX_CART_TOTAL_CENTS);

  if (!codeRaw) return json({ valid: false, reason: 'Code required' }, 400, headers);

  // Normalize code (client might send lowercase)
  const normalizedCode = codeRaw.toUpperCase();

  // 3) LOAD PROMO (SERVICE READ)
  const svc = createServiceClient();

  // Use ilike to avoid case sensitivity issues unless your DB enforces uppercase storage.
  const { data: promo, error: promoError } = await svc
    .from('promotions')
    .select(
      'id,type,value,active,starts_at,ends_at,expires_at,max_uses,per_user_limit,min_order_cents',
    )
    .ilike('code', normalizedCode)
    .eq('active', true)
    .maybeSingle<PromoRow>();

  if (promoError || !promo) {
    // Return 200 so UI can treat it as "invalid code" without surfacing server errors
    return json({ valid: false, reason: 'Invalid code' }, 200, headers);
  }

  const nowMs = Date.now();

  // 4) DATE VALIDATION
  const startsAt = dateMs(promo.starts_at);
  if (startsAt !== null && startsAt > nowMs) {
    return json({ valid: false, reason: 'Not active yet' }, 200, headers);
  }

  const expiry = promo.expires_at ?? promo.ends_at ?? null;
  const expMs = dateMs(expiry);
  if (expMs !== null && expMs < nowMs) {
    return json({ valid: false, reason: 'Expired' }, 200, headers);
  }

  // 5) MINIMUM ORDER CHECK (cheap, do early)
  const minOrder = clampInt(asInt(promo.min_order_cents ?? 0, 0), 0, CONFIG.MAX_CART_TOTAL_CENTS);
  if (minOrder > 0 && cartTotalCents < minOrder) {
    return json({ valid: false, reason: 'Minimum order not met' }, 200, headers);
  }

  // 6) GLOBAL USAGE CHECK
  if (promo.max_uses != null) {
    const { count, error } = await svc
      .from('promo_redemptions')
      .select('id', { count: 'exact', head: true })
      .eq('promotion_id', promo.id);

    if (error) return json({ valid: false, reason: 'Unable to validate usage' }, 500, headers);

    const totalUses = count ?? 0;
    if (totalUses >= promo.max_uses) {
      return json({ valid: false, reason: 'Usage limit reached' }, 200, headers);
    }
  }

  // 7) PER-USER LIMIT CHECK
  if (promo.per_user_limit != null && promo.per_user_limit > 0) {
    const { count, error } = await svc
      .from('promo_redemptions')
      .select('id', { count: 'exact', head: true })
      .eq('promotion_id', promo.id)
      .eq('user_id', userId);

    if (error) return json({ valid: false, reason: 'Unable to validate user usage' }, 500, headers);

    const userUses = count ?? 0;
    if (userUses >= promo.per_user_limit) {
      return json({ valid: false, reason: 'User limit reached' }, 200, headers);
    }
  }

  // 8) SMART DISCOUNTS (OPTIONAL OVERRIDE)
  const now = new Date();
  const currentHour = now.getHours();
  const currentDay = now.getDay();

  const { data: smart } = await svc
    .from('smart_discounts')
    .select('type,value')
    .eq('active', true)
    .eq('day_of_week', currentDay)
    .lte('start_hour', currentHour)
    .gte('end_hour', currentHour)
    .maybeSingle<SmartRow>();

  const discountType = (smart?.type ?? promo.type ?? '').toString();
  const discountValue = Number.isFinite(smart?.value ?? promo.value ?? NaN)
    ? Number(smart?.value ?? promo.value)
    : 0;

  // 9) LIGHT SAFETY CAPS (UI precheck only; server enforces at checkout)
  if (discountType === 'percent') {
    if (discountValue <= 0 || discountValue > CONFIG.MAX_SAFE_PERCENT) {
      return json({ valid: false, reason: 'Discount exceeds safety cap' }, 200, headers);
    }
  } else if (discountType === 'fixed') {
    // IMPORTANT: make this match your DB. Your schema already has min_order_cents,
    // so the professional default is: promotions.value is in cents for fixed promos.
    const fixedCents = clampInt(Math.round(discountValue), 0, CONFIG.MAX_CART_TOTAL_CENTS);
    if (fixedCents <= 0 || fixedCents > cartTotalCents) {
      return json({ valid: false, reason: 'Invalid discount amount' }, 200, headers);
    }
  } else {
    return json({ valid: false, reason: 'Invalid promo type' }, 200, headers);
  }

  // ✅ VALID
  return json(
    {
      valid: true,
      promotionId: promo.id,
      type: discountType,
      value: discountValue,
    },
    200,
    headers,
  );
});
