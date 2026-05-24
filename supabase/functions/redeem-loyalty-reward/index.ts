// supabase/functions/redeem-loyalty-reward/index.ts
// =============================================================================
// REDEEM LOYALTY REWARD — Catalog-based reward redemption (Phase 5C)
// =============================================================================
// Redeems approved rewards by rewardId only. No arbitrary points, no cash
// conversion, no client-supplied discount or label.
//
// Two paths:
//   Customer: JWT auth, self-service rewards (food_item, choice_reward)
//   Staff:    Admin JWT + account_id, staff-required rewards (staff_reward, merch)
//
// All values (pointsCost, maxDiscountCents, label) come from the server catalog
// in _shared/loyalty-rewards.ts. The client sends only reward_id.
//
// Calls v2_redeem_loyalty_reward RPC (SECURITY DEFINER, service_role only).
// =============================================================================

import { corsHeaders, handlePreflight } from '../_shared/cors.ts';
import {
  requireAuth,
  authenticateAdmin,
  AuthError,
} from '../_shared/auth.ts';
import { createServiceClient } from '../_shared/supabase.ts';
import { getLoyaltyRewardById } from '../_shared/loyalty-rewards.ts';

// ─── Constants ────────────────────────────────────────────────────────────────

const SERVICE = 'redeem-loyalty-reward';
const MAX_BODY_BYTES = 8_000;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Fields that must NEVER be accepted from the client.
const UNSAFE_FIELDS = [
  'points',
  'pointsToRedeem',
  'points_to_redeem',
  'discountAmount',
  'discount_cents',
  'maxDiscountCents',
  'pointsCost',
  'points_cost',
  'rewardLabel',
  'reward_label',
  'rewardId',
] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

type Rec = Record<string, unknown>;

function isRecord(v: unknown): v is Rec {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isUuid(v: string): boolean {
  return UUID_RE.test(v);
}

function nowIso(): string {
  return new Date().toISOString();
}

function prefix(id: string | null | undefined, n = 8): string {
  if (!id) return '(none)';
  return id.slice(0, n);
}

function makeRequestId(req: Request): string {
  const h = (req.headers.get('x-request-id') ?? '').trim();
  if (h) return h.slice(0, 128);
  return crypto.randomUUID();
}

function log(
  level: 'info' | 'warn' | 'error',
  event: string,
  data?: Rec,
): void {
  const line = JSON.stringify({
    level,
    event,
    service: SERVICE,
    ts: nowIso(),
    ...(data ?? {}),
  });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

function json(
  ch: Record<string, string>,
  body: unknown,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...ch,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

function errResp(
  ch: Record<string, string>,
  requestId: string,
  code: string,
  message: string,
  status: number,
): Response {
  return json(
    ch,
    { ok: false, error: { code, message }, meta: { requestId } },
    status,
  );
}

async function readJsonBody(
  req: Request,
  maxBytes: number,
): Promise<Rec> {
  const ct = (req.headers.get('content-type') ?? '').toLowerCase();
  if (!ct.includes('application/json')) throw new Error('UNSUPPORTED_CONTENT_TYPE');

  const ab = await req.arrayBuffer();
  if (ab.byteLength > maxBytes) throw new Error('PAYLOAD_TOO_LARGE');
  if (ab.byteLength === 0) throw new Error('EMPTY_BODY');

  const text = new TextDecoder().decode(ab);
  if (!text.trim()) throw new Error('EMPTY_BODY');

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('INVALID_JSON');
  }

  if (!isRecord(parsed)) throw new Error('BAD_BODY');
  return parsed;
}

// Normalize RPC response (Supabase can return array or object)
function normalizeRpcRow(raw: unknown): Rec | null {
  const row = Array.isArray(raw) ? raw[0] : raw;
  return isRecord(row) ? row : null;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request): Promise<Response> => {
  const requestId = makeRequestId(req);

  // ── CORS ────────────────────────────────────────────────────────────────
  const ch = corsHeaders(req);
  if (!ch) return new Response('Origin not allowed', { status: 403 });
  if (req.method === 'OPTIONS') return handlePreflight(req);

  if (req.method !== 'POST') {
    return errResp(ch, requestId, 'METHOD_NOT_ALLOWED', 'Method not allowed', 405);
  }

  // ── Parse body ──────────────────────────────────────────────────────────
  let body: Rec;
  try {
    body = await readJsonBody(req, MAX_BODY_BYTES);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'BAD_REQUEST';
    const code =
      msg === 'PAYLOAD_TOO_LARGE'     ? 'PAYLOAD_TOO_LARGE' :
      msg === 'UNSUPPORTED_CONTENT_TYPE' ? 'UNSUPPORTED_CONTENT_TYPE' :
      msg === 'EMPTY_BODY'            ? 'EMPTY_BODY' :
      'INVALID_JSON';
    const status =
      code === 'PAYLOAD_TOO_LARGE' ? 413 :
      code === 'UNSUPPORTED_CONTENT_TYPE' ? 415 :
      400;
    return errResp(ch, requestId, code, 'Invalid request payload', status);
  }

  // ── Reject unsafe fields ────────────────────────────────────────────────
  for (const field of UNSAFE_FIELDS) {
    if (body[field] !== undefined && body[field] !== null) {
      return errResp(
        ch,
        requestId,
        'UNSAFE_FIELD',
        `Field '${field}' is not permitted. Reward value is determined by the server.`,
        400,
      );
    }
  }

  // ── Validate reward_id from catalog ─────────────────────────────────────
  const rawRewardId = typeof body.reward_id === 'string' ? body.reward_id.trim() : '';
  if (!rawRewardId) {
    return errResp(ch, requestId, 'MISSING_REWARD_ID', 'reward_id is required', 400);
  }

  const reward = getLoyaltyRewardById(rawRewardId);
  if (!reward) {
    return errResp(ch, requestId, 'INVALID_REWARD', 'Unknown reward_id', 422);
  }
  if (!reward.active) {
    return errResp(ch, requestId, 'REWARD_INACTIVE', 'This reward is not currently available', 422);
  }

  const isStaffReward = reward.requiresStaffApproval === true;

  if (!isStaffReward && body.account_id !== undefined && body.account_id !== null) {
  return errResp(
    ch,
    requestId,
    'UNSAFE_FIELD',
    "Field 'account_id' is only permitted for staff-required rewards.",
    400,
  );
}

  // ── Auth (path depends on reward type) ──────────────────────────────────
  let authUserId: string;
  let channel: 'customer' | 'staff';

  if (isStaffReward) {
    // Staff/admin path
    const adminResult = await authenticateAdmin(req);
    if (!adminResult.ok) {
      const status = adminResult.reason === 'not_admin' ? 403 : 401;
      return errResp(
        ch,
        requestId,
        adminResult.reason === 'not_admin' ? 'FORBIDDEN' : 'UNAUTHORIZED',
        adminResult.reason === 'not_admin'
          ? 'This reward requires staff approval'
          : 'Unauthorized',
        status,
      );
    }
    authUserId = adminResult.userId;
    channel = 'staff';
  } else {
    // Customer path
    try {
      const user = await requireAuth(req);
      authUserId = user.id;
      channel = 'customer';
    } catch (e) {
      const status = e instanceof AuthError ? e.status : 401;
      return errResp(ch, requestId, 'UNAUTHORIZED', 'Unauthorized', status);
    }
  }

  // ── Resolve loyalty account ─────────────────────────────────────────────
  const svc = createServiceClient();
  let accountId: string;
  let accountUserId: string;

  if (isStaffReward) {
    // Staff path: account_id is required in body
    const rawAccountId = typeof body.account_id === 'string' ? body.account_id.trim() : '';
    if (!rawAccountId || !isUuid(rawAccountId)) {
      return errResp(
        ch,
        requestId,
        'MISSING_ACCOUNT_ID',
        'account_id is required for staff rewards',
        400,
      );
    }

    const { data: acct, error: acctErr } = await svc
      .from('loyalty_accounts')
      .select('id, user_id, balance')
      .eq('id', rawAccountId)
      .maybeSingle();

    if (acctErr) {
      log('error', 'account_lookup_failed', {
        requestId,
        accountId: prefix(rawAccountId),
        error: acctErr.message,
      });
      return errResp(ch, requestId, 'INTERNAL', 'Internal server error', 500);
    }
    if (!acct) {
      return errResp(ch, requestId, 'ACCOUNT_NOT_FOUND', 'Loyalty account not found', 404);
    }

    accountId = acct.id as string;
    accountUserId = acct.user_id as string;
  } else {
    // Customer path: look up account by auth user_id
    const { data: acct, error: acctErr } = await svc
      .from('loyalty_accounts')
      .select('id, user_id, balance')
      .eq('user_id', authUserId)
      .maybeSingle();

    if (acctErr) {
      log('error', 'account_lookup_failed', {
        requestId,
        userId: prefix(authUserId),
        error: acctErr.message,
      });
      return errResp(ch, requestId, 'INTERNAL', 'Internal server error', 500);
    }
    if (!acct) {
      return errResp(
        ch,
        requestId,
        'ACCOUNT_NOT_FOUND',
        'No loyalty account found for your user',
        404,
      );
    }

    accountId = acct.id as string;
    accountUserId = acct.user_id as string;

    // Ownership: customer can only redeem their own account
    if (accountUserId !== authUserId) {
      log('error', 'ownership_mismatch', {
        requestId,
        accountUserId: prefix(accountUserId),
        authUserId: prefix(authUserId),
      });
      return errResp(ch, requestId, 'OWNERSHIP_MISMATCH', 'Account ownership mismatch', 422);
    }
  }

  // ── Build idempotency key ───────────────────────────────────────────────
  const rawClientIdem = typeof body.idempotency_key === 'string'
    ? body.idempotency_key.trim().slice(0, 128)
    : '';

  const safeKey = rawClientIdem || crypto.randomUUID();
  const idempotencyKey = `reward:${reward.id}:${accountId}:${safeKey}`;

  // ── Determine status ────────────────────────────────────────────────────
  const status = isStaffReward ? 'staff_required' : 'applied';

  // ── Call RPC ────────────────────────────────────────────────────────────
  try {
    const { data, error } = await svc.rpc(
      'v2_redeem_loyalty_reward' as never,
      {
        p_account_id:      accountId,
        p_user_id:         accountUserId,
        p_reward_id:       reward.id,
        p_reward_label:    reward.label,
        p_points_cost:     reward.pointsCost,
        p_discount_cents:  reward.maxDiscountCents,
        p_idempotency_key: idempotencyKey,
        p_status:          status,
        p_metadata: {
          source:                  SERVICE,
          channel,
          reward_type:             reward.type,
          requires_staff_approval: isStaffReward,
          request_id:              requestId,
          ...(isStaffReward ? { admin_id: authUserId } : {}),
        },
      } as never,
    );

    if (error) {
      const pgMsg = error.message ?? '';

      log('warn', 'rpc_failed', {
        requestId,
        code: error.code ?? null,
        accountId: prefix(accountId),
        rewardId: reward.id,
      });

      // Map known RPC errors to safe client messages
      if (pgMsg.includes('Insufficient loyalty points')) {
        return errResp(
          ch,
          requestId,
          'INSUFFICIENT_POINTS',
          'Not enough points to redeem this reward',
          422,
        );
      }
      if (pgMsg.includes('Account ownership mismatch')) {
        return errResp(ch, requestId, 'OWNERSHIP_MISMATCH', 'Account ownership mismatch', 422);
      }
      if (pgMsg.includes('Loyalty account not found')) {
        return errResp(ch, requestId, 'ACCOUNT_NOT_FOUND', 'Loyalty account not found', 404);
      }

      return errResp(ch, requestId, 'REDEEM_FAILED', 'Unable to redeem reward. Please try again.', 422);
    }

    const row = normalizeRpcRow(data);
    if (!row) {
      log('warn', 'rpc_bad_shape', { requestId, rawType: typeof data });
      return errResp(ch, requestId, 'BAD_RESPONSE', 'Unexpected response from server', 500);
    }

    const wasDuplicate = row.was_duplicate === true;

    log('info', wasDuplicate ? 'reward_duplicate' : 'reward_redeemed', {
      requestId,
      accountId: prefix(accountId),
      rewardId: reward.id,
      channel,
      wasDuplicate,
    });

    return json(ch, {
      ok: true,
      result: {
        redemption_id:  row.redemption_id,
        ledger_id:      row.ledger_id,
        reward_id:      reward.id,
        reward_label:   reward.label,
        points_spent:   reward.pointsCost,
        discount_cents: reward.maxDiscountCents,
        new_balance:    row.new_balance,
        status,
        was_duplicate:  wasDuplicate,
      },
      meta: { requestId },
    });
  } catch (e) {
    log('error', 'handler_crash', {
      requestId,
      error: e instanceof Error ? e.message : String(e),
    });
    return errResp(ch, requestId, 'INTERNAL', 'Internal server error', 500);
  }
});