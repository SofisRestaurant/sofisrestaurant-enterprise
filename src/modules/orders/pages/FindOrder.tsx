// src/modules/orders/pages/FindOrder.tsx
// ============================================================================
// TRACK YOUR ORDER — Guest order status lookup + live auto-polling
// ============================================================================
//
// Flow:
//   1. Guest submits order_number + email → get-guest-order-summary (initial)
//   2. On found=true: show status card, store credentials in ref, start polling
//   3. Every 60 s: re-call get-guest-order-summary with same credentials
//        found=true  → update card, clear stale/paused flags, record last-checked
//        found=false → keep last known card, set refreshStale=true
//        429         → stop auto-refresh, set refreshPaused=true
//        network err → keep card, set refreshStale=true
//   4. Stop polling automatically when status is terminal
//   5. Manual "Refresh status" button triggers an on-demand poll
//   6. Manual button is disabled for 30 s after any completed lookup or refresh
//   7. "Search a different order" stops polling and resets everything
//
// Polling architecture:
//   - credentialsRef      — PollCredentials stored here only; never in state/URL/storage
//   - pollIntervalRef     — setInterval handle; always cleared on reset/unmount
//   - isActivePollRef     — prevents concurrent in-flight polls
//   - isMountedRef        — guards all setState after unmount
//   - cooldownTimerRef    — setTimeout handle for manual-refresh cooldown
//   - runPollRef          — always holds the latest runPoll closure for the interval
//
// Rate-limit contract:
//   Backend: 10 requests / 15 min / IP  (guest_rate_limits table)
//   Frontend auto-poll: every 60 s  → ≤ 10 requests per 10 minutes per IP
//   Manual refresh: disabled 30 s after any completed request
//   On 429: auto-poll stops; manual refresh still available after cooldown
//
// Security contract (unchanged from previous version):
//   - Nothing stored in sessionStorage or localStorage
//   - No token issued or consumed
//   - No navigation to /order-status/:id (no order id is returned)
//   - checkout_guest_token completely untouched
//   - Error messages never reveal whether an order or email was found
//
// Wire-up: already registered in router.tsx as
//   { path: 'find-order', lazy: lazyRoute(() => import('@/modules/orders/pages/FindOrder')) }
// ============================================================================

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SyntheticEvent,
} from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence, MotionConfig } from 'framer-motion';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  CreditCard,
  Package,
  RefreshCw,
  Search,
  Wifi,
  WifiOff,
} from 'lucide-react';

import { invokeEdge, InvokeEdgeError } from '@/lib/supabase/invoke';

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Background auto-refresh interval.
 * 60 s keeps well within the backend's 10 req / 15 min / IP limit:
 *   60 s × 10 req = 600 s = 10 min — one request headroom to spare.
 */
const AUTO_REFRESH_MS = 60_000;

/**
 * How long the manual "Refresh status" button stays disabled after any
 * completed request (initial lookup or manual refresh).
 * Prevents accidental rapid-fire requests.
 */
const MANUAL_REFRESH_COOLDOWN_MS = 30_000;

/**
 * Statuses after which polling stops — the order will not advance further
 * from the guest's perspective.
 * "ready" is terminal for this limited view: the guest only needs to know
 * the order is ready; they don't need live updates beyond that point.
 */
const TERMINAL_STATUSES = new Set([
  'completed',
  'complete',
  'ready',
  'picked_up',
  'delivered',
  'cancelled',
  'canceled',
  'refunded',
]);

function isTerminalStatus(status: string): boolean {
  return TERMINAL_STATUSES.has(status.toLowerCase());
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface SafeOrderSummary {
  order_number: number;
  status: string;
  payment_status: string;
  fulfillment_type: string | null;
  pickup_time: string | null;
  created_at: string;
  updated_at: string;
}

interface GuestOrderSummaryResponse {
  ok: boolean;
  found: boolean;
  order?: SafeOrderSummary;
}

/** Stored in a ref only — never in React state, URL, or browser storage. */
interface PollCredentials {
  order_number: string;
  email: string;
}

type LookupState = 'idle' | 'busy' | 'found' | 'not-found' | 'error';

// ─── Client-side validation (UX only — not security gates) ───────────────────

function isNumericOrderNumber(v: string): boolean {
  const t = v.trim();
  return t.length > 0 && /^\d{1,8}$/.test(t);
}

function isPlausibleEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatOrderNumber(n: number): string {
  return String(n).padStart(4, '0');
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return iso;
  }
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return iso;
  }
}

function formatLastChecked(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 15_000) return 'just now';
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

// ─── Status helpers ───────────────────────────────────────────────────────────

type StatusMeta = {
  label: string;
  color: string;
  bg: string;
  border: string;
  dotColor: string;
};

function getStatusMeta(status: string): StatusMeta {
  switch (status.toLowerCase()) {
    case 'confirmed':
      return {
        label: 'Confirmed',
        color: 'text-amber-400',
        bg: 'bg-amber-500/10',
        border: 'border-amber-500/25',
        dotColor: 'bg-amber-400',
      };
    case 'preparing':
      return {
        label: 'Preparing',
        color: 'text-orange-400',
        bg: 'bg-orange-500/10',
        border: 'border-orange-500/25',
        dotColor: 'bg-orange-400',
      };
    case 'ready':
      return {
        label: 'Ready for Pickup',
        color: 'text-emerald-400',
        bg: 'bg-emerald-500/10',
        border: 'border-emerald-500/25',
        dotColor: 'bg-emerald-400',
      };
    case 'picked_up':
      return {
        label: 'Picked Up',
        color: 'text-emerald-400',
        bg: 'bg-emerald-500/10',
        border: 'border-emerald-500/25',
        dotColor: 'bg-emerald-400',
      };
    case 'delivered':
    case 'completed':
    case 'complete':
      return {
        label: 'Completed',
        color: 'text-emerald-400',
        bg: 'bg-emerald-500/10',
        border: 'border-emerald-500/25',
        dotColor: 'bg-emerald-500',
      };
    case 'cancelled':
    case 'canceled':
      return {
        label: 'Cancelled',
        color: 'text-red-400',
        bg: 'bg-red-500/10',
        border: 'border-red-500/25',
        dotColor: 'bg-red-400',
      };
    case 'refunded':
      return {
        label: 'Refunded',
        color: 'text-blue-400',
        bg: 'bg-blue-500/10',
        border: 'border-blue-500/25',
        dotColor: 'bg-blue-400',
      };
    default:
      return {
        label: status.charAt(0).toUpperCase() + status.slice(1),
        color: 'text-neutral-400',
        bg: 'bg-neutral-500/10',
        border: 'border-neutral-500/25',
        dotColor: 'bg-neutral-400',
      };
  }
}

function getPaymentMeta(status: string): { label: string; color: string } {
  switch (status.toLowerCase()) {
    case 'paid':
    case 'succeeded':
    case 'complete':
    case 'completed':
      return { label: 'Paid', color: 'text-emerald-400' };
    case 'pending':
      return { label: 'Pending', color: 'text-amber-400' };
    case 'failed':
      return { label: 'Failed', color: 'text-red-400' };
    case 'refunded':
      return { label: 'Refunded', color: 'text-blue-400' };
    default:
      return {
        label: status.charAt(0).toUpperCase() + status.slice(1),
        color: 'text-neutral-400',
      };
  }
}

function getFulfillmentLabel(type: string | null): string | null {
  if (!type) return null;
  switch (type.toLowerCase()) {
    case 'pickup':   return 'Pickup';
    case 'delivery': return 'Delivery';
    case 'dine_in':
    case 'dine-in':  return 'Dine In';
    default:         return type.charAt(0).toUpperCase() + type.slice(1);
  }
}

// ─── Animation variants ───────────────────────────────────────────────────────

const slideVariants = {
  hidden:  { opacity: 0, y: 18 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring' as const, stiffness: 340, damping: 28 },
  },
  exit:    { opacity: 0, y: -12, transition: { duration: 0.14 } },
};

const staggerContainer = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};

const fadeUp = {
  hidden:  { opacity: 0, y: 14 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring' as const, stiffness: 340, damping: 28 },
  },
};

const cardStagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06, delayChildren: 0.08 } },
};

const cardRow = {
  hidden: { opacity: 0, x: -10 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { type: 'spring' as const, stiffness: 340, damping: 28 },
  },
};

const statusBadgeVariants = {
  enter: { opacity: 0, y: 8, scale: 0.94 },
  center: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring' as const, stiffness: 400, damping: 28 },
  },
  exit: { opacity: 0, y: -6, scale: 0.96, transition: { duration: 0.12 } },
};

// ─── Primitives ───────────────────────────────────────────────────────────────

function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: ReactNode }) {
  return (
    <label
      htmlFor={htmlFor}
      className="block text-[11px] font-bold uppercase tracking-[0.18em] text-neutral-500"
    >
      {children}
    </label>
  );
}

function TextInput({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={[
        'w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3',
        'text-sm text-white placeholder:text-neutral-600',
        'transition focus:border-amber-500/50 focus:outline-none focus:ring-1 focus:ring-amber-500/30',
        'disabled:cursor-not-allowed disabled:opacity-40',
        className,
      ].join(' ')}
    />
  );
}

function SubmitButton({
  busy,
  disabled,
  children,
}: {
  busy?: boolean;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={disabled || busy}
      className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 py-3 text-sm font-bold text-neutral-950 transition hover:bg-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {busy ? (
        <span
          className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-950/25 border-t-neutral-950"
          aria-hidden="true"
        />
      ) : null}
      {children}
    </button>
  );
}

function ErrorBanner({ children }: { children: ReactNode }) {
  return (
    <motion.div
      role="alert"
      aria-live="assertive"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 28 }}
      className="flex gap-3 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300"
    >
      <AlertCircle size={15} className="mt-0.5 shrink-0 text-red-400" aria-hidden="true" />
      <span>{children}</span>
    </motion.div>
  );
}

// ─── Status card ─────────────────────────────────────────────────────────────

interface StatusCardProps {
  order: SafeOrderSummary;
  lastChecked: Date | null;
  /** A background refresh returned found=false or a non-429 network error. */
  refreshStale: boolean;
  /** The endpoint returned 429; auto-refresh has been stopped. */
  refreshPaused: boolean;
  /** A request is currently in flight. */
  isPolling: boolean;
  /** The auto-refresh interval is currently running. */
  isAutoRefreshing: boolean;
  /** Manual refresh button is in its post-request cooldown period. */
  manualCooldown: boolean;
  isTerminal: boolean;
  onManualRefresh: () => void;
}

function StatusCard({
  order,
  lastChecked,
  refreshStale,
  refreshPaused,
  isPolling,
  isAutoRefreshing,
  manualCooldown,
  isTerminal,
  onManualRefresh,
}: StatusCardProps) {
  const statusMeta = getStatusMeta(order.status);
  const paymentMeta = getPaymentMeta(order.payment_status);
  const fulfillLabel = getFulfillmentLabel(order.fulfillment_type);

  return (
    <motion.div
      variants={slideVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="overflow-hidden rounded-2xl border border-white/8 bg-white/4"
      aria-label={`Order status for order ${formatOrderNumber(order.order_number)}`}
    >
      {/* ── Header: animated status badge + order number ── */}
      <div
        className={[
          'flex items-center justify-between gap-3 px-5 py-4',
          statusMeta.bg,
          'border-b border-white/6',
        ].join(' ')}
      >
        <div className="flex items-center gap-2.5">
          {/* Pulsing dot — stops when terminal */}
          <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden="true">
            {!isTerminal ? (
              <span
                className={[
                  'absolute inline-flex h-full w-full animate-ping rounded-full opacity-60',
                  statusMeta.dotColor,
                ].join(' ')}
              />
            ) : null}
            <span
              className={[
                'relative inline-flex h-2.5 w-2.5 rounded-full',
                statusMeta.dotColor,
              ].join(' ')}
            />
          </span>

          {/* Status label animates on every status change */}
          <AnimatePresence mode="wait">
            <motion.span
              key={order.status}
              variants={statusBadgeVariants}
              initial="enter"
              animate="center"
              exit="exit"
              className={['text-sm font-bold', statusMeta.color].join(' ')}
            >
              {statusMeta.label}
            </motion.span>
          </AnimatePresence>
        </div>

        <span className="font-mono text-base md:text-sm font-bold text-white/70">
          #{formatOrderNumber(order.order_number)}
        </span>
      </div>

      {/* ── Detail rows ── */}
      <motion.dl
        className="divide-y divide-white/6 px-5"
        variants={cardStagger}
        initial="hidden"
        animate="visible"
      >
        {/* Payment */}
        <motion.div variants={cardRow} className="flex items-center justify-between gap-4 py-3.5">
          <dt className="flex items-center gap-2 text-xs text-neutral-500">
            <CreditCard size={13} aria-hidden="true" />
            Payment
          </dt>
          <dd className={['text-sm font-semibold', paymentMeta.color].join(' ')}>
            {paymentMeta.label}
          </dd>
        </motion.div>

        {/* Fulfillment type */}
        {fulfillLabel ? (
          <motion.div variants={cardRow} className="flex items-center justify-between gap-4 py-3.5">
            <dt className="flex items-center gap-2 text-xs text-neutral-500">
              <Package size={13} aria-hidden="true" />
              Fulfillment
            </dt>
            <dd className="text-sm font-semibold text-white/80">{fulfillLabel}</dd>
          </motion.div>
        ) : null}

        {/* Pickup time */}
        {order.pickup_time ? (
          <motion.div variants={cardRow} className="flex items-center justify-between gap-4 py-3.5">
            <dt className="flex items-center gap-2 text-xs text-neutral-500">
              <Clock size={13} aria-hidden="true" />
              Pickup Time
            </dt>
            <dd className="text-sm font-semibold text-white/80">{formatTime(order.pickup_time)}</dd>
          </motion.div>
        ) : null}

        {/* Order placed */}
        <motion.div variants={cardRow} className="flex items-center justify-between gap-4 py-3.5">
          <dt className="flex items-center gap-2 text-xs text-neutral-500">
            <CheckCircle2 size={13} aria-hidden="true" />
            Order Placed
          </dt>
          <dd className="text-right text-xs text-neutral-400">
            {formatDateTime(order.created_at)}
          </dd>
        </motion.div>

        {/* Last updated (from server) */}
        <motion.div variants={cardRow} className="flex items-center justify-between gap-4 py-3.5">
          <dt className="flex items-center gap-2 text-xs text-neutral-500">
            <RefreshCw size={13} aria-hidden="true" />
            Last Updated
          </dt>
          <dd className="text-right text-xs text-neutral-400">
            {formatDateTime(order.updated_at)}
          </dd>
        </motion.div>
      </motion.dl>

      {/* ── Live footer ── */}
      <div className="border-t border-white/6">
        {/* Paused / stale banners — mutually exclusive, paused takes priority */}
        <AnimatePresence>
          {refreshPaused ? (
            <motion.div
              key="paused"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.18 }}
              className="overflow-hidden"
            >
              <div className="flex items-center gap-1.5 px-5 pt-3 text-[11px] text-amber-600/80">
                <WifiOff size={11} aria-hidden="true" />
                <span>Auto-refresh paused. You can try again in a few minutes.</span>
              </div>
            </motion.div>
          ) : refreshStale ? (
            <motion.div
              key="stale"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.18 }}
              className="overflow-hidden"
            >
              <div className="flex items-center gap-1.5 px-5 pt-3 text-[11px] text-amber-600/80">
                <WifiOff size={11} aria-hidden="true" />
                <span>Unable to refresh right now. Showing the last known status.</span>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* Live indicator (left) + last-checked time (right) */}
        <div className="flex items-center justify-between gap-3 px-5 py-3">
          <div className="flex items-center gap-1.5">
            {isTerminal ? (
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-neutral-600" aria-hidden="true" />
                <span className="text-[11px] text-neutral-600">No longer updating</span>
              </>
            ) : (
              <>
                {/* Green pulse only when actively auto-refreshing and not paused */}
                <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
                  {isAutoRefreshing && !refreshPaused && !isPolling ? (
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" />
                  ) : null}
                  <span
                    className={[
                      'relative inline-flex h-2 w-2 rounded-full',
                      refreshPaused ? 'bg-neutral-600' : 'bg-emerald-500',
                    ].join(' ')}
                  />
                </span>
                <Wifi
                  size={11}
                  className={refreshPaused ? 'text-neutral-600' : 'text-emerald-600'}
                  aria-hidden="true"
                />
                <span className="text-[11px] text-neutral-500">
                  {isPolling
                    ? 'Refreshing…'
                    : refreshPaused
                      ? 'Paused'
                      : isAutoRefreshing
                        ? 'Auto-refreshing every 60 seconds'
                        : 'Live status'}
                </span>
              </>
            )}
          </div>

          {lastChecked ? (
            <span
              className="text-[11px] text-neutral-700"
              aria-label={`Last checked ${formatLastChecked(lastChecked)}`}
            >
              Checked {formatLastChecked(lastChecked)}
            </span>
          ) : null}
        </div>

        {/* Manual refresh button — hidden once terminal */}
        {!isTerminal ? (
          <div className="px-5 pb-4">
            <button
              type="button"
              onClick={onManualRefresh}
              disabled={isPolling || manualCooldown}
              className="flex items-center gap-1.5 text-[11px] font-medium text-neutral-500 transition hover:text-neutral-300 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-500/50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <RefreshCw size={11} className={isPolling ? 'animate-spin' : ''} aria-hidden="true" />
              {isPolling ? 'Refreshing…' : 'Refresh status'}
            </button>
          </div>
        ) : null}
      </div>
    </motion.div>
  );
}

// ─── Not-found notice ─────────────────────────────────────────────────────────

function NotFoundNotice() {
  return (
    <motion.div
      variants={slideVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      role="status"
      aria-live="polite"
      className="flex gap-3 rounded-xl border border-white/10 bg-white/4 px-4 py-4 text-sm leading-relaxed text-neutral-400"
    >
      <Search size={15} className="mt-0.5 shrink-0 text-neutral-600" aria-hidden="true" />
      <span>
        We couldn't find an order with those details. Check your order number and the email address
        you used at checkout.
      </span>
    </motion.div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function FindOrder() {
  // ── Form fields ─────────────────────────────────────────────────────────
  const [orderNumber, setOrderNumber] = useState('');
  const [email, setEmail] = useState('');

  // ── Lookup state ─────────────────────────────────────────────────────────
  const [lookupState, setLookupState] = useState<LookupState>('idle');
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [foundOrder, setFoundOrder] = useState<SafeOrderSummary | null>(null);

  // ── Polling state ─────────────────────────────────────────────────────────
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [refreshStale, setRefreshStale] = useState(false);
  /**
   * True when the endpoint returned 429; auto-refresh has been stopped.
   * Cleared on the next successful poll (manual or auto).
   */
  const [refreshPaused, setRefreshPaused] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  /** True while the auto-refresh interval is running. */
  const [isAutoRefreshing, setIsAutoRefreshing] = useState(false);
  /** True for MANUAL_REFRESH_COOLDOWN_MS after any completed request. */
  const [manualCooldown, setManualCooldown] = useState(false);

  // ── Refs ──────────────────────────────────────────────────────────────────
  const credentialsRef = useRef<PollCredentials | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isActivePollRef = useRef(false);
  const isMountedRef = useRef(true);
  const runPollRef = useRef<(() => Promise<void>) | null>(null);

  // ── Mount / unmount ───────────────────────────────────────────────────────

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (pollIntervalRef.current !== null) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      if (cooldownTimerRef.current !== null) {
        clearTimeout(cooldownTimerRef.current);
        cooldownTimerRef.current = null;
      }
    };
  }, []);

  // ── stopPolling ───────────────────────────────────────────────────────────

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current !== null) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    setIsAutoRefreshing(false);
  }, []);

  // ── startCooldown — disables manual refresh for MANUAL_REFRESH_COOLDOWN_MS ──

  const startCooldown = useCallback(() => {
    if (cooldownTimerRef.current !== null) {
      clearTimeout(cooldownTimerRef.current);
    }
    setManualCooldown(true);
    cooldownTimerRef.current = setTimeout(() => {
      if (isMountedRef.current) setManualCooldown(false);
      cooldownTimerRef.current = null;
    }, MANUAL_REFRESH_COOLDOWN_MS);
  }, []);

  // ── startPolling — defined after stopPolling for correct dep order ────────

  const startPolling = useCallback(() => {
    stopPolling(); // clear any pre-existing interval first
    setIsAutoRefreshing(true);
    pollIntervalRef.current = setInterval(() => {
      void runPollRef.current?.();
    }, AUTO_REFRESH_MS);
  }, [stopPolling]);

  // ── runPoll — background & manual poll (never touches lookupState) ────────

  const runPoll = useCallback(async () => {
    const creds = credentialsRef.current;
    if (!creds || isActivePollRef.current) return;

    isActivePollRef.current = true;
    if (isMountedRef.current) setIsPolling(true);

    try {
      const result = await invokeEdge<GuestOrderSummaryResponse>('get-guest-order-summary', {
        order_number: creds.order_number,
        email: creds.email,
      });

      if (!isMountedRef.current) return;

      if (result.found && result.order) {
        setFoundOrder(result.order);
        setRefreshStale(false);
        setRefreshPaused(false); // successful response clears any prior pause
        setLastChecked(new Date());

        if (isTerminalStatus(result.order.status)) {
          stopPolling();
        } else if (pollIntervalRef.current === null) {
          // Polling was stopped (e.g. after a prior 429). Restart now that the
          // endpoint is responding normally again.
          startPolling();
        }
      } else {
        // found=false on a refresh: keep last known card, surface stale warning.
        setRefreshStale(true);
      }
    } catch (err) {
      if (!isMountedRef.current) return;

      if (err instanceof InvokeEdgeError && err.status === 429) {
        // Rate-limited: stop the auto-refresh interval and show paused banner.
        // The user can still manually refresh once the cooldown expires.
        setRefreshPaused(true);
        stopPolling();
      } else {
        // Any other network / edge-function error: keep card, surface stale warning.
        setRefreshStale(true);
      }
    } finally {
      isActivePollRef.current = false;
      if (isMountedRef.current) setIsPolling(false);
    }
  }, [stopPolling, startPolling]);

  // Keep ref current so the setInterval callback always uses the latest closure.
  runPollRef.current = runPoll;

  // ── handleLookup — initial form submit ────────────────────────────────────

  const handleLookup = useCallback(
    async (e: SyntheticEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (lookupState === 'busy') return;

      // Tear down any polling / cooldown from a previous search.
      stopPolling();
      credentialsRef.current = null;

      setLookupError(null);
      setFoundOrder(null);
      setLastChecked(null);
      setRefreshStale(false);
      setRefreshPaused(false);
      setManualCooldown(false);
      if (cooldownTimerRef.current !== null) {
        clearTimeout(cooldownTimerRef.current);
        cooldownTimerRef.current = null;
      }

      setLookupState('busy');

      const submittedOrderNumber = orderNumber.trim();
      const submittedEmail = email.trim();

      try {
        const result = await invokeEdge<GuestOrderSummaryResponse>('get-guest-order-summary', {
          order_number: submittedOrderNumber,
          email: submittedEmail,
        });

        if (result.found && result.order) {
          // Stash credentials in ref only — never in state, URL, or storage.
          credentialsRef.current = {
            order_number: submittedOrderNumber,
            email: submittedEmail,
          };

          setFoundOrder(result.order);
          setLastChecked(new Date());
          setLookupState('found');

          // Disable manual refresh for 30 s after the initial lookup.
          startCooldown();

          // Begin auto-polling only if the order is still in progress.
          if (!isTerminalStatus(result.order.status)) {
            startPolling();
          }
        } else {
          setLookupState('not-found');
        }
      } catch (err) {
        if (err instanceof InvokeEdgeError) {
          if (err.status === 429) {
            setLookupError('Too many requests. Please wait a few minutes and try again.');
            setLookupState('error');
            return;
          }
          if (err.status === 400) {
            setLookupError('Please check your order number and email address and try again.');
            setLookupState('error');
            return;
          }
        }
        setLookupError('Something went wrong. Please try again in a moment.');
        setLookupState('error');
      }
    },
    [lookupState, orderNumber, email, stopPolling, startCooldown, startPolling],
  );

  // ── handleReset — wipe everything and stop polling ────────────────────────

  const handleReset = useCallback(() => {
    stopPolling();

    if (cooldownTimerRef.current !== null) {
      clearTimeout(cooldownTimerRef.current);
      cooldownTimerRef.current = null;
    }

    credentialsRef.current = null;
    setLookupState('idle');
    setLookupError(null);
    setFoundOrder(null);
    setLastChecked(null);
    setRefreshStale(false);
    setRefreshPaused(false);
    setManualCooldown(false);
  }, [stopPolling]);

  // ── handleManualRefresh — on-demand poll + cooldown ───────────────────────

  const handleManualRefresh = useCallback(async () => {
    await runPoll();
    // Start the 30 s cooldown after the request completes, whether success or failure.
    if (isMountedRef.current) startCooldown();
  }, [runPoll, startCooldown]);

  // ── Derived ───────────────────────────────────────────────────────────────

  const busy = lookupState === 'busy';
  const hasResult = lookupState === 'found' || lookupState === 'not-found';
  const submitValid = isNumericOrderNumber(orderNumber) && isPlausibleEmail(email);
  const isTerminalNow = foundOrder ? isTerminalStatus(foundOrder.status) : false;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex min-h-svh items-center justify-center bg-neutral-950 px-4 py-10 text-neutral-200">
        <div className="w-full max-w-md">
          {/* ── Card ──────────────────────────────────────────────────────── */}
          <div className="overflow-hidden rounded-2xl border border-white/8 bg-neutral-950 shadow-2xl shadow-black/60">
            {/* Amber accent line */}
            <div className="h-0.5 w-full bg-linear-to-r from-transparent via-amber-500/60 to-transparent" />

            <div className="p-6 sm:p-8">
              {/* ── Back navigation ── */}
              <Link
                to="/menu"
                className="mb-7 inline-flex items-center gap-1.5 text-xs font-medium text-neutral-600 transition hover:text-neutral-400"
              >
                <ArrowLeft size={13} />
                Back to menu
              </Link>

              {/* ── Page header (static, always visible) ── */}
              <motion.div
                variants={staggerContainer}
                initial="hidden"
                animate="visible"
                className="mb-6"
              >
                <motion.div
                  variants={fadeUp}
                  className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/15 ring-1 ring-amber-500/30"
                >
                  <Search size={19} className="text-amber-400" />
                </motion.div>

                <motion.h1
                  variants={fadeUp}
                  className="text-2xl font-bold tracking-tight text-white"
                >
                  Track Your Order
                </motion.h1>

                <motion.p
                  variants={fadeUp}
                  className="mt-2 text-sm leading-relaxed text-neutral-500"
                >
                  Enter your order number and the email address you used at checkout.
                </motion.p>
              </motion.div>

              {/* ── Lookup form (always present; fields disabled while busy) ── */}
              <motion.form
                onSubmit={handleLookup}
                noValidate
                variants={slideVariants}
                initial="hidden"
                animate="visible"
                className="space-y-4"
                aria-label="Track your order"
              >
                {/* Order number */}
                <div className="space-y-1.5">
                  <FieldLabel htmlFor="find-order-number">Order Number</FieldLabel>
                  <TextInput
                    id="find-order-number"
                    type="text"
                    inputMode="numeric"
                    placeholder="e.g. 0042"
                    value={orderNumber}
                    onChange={(e) => setOrderNumber(e.target.value.replace(/\D/g, '').slice(0, 8))}
                    autoComplete="off"
                    autoFocus
                    disabled={busy}
                    required
                    aria-describedby="order-number-hint"
                  />
                  <p
                    id="order-number-hint"
                    className="text-[11px] leading-relaxed text-neutral-600"
                  >
                    Found in your confirmation email or printed receipt.
                  </p>
                </div>

                {/* Email */}
                <div className="space-y-1.5">
                  <FieldLabel htmlFor="find-order-email">Email Used at Checkout</FieldLabel>
                  <TextInput
                    id="find-order-email"
                    type="email"
                    inputMode="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    disabled={busy}
                    required
                    aria-describedby="email-hint"
                  />
                  <p id="email-hint" className="text-[11px] leading-relaxed text-neutral-600">
                    Use the exact email you provided at checkout.
                  </p>
                </div>

                {/* Error banner (initial lookup failures only) */}
                <AnimatePresence>
                  {lookupState === 'error' && lookupError ? (
                    <ErrorBanner key="lookup-error">{lookupError}</ErrorBanner>
                  ) : null}
                </AnimatePresence>

                <SubmitButton busy={busy} disabled={!submitValid}>
                  {busy ? 'Checking…' : 'Check Status'}
                </SubmitButton>
              </motion.form>

              {/* ── Result area ── */}
              <AnimatePresence>
                {hasResult ? (
                  <motion.div
                    key="result-area"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 340, damping: 28 }}
                    className="mt-5 space-y-4"
                  >
                    <AnimatePresence mode="wait">
                      {lookupState === 'found' && foundOrder ? (
                        <StatusCard
                          key="status-card"
                          order={foundOrder}
                          lastChecked={lastChecked}
                          refreshStale={refreshStale}
                          refreshPaused={refreshPaused}
                          isPolling={isPolling}
                          isAutoRefreshing={isAutoRefreshing}
                          manualCooldown={manualCooldown}
                          isTerminal={isTerminalNow}
                          onManualRefresh={handleManualRefresh}
                        />
                      ) : (
                        <NotFoundNotice key="not-found" />
                      )}
                    </AnimatePresence>

                    <button
                      type="button"
                      onClick={handleReset}
                      className="w-full text-[11px] text-neutral-600 underline underline-offset-2 transition hover:text-neutral-400"
                    >
                      Search a different order
                    </button>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          </div>

          {/* ── Footer ────────────────────────────────────────────────────── */}
          <p className="mt-4 text-center text-[11px] text-neutral-700">
            Still need help?{' '}
            <Link
              to="/contact"
              className="underline underline-offset-2 transition hover:text-neutral-500"
            >
              Contact us
            </Link>{' '}
            and include your order number.
          </p>
        </div>
      </div>
    </MotionConfig>
  );
}