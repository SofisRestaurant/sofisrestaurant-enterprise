/// <reference lib="deno.ns" />
import { createServiceClient } from '../_shared/supabase.ts';

const ALLOWED_ORIGINS = new Set([
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'https://sofislegacy.com',
  'https://www.sofislegacy.com',
  'https://sofisrestaurant-enterprise.vercel.app',
]);

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed =
    origin && ALLOWED_ORIGINS.has(origin)
      ? origin
      : 'null'; // fail closed

  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type, x-application-name, x-request-id, x-idempotency-key',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function mapMenuItem(row: Record<string, unknown>) {
  return {
    id: String(row.id ?? ''),
    name: String(row.name ?? ''),
    price: Number(row.price ?? 0),
    category: String(row.category ?? 'entrees'),
    featured: Boolean(row.featured ?? false),
    available: Boolean(row.available ?? true),
    sort_order: Number(row.sort_order ?? 0),
    is_vegetarian: Boolean(row.is_vegetarian ?? false),
    is_vegan: Boolean(row.is_vegan ?? false),
    is_gluten_free: Boolean(row.is_gluten_free ?? false),
    description: row.description ? String(row.description) : null,
    image_url: row.image_url ? String(row.image_url) : null,
    spicy_level: row.spicy_level ?? null,
    allergens: Array.isArray(row.allergens) ? row.allergens : [],
    pairs_with: Array.isArray(row.pairs_with) ? row.pairs_with : [],
    modifier_groups: Array.isArray(row.modifier_groups) ? row.modifier_groups : [],
    created_at: row.created_at ? String(row.created_at) : '',
    updated_at: row.updated_at ?? null,
  };
}

function json(data: unknown, init: ResponseInit, cors: HeadersInit) {
  const headers = new Headers(init.headers);

  headers.set('Content-Type', 'application/json');

  // optional caching (makes homepage faster)
  headers.set('Cache-Control', 'public, max-age=60');

  for (const [k, v] of Object.entries(cors)) {
    headers.set(k, String(v));
  }

  return new Response(JSON.stringify(data), {
    ...init,
    headers,
  });
}

Deno.serve(async (req: Request) => {
  const cors = corsHeaders(req.headers.get('origin'));

  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: cors,
    });
  }

 if (req.method !== 'GET' && req.method !== 'POST') {
  return json(
    { ok: false, error: 'Method not allowed' },
    { status: 405 },
    cors
  );
}

  try {
    const db = createServiceClient();

const { data, error } = await db
  .from('menu_items')
  .select(`
    id,
    name,
    price,
    category,
    featured,
    available,
    sort_order,
    description,
    image_url,
    modifier_groups:menu_item_modifier_groups(
      modifier_groups(
        id,
        name,
        modifiers(*)
      )
    )
  `)
  .eq('featured', true)
  .eq('available', true)
  .order('sort_order', { ascending: true });

    if (error) {
      console.error({
        event: 'get_featured_menu_db_error',
        error: error.message,
      });

      return json(
        { ok: false, error: 'Failed to fetch featured menu' },
        { status: 503 },
        cors
      );
    }

    const featuredItems = (data ?? []).map(mapMenuItem);

    return json(
      { ok: true, featuredItems },
      { status: 200 },
      cors
    );
  } catch (err) {
    console.error({
      event: 'get_featured_menu_unhandled',
      error: err,
    });

    return json(
      { ok: false, error: 'Unhandled server error' },
      { status: 500 },
      cors
    );
  }
});