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
import { LOYALTY_TIERS, asTier } from '@/domain/loyalty/tiers';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PageState = 'loading' | 'found' | 'timeout' | 'error';
type OrderServiceType = 'pickup' | 'delivery' | 'dine_in';

type LoyaltyTxV2 = {
  entry_type: 'earn' | 'redeem' | 'bonus' | 'expired' | 'adjustment';
  amount: number;
  balance_after: number;
  tier_at_time: string;
  streak_at_time: number;
  created_at: string;
  source: string;
  reference_id: string | null;
  metadata: Record<string, unknown> | null;
};

type LoyaltyAccountSnap = {
  balance: number;
  lifetime_earned: number;
  tier: string;
  streak: number;
  updated_at: string;
};

type LoyaltyForOrderMeta = {
  requestId?: string;
  ts?: string;
  v2Found?: boolean;
  usedHeuristic?: boolean;
  matchMethod?: 'reference_id' | 'metadata.order_id' | 'idempotency_key' | 'heuristic' | 'none';
  legacy?: {
    v1Found: boolean;
    points_delta?: number;
    points_balance?: number;
    created_at?: string;
  };
};

type LoyaltyForOrderResp = {
  ok?: boolean;
  loyalty?: LoyaltyTxV2 | null;
  account?: LoyaltyAccountSnap | null;
  meta?: LoyaltyForOrderMeta;
  error?: unknown;
  code?: unknown;
};

type GetOrderResp = {
  ok?: boolean;
  order?: Record<string, unknown> | null;
  pending?: boolean;
  error?: unknown;
  code?: unknown;
};

type UnknownRecord = Record<string, unknown>;
type TimeoutHandle = ReturnType<typeof setTimeout>;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 2_000;
const POLL_MAX_ATTEMPTS = 25;
const LOYALTY_RETRY_BASE_MS = 1_800;
const LOYALTY_MAX_ATTEMPTS = 10;
const LOYALTY_RETRY_MAX_MS = 5_200;
const STRIPE_SESSION_RE = /^cs_(test|live)_[a-zA-Z0-9]+$/;

const GUEST_TOKEN_STORAGE_KEY = 'checkout_guest_token';

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}
function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === 'string' && value.trim().length > 0;
}
function safeServiceTypeFromOrder(order: Order | null): OrderServiceType | null {
  const md = order?.metadata;
  if (!isRecord(md)) return null;
  const v = md.order_service_type;
  return v === 'pickup' || v === 'delivery' || v === 'dine_in' ? v : null;
}
function cents(n: number): string {
  return (n / 100).toFixed(2);
}
function fmt(n: number): string {
  return n.toLocaleString();
}
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}
function nextTierNudge(points: number, tier: string): { label: string; ptsLeft: number } | null {
  const resolvedTier = asTier(tier);
  const cfg = LOYALTY_TIERS[resolvedTier];
  const nextThreshold =
    'nextThreshold' in cfg && typeof cfg.nextThreshold === 'number' ? cfg.nextThreshold : null;
  if (!nextThreshold) return null;
  const left = Math.max(0, Math.ceil(nextThreshold - points));
  if (left <= 0) return null;
  return { label: `Only ${fmt(left)} points to the next tier`, ptsLeft: left };
}
function safeOrderNumber(n: unknown): string | null {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  return String(Math.trunc(n)).padStart(4, '0');
}
function computeBackoffMs(baseMs: number, attempt: number, maxMs: number): number {
  const safeAttempt = clampInt(attempt, 1, 12);
  const jitter = Math.min(250, safeAttempt * 35);
  const exp = baseMs * Math.pow(2, safeAttempt - 1);
  return clampInt(exp + jitter, baseMs, maxMs);
}

function readGuestToken(): string | null {
  try {
    const v = sessionStorage.getItem(GUEST_TOKEN_STORAGE_KEY);
    return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
  } catch {
    return null;
  }
}

// clearGuestToken is retained for potential future use (e.g. explicit logout),
// but is intentionally NOT called on the success path. The token must survive
// so the guest can click "Track My Order" in the same session. sessionStorage
// clears automatically when the tab closes. OrderStatus.tsx clears it when
// the order reaches a terminal status during polling.
function clearGuestToken(): void {
  try {
    sessionStorage.removeItem(GUEST_TOKEN_STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
}
// Suppress unused-variable lint — the function is kept intentionally.
void clearGuestToken;

// ---------------------------------------------------------------------------
// Animation variants
// ---------------------------------------------------------------------------

const containerVariants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.07,
      delayChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: {
    opacity: 0,
    y: 'var(--entry-y, 18px)',
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: 'spring' as const,
      stiffness: 340,
      damping: 28,
    },
  },
};

const checkIconVariants = {
  hidden: { scale: 0, opacity: 0 },
  visible: {
    scale: 1,
    opacity: 1,
    transition: { type: 'spring' as const, stiffness: 500, damping: 22, delay: 0.05 },
  },
};

const btnVariants = {
  rest: { scale: 1 },
  hover: { scale: 1.025 },
  tap: { scale: 0.97 },
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function LoadingState({ attempt }: { attempt: number }) {
  return (
    <div className="flex flex-col items-center gap-6 py-8 text-center">
      <div className="relative flex h-20 w-20 items-center justify-center">
        <div className="absolute inset-0 animate-ping rounded-full bg-amber-500/20" />
        <div className="absolute inset-2 animate-pulse rounded-full bg-amber-500/10" />
        <span className="relative text-3xl">🧾</span>
      </div>
      <div>
        <p className="text-lg font-semibold text-white">
          {attempt > 5 ? 'Almost there…' : 'Confirming your order'}
        </p>
        <p className="mt-1 text-sm text-neutral-500">
          {attempt > 5
            ? 'Payment received — finalizing details.'
            : 'Verifying payment with Stripe.'}
        </p>
      </div>
    </div>
  );
}

function ErrorState() {
  return (
    <div className="space-y-4 text-center">
      <div className="flex justify-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10 ring-1 ring-red-500/20">
          <span className="text-2xl">⚠</span>
        </div>
      </div>
      <div>
        <h2 className="text-lg font-bold text-white">Something went wrong</h2>
        <p className="mt-1 text-sm text-neutral-500">Your payment may still have been processed.</p>
      </div>
      <div className="flex flex-col gap-2">
        <Link
          to="/account/orders"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/8 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/12"
        >
          Check My Orders
        </Link>
        <Link
          to="/menu"
          className="text-sm text-neutral-600 underline underline-offset-2 hover:text-neutral-400"
        >
          Return to menu
        </Link>
      </div>
    </div>
  );
}

function TimeoutState() {
  return (
    <div className="space-y-4 text-center">
      <div className="flex justify-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-yellow-500/10 ring-1 ring-yellow-500/20">
          <span className="text-2xl">⏱</span>
        </div>
      </div>
      <div>
        <h2 className="text-lg font-bold text-white">Taking longer than usual</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Your payment was received. The order is being finalized.
        </p>
      </div>
      <Link
        to="/account/orders"
        className="inline-flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-5 py-2.5 text-sm font-semibold text-amber-400 transition hover:bg-amber-500/15"
      >
        View My Orders
      </Link>
    </div>
  );
}

function LoyaltyResultCard({
  loyalty,
  account,
  meta,
}: {
  loyalty: LoyaltyTxV2;
  account: LoyaltyAccountSnap | null;
  meta?: LoyaltyForOrderMeta;
}) {
  const tier = asTier(account?.tier ?? loyalty.tier_at_time);
  const tierCfg = LOYALTY_TIERS[tier];
  const pointsDelta = typeof loyalty.amount === 'number' ? loyalty.amount : 0;
  const earned = Math.max(0, Math.trunc(pointsDelta));
  const displayBalance =
    account && typeof account.balance === 'number' ? account.balance : loyalty.balance_after;

  const matchLabel =
    meta?.matchMethod === 'reference_id'
      ? 'Linked by order id'
      : meta?.matchMethod === 'metadata.order_id'
        ? 'Linked by ledger metadata'
        : meta?.matchMethod === 'idempotency_key'
          ? 'Linked by idempotency key'
          : meta?.matchMethod === 'heuristic'
            ? 'Matched by time window'
            : null;

  return (
    <div className="overflow-hidden rounded-xl border border-amber-500/20 bg-linear-to-br from-amber-950/40 via-neutral-900 to-neutral-900">
      <div className="flex items-center justify-between border-b border-amber-500/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">✨</span>
          <span className="text-sm font-semibold text-amber-300">Loyalty Update</span>
        </div>
        <span className="font-mono text-2xl font-bold text-amber-400">
          {pointsDelta >= 0 ? `+${fmt(earned)}` : `-${fmt(Math.abs(pointsDelta))}`} pts
        </span>
      </div>

      <div className="space-y-3 px-4 py-4 font-mono text-xs">
        <div className="flex items-center justify-between rounded-lg bg-white/3 px-3 py-2">
          <span className="text-neutral-400">Entry type</span>
          <span className="font-semibold text-neutral-200">{loyalty.entry_type}</span>
        </div>
        <div className="flex items-center justify-between rounded-lg bg-white/3 px-3 py-2">
          <span className="text-neutral-400">Tier</span>
          <span className={`flex items-center gap-1 font-semibold ${tierCfg.dark.text}`}>
            {tierCfg.icon} {tierCfg.label}
          </span>
        </div>
        <div className="flex items-center justify-between rounded-lg bg-white/3 px-3 py-2">
          <span className="text-neutral-400">Streak</span>
          <span className="font-semibold text-neutral-200">{fmt(loyalty.streak_at_time)} days</span>
        </div>
        <div className="flex justify-between border-t border-white/5 pt-2 text-neutral-400">
          <span>New balance</span>
          <span className="font-bold text-neutral-200">{fmt(displayBalance)} pts</span>
        </div>
        {matchLabel ? (
          <div className="pt-1 text-10px text-neutral-500">
            {meta?.usedHeuristic ? `⚠ ${matchLabel}` : `✓ ${matchLabel}`}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function StickyNextSteps({
  order,
  loyalty,
  account,
}: {
  order: Order;
  loyalty: LoyaltyTxV2 | null;
  account: LoyaltyAccountSnap | null;
}) {
  const tier = account?.tier ? asTier(account.tier) : loyalty ? asTier(loyalty.tier_at_time) : null;
  const tierCfg = tier ? LOYALTY_TIERS[tier] : null;
  const balancePoints =
    account && typeof account.balance === 'number'
      ? account.balance
      : loyalty
        ? loyalty.balance_after
        : 0;
  const tierSource = account?.tier ?? loyalty?.tier_at_time ?? 'bronze';
  const nudge = nextTierNudge(balancePoints, tierSource);
  const orderNo = safeOrderNumber(order.order_number);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const handleCopy = useCallback(() => {
    const summary = `Sofi's Restaurant • Order ${
      orderNo ? `#${orderNo}` : ''
    } • Total $${cents(order.amount_total)} • Ref ${order.id.slice(0, 8).toUpperCase()}`;
    void navigator.clipboard.writeText(summary).catch(() => {});
  }, [order.id, order.amount_total, orderNo]);

  return (
    <div className="space-y-2">
      <p className="text-10px font-bold uppercase tracking-[0.2em] text-neutral-500">
        Next visit perks
      </p>

      <div className="rounded-xl border border-white/8 bg-white/3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-white">Save your receipt</p>
            <p className="mt-1 text-xs text-neutral-500">
              If anything looks off, we can help faster with your order ID.
            </p>
          </div>
          <span className="text-xl">🧾</span>
        </div>
        <div className="mt-3 flex flex-col gap-2">
          <button
            type="button"
            onClick={handlePrint}
            className="rounded-lg bg-white/8 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/12"
          >
            Print / Save PDF
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="rounded-lg border border-white/10 bg-transparent px-3 py-2 text-xs font-semibold text-neutral-200 transition hover:border-white/20"
          >
            Copy receipt summary
          </button>
        </div>
      </div>

      {loyalty || account ? (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-amber-200">
                {tierCfg ? (
                  <>
                    {tierCfg.icon} {tierCfg.label} member perks
                  </>
                ) : (
                  <>Loyalty perks</>
                )}
              </p>
              <p className="mt-1 text-xs text-amber-200/70">
                Use points in your account anytime. Keep your streak alive to boost rewards.
              </p>
              {nudge ? (
                <p className="mt-2 text-[11px] font-semibold text-amber-300">⚡ {nudge.label}</p>
              ) : null}
            </div>
            <span className="text-xl">🎁</span>
          </div>
          <div className="mt-3 flex gap-2">
            <Link
              to="/account"
              className="flex-1 rounded-lg bg-amber-500/15 px-3 py-2 text-center text-xs font-semibold text-amber-200 transition hover:bg-amber-500/20"
            >
              View rewards
            </Link>
            <Link
              to="/menu"
              className="flex-1 rounded-lg bg-white/8 px-3 py-2 text-center text-xs font-semibold text-white transition hover:bg-white/12"
            >
              Order again
            </Link>
          </div>
        </div>
      ) : null}

      <div className="rounded-xl border border-white/8 bg-white/3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-white">Need help?</p>
            <p className="mt-1 text-xs text-neutral-500">
              We respond fast. Include your order ref for the quickest fix.
            </p>
          </div>
          <span className="text-xl">💬</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <a
            href="mailto:sofisrestaurant2022@gmail.com"
            className="rounded-lg bg-white/8 px-3 py-2 text-center text-xs font-semibold text-white transition hover:bg-white/12"
          >
            Email us
          </a>
          <Link
            to="/contact"
            className="rounded-lg border border-white/10 bg-transparent px-3 py-2 text-center text-xs font-semibold text-neutral-200 transition hover:border-white/20"
          >
            Contact form
          </Link>
        </div>
      </div>
    </div>
  );
}

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