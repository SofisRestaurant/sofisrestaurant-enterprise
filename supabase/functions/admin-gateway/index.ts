// =============================================================================
// PATH: supabase/functions/admin-gateway/index.ts
// =============================================================================
// Server boot only.
// Responsibilities: CORS, auth, body size guard, JSON parse, dispatch, log.
// No business logic lives here.
// =============================================================================

import { authenticateAdmin } from '../_shared/auth.ts';
import { ok, fail, withStandardHeaders, type Meta } from './lib/http.ts';
import { isRecord, log } from './lib/guards.ts';
import { parseGatewayRequest } from './lib/parsers.ts';
import { dispatch } from './actions/dispatch.ts';

/* -------------------------------------------------------------------------- */
/* Config                                                                     */
/* -------------------------------------------------------------------------- */

const CONFIG = {
  // Raised to 32k to accommodate batch modifier creates.
  MAX_BODY_BYTES: 32_000,
} as const;

/* -------------------------------------------------------------------------- */
/* CORS                                                                       */
/* - Origin present → must be allowlisted, ACAO header set                   */
/* - Origin absent  → allow request, ACAO header NOT set                     */
/* -------------------------------------------------------------------------- */

const ALLOWED_ORIGINS = new Set<string>([
  'http://localhost:3000',
  'http://localhost:5173',
  'https://sofislegacy.com',
  'https://www.sofislegacy.com',
  'https://sofisrestaurant.netlify.app',
]);

function corsHeadersFor(req: Request): Record<string, string> | null {
  const origin = (req.headers.get('origin') ?? '').trim();

  if (!origin) {
    return { Vary: 'Origin' };
  }

  if (!ALLOWED_ORIGINS.has(origin)) return null;

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers':
      'authorization, apikey, content-type, x-client-info, x-request-id, x-idempotency-key, x-application-name',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

/* -------------------------------------------------------------------------- */
/* Server                                                                     */
/* -------------------------------------------------------------------------- */

Deno.serve(async (req: Request): Promise<Response> => {
  const requestId = crypto.randomUUID();
  const ts = Date.now();
  const start = Date.now();
  

  // ── CORS ──────────────────────────────────────────────────────────────────
  const cors = corsHeadersFor(req);
  if (!cors) {
    return new Response('Origin not allowed', { status: 403, headers: { Vary: 'Origin' } });
  }

  const metaPre: Meta = { requestedBy: 'unknown', requestId, ts };

  // ── Preflight ─────────────────────────────────────────────────────────────
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: withStandardHeaders(cors, requestId) });
  }

  // ── Method guard ──────────────────────────────────────────────────────────
  if (req.method !== 'POST') {
    return fail('METHOD_NOT_ALLOWED', 'Method not allowed', metaPre, cors, requestId, 405);
  }

  // ── Body read ─────────────────────────────────────────────────────────────
  let rawText = '';
  try {
    rawText = await req.text();
  } catch {
    return fail('BAD_BODY', 'Unable to read request body', metaPre, cors, requestId, 400);
  }

  const byteLen = new TextEncoder().encode(rawText).length;
  if (byteLen > CONFIG.MAX_BODY_BYTES) {
    return fail('PAYLOAD_TOO_LARGE', 'Payload too large', metaPre, cors, requestId, 413, {
      len: byteLen,
      max: CONFIG.MAX_BODY_BYTES,
    });
  }

  // ── JSON parse ────────────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = rawText ? JSON.parse(rawText) : null;
  } catch {
    return fail('BAD_JSON', 'Invalid JSON', metaPre, cors, requestId, 400);
  }

  // ── Request parse ─────────────────────────────────────────────────────────
  const parsed = parseGatewayRequest(body);
  if (!parsed) {
    console.log('ADMIN_GATEWAY_BAD_REQUEST_RAW', rawText);
    console.log('ADMIN_GATEWAY_BAD_REQUEST_BODY', JSON.stringify(body));
    return fail('BAD_REQUEST', 'Invalid request', metaPre, cors, requestId, 400);
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  const auth = await authenticateAdmin(req);
  if (!auth.ok) {
    const status = auth.reason === 'not_admin' ? 403 : 401;
    const code =
      status === 403
        ? 'AUTH_FORBIDDEN'
        : auth.reason === 'missing_bearer' || auth.reason === 'empty_token'
          ? 'AUTH_MISSING'
          : 'AUTH_INVALID';

    return fail(code, auth.message, metaPre, cors, requestId, status, { reason: auth.reason });
  }

  const meta: Meta = { requestedBy: auth.userId, requestId, ts };

  // ── Dispatch ──────────────────────────────────────────────────────────────
  try {
    const { action, result } = await dispatch(parsed);

    log('info', 'request_ok', {
      requestId,
      userId: auth.userId,
      action,
      duration_ms: Date.now() - start,
    });

    return ok(result, meta, cors, requestId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    const code =
      isRecord(e) && typeof e.code === 'string' && e.code.trim() ? e.code.trim() : 'INTERNAL';

    log('error', 'request_failed', {
      requestId,
      userId: auth.userId,
      action: parsed.action,
      code,
      message: msg,
      duration_ms: Date.now() - start,
    });

    return fail(code, msg, meta, cors, requestId, 500);
  }
});