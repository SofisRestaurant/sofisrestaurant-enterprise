// src/modules/orders/pages/OrderSuccess.tsx
// ============================================================================
// ORDER SUCCESS — dual-pipeline (auth + guest)
// ============================================================================
// [FIX 2026-05-10 PATCH 2] clearGuestToken() removed from the success path.
//
//   BEFORE: clearGuestToken() was called immediately after setPageState('found')
//   in both run() and reconcile(). React batches state updates, so by the time
//   the component re-rendered and showed the "Track My Order" button, the token
//   was already gone from sessionStorage. Clicking the button landed the guest
//   on /order-status/:id with no credential → 401 "Access denied".
//
//   AFTER: The token is intentionally left in sessionStorage. sessionStorage is
//   scoped to the browser tab and cleared automatically when the tab closes.
//   The token cannot be used to access any order other than the one it was
//   issued for. OrderStatus.tsx will clear it when the order reaches a terminal
//   status (DELIVERED / CANCELLED) during polling.
//
// All other logic is unchanged from the prior version.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence, MotionConfig } from 'framer-motion';
import { MapPin } from 'lucide-react';

import { supabase } from '@/lib/supabase/supabaseClient';
import { invokeEdge } from '@/lib/supabase/invoke';
import { useCartStore } from '@/modules/cart/store/cart.store';
import { mapOrderRowToDomain } from '@/modules/orders/mappers';
import type { Order, OrderStatus } from '@/domain/orders/order.types';

import type {
  PageState,
  LoyaltyTxV2,
  LoyaltyAccountSnap,
  LoyaltyForOrderMeta,
  LoyaltyForOrderResp,
  GetOrderResp,
  TimeoutHandle,
} from './order-success/orderSuccess.types';
import {
  isRecord,
  isOrderStatus,
  readNumber,
  safeServiceTypeFromOrder,
  formatDate,
  cents,
  readGuestToken,
  computeBackoffMs,
} from './order-success/orderSuccess.helpers';
import {
  containerVariants,
  itemVariants,
  checkIconVariants,
  btnVariants,
} from './order-success/orderSuccess.animations';
import { LoadingState, ErrorState, TimeoutState } from './order-success/OrderSuccessStates';
import { LoyaltyResultCard } from './order-success/OrderSuccessLoyalty';
import { StickyNextSteps } from './order-success/OrderSuccessNextSteps';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 2_000;
const POLL_MAX_ATTEMPTS = 25;
const LOYALTY_RETRY_BASE_MS = 1_800;
const LOYALTY_MAX_ATTEMPTS = 10;
const LOYALTY_RETRY_MAX_MS = 5_200;
const STRIPE_SESSION_RE = /^cs_(test|live)_[a-zA-Z0-9]+$/;

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

async function getJwtIfAuthed(): Promise<string | null> {
  const { data: immediate } = await supabase.auth.getSession();
  if (immediate?.session?.access_token) {
    return immediate.session.access_token;
  }

  return new Promise<string | null>((resolve) => {
    const deadline = setTimeout(() => {
      subscription.unsubscribe();
      resolve(null);
    }, 2_500);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.access_token) {
        clearTimeout(deadline);
        subscription.unsubscribe();
        resolve(session.access_token);
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export default function OrderSuccess() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const clearCart = useCartStore((s) => s.clearCart);

  const rawSessionId = searchParams.get('session_id');
  const sessionId = useMemo(() => (rawSessionId ? rawSessionId.trim() : ''), [rawSessionId]);

  const isValidSessionId = useMemo(() => {
    return sessionId.length > 0 && sessionId.length <= 200 && STRIPE_SESSION_RE.test(sessionId);
  }, [sessionId]);

  const [pageState, setPageState] = useState<PageState>(isValidSessionId ? 'loading' : 'error');
  const [order, setOrder] = useState<Order | null>(null);
  const [liveStatus, setLiveStatus] = useState<OrderStatus | null>(null);
  const [attempt, setAttempt] = useState(0);
  // ── [CHANGE 1] Guest detection flag ───────────────────────────────────────
  // Set to true in both found-paths when no JWT was present and a
  // checkout_guest_token existed at the moment the order was confirmed.
  // Drives the guest-only recovery info card below the Track My Order CTA.
  const [isGuestOrder, setIsGuestOrder] = useState(false);

  const [loyalty, setLoyalty] = useState<LoyaltyTxV2 | null>(null);
  const [loyaltyAccount, setLoyaltyAccount] = useState<LoyaltyAccountSnap | null>(null);
  const [loyaltyMeta, setLoyaltyMeta] = useState<LoyaltyForOrderMeta | undefined>(undefined);
  const [loyaltyAttempt, setLoyaltyAttempt] = useState(0);

  const loyaltyStartedForOrderRef = useRef<string | null>(null);
  const pollTimerRef = useRef<TimeoutHandle | null>(null);
  const loyaltyTimerRef = useRef<TimeoutHandle | null>(null);
  const jwtRef = useRef<string | null>(null);

  const stopTimer = useCallback((ref: { current: TimeoutHandle | null }) => {
    if (ref.current !== null) {
      clearTimeout(ref.current);
      ref.current = null;
    }
  }, []);

  // ── Loyalty fetch (auth-only) ───────────────────────────────────────────
  const fetchLoyaltyWithRetry = useCallback(
    async (orderId: string) => {
      let retryCount = 0;
      stopTimer(loyaltyTimerRef);
      setLoyaltyAttempt(0);

      const schedule = (ms: number) => {
        stopTimer(loyaltyTimerRef);
        loyaltyTimerRef.current = setTimeout(() => {
          void run();
        }, ms);
      };

      const run = async () => {
        if (!orderId) return;
        retryCount += 1;
        setLoyaltyAttempt(retryCount);
        try {
          const token = await getJwtIfAuthed();
          if (!token) {
            stopTimer(loyaltyTimerRef);
            return;
          }
          const resp = await invokeEdge<LoyaltyForOrderResp>(
            'loyalty-for-order',
            { order_id: orderId },
            {
              headers: {
                Authorization: `Bearer ${token}`,
                'x-request-id': crypto.randomUUID(),
              },
            },
          );
          if (resp?.account && typeof resp.account.balance === 'number') {
            setLoyaltyAccount(resp.account);
          }
          if (resp?.meta) {
            setLoyaltyMeta(resp.meta);
          }
          const tx = resp?.loyalty ?? null;
          if (tx && typeof tx.amount === 'number' && typeof tx.created_at === 'string') {
            setLoyalty(tx);
            stopTimer(loyaltyTimerRef);
            return;
          }
          if (retryCount < LOYALTY_MAX_ATTEMPTS) {
            schedule(
              computeBackoffMs(LOYALTY_RETRY_BASE_MS + 200, retryCount, LOYALTY_RETRY_MAX_MS),
            );
          }
        } catch {
          if (retryCount < LOYALTY_MAX_ATTEMPTS) {
            schedule(
              computeBackoffMs(LOYALTY_RETRY_BASE_MS + 350, retryCount, LOYALTY_RETRY_MAX_MS),
            );
          }
        }
      };

      await run();
    },
    [stopTimer],
  );

  // ── Order fetch ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isValidSessionId) {
      setPageState('error');
      return;
    }

    let cancelled = false;
    let attempts = 0;
    let authRetried = false;

    const stopPoll = () => stopTimer(pollTimerRef);

    const schedulePoll = () => {
      stopPoll();
      pollTimerRef.current = setTimeout(() => {
        void run();
      }, POLL_INTERVAL_MS);
    };

    const reconcile = async () => {
      await new Promise<void>((resolve) => {
        pollTimerRef.current = setTimeout(resolve, 5_000);
      });
      if (cancelled) return;

      const latestToken = await getJwtIfAuthed();
      if (latestToken) jwtRef.current = latestToken;

      const finalHeaders: Record<string, string> = { 'x-request-id': crypto.randomUUID() };
      if (jwtRef.current) finalHeaders.Authorization = `Bearer ${jwtRef.current}`;
      const finalBody: Record<string, unknown> = { session_id: sessionId };
      const gt = readGuestToken();
      if (gt) finalBody.guest_token = gt;

      try {
        const finalResp = await invokeEdge<GetOrderResp>('get-order-for-success', finalBody, {
          headers: finalHeaders,
        });
        if (!cancelled && finalResp?.order) {
          const orderRow = finalResp.order as unknown as Parameters<typeof mapOrderRowToDomain>[0];
          const mapped = mapOrderRowToDomain(orderRow);
          setOrder((current) => (current?.id === mapped.id ? current : mapped));
          setLiveStatus(mapped.status);
          setPageState('found');
          clearCart();
          // ── [CHANGE 2] Guest detection — reconcile path ─────────────────
          if (jwtRef.current === null && readGuestToken() !== null) setIsGuestOrder(true);
          // NOTE: clearGuestToken() intentionally omitted — guest must be
          // able to use the token on the /order-status page in the same session.
          if (loyaltyStartedForOrderRef.current !== mapped.id) {
            loyaltyStartedForOrderRef.current = mapped.id;
            void fetchLoyaltyWithRetry(mapped.id);
          }
          return;
        }
      } catch {
        // Fall through to finalize-order attempt.
      }

      if (!cancelled && jwtRef.current) {
        try {
          type FinalizeResp = { ok?: boolean; order_id?: string };
          const finalizeResp = await invokeEdge<FinalizeResp>(
            'finalize-order',
            { session_id: sessionId },
            {
              headers: {
                Authorization: `Bearer ${jwtRef.current}`,
                'x-request-id': crypto.randomUUID(),
              },
            },
          );
          if (!cancelled && finalizeResp?.order_id) {
            attempts = 0;
            schedulePoll();
            return;
          }
        } catch {
          // finalize-order failed — fall through to timeout state.
        }
      }

      if (!cancelled) {
        setPageState('timeout');
      }
    };

    const run = async () => {
      if (cancelled) return;
      attempts += 1;
      setAttempt(attempts);

      const token = jwtRef.current;
      const guestToken = readGuestToken();

      if (!token && !guestToken) {
        setPageState('error');
        stopPoll();
        return;
      }

      const headers: Record<string, string> = {
        'x-request-id': crypto.randomUUID(),
      };
      if (token) headers.Authorization = `Bearer ${token}`;

      const body: Record<string, unknown> = { session_id: sessionId };
      if (guestToken) body.guest_token = guestToken;

      try {
        const resp = await invokeEdge<GetOrderResp>('get-order-for-success', body, { headers });

        if (cancelled) return;

        if (resp?.pending === true || !resp?.order) {
          if (attempts >= POLL_MAX_ATTEMPTS) {
            stopPoll();
            void reconcile();
          } else {
            schedulePoll();
          }
          return;
        }

        const orderRow = resp.order as unknown as Parameters<typeof mapOrderRowToDomain>[0];
        const mapped = mapOrderRowToDomain(orderRow);
        setOrder((current) => (current?.id === mapped.id ? current : mapped));
        setLiveStatus(mapped.status);
        setPageState('found');
        clearCart();
        // ── [CHANGE 3] Guest detection — run() path ─────────────────────
        if (jwtRef.current === null && readGuestToken() !== null) setIsGuestOrder(true);
        // NOTE: clearGuestToken() intentionally omitted — guest must be
        // able to use the token on the /order-status page in the same session.

        if (loyaltyStartedForOrderRef.current !== mapped.id) {
          loyaltyStartedForOrderRef.current = mapped.id;
          void fetchLoyaltyWithRetry(mapped.id);
        }

        stopPoll();
      } catch (err) {
        if (cancelled) return;

        const message = (err instanceof Error ? err.message : String(err ?? '')).toLowerCase();
        const isFatalAuth =
          message.includes('401') ||
          message.includes('403') ||
          message.includes('unauthorized') ||
          message.includes('forbidden') ||
          message.includes('guest_token_required') ||
          message.includes('guest token') ||
          message.includes('token required') ||
          message.includes('authentication required') ||
          message.includes('invalid token') ||
          message.includes('non-2xx') ||
          message.includes('edge function returned');
        if (isFatalAuth) {
          if (!authRetried) {
            authRetried = true;
            const refreshed = await getJwtIfAuthed();
            if (refreshed) {
              jwtRef.current = refreshed;
              attempts -= 1;
              schedulePoll();
              return;
            }
          }
          setPageState('error');
          stopPoll();
          return;
        }

        if (attempts >= POLL_MAX_ATTEMPTS) {
          setPageState('error');
          stopPoll();
        } else {
          schedulePoll();
        }
      }
    };

    void (async () => {
      jwtRef.current = await getJwtIfAuthed();
      if (!cancelled) void run();
    })();

    return () => {
      cancelled = true;
      stopPoll();
      stopTimer(loyaltyTimerRef);
    };
  }, [clearCart, fetchLoyaltyWithRetry, isValidSessionId, sessionId, stopTimer]);

  // ── Realtime subscription ───────────────────────────────────────────────
  useEffect(() => {
    if (!order?.id) return;
    const channel = supabase
      .channel(`order-success-${order.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${order.id}` },
        (payload) => {
          const nextRecord = isRecord(payload) && isRecord(payload.new) ? payload.new : null;
          const nextStatus = nextRecord?.status;
          if (isOrderStatus(nextStatus)) {
            setLiveStatus(nextStatus);
          }
          const nextOrderNumber = readNumber(nextRecord?.order_number);
          if (nextOrderNumber !== null || isRecord(nextRecord)) {
            setOrder((current) => {
              if (!current || !nextRecord) return current;
              return {
                ...current,
                ...(nextOrderNumber !== null ? { order_number: nextOrderNumber } : {}),
                ...(isOrderStatus(nextStatus) ? { status: nextStatus } : {}),
              };
            });
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [order?.id]);

  const serviceType = useMemo(() => (order ? safeServiceTypeFromOrder(order) : null), [order]);

  const loyaltyStatusText = useMemo(() => {
    if (loyalty) return null;
    if (pageState !== 'found') return null;
    if (loyaltyAttempt <= 0) return null;
    if (loyaltyAttempt < LOYALTY_MAX_ATTEMPTS) return '✨ Updating your points…';
    return '✨ Your points are still updating — check your account in a moment.';
  }, [loyalty, loyaltyAttempt, pageState]);

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex min-h-svh items-center justify-center bg-neutral-950 px-4 py-10 text-neutral-200">
        <div className="w-full max-w-md">
          <div className="overflow-hidden rounded-2xl border border-white/8 bg-neutral-950 shadow-2xl shadow-black/60">
            <div className="h-0.5 w-full bg-linear-to-r from-transparent via-amber-500/60 to-transparent" />
            <div className="p-6 sm:p-8">
              {pageState === 'loading' ? <LoadingState attempt={attempt} /> : null}
              {pageState === 'timeout' ? <TimeoutState /> : null}
              {pageState === 'error' ? <ErrorState /> : null}

              {/* Success view */}
              {pageState === 'found' && order && liveStatus ? (
                <motion.div
                  className="space-y-5 [--entry-y:18px] md:[--entry-y:32px]"
                  variants={containerVariants}
                  initial="hidden"
                  animate="visible"
                >
                  {/* ── Header ── */}
                  <motion.div className="text-center" variants={itemVariants}>
                    <div className="mb-4 flex justify-center">
                      <motion.div
                        className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/15 ring-1 ring-amber-500/30"
                        variants={checkIconVariants}
                      >
                        <span className="text-3xl">✓</span>
                      </motion.div>
                    </div>

                    <h1 className="text-2xl font-bold tracking-tight text-white">
                      Order Confirmed
                    </h1>

                    {order.order_number ? (
                      <p className="mt-1 font-mono text-sm text-neutral-400">
                        #{String(order.order_number).padStart(4, '0')}
                      </p>
                    ) : (
                      <p className="mt-1 font-mono text-sm text-neutral-500">
                        {order.id.slice(0, 8).toUpperCase()}
                      </p>
                    )}

                    <p className="mt-1 text-xs text-neutral-600">{formatDate(order.created_at)}</p>

                    {serviceType ? (
                      <p className="mt-2 text-[11px] text-neutral-500">
                        Service:{' '}
                        <span className="font-semibold text-amber-300">
                          {serviceType === 'dine_in' ? 'dine-in' : serviceType}
                        </span>
                      </p>
                    ) : null}
                  </motion.div>

                  {/* ── Totals ── */}
                  <motion.div
                    className="rounded-xl border border-white/8 bg-white/3 p-4"
                    variants={itemVariants}
                  >
                    <div className="space-y-2 font-mono text-sm">
                      <div className="flex justify-between text-neutral-500">
                        <span>Subtotal</span>
                        <span>${cents(order.amount_subtotal)}</span>
                      </div>
                      {order.amount_tax > 0 ? (
                        <div className="flex justify-between text-neutral-500">
                          <span>Tax</span>
                          <span>${cents(order.amount_tax)}</span>
                        </div>
                      ) : null}
                      <div className="flex justify-between border-t border-white/10 pt-2 font-bold text-white">
                        <span>Total Paid</span>
                        <span className="text-amber-400">${cents(order.amount_total)}</span>
                      </div>
                    </div>
                  </motion.div>

                  {/* ── Loyalty ── */}
                  {loyalty || loyaltyStatusText ? (
                    <motion.div variants={itemVariants}>
                      <AnimatePresence mode="wait">
                        {loyalty ? (
                          <motion.div
                            key="loyalty-card"
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
                          >
                            <p className="mb-3 text-10px font-bold uppercase tracking-[0.2em] text-neutral-500">
                              Loyalty Rewards
                            </p>
                            <LoyaltyResultCard
                              loyalty={loyalty}
                              account={loyaltyAccount}
                              meta={loyaltyMeta}
                            />
                          </motion.div>
                        ) : loyaltyStatusText ? (
                          <motion.div
                            key="loyalty-loading"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-200"
                          >
                            {loyaltyStatusText}
                          </motion.div>
                        ) : null}
                      </AnimatePresence>
                    </motion.div>
                  ) : null}

                  {/* ── CTAs ── */}
                  <motion.div className="space-y-2" variants={itemVariants}>
                    <motion.div
                      variants={btnVariants}
                      initial="rest"
                      whileHover="hover"
                      whileTap="tap"
                      style={{ originX: 0.5, originY: 0.5 }}
                    >
                      <Link
                        to={`/order-status/${order.id}`}
                        className="flex w-full items-center justify-center gap-2 rounded-xl
                                   bg-amber-500 py-3 text-sm font-bold text-neutral-950
                                   shadow-[0_0_0_0_rgba(245,158,11,0)]
                                   hover:shadow-[0_0_18px_4px_rgba(245,158,11,0.35)]
                                   focus-visible:outline-none focus-visible:ring-2
                                   focus-visible:ring-amber-400 focus-visible:ring-offset-2
                                   focus-visible:ring-offset-neutral-950"
                      >
                        <MapPin size={15} className="shrink-0" />
                        Track My Order
                      </Link>
                      <p className="mt-2 text-center text-[11px] leading-relaxed text-neutral-500">
                        Guest tracking works in this browser session. Keep this tab open to follow
                        your order.
                      </p>
                    </motion.div>

                    {/* ── [CHANGE 4] Guest recovery info card ───────────────────────────
                         Shown only for guest checkouts (no JWT at order-found time).
                         Explains same-session tracking and how to recover via Find My Order.
                         Does not mention tokens, sessionStorage, or any internal identifiers.
                         checkout_guest_token lifecycle is completely untouched.            */}
                    {isGuestOrder && (
                      <div className="rounded-xl border border-white/8 bg-white/3 px-4 py-3 text-xs leading-relaxed text-neutral-400">
                        <p className="mb-1 font-semibold text-neutral-300">
                          {order.order_number
                            ? `Order #${String(order.order_number).padStart(4, '0')} · Lost this page?`
                            : 'Lost this page?'}
                        </p>
                        <p>
                          Go to{' '}
                          <Link
                            to="/find-order"
                            className="text-amber-400 underline underline-offset-2 hover:text-amber-300 focus-visible:outline-none"
                          >
                            Find My Order
                          </Link>
                          {order.order_number
                            ? ` and enter order #${String(order.order_number).padStart(4, '0')} with the email you used at checkout.`
                            : ' and enter your order number with the email you used at checkout.'}
                        </p>
                      </div>
                    )}

                    <motion.div
                      variants={btnVariants}
                      initial="rest"
                      whileHover="hover"
                      whileTap="tap"
                      style={{ originX: 0.5, originY: 0.5 }}
                    >
                      <Link
                        to="/account/orders"
                        className="flex w-full items-center justify-center gap-2 rounded-xl
                                   bg-white/8 py-3 text-sm font-semibold text-white
                                   hover:bg-white/12 focus-visible:outline-none
                                   focus-visible:ring-2 focus-visible:ring-white/30"
                      >
                        View Order History
                      </Link>
                    </motion.div>

                    <div className="grid grid-cols-2 gap-2">
                      <motion.div
                        variants={btnVariants}
                        initial="rest"
                        whileHover="hover"
                        whileTap="tap"
                        style={{ originX: 0.5, originY: 0.5 }}
                      >
                        <Link
                          to="/account"
                          className="flex w-full items-center justify-center rounded-xl
                                     border border-white/8 py-2.5 text-xs font-medium
                                     text-neutral-400 hover:border-white/15 hover:text-neutral-200"
                        >
                          My Account
                        </Link>
                      </motion.div>

                      <motion.div
                        variants={btnVariants}
                        initial="rest"
                        whileHover="hover"
                        whileTap="tap"
                        style={{ originX: 0.5, originY: 0.5 }}
                      >
                        <Link
                          to="/menu"
                          className="flex w-full items-center justify-center rounded-xl
                                     border border-amber-500/30 bg-amber-500/10 py-2.5
                                     text-xs font-semibold text-amber-400
                                     hover:bg-amber-500/15"
                        >
                          Order Again
                        </Link>
                      </motion.div>
                    </div>

                    <button
                      onClick={() => navigate('/menu')}
                      className="w-full text-10px text-neutral-600 underline underline-offset-2 hover:text-neutral-400"
                      type="button"
                    >
                      Continue browsing
                    </button>
                  </motion.div>

                  {/* ── Sticky next steps ── */}
                  <motion.div variants={itemVariants}>
                    <StickyNextSteps order={order} loyalty={loyalty} account={loyaltyAccount} />
                  </motion.div>

                  {/* ── Ref footer ── */}
                  <motion.p
                    className="text-center font-mono text-10px text-neutral-700"
                    variants={itemVariants}
                  >
                    Ref {order.id.slice(0, 8).toUpperCase()}
                  </motion.p>
                </motion.div>
              ) : null}
            </div>
          </div>

          {pageState === 'found' ? (
            <p className="mt-4 text-center text-xs text-neutral-700">
              A confirmation has been sent to your email.
            </p>
          ) : null}
        </div>
      </div>
    </MotionConfig>
  );
}