// =============================================================================
// supabase/functions/finalize-order/rate-limit.ts
// =============================================================================

import type { DbClient, Db } from './types.ts';
import {
  FINALIZE_RATE_LIMIT_TABLE,
  RATE_LIMIT_MAX,
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_BLOCK_MS,
} from './config.ts';
import { nowIso } from './utils.ts';

export async function checkRateLimit(
  db: DbClient,
  userId: string,
): Promise<{ blocked: boolean; retryAfterSeconds: number }> {
  const now = Date.now();

  const { data, error } = await db
    .from(FINALIZE_RATE_LIMIT_TABLE)
    .select('attempts,last_attempt_at,blocked_until')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw new Error('RATE_LIMIT_LOOKUP_FAILED');

  const blockedUntilMs =
    typeof data?.blocked_until === 'string' ? Date.parse(data.blocked_until) : Number.NaN;

  if (Number.isFinite(blockedUntilMs) && blockedUntilMs > now) {
    return {
      blocked: true,
      retryAfterSeconds: Math.max(1, Math.ceil((blockedUntilMs - now) / 1000)),
    };
  }

  const lastAttemptMs =
    typeof data?.last_attempt_at === 'string' ? Date.parse(data.last_attempt_at) : Number.NaN;

  const previousAttempts = typeof data?.attempts === 'number' ? data.attempts : 0;
  const nextAttempts =
    Number.isFinite(lastAttemptMs) && now - lastAttemptMs < RATE_LIMIT_WINDOW_MS
      ? previousAttempts + 1
      : 1;

  const blocked = nextAttempts > RATE_LIMIT_MAX;
  const blockedUntilIso = blocked ? new Date(now + RATE_LIMIT_BLOCK_MS).toISOString() : null;

  const upsertRow: Db['public']['Tables']['checkout_rate_limits']['Insert'] = {
    user_id: userId,
    attempts: nextAttempts,
    last_attempt_at: nowIso(),
    blocked_until: blockedUntilIso,
  };

  const { error: upsertError } = await db
    .from(FINALIZE_RATE_LIMIT_TABLE)
    .upsert(upsertRow, { onConflict: 'user_id' });

  if (upsertError) throw new Error('RATE_LIMIT_WRITE_FAILED');

  return {
    blocked,
    retryAfterSeconds: blocked ? Math.max(1, Math.ceil(RATE_LIMIT_BLOCK_MS / 1000)) : 0,
  };
}