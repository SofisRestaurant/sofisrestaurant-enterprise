// =============================================================================
// src/modules/checkout/hooks/useCheckout.ts
// CHECKOUT HOOK — Production (2026)
// =============================================================================
// - Single source of truth for checkout state
// - Timeout + stale-request protection
// - Delegates transport + payload normalization to createCheckoutSession()
// - Keeps frontend totals as local telemetry only (server remains authoritative)
// - Supports promo code / promo id / credit id / loyalty intent passthrough
// - Strict runtime guards and production-safe state transitions
// =============================================================================

import { useCallback, useMemo, useRef, useState } from 'react';
import { useCart } from '@/modules/cart/hooks/useCart';
import { createCheckoutSession } from '@/modules/checkout/api/checkout.api';
import type { CheckoutData } from '@/modules/checkout/types/checkout.types';

type OrderType = 'pickup' | 'delivery' | 'dine_in';

export type CheckoutArgs = {
  customer_uid: string;
  email?: string | null;
  name?: string | null;
  phone?: string | null;

  promo_code?: string;
  promo_id?: string;
  credit_id?: string;

  orderType?: OrderType;
  notes?: string | null;
  idempotencyKey?: string;

  loyalty?: {
    applyPoints?: boolean;
    pointsToRedeem?: number;
    loyaltyAccountId?: string;
  };
};

type CheckoutTotals = {
  subtotalCents: number;
  discountCents: number;
  creditCents: number;
  taxCents: number;
  totalCents: number;
};

type CheckoutState = {
  isLoading: boolean;
  error: string | null;
  errorCode: string | null;
  canRetry: boolean;
  retryAfter: number;
};

type CheckoutSuccess = {
  ok: true;
  sessionId: string;
  url: string;
  status: string;
  frontendTotals: CheckoutTotals;
};

type JsonRecord = Record<string, unknown>;
type CheckoutItem = CheckoutData['items'][number];
type CreateCheckoutPayload = Parameters<typeof createCheckoutSession>[0];

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_NOTES_LEN = 1_200;
const MAX_REDEEM_POINTS = 1_000_000;

// ─────────────────────────────────────────────────────────────────────────────
// Checkout lock — persists across page refreshes
// Prevents duplicate Stripe sessions when the user refreshes during payment.
// TTL matches Stripe's session expiry (30 min).
// ─────────────────────────────────────────────────────────────────────────────

const CHECKOUT_LOCK_KEY = 'sofis.checkout.lock.v1';
const CHECKOUT_LOCK_TTL_MS = 30 * 60 * 1000;

type CheckoutLock = { sessionId: string; expiresAt: number };

export function writeCheckoutLock(sessionId: string): void {
  try {
    localStorage.setItem(
      CHECKOUT_LOCK_KEY,
      JSON.stringify({ sessionId, expiresAt: Date.now() + CHECKOUT_LOCK_TTL_MS }),
    );
  } catch { /* localStorage unavailable */ }
}

export function readCheckoutLock(): CheckoutLock | null {
  try {
    const raw = localStorage.getItem(CHECKOUT_LOCK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed !== 'object' || parsed === null ||
      typeof (parsed as CheckoutLock).sessionId !== 'string' ||
      typeof (parsed as CheckoutLock).expiresAt !== 'number'
    ) return null;
    const lock = parsed as CheckoutLock;
    if (Date.now() > lock.expiresAt) {
      localStorage.removeItem(CHECKOUT_LOCK_KEY);
      return null;
    }
    return lock;
  } catch { return null; }
}

export function clearCheckoutLock(): void {
  try { localStorage.removeItem(CHECKOUT_LOCK_KEY); } catch { /* ignore */ }
}

export function clearCheckoutFormState(): void {
  try {
    localStorage.removeItem('sofis.checkout.orderType.v1');
    localStorage.removeItem('sofis.checkout.notes.v1');
    localStorage.removeItem('sofis.checkout.promo.v1');
    localStorage.removeItem('sofis.checkout.credit.v1');
  } catch { /* ignore */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// Runtime helpers
// ─────────────────────────────────────────────────────────────────────────────

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): JsonRecord {
  return isRecord(value) ? value : {};
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : Number.NaN;

  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampInt(value: unknown, min: number, max: number): number {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : Number.NaN;

  if (!Number.isFinite(parsed)) {
    return min;
  }

  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function normalizePromoCode(value?: string | null): string | null {
  const normalized = (value ?? '').trim();
  return normalized || null;
}

function normalizeId(value?: string | null): string | null {
  const normalized = (value ?? '').trim();
  return normalized || null;
}

function normalizeNotes(value?: string | null): string | null {
  const normalized = (value ?? '').trim();
  if (!normalized) {
    return null;
  }

  return normalized.length > MAX_NOTES_LEN
    ? normalized.slice(0, MAX_NOTES_LEN)
    : normalized;
}

function normalizeEmail(value?: string | null): string | null {
  const normalized = (value ?? '').trim().toLowerCase();
  return normalized || null;
}

function isOrderType(value: unknown): value is OrderType {
  return value === 'pickup' || value === 'delivery' || value === 'dine_in';
}

function getOrderType(value: unknown): OrderType {
  return isOrderType(value) ? value : 'pickup';
}

function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function getItemId(item: unknown): string {
  const record = asRecord(item);

  return asString(
    record.id ??
      record.menuItemId ??
      record.menu_item_id ??
      record.item_id ??
      record.menuItemID,
  ).trim();
}

function moneyToCents(value: string): number {
  const cleaned = value.replace(/[^0-9.]/g, '');
  const parsed = Number(cleaned);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return Math.round(parsed * 100);
}

function deriveFrontendTotals(
  items: unknown,
  subtotalFormatted: string,
  totalFormatted: string,
): CheckoutTotals {
  const subtotalFromUi = moneyToCents(subtotalFormatted);
  const totalFromUi = moneyToCents(totalFormatted);

  const totals: CheckoutTotals = {
    subtotalCents: subtotalFromUi,
    discountCents: 0,
    creditCents: 0,
    taxCents: Math.max(0, totalFromUi - subtotalFromUi),
    totalCents: totalFromUi,
  };

  if (!Array.isArray(items)) {
    return totals;
  }

  let summedLineTotals = 0;

  for (const item of items) {
    const record = asRecord(item);
    const lineTotalCents = asNumber(record.lineTotalCents, Number.NaN);

    if (Number.isFinite(lineTotalCents)) {
      summedLineTotals += Math.max(0, Math.round(lineTotalCents));
    }
  }

  if (summedLineTotals > 0) {
    totals.subtotalCents = summedLineTotals;
    totals.taxCents = Math.max(0, totals.totalCents - totals.subtotalCents);
  }

  return totals;
}

function buildCheckoutUrls(): { successUrl: string; cancelUrl: string } {
  if (typeof window === 'undefined') {
    return {
      successUrl: '/order-success?session_id={CHECKOUT_SESSION_ID}',
      cancelUrl: '/order-canceled',
    };
  }

 const origin =
  typeof window !== 'undefined'
    ? window.location.origin
    : 'https://sofisrestaurant-enterprise.vercel.app';

  return {
    successUrl: `${origin}/order-success?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${origin}/order-canceled`,
  };
}

function normalizeCheckoutItems(items: unknown[]): CheckoutItem[] {
  const normalized: CheckoutItem[] = [];

  for (const rawItem of items) {
    if (!isRecord(rawItem)) {
      continue;
    }

    const itemId = getItemId(rawItem);
    if (!itemId) {
      continue;
    }

    normalized.push(rawItem as unknown as CheckoutItem);
  }

  return normalized;
}

function setPayloadField(
  payload: CreateCheckoutPayload,
  key: string,
  value: unknown,
): void {
  (payload as unknown as JsonRecord)[key] = value;
}

function buildCheckoutPayload(
  items: unknown[],
  args: CheckoutArgs,
  frontendTotals: CheckoutTotals,
): CreateCheckoutPayload {
  const email = normalizeEmail(args.email);
  if (!email || !looksLikeEmail(email)) {
    throw new Error('A valid email is required for checkout.');
  }

  const normalizedItems = normalizeCheckoutItems(items);
  if (normalizedItems.length === 0) {
    throw new Error('Your cart is empty.');
  }

  const { successUrl, cancelUrl } = buildCheckoutUrls();

  const payload: CreateCheckoutPayload = {
    items: normalizedItems,
    customer: {
      customer_uid: args.customer_uid,
      email,
      name: normalizeNotes(args.name) ?? '',
      phone: normalizeNotes(args.phone) ?? '',
    },
    successUrl,
    cancelUrl,
  };

  const orderType = getOrderType(args.orderType);
  const notes = normalizeNotes(args.notes);
  const promoCode = normalizePromoCode(args.promo_code);
  const promoId = normalizeId(args.promo_id);
  const creditId = normalizeId(args.credit_id);
  const idempotencyKey = normalizeId(args.idempotencyKey);

  setPayloadField(payload, 'orderType', orderType);
  setPayloadField(payload, 'notes', notes);
  setPayloadField(payload, 'frontendTotals', frontendTotals);

  if (promoCode) {
    setPayloadField(payload, 'promoCode', promoCode);
  }

  if (promoId) {
    setPayloadField(payload, 'promoId', promoId);
  }

  if (creditId) {
    setPayloadField(payload, 'creditId', creditId);
  }

  if (idempotencyKey) {
    setPayloadField(payload, 'idempotencyKey', idempotencyKey);
  }

  if (args.loyalty) {
    setPayloadField(payload, 'loyalty', {
      applyPoints: Boolean(args.loyalty.applyPoints),
      pointsToRedeem: clampInt(args.loyalty.pointsToRedeem, 0, MAX_REDEEM_POINTS),
      loyaltyAccountId: normalizeId(args.loyalty.loyaltyAccountId) ?? undefined,
    });
  }

  return payload;
}

function toErrorMessage(error: unknown, fallback = 'Checkout failed'): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (typeof error === 'string' && error.trim()) {
    return error;
  }

  if (isRecord(error)) {
    if (typeof error.message === 'string' && error.message.trim()) {
      return error.message;
    }

    if (typeof error.error === 'string' && error.error.trim()) {
      return error.error;
    }

    const details = asRecord(error.details);
    if (typeof details.message === 'string' && details.message.trim()) {
      return details.message;
    }

    if (typeof details.error === 'string' && details.error.trim()) {
      return details.error;
    }
  }

  return fallback;
}

function inferErrorCode(error: unknown): string | null {
  if (isRecord(error)) {
    if (typeof error.code === 'string' && error.code.trim()) {
      return error.code;
    }

    const details = asRecord(error.details);
    if (typeof details.code === 'string' && details.code.trim()) {
      return details.code;
    }
  }

  const message = toErrorMessage(error, '').toLowerCase();

  if (!message) {
    return null;
  }

  if (message.includes('empty')) return 'EMPTY_CART';
  if (message.includes('timeout')) return 'TIMEOUT';
  if (message.includes('rate')) return 'RATE_LIMITED';
  if (message.includes('promo')) return 'PROMO_INVALID';
  if (message.includes('credit')) return 'CREDIT_INVALID';
  if (message.includes('email')) return 'EMAIL_INVALID';
  if (message.includes('item')) return 'ITEMS_INVALID';

  return null;
}

function inferRetryAfterMs(error: unknown): number {
  if (!isRecord(error)) {
    return 0;
  }

  const details = asRecord(error.details);
  const direct = asNumber(error.retryAfterMs ?? error.retry_after_ms, Number.NaN);
  const nested = asNumber(details.retryAfterMs ?? details.retry_after_ms, Number.NaN);

  if (Number.isFinite(direct) && direct > 0) {
    return Math.round(direct);
  }

  if (Number.isFinite(nested) && nested > 0) {
    return Math.round(nested);
  }

  return 0;
}

function shouldAllowRetry(error: unknown): boolean {
  const message = toErrorMessage(error, '').toLowerCase();
  const code = inferErrorCode(error)?.toLowerCase() ?? '';

  if (code === 'empty_cart' || code === 'email_invalid' || code === 'items_invalid') {
    return false;
  }

  if (
    message.includes('invalid email') ||
    message.includes('missing item') ||
    message.includes('cart is empty')
  ) {
    return false;
  }

  return true;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let handle: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    handle = setTimeout(() => {
      reject(new Error('Checkout timed out. Please try again.'));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (handle !== null) {
      clearTimeout(handle);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useCheckout() {
  const { items, subtotalFormatted, totalFormatted } = useCart();

  const [state, setState] = useState<CheckoutState>({
    isLoading: false,
    error: null,
    errorCode: null,
    canRetry: false,
    retryAfter: 0,
  });

  const requestRunIdRef = useRef(0);

  const canCheckout = useMemo(() => Array.isArray(items) && items.length > 0, [items]);

  const reset = useCallback(() => {
    requestRunIdRef.current += 1;
    setState({
      isLoading: false,
      error: null,
      errorCode: null,
      canRetry: false,
      retryAfter: 0,
    });
  }, []);

  const checkout = useCallback(
    async (args: CheckoutArgs): Promise<CheckoutSuccess> => {
      if (!canCheckout) {
        const error = new Error('Your cart is empty.');
        setState({
          isLoading: false,
          error: error.message,
          errorCode: 'EMPTY_CART',
          canRetry: false,
          retryAfter: 0,
        });
        throw error;
      }

      const runId = requestRunIdRef.current + 1;
      requestRunIdRef.current = runId;

      setState({
        isLoading: true,
        error: null,
        errorCode: null,
        canRetry: false,
        retryAfter: 0,
      });

      try {
        const frontendTotals = deriveFrontendTotals(items, subtotalFormatted, totalFormatted);
        const payload = buildCheckoutPayload(items as unknown[], args, frontendTotals);

        const session = await withTimeout(
          createCheckoutSession(payload),
          DEFAULT_TIMEOUT_MS,
        );

        if (requestRunIdRef.current !== runId) {
          throw new Error('Checkout request was superseded by a newer attempt.');
        }

        if (!session.url || !session.id) {
          throw new Error('Stripe checkout URL missing.');
        }

        writeCheckoutLock(session.id);

        return {
          ok: true,
          sessionId: session.id,
          url: session.url,
          status: session.status,
          frontendTotals,
        };
      } catch (error: unknown) {
        if (requestRunIdRef.current === runId) {
          setState({
            isLoading: false,
            error: toErrorMessage(error, 'Checkout failed'),
            errorCode: inferErrorCode(error),
            canRetry: shouldAllowRetry(error),
            retryAfter: inferRetryAfterMs(error),
          });
        }

        throw error;
      } finally {
        if (requestRunIdRef.current === runId) {
          setState((current) => ({
            ...current,
            isLoading: false,
          }));
        }
      }
    },
    [canCheckout, items, subtotalFormatted, totalFormatted],
  );

  const redirectToCheckout = useCallback(async (args: CheckoutArgs): Promise<void> => {
    const result = await checkout(args);
    window.location.assign(result.url);
  }, [checkout]);

  return {
    checkout,
    redirectToCheckout,
    reset,
    canCheckout,
    isLoading: state.isLoading,
    error: state.error,
    errorCode: state.errorCode,
    canRetry: state.canRetry,
    retryAfter: state.retryAfter,
    cartItemCount: Array.isArray(items) ? items.length : 0,
    hasItemsWithInvalidIds: Array.isArray(items)
      ? items.some((item) => getItemId(item).length === 0)
      : false,
  };
}