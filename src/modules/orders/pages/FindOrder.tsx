// src/modules/orders/pages/FindOrder.tsx
// ============================================================================
// TRACK YOUR ORDER — Guest order status lookup (no OTP, no navigation)
// ============================================================================
//
// Single-step flow:
//   Guest enters order_number + checkout email → get-guest-order-summary
//   Response:
//     { ok: true, found: true,  order: SafeOrderSummary } → show status card
//     { ok: true, found: false }                          → show not-found msg
//
// Security contract:
//   - email is never logged.
//   - Nothing is stored in sessionStorage or localStorage.
//   - No token is issued or consumed.
//   - No navigation to /order-status/:id (no order id is returned).
//   - checkout_guest_token is completely untouched.
//   - Authenticated user flow is completely untouched.
//   - Error messages never reveal whether an order or email was found.
//
// Wire-up: already registered in router.tsx as
//   { path: 'find-order', lazy: lazyRoute(() => import('@/modules/orders/pages/FindOrder')) }
// ============================================================================

import {
  useCallback,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SyntheticEvent,
} from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence, MotionConfig } from 'framer-motion';
import {
  ArrowLeft,
  Search,
  CheckCircle2,
  Clock,
  Package,
  CreditCard,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';

import { invokeEdge, InvokeEdgeError } from '@/lib/supabase/invoke';

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

type LookupState = 'idle' | 'busy' | 'found' | 'not-found' | 'error';

// ─── Client-side validation (UX only — not security gates) ───────────────────

function isNumericOrderNumber(v: string): boolean {
  const t = v.trim();
  return t.length > 0 && /^\d{1,8}$/.test(t);
}

function isPlausibleEmail(v: string): boolean {
  const t = v.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(t);
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

// ─── Status helpers ───────────────────────────────────────────────────────────

type StatusMeta = {
  label: string;
  color: string;          // text color class
  bg: string;             // background class
  border: string;         // border class
  dotColor: string;       // pulsing dot class
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
    case 'delivered':
    case 'completed':
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

// ─── Primitives ───────────────────────────────────────────────────────────────

function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: ReactNode }) {
  return (
    <label
      htmlFor={htmlFor}
      className="block text-[11px] font-bold uppercase tracking-0.18em text-neutral-500"
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

function StatusCard({ order }: { order: SafeOrderSummary }) {
  const statusMeta = getStatusMeta(order.status);
  const paymentMeta = getPaymentMeta(order.payment_status);
  const fulfillLabel = getFulfillmentLabel(order.fulfillment_type);

  return (
    <motion.div
      key="status-card"
      variants={slideVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="overflow-hidden rounded-2xl border border-white/8 bg-white/4"
      aria-label={`Order status for order ${formatOrderNumber(order.order_number)}`}
    >
      {/* Header band */}
      <div
        className={[
          'flex items-center justify-between gap-3 px-5 py-4',
          statusMeta.bg,
          'border-b border-white/6',
        ].join(' ')}
      >
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span
              className={[
                'absolute inline-flex h-full w-full animate-ping rounded-full opacity-60',
                statusMeta.dotColor,
              ].join(' ')}
            />
            <span
              className={[
                'relative inline-flex h-2.5 w-2.5 rounded-full',
                statusMeta.dotColor,
              ].join(' ')}
            />
          </span>
          <span className={['text-sm font-bold', statusMeta.color].join(' ')}>
            {statusMeta.label}
          </span>
        </div>

        <span className="font-mono text-sm font-bold text-white/70">
          #{formatOrderNumber(order.order_number)}
        </span>
      </div>

      {/* Detail rows */}
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

        {/* Placed at */}
        <motion.div variants={cardRow} className="flex items-center justify-between gap-4 py-3.5">
          <dt className="flex items-center gap-2 text-xs text-neutral-500">
            <CheckCircle2 size={13} aria-hidden="true" />
            Order Placed
          </dt>
          <dd className="text-right text-xs text-neutral-400">
            {formatDateTime(order.created_at)}
          </dd>
        </motion.div>

        {/* Last updated */}
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
    </motion.div>
  );
}

// ─── Not-found notice ─────────────────────────────────────────────────────────

function NotFoundNotice() {
  return (
    <motion.div
      key="not-found"
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
  const [orderNumber, setOrderNumber] = useState('');
  const [email, setEmail] = useState('');
  const [lookupState, setLookupState] = useState<LookupState>('idle');
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [foundOrder, setFoundOrder] = useState<SafeOrderSummary | null>(null);

  // ── Lookup handler ────────────────────────────────────────────────────────

  const handleLookup = useCallback(
    async (e: SyntheticEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (lookupState === 'busy') return;

      setLookupError(null);
      setFoundOrder(null);
      setLookupState('busy');

      try {
        const result = await invokeEdge<GuestOrderSummaryResponse>('get-guest-order-summary', {
          order_number: orderNumber.trim(),
          email: email.trim(),
        });

        if (result.found && result.order) {
          setFoundOrder(result.order);
          setLookupState('found');
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
    [lookupState, orderNumber, email],
  );

  // ── Reset: let the user search again ─────────────────────────────────────

  const handleReset = useCallback(() => {
    setLookupState('idle');
    setLookupError(null);
    setFoundOrder(null);
  }, []);

  const busy = lookupState === 'busy';
  const hasResult = lookupState === 'found' || lookupState === 'not-found';
  const submitValid = isNumericOrderNumber(orderNumber) && isPlausibleEmail(email);

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

              {/* ── Page header ── */}
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

              {/* ── Lookup form ── */}
              <AnimatePresence mode="wait" initial={false}>
                <motion.form
                  key="lookup-form"
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
                      onChange={(e) =>
                        setOrderNumber(e.target.value.replace(/\D/g, '').slice(0, 8))
                      }
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

                  {/* Error banner */}
                  <AnimatePresence>
                    {lookupState === 'error' && lookupError ? (
                      <ErrorBanner key="lookup-error">{lookupError}</ErrorBanner>
                    ) : null}
                  </AnimatePresence>

                  {/* Submit */}
                  <SubmitButton busy={busy} disabled={!submitValid}>
                    {busy ? 'Checking…' : 'Check Status'}
                  </SubmitButton>
                </motion.form>
              </AnimatePresence>

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
                        <StatusCard key="card" order={foundOrder} />
                      ) : (
                        <NotFoundNotice key="not-found" />
                      )}
                    </AnimatePresence>

                    {/* Search again */}
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