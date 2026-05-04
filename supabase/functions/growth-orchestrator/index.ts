// PATH: supabase/functions/growth-orchestrator/index.ts
// =============================================================================
// GROWTH ORCHESTRATOR — Abandoned Cart Recovery
// =============================================================================
//
// LIFECYCLE CONTRACT (single source of truth)
//
//   consumed_at IS NULL     → cart is active / unprocessed
//   consumed_at IS NOT NULL → cart is done; skip unconditionally
//
//   This function marks recovery-processed carts with consumed_at.
//   finalize-order / stripe-webhook also set consumed_at on conversion.
//   Both are valid terminal transitions — consumed_at means "this cart is
//   finished, one way or another." No parallel tracking system exists.
//
// IDENTITY CONTRACT
//
//   pending_carts.guest_email  → email for guest checkout carts
//   pending_carts.user_id      → auth user id (may be null on guest carts)
//   At least one must be present; carts with neither are skipped.
//
// PAYLOAD CONTRACT
//
//   pending_carts.items        → cart contents (JSON)
//   pending_carts.total_cents  → cart value
//
// NO DEPRECATED FIELDS
//   recovery_processed → does not exist; use consumed_at
//   cart.email         → does not exist; use guest_email
//   cart.cart_json     → does not exist; use items
//
// NO MIGRATION REQUIRED
//   All columns used exist in the current database.types.ts schema.
//
// CONCURRENCY
//   The UPDATE in step 6 uses .select('id') to return affected rows.
//   updatedRows.length === 0 means the .is('consumed_at', null) WHERE clause
//   matched nothing — a concurrent invocation or webhook already set it.
//   Only the invocation that gets rows back increments processedCount.
// =============================================================================

import { supabaseAdmin } from '../_shared/supabaseAdmin.ts';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Cart must be at least this old before being considered abandoned. */
const THRESHOLD_MINUTES     = 30;

/** Recovery promo is valid for this many hours. */
const RECOVERY_WINDOW_HOURS = 12;

/** Discount applied to the recovery promo. */
const RECOVERY_PERCENT      = 10;

/** Minimum order value in cents to redeem the recovery promo. */
const MIN_ORDER_CENTS       = 1000;

/** Maximum carts processed per invocation — prevents timeout on backlog. */
const BATCH_LIMIT           = 100;

// ── Structured logging ────────────────────────────────────────────────────────

function structuredLog(
  level: 'info' | 'warn' | 'error',
  event: string,
  data?: Record<string, unknown>,
): void {
  const entry = JSON.stringify({
    ts:  new Date().toISOString(),
    fn:  'growth-orchestrator',
    level,
    event,
    ...(data ?? {}),
  });
  if (level === 'error') console.error(entry);
  else if (level === 'warn') console.warn(entry);
  else console.log(entry);
}

// ── Handler ───────────────────────────────────────────────────────────────────

Deno.serve(async () => {
  const supabase = supabaseAdmin();

  try {
    const now    = new Date();
    const nowIso = now.toISOString();
    const cutoff = new Date(now.getTime() - THRESHOLD_MINUTES * 60_000).toISOString();

    // ── 1. Fetch abandoned cart candidates ────────────────────────────────────
    //
    // Selects only the columns this function actually reads — no select('*').
    // consumed_at IS NULL = active cart (single lifecycle source of truth).
    // guest_email OR user_id = has a contactable identity.
    const { data: rawCarts, error: cartError } = await supabase
      .from('pending_carts')
      .select(
        'id, user_id, guest_email, total_cents, items, created_at, idempotency_key',
      )
      .lt('created_at', cutoff)
      .is('consumed_at', null)
      .or('guest_email.not.is.null,user_id.not.is.null')
      .order('created_at', { ascending: true })
      .limit(BATCH_LIMIT);

    if (cartError) throw cartError;
    if (!rawCarts || rawCarts.length === 0) {
      structuredLog('info', 'complete', { processed: 0, candidates: 0 });
      return Response.json({ processed: 0 });
    }

    let processedCount = 0;

    for (const cart of rawCarts) {
      // Narrow all nullable fields immediately.
      // All subsequent code uses these locals — never cart.* directly.
      const userId:     string | null = cart.user_id;
      const guestEmail: string | null = cart.guest_email;
      const createdAt:  string | null = cart.created_at;

      // Identity gate: must have at least one contactable value.
      if (!userId && !guestEmail) continue;

      // ── 2. Skip carts whose authenticated user has already converted ───────
      // Guest carts have no order history — identity is session-scoped.
      if (userId) {
        const { count: paidCount, error: paidError } = await supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('customer_uid', userId)
          .eq('payment_status', 'paid');

        if (paidError) {
          structuredLog('warn', 'paid_check_failed', {
            cart_id: cart.id,
            error:   paidError.message,
          });
          continue; // fail closed — cannot verify, skip safely
        }

        if ((paidCount ?? 0) > 0) continue;
      }

      // ── 3. Dedup: skip if abandoned_cart_sessions row already exists ───────
      // If createdAt is null there is no stable match target — skip the check.
      if (createdAt) {
        const dedupeBase = supabase
          .from('abandoned_cart_sessions')
          .select('id', { count: 'exact', head: true })
          .eq('last_activity', createdAt); // string — confirmed non-null above

        // Prefer user_id (stable across sessions); fall back to email.
        // Identity gate above guarantees at least one is non-null, so if
        // userId is null then guestEmail is definitively non-null.
        const deduped = userId
          ? await dedupeBase.eq('user_id', userId)
          : await dedupeBase.eq('email', guestEmail as string);

        if ((deduped.count ?? 0) > 0) continue;
      }

      // ── 4. Create recovery promo code ─────────────────────────────────────
      const code     = `RECOVER-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
      const promoEnd = new Date(now.getTime() + RECOVERY_WINDOW_HOURS * 3_600_000);

      const { error: promoError } = await supabase.from('promotions').insert({
        code,
        type:            'percent',
        value:           RECOVERY_PERCENT,
        min_order_cents: MIN_ORDER_CENTS,
        per_user_limit:  1,
        max_uses:        1,
        starts_at:       nowIso,
        ends_at:         promoEnd.toISOString(),
        active:          true,
        channel:         'abandoned_cart',
      });

      if (promoError) {
        structuredLog('error', 'promo_failed', {
          cart_id: cart.id,
          error:   promoError.message,
        });
        continue;
      }

      // ── 5. Insert abandoned_cart_sessions row ─────────────────────────────
      //
      // Column mapping against abandoned_cart_sessions Insert type:
      //   email            ← guestEmail  (string | null — schema correct)
      //   user_id          ← userId      (string | null — schema correct)
      //   cart_value_cents ← total_cents (number)
      //   last_activity    ← createdAt   (string | null — schema correct)
      //   recovered        ← false
      const { error: sessionError } = await supabase
        .from('abandoned_cart_sessions')
        .insert({
          email:            guestEmail,
          user_id:          userId,
          cart_value_cents: cart.total_cents,
          last_activity:    createdAt,
          recovered:        false,
        });

      if (sessionError) {
        structuredLog('error', 'session_failed', {
          cart_id: cart.id,
          error:   sessionError.message,
        });
        continue;
      }

      // ── 6. Mark cart processed — single lifecycle transition ──────────────
      //
      // consumed_at is the ONE source of lifecycle truth for pending_carts.
      //
      // .select('id') returns the rows affected by the UPDATE. This is the
      // correct pattern in @supabase/supabase-js v2 — .select() takes zero or
      // one argument (column list string), not an options object. Using
      // { count: 'exact', head: true } after .update() is not supported and
      // causes a TypeScript error ("Expected 0-1 arguments, but got 2").
      //
      // .is('consumed_at', null) in the WHERE clause is the atomic concurrency
      // guard: if a parallel invocation or a converting webhook already set
      // consumed_at, this UPDATE matches 0 rows → updatedRows is empty →
      // this invocation skips processedCount++ for that cart.
      const { data: updatedRows, error: updateError } = await supabase
        .from('pending_carts')
        .update({ consumed_at: nowIso })
        .eq('id', cart.id)
        .is('consumed_at', null)
        .select('id');

      if (updateError) {
        structuredLog('error', 'update_failed', {
          cart_id: cart.id,
          error:   updateError.message,
        });
        // Session row already inserted — dedup check prevents duplicate on
        // next run. Log and continue; do not attempt to unwind the session.
        continue;
      }

      // Empty result means the atomic guard fired — concurrent invocation won.
      if (!updatedRows || updatedRows.length === 0) {
        structuredLog('warn', 'update_raced', { cart_id: cart.id });
        continue;
      }

      processedCount++;

      // ── 7. External dispatch ──────────────────────────────────────────────
      // Wire email / SMS provider here. Available:
      //   recovery code: code
      //   email:         guestEmail  (null for auth-only users)
      //   user id:       userId      (null for guest carts)
      //   cart items:    cart.items
      //   cart total:    cart.total_cents
      //
      // Do NOT await — provider failures must not block the loop or unwind
      // the consumed_at stamp already written to the database.
    }

    structuredLog('info', 'complete', {
      processed:  processedCount,
      candidates: rawCarts.length,
    });

    return Response.json({ processed: processedCount });

  } catch (err) {
    structuredLog('error', 'fatal', {
      error: err instanceof Error ? err.message : String(err),
    });
    return Response.json({ error: 'Internal automation failure' }, { status: 500 });
  }
});