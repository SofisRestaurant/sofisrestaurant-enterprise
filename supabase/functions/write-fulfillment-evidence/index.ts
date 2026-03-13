import {
  createAnonClient,
  createServiceClient,
  getAuthenticatedUser,
  getBearerToken,
  getProfileRole,
} from './auth.ts';
import {
  buildMarkOutForDeliveryUpsertRow,
  buildWriteUpsertRow,
} from './builders.ts';
import { MAX_BODY_BYTES } from './constants.ts';
import { corsHeadersFor } from './cors.ts';
import { getExistingEvidence, getOrderExists, upsertEvidenceRow } from './db.ts';
import {
  isErrorResponseBody,
  isMarkOutForDeliveryPayload,
  normalizeRole,
  shortId,
} from './guards.ts';
import { parsePayload } from './payload.ts';
import { errorResponse, successResponse } from './responses.ts';

interface ErrorWithCode {
  code?: string;
}

function isErrorWithCode(value: unknown): value is ErrorWithCode {
  return typeof value === 'object' && value !== null;
}

function getErrorCode(value: unknown): string {
  if (!isErrorWithCode(value)) {
    return 'unknown';
  }

  return typeof value.code === 'string' && value.code.trim().length > 0
    ? value.code
    : 'unknown';
}

Deno.serve(async (request: Request): Promise<Response> => {
  const origin = request.headers.get('origin');
  const corsHeaders = corsHeadersFor(origin);

  if (request.method === 'OPTIONS') {
    if (corsHeaders === null) {
      return errorResponse(403, 'origin_forbidden', 'Origin is not allowed.', null);
    }

    return new Response(null, {
      status: 204,
      headers: new Headers(corsHeaders),
    });
  }

  if (corsHeaders === null) {
    return errorResponse(403, 'origin_forbidden', 'Origin is not allowed.', null);
  }

  if (request.method !== 'POST') {
    return errorResponse(405, 'method_not_allowed', 'Only POST is allowed.', corsHeaders);
  }

  const contentType = request.headers.get('content-type')?.toLowerCase() ?? '';
  if (!contentType.includes('application/json')) {
    return errorResponse(
      415,
      'unsupported_media_type',
      'Content-Type must be application/json.',
      corsHeaders,
    );
  }

  const contentLengthHeader = request.headers.get('content-length');
  if (contentLengthHeader !== null) {
    const contentLength = Number(contentLengthHeader);

    if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
      return errorResponse(
        413,
        'payload_too_large',
        'Request body exceeds size limit.',
        corsHeaders,
      );
    }
  }

  const rawBody = await request.text();

  if (rawBody.trim().length === 0) {
    return errorResponse(400, 'empty_body', 'Request body is required.', corsHeaders);
  }

  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
    return errorResponse(
      413,
      'payload_too_large',
      'Request body exceeds size limit.',
      corsHeaders,
    );
  }

  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(rawBody) as unknown;
  } catch {
    return errorResponse(400, 'invalid_json', 'Request body must be valid JSON.', corsHeaders);
  }

  const parsedPayload = parsePayload(parsedJson);

  if (isErrorResponseBody(parsedPayload)) {
    return errorResponse(
      400,
      parsedPayload.code,
      parsedPayload.message,
      corsHeaders,
      parsedPayload.field,
    );
  }

  const payload = parsedPayload;

  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim() ?? '';
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')?.trim() ?? '';
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim() ?? '';

  if (
    supabaseUrl.length === 0 ||
    supabaseAnonKey.length === 0 ||
    supabaseServiceRoleKey.length === 0
  ) {
    return errorResponse(
      500,
      'server_misconfigured',
      'Required Supabase environment variables are missing.',
      corsHeaders,
    );
  }

  const jwt = getBearerToken(request.headers.get('authorization') ?? '');

  if (jwt === null) {
    return errorResponse(401, 'unauthorized', 'Missing bearer token.', corsHeaders);
  }

  const anonClient = createAnonClient(supabaseUrl, supabaseAnonKey, jwt);
  const serviceClient = createServiceClient(supabaseUrl, supabaseServiceRoleKey);

  const authUserId = await getAuthenticatedUser(anonClient, jwt);

  if (authUserId === null) {
    return errorResponse(401, 'unauthorized', 'Authentication failed.', corsHeaders);
  }

  if (payload.staffId !== undefined && payload.staffId !== authUserId) {
    return errorResponse(
      403,
      'staff_mismatch',
      'staffId does not match the authenticated user.',
      corsHeaders,
      'staffId',
    );
  }

  const profileResult = await getProfileRole(serviceClient, authUserId);

  if (profileResult.error !== null) {
    console.error('[write-fulfillment-evidence] profile lookup failed', {
      code: getErrorCode(profileResult.error),
      userIdPrefix: shortId(authUserId),
    });

    return errorResponse(500, 'internal_error', 'Unable to validate user role.', corsHeaders);
  }

  if (profileResult.data === null) {
    return errorResponse(
      403,
      'profile_not_found',
      'No profile found for the authenticated user.',
      corsHeaders,
    );
  }

  const role = normalizeRole(profileResult.data.role);

  if (role !== 'admin' && role !== 'staff') {
    return errorResponse(
      403,
      'forbidden',
      'Only admin or staff can write fulfillment evidence.',
      corsHeaders,
    );
  }

  const orderResult = await getOrderExists(serviceClient, payload.orderId);

  if (orderResult.error !== null) {
    console.error('[write-fulfillment-evidence] order lookup failed', {
      code: getErrorCode(orderResult.error),
      orderIdPrefix: shortId(payload.orderId),
      userIdPrefix: shortId(authUserId),
    });

    return errorResponse(500, 'internal_error', 'Unable to verify order.', corsHeaders);
  }

  if (orderResult.data === null) {
    return errorResponse(404, 'order_not_found', 'Order not found.', corsHeaders);
  }

  const existingResult = await getExistingEvidence(serviceClient, payload.orderId);

  if (existingResult.error !== null) {
    console.error('[write-fulfillment-evidence] evidence lookup failed', {
      code: getErrorCode(existingResult.error),
      orderIdPrefix: shortId(payload.orderId),
      userIdPrefix: shortId(authUserId),
    });

    return errorResponse(
      500,
      'internal_error',
      'Unable to load existing evidence.',
      corsHeaders,
    );
  }

  const now = new Date().toISOString();

  const row = isMarkOutForDeliveryPayload(payload)
    ? buildMarkOutForDeliveryUpsertRow(
        payload.orderId,
        authUserId,
        existingResult.data,
        now,
      )
    : buildWriteUpsertRow(payload, authUserId, existingResult.data, now);

  const writeResult = await upsertEvidenceRow(serviceClient, row);

  if (writeResult.error !== null || writeResult.data === null) {
    console.error('[write-fulfillment-evidence] upsert failed', {
      code: getErrorCode(writeResult.error),
      orderIdPrefix: shortId(payload.orderId),
      userIdPrefix: shortId(authUserId),
    });

    return errorResponse(
      500,
      'evidence_write_failed',
      'Failed to write fulfillment evidence.',
      corsHeaders,
    );
  }

  return successResponse(
    200,
    isMarkOutForDeliveryPayload(payload)
      ? 'out_for_delivery_marked'
      : 'evidence_written',
    writeResult.data.order_id,
    corsHeaders,
  );
});