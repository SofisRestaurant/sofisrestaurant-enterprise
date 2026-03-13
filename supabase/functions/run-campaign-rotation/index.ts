import { createAuthClient, createServiceClient } from '../_shared/supabase.ts';

type JsonObject = Record<string, unknown>;

type RotationRequest = {
  placement: string | null;
  force: boolean;
  reason: string;
};

type RotationSettings = {
  auto_rotate_daily: boolean;
  last_rotation_at: string | null;
};

type RotationRpcRow = {
  placement: string | null;
  featured_campaign_id: string | null;
  was_manual_override: boolean | null;
  rotated_at: string | null;
};

type RateLimitDecision =
  | {
      ok: true;
    }
  | {
      ok: false;
      retryAfterSeconds: number;
    };

type ParsedJsonResult =
  | {
      ok: true;
      value: JsonObject;
    }
  | {
      ok: false;
      status: number;
      code: string;
      error: string;
    };

const FUNCTION_NAME = 'run-campaign-rotation';
const MAX_POST_BODY_BYTES = 8_192;
const DEFAULT_REASON_ADMIN = 'manual_admin';
const DEFAULT_REASON_CRON = 'scheduled';

const CRON_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const CRON_RATE_LIMIT_MAX_ATTEMPTS = 2;
const CRON_RATE_LIMIT_BLOCK_MS = 10 * 60 * 1000;

const ADMIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const ADMIN_RATE_LIMIT_MAX_ATTEMPTS = 4;
const ADMIN_RATE_LIMIT_BLOCK_MS = 30 * 60 * 1000;

const ALLOWED_ORIGINS = new Set<string>([
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'https://sofislegacy.com',
  'https://www.sofislegacy.com',
  'https://sofisrestaurant.netlify.app',
]);

const ALLOWED_HEADERS =
  'authorization, apikey, content-type, x-client-info, x-application-name, x-request-id, x-cron-secret';

function corsHeadersFor(origin: string | null): HeadersInit | null {
  const normalizedOrigin = (origin ?? '').trim();
  if (!normalizedOrigin || !ALLOWED_ORIGINS.has(normalizedOrigin)) return null;

  return {
    'Access-Control-Allow-Origin': normalizedOrigin,
    'Access-Control-Allow-Headers': ALLOWED_HEADERS,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function makeRequestId(): string {
  return crypto.randomUUID().replaceAll('-', '').slice(0, 16);
}

function withStandardHeaders(headersInit: HeadersInit, requestId: string): Headers {
  const headers = new Headers(headersInit);
  if (!headers.has('Vary')) headers.set('Vary', 'Origin');
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
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
  return new Response(JSON.stringify(body), {
    status,
    headers: withStandardHeaders(headersInit, requestId),
  });
}

function errorResponse(
  status: number,
  code: string,
  error: string,
  headersInit: HeadersInit,
  requestId: string,
  extraHeaders?: HeadersInit,
): Response {
  const headers = new Headers(headersInit);
  if (extraHeaders) {
    const extra = new Headers(extraHeaders);
    for (const [key, value] of extra.entries()) {
      headers.set(key, value);
    }
  }

  return jsonResponse(
    {
      ok: false,
      code,
      error,
      requestId,
    },
    status,
    headers,
    requestId,
  );
}

function isRecord(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sanitizePlainText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const withoutControls = trimmed
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!withoutControls) return null;

  return withoutControls.length <= maxLength
    ? withoutControls
    : withoutControls.slice(0, maxLength).trim();
}

function sanitizePlacement(value: unknown): string | null {
  const placement = sanitizePlainText(value, 64);
  if (!placement) return null;
  if (!/^[a-z0-9](?:[a-z0-9:_-]{0,63})$/i.test(placement)) return null;
  return placement;
}

function parseBooleanStrict(value: unknown, fallback: boolean): boolean | null {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return null;

  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'y') {
    return true;
  }
  if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'n') {
    return false;
  }

  return null;
}

function parseIsoToEpochMs(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readClientIp(req: Request): string | null {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }

  const cloudflare = req.headers.get('cf-connecting-ip')?.trim();
  if (cloudflare) return cloudflare;

  return null;
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((part) => part.toString(16).padStart(2, '0'))
    .join('');
}

function readJsonObjectBody(req: Request): Promise<ParsedJsonResult> {
  return (async (): Promise<ParsedJsonResult> => {
    const contentType = (req.headers.get('content-type') ?? '').toLowerCase();
    if (!contentType.includes('application/json')) {
      return {
        ok: false,
        status: 415,
        code: 'UNSUPPORTED_CONTENT_TYPE',
        error: 'Content-Type must be application/json.',
      };
    }

    let rawBody = '';
    try {
      rawBody = await req.text();
    } catch {
      return {
        ok: false,
        status: 400,
        code: 'INVALID_JSON_BODY',
        error: 'Unable to read request body.',
      };
    }

    if (!rawBody.trim()) {
      return {
        ok: false,
        status: 400,
        code: 'EMPTY_BODY',
        error: 'Request body is required.',
      };
    }

    const bodyBytes = new TextEncoder().encode(rawBody).length;
    if (bodyBytes > MAX_POST_BODY_BYTES) {
      return {
        ok: false,
        status: 413,
        code: 'BODY_TOO_LARGE',
        error: 'Request body is too large.',
      };
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

    return {
      ok: true,
      value: parsed,
    };
  })();
}

function parseRotationRequest(
  body: JsonObject,
  defaultReason: string,
):
  | { ok: true; value: RotationRequest }
  | { ok: false; status: number; code: string; error: string } {
  const placement =
    body.placement === null || body.placement === undefined
      ? null
      : sanitizePlacement(body.placement);

  if (body.placement !== undefined && body.placement !== null && placement === null) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_PLACEMENT',
      error: 'Placement is invalid.',
    };
  }

  const force = parseBooleanStrict(body.force, false);
  if (force === null) {
    return {
      ok: false,
      status: 400,
      code: 'INVALID_FORCE',
      error: 'Force must be true or false.',
    };
  }

  const reason = sanitizePlainText(body.reason, 64) ?? defaultReason;

  return {
    ok: true,
    value: {
      placement,
      force,
      reason,
    },
  };
}

function parseRotationSettings(value: unknown): RotationSettings | null {
  if (!isRecord(value)) return null;
  if (typeof value.auto_rotate_daily !== 'boolean') return null;

  return {
    auto_rotate_daily: value.auto_rotate_daily,
    last_rotation_at: typeof value.last_rotation_at === 'string' ? value.last_rotation_at : null,
  };
}

function parseRotationRpcRow(value: unknown): RotationRpcRow | null {
  if (!isRecord(value)) return null;

  const placement =
    value.placement === null || value.placement === undefined
      ? null
      : sanitizePlacement(value.placement);

  const featuredCampaignId =
    value.featured_campaign_id === null || value.featured_campaign_id === undefined
      ? null
      : sanitizePlainText(value.featured_campaign_id, 128);

  const wasManualOverride =
    typeof value.was_manual_override === 'boolean' ? value.was_manual_override : null;

  const rotatedAt =
    typeof value.rotated_at === 'string' && value.rotated_at.trim() ? value.rotated_at : null;

  return {
    placement,
    featured_campaign_id: featuredCampaignId,
    was_manual_override: wasManualOverride,
    rotated_at: rotatedAt,
  };
}

function parseRotationRpcRows(value: unknown): RotationRpcRow[] {
  if (Array.isArray(value)) {
    const rows: RotationRpcRow[] = [];
    for (const entry of value) {
      const parsed = parseRotationRpcRow(entry);
      if (parsed) rows.push(parsed);
    }
    return rows;
  }

  const parsed = parseRotationRpcRow(value);
  return parsed ? [parsed] : [];
}

function uniqueNonNullStrings(values: Array<string | null>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    if (!value) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }

  return result;
}

function prefixIdentifier(value: string | null): string | null {
  if (!value) return null;
  return value.slice(0, 8);
}

function timingSafeEqual(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  const length = Math.max(leftBytes.length, rightBytes.length);

  let mismatch = leftBytes.length === rightBytes.length ? 0 : 1;

  for (let index = 0; index < length; index += 1) {
    const leftValue = index < leftBytes.length ? leftBytes[index] : 0;
    const rightValue = index < rightBytes.length ? rightBytes[index] : 0;
    mismatch |= leftValue ^ rightValue;
  }

  return mismatch === 0;
}

async function applyCheckoutRateLimit(input: {
  svc: ReturnType<typeof createServiceClient>;
  scope: 'cron' | 'admin';
  actorKey: string;
  userId: string | null;
  ipValue: string | null;
  maxAttempts: number;
  windowMs: number;
  blockMs: number;
}): Promise<RateLimitDecision> {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const limitId = `${FUNCTION_NAME}:${input.scope}:${(await sha256Hex(input.actorKey)).slice(0, 32)}`;
  const ipFingerprint = input.ipValue ? (await sha256Hex(input.ipValue)).slice(0, 8) : null;

  const { data: existing, error: existingError } = await input.svc
    .from('checkout_rate_limits')
    .select('attempts, blocked_until, last_attempt_at')
    .eq('id', limitId)
    .maybeSingle();

  if (existingError) {
    throw new Error('RATE_LIMIT_READ_FAILED');
  }

  const existingBlockedUntil =
    existing && typeof existing.blocked_until === 'string'
      ? parseIsoToEpochMs(existing.blocked_until)
      : null;

  if (existingBlockedUntil !== null && existingBlockedUntil > now) {
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((existingBlockedUntil - now) / 1000)),
    };
  }

  const existingAttempts =
    existing && typeof existing.attempts === 'number' ? existing.attempts : 0;
  const lastAttemptAt =
    existing && typeof existing.last_attempt_at === 'string'
      ? parseIsoToEpochMs(existing.last_attempt_at)
      : null;

  const isWithinWindow = lastAttemptAt !== null && now - lastAttemptAt < input.windowMs;
  const nextAttempts = isWithinWindow ? existingAttempts + 1 : 1;

  const blockedUntilIso =
    nextAttempts > input.maxAttempts ? new Date(now + input.blockMs).toISOString() : null;

  const { error: upsertError } = await input.svc.from('checkout_rate_limits').upsert(
    {
      id: limitId,
      ip: ipFingerprint,
      user_id: input.userId,
      attempts: nextAttempts,
      last_attempt_at: nowIso,
      blocked_until: blockedUntilIso,
    },
    { onConflict: 'id' },
  );

  if (upsertError) {
    throw new Error('RATE_LIMIT_WRITE_FAILED');
  }

  if (blockedUntilIso !== null) {
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil(input.blockMs / 1000)),
    };
  }

  return { ok: true };
}

async function readRotationSettings(
  svc: ReturnType<typeof createServiceClient>,
): Promise<RotationSettings | null> {
  const { data, error } = await svc
    .from('growth_campaign_settings')
    .select('auto_rotate_daily, last_rotation_at')
    .eq('id', 1)
    .maybeSingle();

  if (error) {
    throw new Error('SETTINGS_READ_FAILED');
  }

  return data ? parseRotationSettings(data) : null;
}

async function executeRotationRpc(
  svc: ReturnType<typeof createServiceClient>,
  placement: string | null,
): Promise<{ rpcName: string; rows: RotationRpcRow[] }> {
  if (placement) {
    const targeted = await svc.rpc('rotate_featured_growth_campaigns', {
      target_placement: placement,
    });

    if (!targeted.error) {
      return {
        rpcName: 'rotate_featured_growth_campaigns',
        rows: parseRotationRpcRows(targeted.data),
      };
    }
  } else {
    const allPlacements = await svc.rpc('rotate_featured_growth_campaigns');

    if (!allPlacements.error) {
      return {
        rpcName: 'rotate_featured_growth_campaigns',
        rows: parseRotationRpcRows(allPlacements.data),
      };
    }
  }

  const fallback = await svc.rpc('rotate_daily_campaigns');
  if (!fallback.error) {
    return {
      rpcName: 'rotate_daily_campaigns',
      rows: parseRotationRpcRows(fallback.data),
    };
  }

  throw new Error('ROTATION_RPC_FAILED');
}

Deno.serve(async (req: Request): Promise<Response> => {
  const requestId = sanitizePlainText(req.headers.get('x-request-id'), 64) ?? makeRequestId();

  // Determine cron/admin first. Cron callers commonly have no Origin header.
  const cronSecretHeader = sanitizePlainText(req.headers.get('x-cron-secret'), 256);
  const configuredCronSecret = sanitizePlainText(
    Deno.env.get('CAMPAIGN_ROTATION_CRON_SECRET'),
    256,
  );

  const isCronRequest = cronSecretHeader !== null;

  if (isCronRequest && configuredCronSecret === null) {
    return errorResponse(
      503,
      'CONFIGURATION_ERROR',
      'Cron secret is not configured.',
      { Vary: 'Origin', 'Cache-Control': 'no-store' },
      requestId,
    );
  }

  const actorMode: 'cron' | 'admin' =
    isCronRequest &&
    configuredCronSecret !== null &&
    timingSafeEqual(cronSecretHeader, configuredCronSecret)
      ? 'cron'
      : 'admin';

  if (isCronRequest && actorMode !== 'cron') {
    return errorResponse(
      401,
      'UNAUTHORIZED',
      'Invalid cron credentials.',
      { Vary: 'Origin', 'Cache-Control': 'no-store' },
      requestId,
    );
  }

  // Enforce CORS only for browser/admin requests.
  const origin = req.headers.get('origin');
  const adminCors = corsHeadersFor(origin);
  const cors: HeadersInit =
    actorMode === 'admin' ? (adminCors ?? { Vary: 'Origin' }) : { Vary: 'Origin' };

  // ✅ Security hardening: cron calls must not be browser-originated.
  if (actorMode === 'cron' && origin) {
    return errorResponse(
      403,
      'CRON_ORIGIN_NOT_ALLOWED',
      'Cron calls must not include an Origin header.',
      { Vary: 'Origin', 'Cache-Control': 'no-store' },
      requestId,
    );
  }

  if (req.method === 'OPTIONS') {
    if (actorMode !== 'admin' || !adminCors) {
      return errorResponse(
        403,
        'ORIGIN_NOT_ALLOWED',
        'Origin not allowed.',
        { Vary: 'Origin', 'Cache-Control': 'no-store' },
        requestId,
      );
    }

    return new Response(null, {
      status: 204,
      headers: withStandardHeaders(adminCors, requestId),
    });
  }

  if (actorMode === 'admin' && !adminCors) {
    return errorResponse(
      403,
      'ORIGIN_NOT_ALLOWED',
      'Origin not allowed.',
      { Vary: 'Origin', 'Cache-Control': 'no-store' },
      requestId,
    );
  }

  if (req.method !== 'POST') {
    return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.', cors, requestId);
  }

  const bodyResult = await readJsonObjectBody(req);
  if (!bodyResult.ok) {
    return errorResponse(bodyResult.status, bodyResult.code, bodyResult.error, cors, requestId);
  }

  const requestParseResult = parseRotationRequest(
    bodyResult.value,
    actorMode === 'cron' ? DEFAULT_REASON_CRON : DEFAULT_REASON_ADMIN,
  );

  if (!requestParseResult.ok) {
    return errorResponse(
      requestParseResult.status,
      requestParseResult.code,
      requestParseResult.error,
      cors,
      requestId,
    );
  }

  const { placement, force, reason } = requestParseResult.value;
  const svc = createServiceClient();
  const ipValue = readClientIp(req);

  try {
    if (actorMode === 'cron') {
      const rateLimit = await applyCheckoutRateLimit({
        svc,
        scope: 'cron',
        actorKey: `${reason}:${placement ?? '*'}`,
        userId: null,
        ipValue,
        maxAttempts: CRON_RATE_LIMIT_MAX_ATTEMPTS,
        windowMs: CRON_RATE_LIMIT_WINDOW_MS,
        blockMs: CRON_RATE_LIMIT_BLOCK_MS,
      });

      if (!rateLimit.ok) {
        return errorResponse(
          429,
          'RATE_LIMITED',
          'Too many campaign rotation attempts. Please try again later.',
          cors,
          requestId,
          { 'Retry-After': String(rateLimit.retryAfterSeconds) },
        );
      }

      const settings = await readRotationSettings(svc);

      if (!force && settings !== null && settings.auto_rotate_daily === false) {
        return jsonResponse(
          {
            ok: true,
            code: 'ROTATION_SKIPPED',
            executed: false,
            skipped: true,
            reason: 'auto_rotate_daily_disabled',
            actor: actorMode,
            placement,
            requestId,
            asOf: new Date().toISOString(),
            lastRotationAt: settings.last_rotation_at,
            results: [],
            placementsTouched: [],
          },
          200,
          cors,
          requestId,
        );
      }
    }

    let adminUserId: string | null = null;

    if (actorMode === 'admin') {
      const authClient = createAuthClient(req);
      const {
        data: { user },
        error: authError,
      } = await authClient.auth.getUser();

      if (authError || !user) {
        return errorResponse(401, 'UNAUTHORIZED', 'Unauthorized.', cors, requestId);
      }

      adminUserId = user.id;

      const { data: profile, error: profileError } = await svc
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();

      if (profileError || !profile || sanitizePlainText(profile.role, 32) !== 'admin') {
        return errorResponse(403, 'FORBIDDEN', 'Forbidden.', cors, requestId);
      }

      const rateLimit = await applyCheckoutRateLimit({
        svc,
        scope: 'admin',
        actorKey: `${user.id}:${placement ?? '*'}:${reason}`,
        userId: user.id,
        ipValue,
        maxAttempts: ADMIN_RATE_LIMIT_MAX_ATTEMPTS,
        windowMs: ADMIN_RATE_LIMIT_WINDOW_MS,
        blockMs: ADMIN_RATE_LIMIT_BLOCK_MS,
      });

      if (!rateLimit.ok) {
        return errorResponse(
          429,
          'RATE_LIMITED',
          'Too many campaign rotation attempts. Please try again later.',
          cors,
          requestId,
          { 'Retry-After': String(rateLimit.retryAfterSeconds) },
        );
      }
    }

    const rpcExecution = await executeRotationRpc(svc, placement);
    const rows = rpcExecution.rows;
    const results = rows.map((row) => ({
      placement: row.placement,
      featuredCampaignIdPrefix: prefixIdentifier(row.featured_campaign_id),
      wasManualOverride: row.was_manual_override,
      rotatedAt: row.rotated_at,
    }));

    return jsonResponse(
      {
        ok: true,
        code: 'ROTATION_EXECUTED',
        executed: true,
        skipped: false,
        actor: actorMode,
        placement,
        reason,
        force,
        rpcName: rpcExecution.rpcName,
        requestId,
        asOf: new Date().toISOString(),
        placementsTouched: uniqueNonNullStrings(rows.map((row) => row.placement)),
        rotatedCount: results.filter((row) => row.featuredCampaignIdPrefix !== null).length,
        manualOverrideCount: results.filter((row) => row.wasManualOverride === true).length,
        adminUserIdPrefix: prefixIdentifier(adminUserId),
        results,
      },
      200,
      cors,
      requestId,
    );
  } catch {
    return errorResponse(503, 'SERVICE_UNAVAILABLE', 'Service unavailable.', cors, requestId);
  }
});
