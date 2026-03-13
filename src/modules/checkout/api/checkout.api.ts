// src/features/checkout/checkout.api.ts
// =============================================================================
// CHECKOUT API — ENTERPRISE GRADE (PRODUCTION READY, 2026)
// =============================================================================
// Contract:
// - Frontend NEVER calculates discounts, promo values, tax, or totals.
// - Frontend ONLY sends: item IDs + quantities + notes/modifiers + pricing_hash
//   plus optional promo_code + credit_id.
// - Server (Edge Function create-checkout) returns Stripe session { id, url }.
// =============================================================================

import { invokeEdge } from '@/lib/supabase/invoke';
import { supabase } from '@/lib/supabase/supabaseClient';
import { LOYALTY_TIERS, TIER_ORDER } from '@/domain/loyalty/tiers';
import type { LoyaltyTier } from '@/domain/loyalty/tiers';
import type {
  CheckoutData,
  CheckoutSession,
} from '@/modules/checkout/types/checkout.types';

export { LOYALTY_TIERS };
export type { LoyaltyTier };

// =============================================================================
// CONFIG
// =============================================================================

const CHECKOUT_CONFIG = {
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 1_000,
  TIMEOUT_MS: 30_000,
  MAX_ITEMS: 100,
  MAX_QTY_PER_ITEM: 100,
  MAX_NAME_LEN: 200,
  MAX_PHONE_LEN: 50,
  MAX_NOTES_LEN: 500,
  DEVICE_FINGERPRINT_MAX_LEN: 256,
  REQUEST_ID_MAX_LEN: 128,
} as const;

// =============================================================================
// ERRORS
// =============================================================================

export class CheckoutValidationError extends Error {
  public readonly field?: string;

  constructor(message: string, field?: string) {
    super(message);
    this.name = 'CheckoutValidationError';
    this.field = field;
  }
}

export class CheckoutNetworkError extends Error {
  public readonly retryable: boolean;

  constructor(message: string, retryable = true) {
    super(message);
    this.name = 'CheckoutNetworkError';
    this.retryable = retryable;
  }
}

export class CheckoutRateLimitError extends Error {
  public readonly retryAfterMs?: number;

  constructor(message: string, retryAfterMs?: number) {
    super(message);
    this.name = 'CheckoutRateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

export class CheckoutPromoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CheckoutPromoError';
  }
}

export class CheckoutCreditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CheckoutCreditError';
  }
}

// =============================================================================
// TYPES
// =============================================================================

export interface LoyaltyProfile {
  points: number;
  lifetimePoints: number;
  tier: LoyaltyTier;
  streak: number;
  lastOrderDate: string | null;
}

export interface LoyaltyPreview {
  pointsToEarn: number;
  basePoints: number;
  tierMultiplier: number;
  streakMultiplier: number;
  tier: LoyaltyTier;
  streak: number;
  currentBalance: number;
  balanceAfter: number;
  willExtendStreak: boolean;
  pointsToNextTier: number | null;
  willLevelUp: boolean;
}

export interface ServerDiscount {
  promo_code?: string;
  promo_cents?: number;
  credit_cents?: number;
  total_discount?: number;
  subtotal_cents: number;
  tax_cents: number;
  grand_total: number;
}

export interface UserCredit {
  id: string;
  amount_cents: number;
  source: string;
  expires_at: string | null;
  created_at: string;
}

type UnknownRecord = Record<string, unknown>;

type CheckoutModifierSelection = {
  id: string;
  groupId?: string | null;
};

type InvokeEdgeOptions = {
  headers?: Record<string, string>;
};

type CheckoutRequestItem = {
  id: string;
  quantity: number;
  notes: string | null;
  modifiers: CheckoutModifierSelection[];
  pricing_hash?: string;
};

type CheckoutRequestBody = {
  request_id: string;
  items: CheckoutRequestItem[];
  order_type: 'pickup' | 'delivery' | 'dine_in';
  notes: string | null;
  success_url: string;
  cancel_url: string;
  promo_code?: string;
  promo_id?: string;
  credit_id?: string;
};

type CheckoutPayloadExtras = {
  promoCode?: string;
  creditId?: string;
  promoId?: string;
};

type InvokeErrorShape = {
  status?: number;
  message?: string;
  details?: unknown;
};

// =============================================================================
// UTILITIES
// =============================================================================

function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asUnknownRecord(value: unknown): UnknownRecord {
  return isRecord(value) ? value : {};
}

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function asNumber(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : Number.NaN;
  return Number.isFinite(n) ? n : fallback;
}

function clampString(value: string, maxLen: number): string {
  return value.length > maxLen ? value.slice(0, maxLen) : value;
}

function sanitizeRequestId(value: string): string {
  const compact = value.replace(/[^a-zA-Z0-9._:-]/g, '');
  return clampString(compact || crypto.randomUUID(), CHECKOUT_CONFIG.REQUEST_ID_MAX_LEN);
}

function tryParseRetryAfterMs(details: unknown): number | undefined {
  const record = asUnknownRecord(details);
  const raw =
    record.retryAfterMs ??
    record.retry_after_ms ??
    asUnknownRecord(record.details).retryAfterMs ??
    asUnknownRecord(record.details).retry_after_ms;

  const parsed = asNumber(raw, Number.NaN);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function toErrorMessage(err: unknown, fallback = 'Request failed'): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;

  if (isRecord(err)) {
    if (typeof err.message === 'string' && err.message.trim()) {
      return err.message;
    }
    if (typeof err.error === 'string' && err.error.trim()) {
      return err.error;
    }

    const details = asUnknownRecord(err.details);
    if (typeof details.message === 'string' && details.message.trim()) {
      return details.message;
    }
    if (typeof details.error === 'string' && details.error.trim()) {
      return details.error;
    }
  }

  return fallback;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function sanitizePromo(code: string): string {
  return code.trim().toUpperCase();
}

function looksLikeUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => reject(new Error('Request timeout')), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutHandle !== undefined) {
      clearTimeout(timeoutHandle);
    }
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isRetryableMessage(msg: string): boolean {
  return /(timeout|network|fetch|econn|enotfound|503|502|504|temporarily|try again)/i.test(msg);
}

function parseCheckoutSessionResponse(payload: unknown): { id: string; url: string } {
  if (!isRecord(payload)) {
    throw new Error('Invalid checkout response');
  }

  const id = asString(payload.sessionId ?? payload.id).trim();
  const url = asString(payload.url).trim();

  if (!id || !url) {
    throw new Error('Invalid checkout response: missing id/url');
  }

  return { id, url };
}

function extractCartItemId(item: unknown): string {
  if (!isRecord(item)) return '';

  const raw =
    item.item_id ??
    item.id ??
    item.menu_item_id ??
    item.menuItemId ??
    item.menuItemID ??
    '';

  return asString(raw).trim();
}

function extractOrderType(payload: CheckoutData): 'pickup' | 'delivery' | 'dine_in' {
  const record = asUnknownRecord(payload);
  const raw = asString(record.orderType ?? record.order_type).trim().toLowerCase();

  if (raw === 'pickup' || raw === 'delivery' || raw === 'dine_in') {
    return raw;
  }

  return 'pickup';
}

function extractTopLevelNotes(payload: CheckoutData): string | null {
  const record = asUnknownRecord(payload);
  const notes = asString(
    record.notes ?? record.orderNotes ?? record.special_instructions,
  ).trim();

  return notes ? clampString(notes, CHECKOUT_CONFIG.MAX_NOTES_LEN) : null;
}

function getDeviceFingerprintHeaderValue(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const nav = window.navigator;
    const screenInfo = window.screen;

    const raw = [
      nav.userAgent ?? '',
      nav.language ?? '',
      String(screenInfo?.width ?? ''),
      String(screenInfo?.height ?? ''),
      String(new Date().getTimezoneOffset()),
      window.location.hostname ?? '',
    ].join('|');

    const value = raw.trim();
    return value
      ? clampString(value, CHECKOUT_CONFIG.DEVICE_FINGERPRINT_MAX_LEN)
      : null;
  } catch {
    return 'unknown-device';
  }
}

function makeCheckoutHeaders(idempotencyKey: string): Record<string, string> {
  const fingerprint = getDeviceFingerprintHeaderValue();

  return {
    'x-idempotency-key': idempotencyKey,
    ...(fingerprint ? { 'x-device-fingerprint': fingerprint } : {}),
  };
}

async function safeInvokeEdge<T>(
  fnName: string,
  body: Record<string, unknown>,
  options?: InvokeEdgeOptions,
): Promise<T> {
  return invokeEdge<T>(fnName, body, options);
}

function isCheckoutDataLike(payload: CheckoutData): payload is CheckoutData {
  return Array.isArray(payload.items) && typeof payload.successUrl === 'string';
}

// =============================================================================
// VALIDATION
// =============================================================================

function validateCheckoutData(payload: CheckoutData): void {
  if (!isCheckoutDataLike(payload)) {
    throw new CheckoutValidationError('Invalid checkout payload');
  }

  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    throw new CheckoutValidationError('Cart is empty', 'items');
  }

  if (payload.items.length > CHECKOUT_CONFIG.MAX_ITEMS) {
    throw new CheckoutValidationError('Too many items', 'items');
  }

  const email = payload.customer?.email ?? '';
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new CheckoutValidationError('Invalid email', 'email');
  }

  if (!payload.successUrl || !payload.cancelUrl) {
    throw new CheckoutValidationError('Missing redirect URLs');
  }
}

// =============================================================================
// LOYALTY
// =============================================================================

export async function getLoyaltyProfile(): Promise<LoyaltyProfile | null> {
  try {
    const sessionRes = await supabase.auth.getSession();
    const userId = sessionRes.data.session?.user?.id;
    if (!userId) return null;

    const { data, error } = await supabase
      .from('profiles')
      .select('loyalty_points, lifetime_points, loyalty_tier, loyalty_streak, last_order_date')
      .eq('id', userId)
      .single();

    if (error || !data) return null;

    return {
      points: asNumber(data.loyalty_points, 0),
      lifetimePoints: asNumber(data.lifetime_points, 0),
      tier: (data.loyalty_tier ?? 'bronze') as LoyaltyTier,
      streak: asNumber(data.loyalty_streak, 0),
      lastOrderDate: asString(data.last_order_date, '') || null,
    };
  } catch {
    return null;
  }
}

export async function getAvailableCredits(): Promise<UserCredit[]> {
  try {
    const sessionRes = await supabase.auth.getSession();
    const userId = sessionRes.data.session?.user?.id;
    if (!userId) return [];

    const { data, error } = await supabase
      .from('user_credits')
      .select('id, amount_cents, source, expires_at, created_at')
      .eq('user_id', userId)
      .eq('used', false)
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      .order('created_at', { ascending: true });

    if (error || !data) return [];

    return data.map((row) => ({
      id: asString(row.id),
      amount_cents: asNumber(row.amount_cents, 0),
      source: asString(row.source),
      expires_at: asString(row.expires_at).trim() || null,
      created_at: asString(row.created_at),
    }));
  } catch {
    return [];
  }
}

export function calculatePointsPreview(
  amountCents: number,
  profile: LoyaltyProfile | null,
): LoyaltyPreview {
  const tier: LoyaltyTier = profile?.tier ?? 'bronze';
  const streak = profile?.streak ?? 0;
  const balance = profile?.points ?? 0;
  const lifetime = profile?.lifetimePoints ?? 0;

  const tierConfig = LOYALTY_TIERS[tier];
  const basePoints = Math.max(Math.floor(amountCents / 100), 0);
  const tierMultiplier = tierConfig.multiplier;

  const nextStreak = streak + 1;
  const streakMultiplier =
    nextStreak >= 30 ? 1.5 : nextStreak >= 7 ? 1.25 : nextStreak >= 3 ? 1.1 : 1.0;

  const pointsToEarn = Math.max(Math.floor(basePoints * tierMultiplier * streakMultiplier), 0);
  const balanceAfter = balance + pointsToEarn;

  const currentIndex = TIER_ORDER.indexOf(tier);
  const nextTier = currentIndex < TIER_ORDER.length - 1 ? TIER_ORDER[currentIndex + 1] : null;
  const nextTierThreshold = nextTier ? LOYALTY_TIERS[nextTier].threshold : null;
  const pointsToNextTier =
    nextTierThreshold !== null ? Math.max(nextTierThreshold - lifetime, 0) : null;
  const willLevelUp = nextTierThreshold !== null && lifetime + pointsToEarn >= nextTierThreshold;

  const today = new Date().toISOString().slice(0, 10);
  const willExtendStreak = profile?.lastOrderDate !== today;

  return {
    pointsToEarn,
    basePoints,
    tierMultiplier,
    streakMultiplier,
    tier,
    streak,
    currentBalance: balance,
    balanceAfter,
    willExtendStreak,
    pointsToNextTier,
    willLevelUp,
  };
}

// =============================================================================
// CHECKOUT HELPERS
// =============================================================================

function normalizeModifiersForCheckout(input: unknown): CheckoutModifierSelection[] {
  const out: CheckoutModifierSelection[] = [];
  if (!Array.isArray(input)) return out;

  for (const entry of input) {
    if (!isRecord(entry)) continue;

    const directId = asString(entry.id).trim();
    const directGroupId = asString(entry.groupId ?? entry.group_id).trim() || null;

    if (directId) {
      out.push({ id: directId, groupId: directGroupId });
      continue;
    }

    const selections = entry.selections;
    const selectionGroupId = asString(entry.groupId ?? entry.group_id).trim() || null;

    if (Array.isArray(selections)) {
      for (const selection of selections) {
        if (typeof selection === 'string') {
          const selectionId = selection.trim();
          if (selectionId) {
            out.push({ id: selectionId, groupId: selectionGroupId });
          }
          continue;
        }

        if (isRecord(selection)) {
          const selectionId = asString(selection.id ?? selection.modifier_id).trim();
          const selectionResolvedGroupId =
            asString(selection.groupId ?? selection.group_id).trim() || selectionGroupId;

          if (selectionId) {
            out.push({ id: selectionId, groupId: selectionResolvedGroupId });
          }
        }
      }
      continue;
    }

    const modifierId = asString(entry.modifier_id).trim();
    if (modifierId) {
      out.push({ id: modifierId, groupId: directGroupId });
    }
  }

  const seen = new Set<string>();
  return out.filter((item) => {
    const key = `${item.groupId ?? ''}:${item.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildCheckoutRequestBody(
  payload: CheckoutData & CheckoutPayloadExtras,
  requestId: string,
): CheckoutRequestBody {
  const secureItems: CheckoutRequestItem[] = payload.items.map((item) => {
    const itemId = extractCartItemId(item);
    const itemRecord = asUnknownRecord(item);
    const pricingHash = asString(itemRecord.pricing_hash ?? itemRecord.pricingHash).trim();

    const quantity = Math.max(
      1,
      Math.min(CHECKOUT_CONFIG.MAX_QTY_PER_ITEM, Math.round(asNumber(itemRecord.quantity, 1))),
    );

    const notes = asString(
      itemRecord.notes ??
        itemRecord.special_instructions ??
        itemRecord.specialInstructions,
    ).trim();

    return {
      id: itemId,
      quantity,
      notes: notes ? clampString(notes, CHECKOUT_CONFIG.MAX_NOTES_LEN) : null,
      modifiers: normalizeModifiersForCheckout(itemRecord.modifiers),
      ...(pricingHash ? { pricing_hash: pricingHash } : {}),
    };
  });

  const hasInvalidModifiers = secureItems.some((item) =>
    item.modifiers.some((modifier) => !modifier.id),
  );

  if (hasInvalidModifiers) {
    throw new CheckoutValidationError('Invalid modifier payload', 'items');
  }

  if (secureItems.some((item) => !item.id)) {
    throw new CheckoutValidationError('Invalid cart item payload (missing item id)', 'items');
  }

  const requestBody: CheckoutRequestBody = {
    request_id: requestId,
    items: secureItems,
    order_type: extractOrderType(payload),
    notes: extractTopLevelNotes(payload),
    success_url: payload.successUrl,
    cancel_url: payload.cancelUrl,
  };

  if (payload.promoCode?.trim()) {
    requestBody.promo_code = sanitizePromo(payload.promoCode);
  }

  if (payload.promoId?.trim()) {
    requestBody.promo_id = payload.promoId.trim();
  }

  if (payload.creditId?.trim()) {
    const creditId = payload.creditId.trim();
    if (!looksLikeUuid(creditId)) {
      throw new CheckoutValidationError('Invalid credit id format', 'creditId');
    }
    requestBody.credit_id = creditId;
  }

  return requestBody;
}

function classifyInvokeError(err: unknown): InvokeErrorShape {
  if (!isRecord(err)) {
    return {};
  }

  return {
    status: typeof err.status === 'number' ? err.status : undefined,
    message: typeof err.message === 'string' ? err.message : undefined,
    details: err.details,
  };
}

// =============================================================================
// CORE: createCheckoutSession
// =============================================================================

export async function createCheckoutSession(
  payload: CheckoutData & CheckoutPayloadExtras,
): Promise<CheckoutSession> {
  const start = Date.now();
  const requestId = sanitizeRequestId(crypto.randomUUID());

  console.group(`🛒 CHECKOUT SESSION [${requestId}]`);

  try {
    validateCheckoutData(payload);

    const emailRaw = asString(payload.customer?.email).trim();
    if (!emailRaw) {
      throw new CheckoutValidationError('Missing customer email', 'email');
    }

    const email = normalizeEmail(emailRaw);
    const requestBody = buildCheckoutRequestBody(payload, requestId);
    
    const idempotencyKey = crypto.randomUUID();

    console.log('📨 create-checkout payload preview', {
      requestId,
      email,
      idempotencyKey,
      order_type: requestBody.order_type,
      notes: requestBody.notes,
      items: requestBody.items.map((item) => ({
        id: item.id,
        quantity: item.quantity,
        hasHash: Boolean(item.pricing_hash),
        modifierCount: item.modifiers.length,
      })),
      promo_code: requestBody.promo_code ?? null,
      promo_id: requestBody.promo_id ?? null,
      credit_id: requestBody.credit_id ?? null,
    });

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= CHECKOUT_CONFIG.MAX_RETRIES; attempt += 1) {
      try {
        console.log(`🔄 Attempt ${attempt}/${CHECKOUT_CONFIG.MAX_RETRIES}`);

        const raw = await withTimeout(
          safeInvokeEdge<unknown>('create-checkout', requestBody, {
            headers: makeCheckoutHeaders(idempotencyKey),
          }),
          CHECKOUT_CONFIG.TIMEOUT_MS,
        );

        const { id, url } = parseCheckoutSessionResponse(raw);

        console.log('✅ Session created:', id);
        console.log('⏱️', Date.now() - start, 'ms');
        console.groupEnd();

        return { id, url, status: 'open' };
      } catch (err: unknown) {
        const invokeError = classifyInvokeError(err);
        const msg = toErrorMessage(err, 'Checkout failed');
        lastError = err instanceof Error ? err : new Error(msg);

        const retryAfterMs = tryParseRetryAfterMs(invokeError.details);

        if (
          invokeError.status === 429 ||
          /too many|rate limit|429/i.test(msg)
        ) {
          throw new CheckoutRateLimitError('Too many checkout attempts', retryAfterMs);
        }

        if (invokeError.status === 422 && /promo|code|coupon/i.test(msg)) {
          throw new CheckoutPromoError(msg);
        }

        if (invokeError.status === 422 && /credit/i.test(msg)) {
          throw new CheckoutCreditError(msg);
        }

        if (invokeError.status === 400 || invokeError.status === 422) {
          throw new CheckoutValidationError(msg);
        }

        if (err instanceof CheckoutValidationError) {
          throw err;
        }

        const retryable =
          invokeError.status === 502 ||
          invokeError.status === 503 ||
          invokeError.status === 504 ||
          isRetryableMessage(msg);

        if (!retryable) {
          console.error('❌ Non-retryable checkout failure', {
            requestId,
            status: invokeError.status ?? null,
            msg,
          });
          throw new CheckoutNetworkError(msg, false);
        }

        if (attempt < CHECKOUT_CONFIG.MAX_RETRIES) {
          const delay = CHECKOUT_CONFIG.RETRY_DELAY_MS * Math.pow(2, attempt - 1);
          console.warn(`⚠️ Retry in ${delay}ms`);
          await sleep(delay);
        }
      }
    }

    throw lastError ?? new Error('Checkout failed');
  } catch (err: unknown) {
    console.error('❌ Checkout failed:', err);
    console.groupEnd();

    if (
      err instanceof CheckoutValidationError ||
      err instanceof CheckoutNetworkError ||
      err instanceof CheckoutRateLimitError ||
      err instanceof CheckoutPromoError ||
      err instanceof CheckoutCreditError
    ) {
      throw err;
    }

    throw new CheckoutNetworkError(toErrorMessage(err, 'Checkout failed'), true);
  }
}

// =============================================================================
// REDIRECT
// =============================================================================

export function redirectToCheckout(session: CheckoutSession): void {
  window.location.assign(session.url);
}