// src/pages/OrderStatus.tsx
// ============================================================================
// ORDER STATUS TRACKING — CUSTOMER-FACING
// ============================================================================
// Security model:
//   Authenticated users → invokeEdge sends Authorization: Bearer JWT
//                         automatically via supabase.auth.getSession().
//                         Realtime subscription is kept (RLS-protected).
//   Guest users         → checkout_guest_token read from sessionStorage,
//                         sent in POST body only, never in URLs or logs.
//                         Polling replaces Realtime (10-second interval).
//   Recovered guests    → guest_order_recovery_token read from sessionStorage,
//                         sent in POST body only, never in URLs or logs.
//   Server validates ownership before returning any order data.
//   Only safe tracking fields are returned (no Stripe IDs, risk data, etc.)
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, CheckCircle2, ChefHat, Clock, Package } from 'lucide-react';
import { AnimatePresence, LayoutGroup, MotionConfig, motion } from 'framer-motion';

import { useAuthState } from '@/features/auth/hooks/useAuthState';
import { invokeEdge, InvokeEdgeError } from '@/lib/supabase/invoke';
import { supabase } from '@/lib/supabase/supabaseClient';
import { OrderStatus as OrderStatusEnum, PaymentStatus } from '@/domain/orders/order.types';
import type { OrderCartItem } from '@/domain/orders/order.types';

// ============================================================================
// TYPES
// ============================================================================

type LoadState = 'loading' | 'found' | 'not-found' | 'unauthorized' | 'error';

/**
 * Safe subset of order fields returned by the get-order-status Edge Function.
 * This type intentionally excludes sensitive fields such as Stripe IDs,
 * risk scores, verification data, guest_token, customer_uid, and admin metadata.
 */
interface TrackableOrder {
  id: string;
  order_number: number | null;
  status: OrderStatusEnum;
  payment_status: PaymentStatus;
  created_at: string;
  updated_at: string;
  amount_total: number;
  amount_subtotal: number;
  amount_tax: number;
  amount_shipping: number;
  fulfillment_type: string | null;
  pickup_time: string | null;
  estimated_ready_time?: string | null;
  customer_name: string | null;
  cart_items: readonly OrderCartItem[] | null;
  notes: string | null;
}

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
// CONFIG
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

const TERMINAL_STATUSES = new Set<OrderStatusEnum>([
  OrderStatusEnum.DELIVERED,
  OrderStatusEnum.CANCELLED,
]);

const GUEST_POLL_INTERVAL_MS = 10_000;
const CHECKOUT_GUEST_TOKEN_STORAGE_KEY = 'checkout_guest_token';
const RECOVERY_TOKEN_STORAGE_KEY = 'guest_order_recovery_token';

// ============================================================================
// PURE HELPERS
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

function readSessionToken(key: string): string | null {
  try {
    const value = sessionStorage.getItem(key);
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
  } catch {
    return null;
  }
}

function removeSessionToken(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // Ignore — sessionStorage may be unavailable in some sandboxed contexts.
  }
}

/**
 * Original same-session guest checkout token.
 * Sent in POST body only. Never placed in URLs or logs.
 */
function readGuestToken(): string | null {
  return readSessionToken(CHECKOUT_GUEST_TOKEN_STORAGE_KEY);
}

/**
 * Recovery token issued by verify-guest-order-access.
 * Sent in POST body only. Never placed in URLs or logs.
 */
function readRecoveryToken(): string | null {
  return readSessionToken(RECOVERY_TOKEN_STORAGE_KEY);
}

/**
 * Remove the same-session guest token once the order is terminal.
 * This must not be called from OrderSuccess because guests need the token
 * to reach this page immediately after checkout.
 */
function clearGuestToken(): void {
  removeSessionToken(CHECKOUT_GUEST_TOKEN_STORAGE_KEY);
}

/**
 * Remove the recovered guest tracking token once the order is terminal.
 */
function clearRecoveryToken(): void {
  removeSessionToken(RECOVERY_TOKEN_STORAGE_KEY);
}

// ============================================================================
// ANIMATION VARIANTS
// ============================================================================

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.065, delayChildren: 0.05 } },
};

const sectionVariants = {
  hidden: { opacity: 0, y: 'var(--entry-y, 16px)' },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring' as const, stiffness: 320, damping: 26 },
  },
};

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

const badgeVariants = {
  enter: { opacity: 0, y: 10, scale: 0.94 },
  center: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring' as const, stiffness: 400, damping: 28 },
  },
  exit: { opacity: 0, y: -8, scale: 0.96, transition: { duration: 0.15 } },
};

const cartItemVariants = {
  hidden: { opacity: 0, x: -12 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { type: 'spring' as const, stiffness: 300, damping: 24 },
  },
};

const cartListVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } },
};

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
  const { user } = useAuthState();

  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [order, setOrder] = useState<TrackableOrder | null>(null);

  const loadOrderRef = useRef<(() => Promise<void>) | null>(null);

  const loadOrder = useCallback(async (): Promise<void> => {
    if (!orderId) {
      setLoadState('not-found');
      return;
    }

    const guestToken = readGuestToken();
    const recoveryToken = readRecoveryToken();

    try {
      const response = await invokeEdge<{ order: TrackableOrder | null }>('get-order-status', {
        order_id: orderId,
        ...(guestToken !== null ? { guest_token: guestToken } : {}),
        ...(recoveryToken !== null ? { guest_recovery_token: recoveryToken } : {}),
      });

      if (!response.order) {
        setLoadState('not-found');
        return;
      }

      setOrder(response.order);
      setLoadState('found');
    } catch (err) {
      if (err instanceof InvokeEdgeError) {
        if (err.status === 401 || err.status === 403) {
          setLoadState('unauthorized');
          return;
        }

        if (err.status === 404) {
          setLoadState('not-found');
          return;
        }
      }

      console.error('[OrderStatus] Failed to load order:', err);
      setLoadState('error');
    }
  }, [orderId]);

  loadOrderRef.current = loadOrder;

  useEffect(() => {
    let mounted = true;

    const run = async (): Promise<void> => {
      if (mounted) {
        await loadOrder();
      }
    };

    void run();

    return () => {
      mounted = false;
    };
  }, [loadOrder]);

  useEffect(() => {
    if (!order?.id) return;

    const isGuest = !user;

    if (!isGuest) {
      const channel = supabase
        .channel(`order-status-${order.id}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'orders',
            filter: `id=eq.${order.id}`,
          },
          (payload: { new: Partial<TrackableOrder> }) => {
            if (!payload?.new || typeof payload.new !== 'object') return;

            const update = payload.new;

            setOrder((prev) => {
              if (!prev) return prev;

              return {
                ...prev,
                ...(update.status !== undefined ? { status: update.status } : {}),
                ...(update.estimated_ready_time !== undefined
                  ? { estimated_ready_time: update.estimated_ready_time }
                  : {}),
                ...(update.updated_at !== undefined ? { updated_at: update.updated_at } : {}),
              };
            });
          },
        )
        .subscribe();

      return () => {
        void supabase.removeChannel(channel);
      };
    }

    if (TERMINAL_STATUSES.has(order.status)) {
      clearGuestToken();
      clearRecoveryToken();
      return;
    }

    const intervalId = setInterval(() => {
      void loadOrderRef.current?.();
    }, GUEST_POLL_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, [order?.id, order?.status, user]);

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

  if (loadState === 'loading') {
    return (
      <div className="min-h-screen bg-neutral-50 px-4 py-12">
        <div className="mx-auto max-w-2xl">
          <div className="rounded-2xl border border-neutral-200 bg-white p-12 shadow-sm">
            <div className="flex flex-col items-center gap-4">
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
        message="You don't have permission to view this order. If you placed this order as a guest and no longer have the original tracking page open, you can recover access below."
        actionLabel="View Your Orders"
        actionPath="/account/orders"
        secondaryLabel="Find My Order"
        secondaryPath="/find-order"
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

  return (
    <MotionConfig reducedMotion="user" transition={{ type: 'spring', stiffness: 300, damping: 26 }}>
      <div className="min-h-screen bg-neutral-50 px-4 py-8">
        <div className="mx-auto max-w-2xl">
          <motion.div
            className="rounded-2xl border border-neutral-200 bg-white shadow-sm [--entry-y:16px] md:[--entry-y:28px]"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
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

            <motion.div
              className="border-b border-neutral-100 p-6 sm:p-8"
              variants={sectionVariants}
            >
              <LayoutGroup>
                <div className="relative flex items-start justify-between">
                  {STATUS_STEPS.map((step, index) => {
                    const complete = isStepComplete(index);
                    const active = currentStepIndex === index;
                    const isLast = index === STATUS_STEPS.length - 1;

                    return (
                      <div key={step.key} className="relative flex flex-1 flex-col items-center">
                        <motion.div
                          layoutId={`step-node-${step.key}`}
                          className={`relative z-10 flex h-10 w-10 items-center justify-center rounded-full border-2
                            ${
                              complete
                                ? `${step.borderColor} ${step.bgColor}`
                                : 'border-neutral-300 bg-white'
                            }`}
                          variants={stepNodeVariants}
                          animate={active ? 'active' : complete ? 'complete' : 'inactive'}
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

                        {!isLast ? (
                          <motion.div
                            className="absolute left-1/2 top-5 h-0.5 w-full origin-left bg-neutral-200"
                            style={{ transform: 'translateY(-50%)' }}
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

            {cartItemViews.length > 0 ? (
              <motion.div
                className="border-b border-neutral-100 p-6 sm:p-8"
                variants={sectionVariants}
              >
                <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  Items
                </h3>

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
                    <span>${formatCents(order.amount_total)}</span>
                  </div>
                </div>
              </motion.div>
            ) : null}

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
// ERROR STATE COMPONENT
// ============================================================================

function ErrorState({
  icon,
  title,
  message,
  actionLabel,
  actionPath,
  onClick,
  secondaryLabel,
  secondaryPath,
}: {
  icon: React.ReactNode;
  title: string;
  message: string;
  actionLabel: string;
  actionPath?: string;
  onClick?: () => void;
  secondaryLabel?: string;
  secondaryPath?: string;
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
            <motion.div variants={btnVariants} initial="rest" whileHover="hover" whileTap="tap">
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
              variants={btnVariants}
              initial="rest"
              whileHover="hover"
              whileTap="tap"
            >
              {actionLabel}
            </motion.button>
          )}

          {secondaryLabel && secondaryPath ? (
            <Link
              to={secondaryPath}
              className="mt-4 inline-block text-sm text-neutral-500 underline underline-offset-2 hover:text-neutral-700"
            >
              {secondaryLabel}
            </Link>
          ) : null}
        </motion.div>
      </div>
    </div>
  );
}