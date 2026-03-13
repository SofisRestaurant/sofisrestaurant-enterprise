// supabase/functions/menu-preflight/index.ts
import { createServiceClient } from '../_shared/supabase.ts';

type JsonRecord = Record<string, unknown>;

const CONFIG = {
  MAX_BODY_BYTES: 10_000,
  MAX_QTY: 20,
  MAX_STOCK: 1_000_000,
  DEFAULT_MAX_QTY: 20,
} as const;

const ALLOWED_ORIGINS = new Set([
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'https://sofislegacy.com',
  'https://www.sofislegacy.com',
  'https://sofisrestaurant.netlify.app',
]);

function corsHeadersFor(origin: string | null): HeadersInit | null {
  const o = (origin ?? '').trim();
  if (!o || !ALLOWED_ORIGINS.has(o)) return null;

  return {
    'Access-Control-Allow-Origin': o,
    Vary: 'Origin',
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, x-application-name, x-request-id, x-idempotency-key',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

function isRecord(v: unknown): v is JsonRecord {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function clampInt(n: unknown, min: number, max: number): number {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, Math.trunc(v)));
}

function safeStr(v: unknown, fallback = '', maxLen = 200): string {
  if (typeof v !== 'string') return fallback;
  const s = v.trim();
  if (!s) return fallback;
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function toCentsFromDbPrice(price: unknown): number {
  const n = typeof price === 'number' ? price : Number(price);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

function json(data: unknown, init: ResponseInit, cors: HeadersInit): Response {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  for (const [k, v] of Object.entries(cors)) headers.set(k, String(v));
  return new Response(JSON.stringify(data), { ...init, headers });
}

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  return typeof e === 'string' ? e : 'Unknown error';
}

Deno.serve(async (req: Request) => {
  const cors = corsHeadersFor(req.headers.get('origin'));

  // ✅ Fail-closed CORS (no "null" origin responses)
  if (!cors) return new Response('Origin not allowed', { status: 403 });

  // ✅ Preflight must be 2xx and include same headers
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  if (req.method !== 'POST') {
    return json({ ok: false, error: 'Method not allowed' }, { status: 405 }, cors);
  }

  // ✅ Body size guard (best-effort)
  const len = req.headers.get('content-length');
  if (len && Number(len) > CONFIG.MAX_BODY_BYTES) {
    return json({ ok: false, error: 'Payload too large' }, { status: 413 }, cors);
  }

  try {
    const raw = await req.json().catch(() => null);
    if (!isRecord(raw)) {
      return json({ ok: false, error: 'Invalid JSON' }, { status: 400 }, cors);
    }

    const itemId = safeStr(raw['item_id'], '', 128);
    const requestedQty = clampInt(raw['qty'], 1, CONFIG.MAX_QTY);

    if (!itemId) {
      return json({ ok: false, error: 'Missing item_id' }, { status: 400 }, cors);
    }

    const db = createServiceClient();

    const { data, error } = await db
      .from('menu_items')
      .select('id, available, price, inventory_count, low_stock_threshold')
      .eq('id', itemId)
      .maybeSingle();

    if (error) {
      // ✅ don’t leak internals
      console.error(
        JSON.stringify({
          level: 'error',
          event: 'menu_preflight_db_error',
          itemId,
          error: error.message,
          code: error.code,
          at: new Date().toISOString(),
        }),
      );
      return json({ ok: false, error: 'Preflight unavailable' }, { status: 503 }, cors);
    }

    if (!data) {
      return json({ ok: false, error: 'Item not found' }, { status: 404 }, cors);
    }

    const available = data.available === true;

    const stockCount =
      data.inventory_count == null ? null : clampInt(data.inventory_count, 0, CONFIG.MAX_STOCK);

    const lowStockThreshold =
      data.low_stock_threshold == null
        ? null
        : clampInt(data.low_stock_threshold, 1, CONFIG.MAX_STOCK);

    const unitPriceCents = toCentsFromDbPrice(data.price);

    // max_qty respects inventory when present, otherwise default max
    const inventoryMax =
      stockCount == null
        ? CONFIG.DEFAULT_MAX_QTY
        : Math.max(1, Math.min(CONFIG.MAX_QTY, stockCount));
    const maxQty = inventoryMax;

    const effectiveAvailable = available && (stockCount == null ? true : stockCount > 0);

    // If requested qty is higher than maxQty, caller can clamp UI.
    // We still return canonical maxQty.
    return json(
      {
        ok: true,
        item_id: data.id,
        available: effectiveAvailable,
        unit_price_cents: unitPriceCents,
        stock_count: stockCount,
        low_stock_threshold: lowStockThreshold,
        max_qty: maxQty,
        requested_qty: requestedQty, // ✅ useful for UI clamping/debug (safe)
      },
      { status: 200 },
      cors,
    );
  } catch (e) {
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'menu_preflight_unhandled',
        error: errMsg(e),
        at: new Date().toISOString(),
      }),
    );
    return json({ ok: false, error: 'Preflight failed' }, { status: 500 }, cors);
  }
});
