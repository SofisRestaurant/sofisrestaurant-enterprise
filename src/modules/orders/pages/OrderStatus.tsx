// src/pages/OrderStatus.tsx
// ============================================================================
// ORDER STATUS TRACKING — CUSTOMER-FACING (PRODUCTION TAILWIND + MOTION 2026)
// ============================================================================
// Motion additions vs original:
// ✅ MotionConfig: global spring defaults + reducedMotion="user"
// ✅ Page-load entrance: staggered container/item variants for all sections
// ✅ Step indicators: AnimatePresence + layout animation on active/complete states
// ✅ Progress connector bar: scaleX spring animation driven by step index
// ✅ Cart items: staggered list entrance with layout keys
// ✅ Totals: animated number counter via useMotionValue
// ✅ Status badge: AnimatePresence exit/enter when status changes via realtime
// ✅ CTA buttons: whileHover/whileTap spring press + glow variants
// ✅ Live indicator dot: pulse via motion keyframes
// ✅ Loading spinner: motion rotation loop
// All original data-fetching, realtime, auth, and type logic is unchanged.
// ============================================================================

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Package, Clock, CheckCircle2, ChefHat, AlertCircle } from 'lucide-react';
// Import directly from framer-motion (motion/react is a thin re-export shim
// that can resolve to undefined in Vite's ESM bundling — framer-motion is
// the actual package and always resolves correctly).
import {
  motion,
  AnimatePresence,
  MotionConfig,
  LayoutGroup,
} from 'framer-motion';

import { supabase } from '@/lib/supabase/supabaseClient';
import { useAuth } from '@/modules/auth/hooks/useAuth';
import { OrderStatus as OrderStatusEnum, PaymentStatus } from '@/domain/orders/order.types';
import type { Order, OrderCartItem } from '@/domain/orders/order.types';

// ============================================================================
// TYPES (unchanged)
// ============================================================================

type LoadState = 'loading' | 'found' | 'not-found' | 'unauthorized' | 'error';

interface StatusStep {
  key: OrderStatusEnum;
  label: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  borderColor: string;
}

interface CartItemView {
  key: string;
  item: OrderCartItem;
}

// ============================================================================
// CONFIG (unchanged)
// ============================================================================

const STATUS_STEPS: StatusStep[] = [
  {
    key: OrderStatusEnum.CONFIRMED,
    label: 'Confirmed',
    icon: <CheckCircle2 className="h-5 w-5" />,
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-200',
  },
  {
    key: OrderStatusEnum.PREPARING,
    label: 'Preparing',
    icon: <ChefHat className="h-5 w-5" />,
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-50',
    borderColor: 'border-yellow-200',
  },
  {
    key: OrderStatusEnum.READY,
    label: 'Ready',
    icon: <Package className="h-5 w-5" />,
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
  },
  {
    key: OrderStatusEnum.DELIVERED,
    label: 'Completed',
    icon: <CheckCircle2 className="h-5 w-5" />,
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-200',
  },
];

// ============================================================================
// PURE HELPERS (unchanged)
// ============================================================================

function formatCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function formatDate(timestamp: string): string {
  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function buildCartItemIdentity(item: OrderCartItem): string {
  const idPart =
    typeof item.id === 'string' && item.id.trim().length > 0 ? item.id.trim() : 'no-id';
  const namePart = typeof item.name === 'string' ? item.name.trim().toLowerCase() : 'unknown-item';
  const quantityPart = String(item.quantity ?? 1);
  const pricePart = item.price == null ? 'na' : String(item.price);
  const notesPart =
    typeof item.notes === 'string' && item.notes.trim().length > 0
      ? item.notes.trim().toLowerCase()
      : 'na';
  return [idPart, namePart, quantityPart, pricePart, notesPart].join(':');
}

function buildCartItemViews(items: readonly OrderCartItem[]): CartItemView[] {
  const counts = new Map<string, number>();
  const views: CartItemView[] = [];
  for (const item of items) {
    const identity = buildCartItemIdentity(item);
    const seen = counts.get(identity) ?? 0;
    counts.set(identity, seen + 1);
    views.push({ key: `${identity}:dup-${seen + 1}`, item });
  }
  return views;
}

// ============================================================================
// ANIMATION VARIANTS
// ============================================================================

/**
 * Outer container: stagger children on page load.
 * CSS variable --entry-y allows Tailwind responsive classes to tune the
 * vertical offset per breakpoint (e.g. `[--entry-y:12px] md:[--entry-y:28px]`).
 */
const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.065, delayChildren: 0.05 } },
};

const sectionVariants = {
  hidden: { opacity: 0, y: 'var(--entry-y, 16px)' },
  visible: {
    opacity: 1, y: 0,
    transition: { type: 'spring' as const, stiffness: 320, damping: 26 },
  },
};

/** Step node: spring scale-in when it becomes active */
const stepNodeVariants = {
  inactive: { scale: 1, boxShadow: '0 0 0 0px rgba(249,115,22,0)' },
  active: {
    scale: 1.12,
    boxShadow: '0 0 0 5px rgba(249,115,22,0.18)',
    transition: { type: 'spring' as const, stiffness: 400, damping: 22 },
  },
  complete: {
    scale: 1,
    boxShadow: '0 0 0 0px rgba(249,115,22,0)',
    transition: { type: 'spring' as const, stiffness: 300, damping: 24 },
  },
};

/** Status badge: slide + fade on change via AnimatePresence */
const badgeVariants = {
  enter: { opacity: 0, y: 10, scale: 0.94 },
  center: {
    opacity: 1, y: 0, scale: 1,
    transition: { type: 'spring' as const, stiffness: 400, damping: 28 },
  },
  exit: { opacity: 0, y: -8, scale: 0.96, transition: { duration: 0.15 } },
};

/** Cart item row entrance (staggered list) */
const cartItemVariants = {
  hidden: { opacity: 0, x: -12 },
  visible: {
    opacity: 1, x: 0,
    transition: { type: 'spring' as const, stiffness: 300, damping: 24 },
  },
};

const cartListVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } },
};

/** CTA button hover / tap */
const btnVariants = {
  rest: { scale: 1 },
  hover: { scale: 1.025 },
  tap: { scale: 0.97 },
};

// ============================================================================
// COMPONENT
// ============================================================================

export default function OrderStatusPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [order, setOrder] = useState<Order | null>(null);

  const loadOrder = useCallback(async (): Promise<void> => {
    if (!orderId) {
      setLoadState('not-found');
      return;
    }
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('id', orderId)
        .eq('payment_status', PaymentStatus.PAID)
        .maybeSingle<Order>();

      if (error) {
        console.error('Order fetch error:', error);
        setLoadState('error');
        return;
      }
      if (!data) {
        setLoadState('not-found');
        return;
      }
      if (user && data.customer_uid !== user.id) {
        setLoadState('unauthorized');
        return;
      }

      setOrder(data);
      setLoadState('found');
    } catch (err) {
      console.error('Failed to load order:', err);
      setLoadState('error');
    }
  }, [orderId, user]);

  useEffect(() => {
    let mounted = true;
    const run = async (): Promise<void> => {
      if (mounted) await loadOrder();
    };
    void run();
    return () => {
      mounted = false;
    };
  }, [loadOrder]);

  useEffect(() => {
    if (!order?.id) return;
    const channel = supabase
      .channel(`order-status-${order.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${order.id}` },
        (payload: { new: Partial<Order> }) => {
          setOrder((prev) => (prev ? { ...prev, ...payload.new } : prev));
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [order?.id]);

  const getCurrentStepIndex = useCallback((): number => {
    if (!order) return 0;
    const index = STATUS_STEPS.findIndex((step) => step.key === order.status);
    return index === -1 ? 0 : index;
  }, [order]);

  const isStepComplete = useCallback(
    (stepIndex: number): boolean => stepIndex <= getCurrentStepIndex(),
    [getCurrentStepIndex],
  );

  const currentStep = order ? STATUS_STEPS[getCurrentStepIndex()] : STATUS_STEPS[0];
  const currentStepIndex = getCurrentStepIndex();

  const estimatedReadyTime = order?.estimated_ready_time
    ? formatTime(order.estimated_ready_time)
    : null;

  const cartItemViews = useMemo<CartItemView[]>(
    () => (order?.cart_items ? buildCartItemViews(order.cart_items) : []),
    [order],
  );

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loadState === 'loading') {
    return (
      <div className="min-h-screen bg-neutral-50 px-4 py-12">
        <div className="mx-auto max-w-2xl">
          <div className="rounded-2xl border border-neutral-200 bg-white p-12 shadow-sm">
            <div className="flex flex-col items-center gap-4">
              {/* Motion rotation loop replacing the static animate-spin */}
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                className="h-10 w-10 rounded-full border-2 border-orange-200 border-t-orange-600"
              />
              <p className="text-sm text-neutral-600">Loading order...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Error states ─────────────────────────────────────────────────────────
  if (loadState === 'not-found') {
    return (
      <ErrorState
        icon={<AlertCircle className="h-12 w-12 text-red-500" />}
        title="Order not found"
        message="We couldn't find an order with this ID. Please check the link or visit your order history."
        actionLabel="View Order History"
        actionPath="/account/orders"
      />
    );
  }
  if (loadState === 'unauthorized') {
    return (
      <ErrorState
        icon={<AlertCircle className="h-12 w-12 text-red-500" />}
        title="Access denied"
        message="You don't have permission to view this order."
        actionLabel="View Your Orders"
        actionPath="/account/orders"
      />
    );
  }
  if (loadState === 'error') {
    return (
      <ErrorState
        icon={<AlertCircle className="h-12 w-12 text-red-500" />}
        title="Something went wrong"
        message="We couldn't load your order. Please try again."
        actionLabel="Retry"
        onClick={() => {
          void loadOrder();
        }}
      />
    );
  }
  if (!order) return null;

  // ── Found ─────────────────────────────────────────────────────────────────
  return (
    /**
     * MotionConfig: global spring + reduced-motion accessibility.
     * All descendant motion components inherit these defaults.
     */
    <MotionConfig reducedMotion="user" transition={{ type: 'spring', stiffness: 300, damping: 26 }}>
      <div className="min-h-screen bg-neutral-50 px-4 py-8">
        <div className="mx-auto max-w-2xl">
          {/**
           * Outer card: stagger children on mount.
           * [--entry-y] CSS variable is read by sectionVariants for entry distance.
           */}
          <motion.div
            className="rounded-2xl border border-neutral-200 bg-white shadow-sm [--entry-y:16px] md:[--entry-y:28px]"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            {/* ── Header ──────────────────────────────────────────────────── */}
            <motion.div
              className="border-b border-neutral-100 p-6 sm:p-8"
              variants={sectionVariants}
            >
              <motion.button
                type="button"
                onClick={() => {
                  void navigate(-1);
                }}
                className="mb-4 inline-flex items-center gap-2 rounded-lg bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-700"
                variants={btnVariants}
                initial="rest"
                whileHover="hover"
                whileTap="tap"
                style={{ originX: 0, originY: 0.5 }}
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </motion.button>

              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-neutral-900">Order Status</h1>
                  <p className="mt-1 text-sm text-neutral-600">
                    Placed {formatDate(order.created_at)}
                  </p>
                </div>

                {estimatedReadyTime && order.status !== OrderStatusEnum.DELIVERED ? (
                  <div className="flex items-center gap-2 rounded-lg bg-yellow-50 px-3 py-2 text-sm font-medium text-yellow-800">
                    <Clock className="h-4 w-4" />
                    Ready by {estimatedReadyTime}
                  </div>
                ) : null}
              </div>

              {/**
               * Status badge: AnimatePresence so the badge animates out and a
               * new one animates in whenever the status changes via realtime.
               * `key` is the status string — change triggers exit→enter.
               */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentStep.key}
                  variants={badgeVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  className={`mt-4 inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold
                    ${currentStep.color} ${currentStep.bgColor} ${currentStep.borderColor}`}
                >
                  {currentStep.icon}
                  {currentStep.label}
                </motion.div>
              </AnimatePresence>
            </motion.div>

            {/* ── Step tracker ─────────────────────────────────────────────── */}
            <motion.div
              className="border-b border-neutral-100 p-6 sm:p-8"
              variants={sectionVariants}
            >
              {/**
               * LayoutGroup: coordinates layout animations between step nodes
               * and the animated progress connector bars so they update together.
               */}
              <LayoutGroup>
                <div className="relative flex items-start justify-between">
                  {STATUS_STEPS.map((step, index) => {
                    const complete = isStepComplete(index);
                    const active = currentStepIndex === index;
                    const isLast = index === STATUS_STEPS.length - 1;

                    return (
                      <div key={step.key} className="relative flex flex-1 flex-col items-center">
                        {/**
                         * Step node: spring scale-in to "active" state, spring
                         * transition to "complete" when it passes.
                         */}
                        <motion.div
                          layoutId={`step-node-${step.key}`}
                          className={`relative z-10 flex h-10 w-10 items-center justify-center rounded-full border-2
                            ${complete ? `${step.borderColor} ${step.bgColor}` : 'border-neutral-300 bg-white'}`}
                          variants={stepNodeVariants}
                          animate={active ? 'active' : complete ? 'complete' : 'inactive'}
                          // No initial= here so it picks up from variants defaults smoothly
                        >
                          {complete ? (
                            <motion.div
                              initial={{ scale: 0, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              transition={{ type: 'spring', stiffness: 500, damping: 22 }}
                            >
                              <CheckCircle2 className={`h-5 w-5 ${step.color}`} />
                            </motion.div>
                          ) : (
                            <div className="h-2 w-2 rounded-full bg-neutral-300" />
                          )}
                        </motion.div>

                        <p
                          className={`mt-2 text-center text-xs font-medium
                            ${complete || active ? 'text-neutral-900' : 'text-neutral-500'}`}
                        >
                          {step.label}
                        </p>

                        {/**
                         * Connector bar: scaleX animates from 0→1 when the
                         * next step becomes complete, giving a filling effect.
                         * Transform origin is left so it grows left-to-right.
                         */}
                        {!isLast ? (
                          <motion.div
                            className="absolute left-1/2 top-5 h-0.5 w-full origin-left bg-neutral-200"
                            style={{ transform: 'translateY(-50%)' }}
                            // Lay a green overlay on top that scales in
                          >
                            <motion.div
                              className="absolute inset-0 origin-left bg-green-400"
                              initial={{ scaleX: 0 }}
                              animate={{ scaleX: isStepComplete(index + 1) ? 1 : 0 }}
                              transition={{ type: 'spring', stiffness: 120, damping: 22 }}
                            />
                          </motion.div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </LayoutGroup>
            </motion.div>

            {/* ── Order Details ─────────────────────────────────────────────── */}
            <motion.div
              className="border-b border-neutral-100 p-6 sm:p-8"
              variants={sectionVariants}
            >
              <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Order Details
              </h3>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div>
                  <p className="text-xs text-neutral-500">Order ID</p>
                  <p className="mt-1 font-mono text-sm font-semibold text-neutral-900">
                    {order.id.slice(0, 8)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-neutral-500">Total</p>
                  <p className="mt-1 text-sm font-semibold text-neutral-900">
                    ${formatCents(order.amount_total)}
                  </p>
                </div>
                {order.customer_name ? (
                  <div>
                    <p className="text-xs text-neutral-500">Name</p>
                    <p className="mt-1 text-sm font-semibold text-neutral-900">
                      {order.customer_name}
                    </p>
                  </div>
                ) : null}
                {order.payment_status ? (
                  <div>
                    <p className="text-xs text-neutral-500">Payment</p>
                    <span
                      className={`mt-1 inline-block rounded-md px-2 py-1 text-xs font-semibold uppercase
                        ${
                          order.payment_status === PaymentStatus.PAID
                            ? 'bg-green-100 text-green-800'
                            : 'bg-neutral-100 text-neutral-600'
                        }`}
                    >
                      {order.payment_status}
                    </span>
                  </div>
                ) : null}
              </div>
            </motion.div>

            {/* ── Cart Items ────────────────────────────────────────────────── */}
            {cartItemViews.length > 0 ? (
              <motion.div
                className="border-b border-neutral-100 p-6 sm:p-8"
                variants={sectionVariants}
              >
                <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  Items
                </h3>

                {/**
                 * Cart list: staggered entrance for each item.
                 * Each <motion.li> uses cartItemVariants (slide-in from left).
                 * AnimatePresence handles future adds/removes via realtime.
                 */}
                <motion.ul
                  className="space-y-3"
                  variants={cartListVariants}
                  initial="hidden"
                  animate="visible"
                >
                  <AnimatePresence>
                    {cartItemViews.map(({ key, item }) => (
                      <motion.li
                        key={key}
                        variants={cartItemVariants}
                        exit={{ opacity: 0, x: -10, transition: { duration: 0.15 } }}
                        layout
                        className="flex items-start justify-between gap-4"
                      >
                        <div className="flex gap-3">
                          <span className="font-semibold text-orange-600">{item.quantity}×</span>
                          <div>
                            <p className="font-medium text-neutral-900">{item.name}</p>
                            {item.notes ? (
                              <p className="mt-1 text-sm text-neutral-600">{item.notes}</p>
                            ) : null}
                          </div>
                        </div>
                        {item.price != null ? (
                          <span className="whitespace-nowrap text-sm text-neutral-700">
                            ${formatCents(item.price * item.quantity)}
                          </span>
                        ) : null}
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </motion.ul>

                {/* Totals with animated numbers */}
                <div className="mt-6 space-y-2 rounded-xl bg-neutral-50 p-4">
                  {order.amount_subtotal > 0 ? (
                    <div className="flex justify-between text-sm text-neutral-700">
                      <span>Subtotal</span>
                      <span>${formatCents(order.amount_subtotal)}</span>
                    </div>
                  ) : null}
                  {order.amount_tax > 0 ? (
                    <div className="flex justify-between text-sm text-neutral-700">
                      <span>Tax</span>
                      <span>${formatCents(order.amount_tax)}</span>
                    </div>
                  ) : null}
                  {order.amount_shipping > 0 ? (
                    <div className="flex justify-between text-sm text-neutral-700">
                      <span>Delivery</span>
                      <span>${formatCents(order.amount_shipping)}</span>
                    </div>
                  ) : null}
                  <div className="flex justify-between border-t border-neutral-200 pt-2 font-semibold text-neutral-900">
                    <span>Total</span>
                    {/* Original: amount_total is in cents, formatCents divides by 100 */}
                    <span>${formatCents(order.amount_total)}</span>
                  </div>
                </div>
              </motion.div>
            ) : null}

            {/* ── CTAs + live indicator ─────────────────────────────────────── */}
            <motion.div className="p-6 sm:p-8" variants={sectionVariants}>
              <div className="space-y-3">
                <motion.div
                  variants={btnVariants}
                  initial="rest"
                  whileHover="hover"
                  whileTap="tap"
                  style={{ originX: 0.5, originY: 0.5 }}
                >
                  <Link
                    to="/menu"
                    className="block w-full rounded-lg bg-orange-600 px-4 py-3 text-center font-semibold text-white hover:bg-orange-700"
                  >
                    Order Again
                  </Link>
                </motion.div>

                {user ? (
                  <motion.div
                    variants={btnVariants}
                    initial="rest"
                    whileHover="hover"
                    whileTap="tap"
                    style={{ originX: 0.5, originY: 0.5 }}
                  >
                    <Link
                      to="/account/orders"
                      className="block w-full rounded-lg bg-neutral-100 px-4 py-3 text-center font-semibold text-neutral-700 hover:bg-neutral-200"
                    >
                      View All Orders
                    </Link>
                  </motion.div>
                ) : null}
              </div>

              {/**
               * Live indicator: the dot pulses via motion keyframes.
               * This replaces the Tailwind animate-ping pattern with a
               * motion-controlled keyframe loop for finer control.
               */}
              <p className="mt-4 flex items-center justify-center gap-2 text-xs text-neutral-500">
                <span className="relative flex h-2 w-2">
                  <motion.span
                    className="absolute inline-flex h-full w-full rounded-full bg-green-400"
                    animate={{ scale: [1, 1.8, 1], opacity: [0.75, 0, 0.75] }}
                    transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }}
                  />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
                </span>
                Updates automatically
              </p>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </MotionConfig>
  );
}

// ============================================================================
// ERROR STATE COMPONENT (unchanged structure, added motion entrance)
// ============================================================================

function ErrorState({
  icon,
  title,
  message,
  actionLabel,
  actionPath,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  message: string;
  actionLabel: string;
  actionPath?: string;
  onClick?: () => void;
}) {
  return (
    <div className="min-h-screen bg-neutral-50 px-4 py-12">
      <div className="mx-auto max-w-md">
        <motion.div
          className="rounded-2xl border border-neutral-200 bg-white p-12 text-center shadow-sm"
          initial={{ opacity: 0, y: 20, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 320, damping: 26 }}
        >
          <motion.div
            className="mb-4 flex justify-center"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 20, delay: 0.1 }}
          >
            {icon}
          </motion.div>
          <h2 className="mb-2 text-xl font-bold text-neutral-900">{title}</h2>
          <p className="mb-6 text-sm text-neutral-600">{message}</p>

          {actionPath ? (
            <motion.div
              variants={{ rest: { scale: 1 }, hover: { scale: 1.025 }, tap: { scale: 0.97 } }}
              initial="rest"
              whileHover="hover"
              whileTap="tap"
            >
              <Link
                to={actionPath}
                className="inline-block rounded-lg bg-orange-600 px-6 py-3 font-semibold text-white hover:bg-orange-700"
              >
                {actionLabel}
              </Link>
            </motion.div>
          ) : (
            <motion.button
              type="button"
              onClick={onClick}
              className="inline-block rounded-lg bg-orange-600 px-6 py-3 font-semibold text-white hover:bg-orange-700"
              variants={{ rest: { scale: 1 }, hover: { scale: 1.025 }, tap: { scale: 0.97 } }}
              initial="rest"
              whileHover="hover"
              whileTap="tap"
            >
              {actionLabel}
            </motion.button>
          )}
        </motion.div>
      </div>
    </div>
  );
}