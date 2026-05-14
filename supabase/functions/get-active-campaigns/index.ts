// =============================================================================
// PATH: supabase/functions/get-active-campaigns/index.ts
// =============================================================================
// get-active-campaigns — Production Hardened (2026)
// - Public endpoint (deploy with verify_jwt=false)
// - CORS allowlist enforcement (Origin strict if present; permissive if missing)
// - Strong input validation (placement/limit/featured)
// - DB read via service client (safe view: active_campaigns_now)
// - Cache headers + ETag
// =============================================================================

import { createServiceClient } from '../_shared/supabase.ts';

type CampaignPublic = {
  id: string;
  campaign_name: string;
  placement: string;
  promo_id: string | null;
  starts_at: string | null;
  ends_at: string | null;
  badge: string | null;
  hero_title: string | null;
  hero_subtitle: string | null;
  cta_label: string | null;
  deep_link: string | null;
  menu_item_id: string | null;
  priority: number;
  weight: number;
  is_featured: boolean;
};

type RequestParams = {
  placement: string;
  limit: number;
  featuredRequested: boolean;
};

type JsonObject = Record<string, unknown>;

type ParseSuccess<T> = { ok: true; value: T };
type ParseFailure = { ok: false; status: number; code: string; error: string };
type ParseResult<T> = ParseSuccess<T> | ParseFailure;

const FUNCTION_NAME = 'get-active-campaigns';
const DEFAULT_PLACEMENT = 'menu_deals_rail';
const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 50;
const MAX_DB_FETCH_LIMIT = 150;
const DB_FETCH_MULTIPLIER = 3;
const MAX_POST_BODY_BYTES = 8_192;

const CACHE_CONTROL_SUCCESS =
  'public, max-age=30, s-maxage=60, stale-while-revalidate=300, stale-if-error=600';
const CACHE_CONTROL_ERROR = 'public, max-age=5, s-maxage=10, stale-while-revalidate=30';

const ALLOWED_HEADERS =
  'authorization, apikey, content-type, x-client-info, x-application-name, x-request-id, x-idempotency-key';

const PLACEMENT_PATTERN = /^[a-z0-9](?:[a-z0-9:_-]{0,63})$/i;

const ALLOWED_ORIGINS = new Set<string>([
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'https://sofislegacy.com',
  'https://www.sofislegacy.com',
  'https://sofisrestaurant-enterprise.vercel.app',
]);

// ─────────────────────────────────────────────────────────────
// CORS (2026 create-checkout style)
// - If Origin present -> must allowlist, set ACAO
// - If Origin missing/empty -> allow request, but do NOT set ACAO
// ─────────────────────────────────────────────────────────────

function corsHeadersFor(req: Request): HeadersInit | null {
  const originRaw = req.headers.get('origin');
  const origin = (originRaw ?? '').trim();

  if (!origin) {
    return { Vary: 'Origin' };
  }

  const isVercelPreview = /^https:\/\/sofisrestaurant-enterprise(-[a-z0-9]+-leonel-mezas-projects)?\.vercel\.app$/.test(origin ?? '');
  if (!ALLOWED_ORIGINS.has(origin) && !isVercelPreview) return null;

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': ALLOWED_HEADERS,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

// ─────────────────────────────────────────────────────────────
// Response helpers
// ─────────────────────────────────────────────────────────────

function makeRequestId(): string {
  return crypto.randomUUID().replaceAll('-', '').slice(0, 16);
}

function withStandardHeaders(headersInit: HeadersInit, requestId: string): Headers {
  const headers = new Headers(headersInit);
  if (!headers.has('Vary')) headers.set('Vary', 'Origin');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Request-Id', requestId);
  return headers;
}

function jsonResponse(
  body: unknown,
  status: number,
  headersInit: HeadersInit,
  requestId: string,
): Response {
  const headers = withStandardHeaders(headersInit, requestId);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(body), { status, headers });
}

function emptyResponse(status: number, headersInit: HeadersInit, requestId: string): Response {
  const headers = withStandardHeaders(headersInit, requestId);
  return new Response(null, { status, headers });
}

function errorResponse(
  status: number,
  code: string,
  error: string,
  requestId: string,
  headersInit: HeadersInit,
  cacheControl: string,
): Response {
  const headers = new Headers(headersInit);
  if (!headers.has('Vary')) headers.set('Vary', 'Origin');
  headers.set('Cache-Control', cacheControl);
  headers.set('X-Request-Id', requestId);

  return jsonResponse({ ok: false, code, error, requestId }, status, headers, requestId);
}

// ─────────────────────────────────────────────────────────────
// Validation helpers
// ─────────────────────────────────────────────────────────────

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  const normalized = Math.trunc(value);
  return Math.max(min, Math.min(max, normalized));
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asNullableString(value: unknown): string | null {
  if (value === null) return null;
  return typeof value === 'string' ? value : null;
}

function asNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value.trim())) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function sanitizePlainText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  // Strip ASCII control chars WITHOUT regex ranges
  let cleaned = '';
  for (let i = 0; i < trimmed.length; i += 1) {
    const code = trimmed.charCodeAt(i);
    const isControl = (code >= 0x00 && code <= 0x1f) || code === 0x7f;
    cleaned += isControl ? ' ' : trimmed[i]!;
  }

  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;

  return cleaned.length <= maxLength ? cleaned : cleaned.slice(0, maxLength).trim();
}

function sanitizePlacement(value: unknown): string | null {
  const normalized = sanitizePlainText(value, 64);
  if (!normalized) return null;
  if (!PLACEMENT_PATTERN.test(normalized)) return null;
  return normalized;
}

function sanitizeDeepLink(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > 2048) return null;

  for (let i = 0; i < trimmed.length; i += 1) {
    const ch = trimmed[i]!;
    const code = trimmed.charCodeAt(i);
    if (ch === '\\' || (code >= 0x00 && code <= 0x1f) || code === 0x7f) return null;
  }

  if (trimmed.startsWith('/')) return trimmed;

  try {
    const url = new URL(trimmed);
    if (url.protocol === 'https:' || url.protocol === 'http:') {
      return url.toString();
    }
    return null;
  } catch {
    return null;
  }
}

function parseBooleanStrict(value: unknown): ParseResult<boolean | null> {
  if (value === null || value === undefined) return { ok: true, value: null };
  if (typeof value === 'boolean') return { ok: true, value };

  if (typeof value !== 'string') {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_BOOLEAN',
      error: 'Boolean parameter must be true or false.',
    };
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) return { ok: true, value: null };

  if (
    normalized === '1' ||
    normalized === 'true' ||
    normalized === 't' ||
    normalized === 'yes' ||
    normalized === 'y'
  ) {
    return { ok: true, value: true };
  }
  if (
    normalized === '0' ||
    normalized === 'false' ||
    normalized === 'f' ||
    normalized === 'no' ||
    normalized === 'n'
  ) {
    return { ok: true, value: false };
  }

  return {
    ok: false,
    status: 400,
    code: 'INVALID_BOOLEAN',
    error: 'Boolean parameter must be true or false.',
  };
}

function parseLimitStrict(value: unknown): ParseResult<number | null> {
  if (value === null || value === undefined || value === '') return { ok: true, value: null };

  if (typeof value === 'number') {
    if (!Number.isInteger(value)) {
      return {
        ok: false,
        status: 400,
        code: 'INVALID_LIMIT',
        error: 'Limit must be an integer between 1 and 50.',
      };
    }
    return { ok: true, value: clampInt(value, 1, MAX_LIMIT) };
  }

  if (typeof value !== 'string') {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_LIMIT',
      error: 'Limit must be an integer between 1 and 50.',
    };
  }

  const trimmed = value.trim();
  if (!trimmed) return { ok: true, value: null };
  if (!/^-?\d+$/.test(trimmed)) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_LIMIT',
      error: 'Limit must be an integer between 1 and 50.',
    };
  }

  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isInteger(parsed)) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_LIMIT',
      error: 'Limit must be an integer between 1 and 50.',
    };
  }

  return { ok: true, value: clampInt(parsed, 1, MAX_LIMIT) };
}

// ─────────────────────────────────────────────────────────────
// Row parsing + filtering
// ─────────────────────────────────────────────────────────────

function parseCampaignPublic(row: unknown): CampaignPublic | null {
  if (!isRecord(row)) return null;

  const id = sanitizePlainText(row.id, 128);
  const campaignName = sanitizePlainText(row.campaign_name, 160);
  const placement = sanitizePlacement(row.placement);

  if (!id || !campaignName || !placement) return null;

  return {
    id,
    campaign_name: campaignName,
    placement,
    promo_id: sanitizePlainText(row.promo_id, 128),
    starts_at: asNullableString(row.starts_at),
    ends_at: asNullableString(row.ends_at),
    badge: sanitizePlainText(row.badge, 48),
    hero_title: sanitizePlainText(row.hero_title, 140),
    hero_subtitle: sanitizePlainText(row.hero_subtitle, 240),
    cta_label: sanitizePlainText(row.cta_label, 48),
    deep_link: sanitizeDeepLink(row.deep_link),
    menu_item_id: sanitizePlainText(row.menu_item_id, 128),
    priority: clampInt(asNumber(row.priority, 0), -10_000, 10_000),
    weight: clampInt(asNumber(row.weight, 1), -10_000, 10_000),
    is_featured: asBoolean(row.is_featured, false),
  };
}

function parseIsoToEpochMs(value: string | null): number | null {
  if (value === null) return null;
  const epochMs = Date.parse(value);
  return Number.isFinite(epochMs) ? epochMs : null;
}

function isCampaignActiveAt(campaign: CampaignPublic, nowMs: number): boolean {
  const startsAtMs = parseIsoToEpochMs(campaign.starts_at);
  if (campaign.starts_at !== null && startsAtMs === null) return false;
  if (startsAtMs !== null && startsAtMs > nowMs) return false;

  const endsAtMs = parseIsoToEpochMs(campaign.ends_at);
  if (campaign.ends_at !== null && endsAtMs === null) return false;
  if (endsAtMs !== null && endsAtMs <= nowMs) return false;

  return true;
}

function sortCampaigns(a: CampaignPublic, b: CampaignPublic): number {
  const aFeatured = a.is_featured ? 1 : 0;
  const bFeatured = b.is_featured ? 1 : 0;
  if (aFeatured !== bFeatured) return bFeatured - aFeatured;

  if (a.priority !== b.priority) return b.priority - a.priority;
  if (a.weight !== b.weight) return b.weight - a.weight;

  const aStarts = a.starts_at ?? '';
  const bStarts = b.starts_at ?? '';
  if (aStarts !== bStarts) return aStarts < bStarts ? 1 : -1;

  return a.id.localeCompare(b.id);
}

// ─────────────────────────────────────────────────────────────
// ETag helpers
// ─────────────────────────────────────────────────────────────

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

// ─────────────────────────────────────────────────────────────
// Body parser
// ─────────────────────────────────────────────────────────────

async function readJsonObjectBody(req: Request): Promise<ParseResult<JsonObject>> {
  const contentType = (req.headers.get('content-type') ?? '').toLowerCase();
  if (!contentType.includes('application/json')) {
    return {
      ok: false,
      status: 415,
      code: 'UNSUPPORTED_CONTENT_TYPE',
      error: 'Content-Type must be application/json.',
    };
  }

const rawBody = await (async () => {
  try {
    return await req.text();
  } catch {
    return null;
  }
})();

if (rawBody === null) {
  return {
    ok: false,
    status: 400,
    code: 'INVALID_JSON_BODY',
    error: 'Unable to read request body.',
  };
}

  if (!rawBody.trim()) {
    return { ok: false, status: 400, code: 'EMPTY_BODY', error: 'Request body is required.' };
  }

  const bodyBytes = new TextEncoder().encode(rawBody).length;
  if (bodyBytes > MAX_POST_BODY_BYTES) {
    return { ok: false, status: 413, code: 'BODY_TOO_LARGE', error: 'Request body is too large.' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_JSON_BODY',
      error: 'Request body must be valid JSON.',
    };
  }

  if (!isRecord(parsed)) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_JSON_BODY',
      error: 'JSON body must be an object.',
    };
  }

  return { ok: true, value: parsed };
}

function resolveRequestParams(url: URL, body: JsonObject | null): ParseResult<RequestParams> {
  const queryPlacementRaw = url.searchParams.get('placement');
  const queryLimitRaw = url.searchParams.get('limit');
  const queryFeaturedRaw = url.searchParams.get('featured');

  const bodyPlacementRaw = body?.placement;
  const bodyLimitRaw = body?.limit;
  const bodyFeaturedRaw = body?.featured;

  const placementCandidate = bodyPlacementRaw ?? queryPlacementRaw ?? DEFAULT_PLACEMENT;
  const placement = sanitizePlacement(placementCandidate);
  if (!placement) {
    return { ok: false, status: 400, code: 'INVALID_PLACEMENT', error: 'Placement is invalid.' };
  }

  const limitResult = parseLimitStrict(bodyLimitRaw ?? queryLimitRaw);
  if (!limitResult.ok) return limitResult;
  const limit = limitResult.value ?? DEFAULT_LIMIT;

  const featuredResult = parseBooleanStrict(bodyFeaturedRaw ?? queryFeaturedRaw);
  if (!featuredResult.ok) return featuredResult;
  const featuredRequested = featuredResult.value ?? true;

  return { ok: true, value: { placement, limit, featuredRequested } };
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const requestId = makeRequestId();

  const cors = corsHeadersFor(req);
  const origin = (req.headers.get('origin') ?? '').trim();

  // If Origin exists, it must be allowlisted
  if (origin && !cors) {
    return errorResponse(
      403,
      'ORIGIN_NOT_ALLOWED',
      'Origin not allowed.',
      requestId,
      { Vary: 'Origin' },
      'no-store',
    );
  }

  // Preflight
  if (req.method === 'OPTIONS') {
    // If no origin, allow but don't set ACAO
    return emptyResponse(204, cors ?? { Vary: 'Origin' }, requestId);
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return errorResponse(
      405,
      'METHOD_NOT_ALLOWED',
      'Method not allowed.',
      requestId,
      cors ?? { Vary: 'Origin' },
      CACHE_CONTROL_ERROR,
    );
  }

  let body: JsonObject | null = null;
  if (req.method === 'POST') {
    const bodyResult = await readJsonObjectBody(req);
    if (!bodyResult.ok) {
      return errorResponse(
        bodyResult.status,
        bodyResult.code,
        bodyResult.error,
        requestId,
        cors ?? { Vary: 'Origin' },
        CACHE_CONTROL_ERROR,
      );
    }
    body = bodyResult.value;
  }

  try {
    const url = new URL(req.url);
    const paramsResult = resolveRequestParams(url, body);
    if (!paramsResult.ok) {
      return errorResponse(
        paramsResult.status,
        paramsResult.code,
        paramsResult.error,
        requestId,
        cors ?? { Vary: 'Origin' },
        CACHE_CONTROL_ERROR,
      );
    }

    const { placement, limit, featuredRequested } = paramsResult.value;
    const nowIso = new Date().toISOString();
    const nowMs = Date.now();
    const fetchLimit = Math.min(limit * DB_FETCH_MULTIPLIER, MAX_DB_FETCH_LIMIT);

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('active_campaigns_now')
      .select(
        'id,campaign_name,placement,promo_id,starts_at,ends_at,badge,hero_title,hero_subtitle,cta_label,deep_link,menu_item_id,priority,weight,is_featured',
      )
      .eq('placement', placement)
      .order('is_featured', { ascending: false })
      .order('priority', { ascending: false })
      .order('weight', { ascending: false })
      .order('starts_at', { ascending: false })
      .limit(fetchLimit);

    if (error) {
      return errorResponse(
        503,
        'SERVICE_UNAVAILABLE',
        'Service unavailable.',
        requestId,
        { ...(cors ?? { Vary: 'Origin' }), 'Cache-Control': CACHE_CONTROL_ERROR },
        CACHE_CONTROL_ERROR,
      );
    }

    const dedupe = new Set<string>();
    const campaigns: CampaignPublic[] = [];

    if (Array.isArray(data)) {
      for (const row of data) {
        const parsed = parseCampaignPublic(row);
        if (!parsed) continue;
        if (parsed.placement !== placement) continue;
        if (!isCampaignActiveAt(parsed, nowMs)) continue;
        if (dedupe.has(parsed.id)) continue;

        dedupe.add(parsed.id);
        campaigns.push(parsed);
      }
    }

    campaigns.sort(sortCampaigns);

    const limitedCampaigns = campaigns.slice(0, limit);
    const featured = featuredRequested
      ? (limitedCampaigns.find((campaign) => campaign.is_featured) ?? null)
      : null;

    const responseBody = {
      ok: true,
      placement,
      limit,
      count: limitedCampaigns.length,
      featured,
      campaigns: limitedCampaigns,
      asOf: nowIso,
      requestId,
    } as const;

    const responseFingerprint = JSON.stringify({
      fn: FUNCTION_NAME,
      placement: responseBody.placement,
      limit: responseBody.limit,
      count: responseBody.count,
      featured: responseBody.featured,
      campaigns: responseBody.campaigns,
      asOf: responseBody.asOf,
    });

    const etag = `W/"${await sha256Hex(responseFingerprint)}"`;
    const requestEtag = req.headers.get('if-none-match')?.trim();

    const successHeaders: HeadersInit = {
      ...(cors ?? { Vary: 'Origin' }),
      'Cache-Control': CACHE_CONTROL_SUCCESS,
      ETag: etag,
    };

    if (requestEtag && requestEtag === etag) {
      return emptyResponse(304, successHeaders, requestId);
    }

    return jsonResponse(responseBody, 200, successHeaders, requestId);
  } catch {
    return errorResponse(
      503,
      'SERVICE_UNAVAILABLE',
      'Service unavailable.',
      requestId,
      { ...(cors ?? { Vary: 'Origin' }), 'Cache-Control': CACHE_CONTROL_ERROR },
      CACHE_CONTROL_ERROR,
    );
  }
});