import type { Database } from '@/types/supabase';
import type {
  CartPromotion,
  CartCredit,
  CartTotals,
  CartState,
  CartSession,
  CheckoutPayload,
  PromoValidationError,
} from '../types/cart.types';
import {
  cartItemKey,
  computeLineTotalCents,
  computeCartTotals,
} from '../types/cart.types';
import type { CartItem, CartModifier } from '../types/cart.types';

export { cartItemKey, computeLineTotalCents, computeCartTotals };

type MenuCategory = Database['public']['Enums']['menu_category'];
type RawRecord = Record<string, unknown>;

const USD_FORMATTER = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const MENU_CATEGORIES: readonly MenuCategory[] = [
  'breakfast',
  'lunch',
  'appetizers',
  'entrees',
  'specials',
  'desserts',
  'drinks',
] as const;

const PROMO_ERROR_MESSAGES: Record<PromoValidationError, string> = {
  NOT_FOUND: 'Promo code not found. Please check and try again.',
  INACTIVE: 'This promo code is not currently active.',
  EXPIRED: 'This promo code has expired.',
  LIMIT_REACHED: 'This promo code has reached its maximum number of uses.',
  USER_LIMIT_REACHED: 'You have already used this promo code the maximum number of times.',
  MIN_ORDER_NOT_MET: 'Your order total does not meet the minimum required for this code.',
  ALREADY_APPLIED: 'This promo code is already applied to your cart.',
};

const CATEGORY_DISPLAY_NAMES: Record<MenuCategory, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  appetizers: 'Appetizers',
  entrees: 'Entrées',
  specials: 'Specials',
  desserts: 'Desserts',
  drinks: 'Drinks',
};

const ORDER_TYPE_LABELS: Record<CheckoutPayload['orderType'], string> = {
  pickup: 'Pickup',
  delivery: 'Delivery',
  dine_in: 'Dine In',
};

function isRecord(value: unknown): value is RawRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toNullableString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  return toTrimmedString(value);
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function toInteger(value: unknown, minimum = 0): number | null {
  const parsed = toFiniteNumber(value);
  if (parsed === null) {
    return null;
  }

  const rounded = Math.trunc(parsed);
  return rounded >= minimum ? rounded : null;
}

function isMenuCategory(value: unknown): value is MenuCategory {
  return typeof value === 'string' && MENU_CATEGORIES.includes(value as MenuCategory);
}

function stableHashPart(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '-');
}

function deterministicPricingHash(
  menuItemId: string,
  unitPriceCents: number,
  category: MenuCategory,
  modifiers: readonly CartModifier[],
): string {
  const modifierSignature = modifiers
    .map((modifier) =>
      [
        stableHashPart(modifier.id),
        stableHashPart(modifier.groupId),
        stableHashPart(modifier.name),
        String(modifier.priceAdjustment),
      ].join(':'),
    )
    .sort()
    .join('|');

  return [
    stableHashPart(menuItemId),
    String(unitPriceCents),
    stableHashPart(category),
    modifierSignature.length > 0 ? modifierSignature : 'no-modifiers',
  ].join('::');
}

function parseRawModifier(value: unknown): CartModifier | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = toTrimmedString(value.id);
  const groupId = toTrimmedString(value.groupId);
  const name = toTrimmedString(value.name);
  const priceAdjustment = toInteger(value.priceAdjustment);

  if (id === null || groupId === null || name === null || priceAdjustment === null) {
    return null;
  }

  return {
    id,
    groupId,
    name,
    priceAdjustment,
  };
}

function parseRawModifiers(value: unknown): CartModifier[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const modifiers: CartModifier[] = [];

  for (const entry of value) {
    const modifier = parseRawModifier(entry);
    if (modifier !== null) {
      modifiers.push(modifier);
    }
  }

  return modifiers;
}

function parseRawCartItem(value: unknown): CartItem | null {
  if (!isRecord(value)) {
    return null;
  }

  const menuItemId = toTrimmedString(value.menuItemId);
  const name = toTrimmedString(value.name);
  const unitPriceCents = toInteger(value.unitPriceCents);
  const quantity = toInteger(value.quantity, 1);
  const category = isMenuCategory(value.category) ? value.category : null;

  if (
    menuItemId === null ||
    name === null ||
    unitPriceCents === null ||
    quantity === null ||
    category === null
  ) {
    return null;
  }

  const modifiers = parseRawModifiers(value.modifiers);
  const pricingHash =
    toTrimmedString(value.pricingHash) ??
    deterministicPricingHash(menuItemId, unitPriceCents, category, modifiers);

  const cartItem: CartItem = {
    menuItemId,
    name,
    pricingHash,
    unitPriceCents,
    imageUrl: toNullableString(value.imageUrl),
    category,
    modifiers,
    quantity,
    notes: toNullableString(value.notes),
    lineTotalCents: 0,
  };

  cartItem.lineTotalCents = computeLineTotalCents(cartItem);
  return cartItem;
}

function getCreditId(credit: CartCredit | null | undefined): string | null {
  return credit?.id ?? null;
}

export function formatCents(cents: number): string {
  return USD_FORMATTER.format(cents / 100);
}

export function formatCentsRaw(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function parseDollarsToCents(dollarStr: string): number {
  const parsed = Number.parseFloat(dollarStr.replace(/[^0-9.]/g, ''));
  if (Number.isNaN(parsed) || parsed < 0) {
    return 0;
  }

  return Math.round(parsed * 100);
}

export function promoErrorMessage(error: PromoValidationError): string {
  return PROMO_ERROR_MESSAGES[error];
}

export function promoSuccessMessage(promo: CartPromotion): string {
  const discount =
    promo.type === 'percent' ? `${promo.value}% off` : `${formatCents(promo.value)} off`;

  return `Code "${promo.code}" applied — ${discount} your order.`;
}

export function creditSuccessMessage(credit: CartCredit): string {
  return `Store credit applied — ${formatCents(credit.amountCents)} off your order.`;
}

export function serializeCartItems(items: CartItem[]): CartItem[] {
  return items.map((item) => {
    const normalized: CartItem = {
      ...item,
      modifiers: item.modifiers.map((modifier) => ({ ...modifier })),
      imageUrl: item.imageUrl ?? null,
      notes: item.notes ?? null,
      lineTotalCents: 0,
    };

    normalized.lineTotalCents = computeLineTotalCents(normalized);
    return normalized;
  });
}

export function deserializeCartItems(raw: unknown): CartItem[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const items: CartItem[] = [];

  for (const entry of raw) {
    const item = parseRawCartItem(entry);
    if (item !== null) {
      items.push(item);
    }
  }

  return items;
}

export function buildCartSession(
  sessionId: string,
  userId: string,
  state: CartState,
  ttlMs = 1000 * 60 * 60 * 2,
): CartSession {
  const now = Date.now();

  return {
    id: sessionId,
    userId,
    items: serializeCartItems(state.items),
    subtotalCents: state.totals.subtotalCents,
    discountCents: state.totals.discountCents,
    taxCents: state.totals.taxCents,
    totalCents: state.totals.totalCents,
    promoId: state.promotion?.id ?? null,
    creditId: getCreditId(state.credit),
    expiresAt: new Date(now + ttlMs).toISOString(),
    createdAt: new Date(now).toISOString(),
  };
}

export function buildCheckoutPayload(
  state: CartState,
  orderType: CheckoutPayload['orderType'],
  notes: string | null = null,
  taxRate = 0.095,
): CheckoutPayload {
  const items = serializeCartItems(state.items);
  const totals = computeCartTotals(items, state.promotion, state.credit, taxRate);

  return {
    items,
    promoId: state.promotion?.id ?? null,
    creditId: getCreditId(state.credit),
    totals,
    orderType,
    notes: notes?.trim() ?? null,
  };
}

export function categoryDisplayName(category: MenuCategory): string {
  return CATEGORY_DISPLAY_NAMES[category];
}

export function groupCartItemsByCategory(items: CartItem[]): Map<MenuCategory, CartItem[]> {
  const grouped = new Map<MenuCategory, CartItem[]>();

  for (const category of MENU_CATEGORIES) {
    const group = items.filter((item) => item.category === category);
    if (group.length > 0) {
      grouped.set(category, group);
    }
  }

  return grouped;
}

export function totalItemCount(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}

export function findCartItem(
  items: CartItem[],
  menuItemId: string,
  modifiers: Pick<CartModifier, 'id'>[],
): CartItem | undefined {
  const modifierIds = modifiers.map((modifier) => ({ id: modifier.id }));
  const lookupKey = cartItemKey(menuItemId, modifierIds);

  return items.find((item) => {
    const itemModifierIds = item.modifiers.map((modifier) => ({ id: modifier.id }));
    return cartItemKey(item.menuItemId, itemModifierIds) === lookupKey;
  });
}

export function isItemInCart(items: CartItem[], menuItemId: string): boolean {
  return items.some((item) => item.menuItemId === menuItemId);
}

export function itemQuantityInCart(items: CartItem[], menuItemId: string): number {
  return items
    .filter((item) => item.menuItemId === menuItemId)
    .reduce((sum, item) => sum + item.quantity, 0);
}

export interface CartTotalsDisplay {
  subtotal: string;
  discount: string | null;
  credit: string | null;
  tax: string;
  total: string;
  savings: string | null;
}

export function formatCartTotals(totals: CartTotals): CartTotalsDisplay {
  const hasDiscount = totals.discountCents > 0;
  const hasCredit = totals.creditCents > 0;
  const totalSavings = totals.discountCents + totals.creditCents;

  return {
    subtotal: formatCents(totals.subtotalCents),
    discount: hasDiscount ? `-${formatCents(totals.discountCents)}` : null,
    credit: hasCredit ? `-${formatCents(totals.creditCents)}` : null,
    tax: formatCents(totals.taxCents),
    total: formatCents(totals.totalCents),
    savings: totalSavings > 0 ? formatCents(totalSavings) : null,
  };
}

export function formatLineItemBreakdown(item: CartItem): string {
  const base = formatCents(item.unitPriceCents);
  const pricedModifiers = item.modifiers.filter((modifier) => modifier.priceAdjustment !== 0);

  if (pricedModifiers.length === 0) {
    return base;
  }

  const breakdown = pricedModifiers
    .map((modifier) => {
      const prefix = modifier.priceAdjustment >= 0 ? '+' : '-';
      return `${prefix}${formatCents(Math.abs(modifier.priceAdjustment))} (${modifier.name})`;
    })
    .join(', ');

  return `${base} ${breakdown}`;
}

export function orderTypeLabel(type: CheckoutPayload['orderType']): string {
  return ORDER_TYPE_LABELS[type];
}

export function shouldSyncCart(items: CartItem[], userId: string | null | undefined): boolean {
  if (typeof userId !== 'string' || userId.trim().length === 0) {
    return false;
  }

  if (items.length === 0) {
    return false;
  }

  return !items.some((item) => item.unitPriceCents <= 0);
}

export function isCartSessionValid(session: CartSession, userId: string): boolean {
  if (session.userId !== userId) {
    return false;
  }

  if (session.items.length === 0) {
    return false;
  }

  if (session.expiresAt === null) {
    return true;
  }

  const expiresAtMs = Date.parse(session.expiresAt);
  if (!Number.isFinite(expiresAtMs)) {
    return false;
  }

  return expiresAtMs > Date.now();
}

export function modifierSummary(modifiers: CartModifier[]): string {
  return modifiers.map((modifier) => modifier.name).join(', ');
}

export function totalModifierAdjustment(modifiers: CartModifier[]): number {
  return modifiers.reduce((sum, modifier) => sum + modifier.priceAdjustment, 0);
}