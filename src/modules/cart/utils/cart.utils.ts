// =============================================================================
// src/features/cart/cart.utils.ts
// Cart utility functions — pure, side-effect-free
//
// Covers:
//   - Currency formatting
//   - Cart item serialization / deserialization (DB JSON ↔ CartItem[])
//   - Promo validation error messages (for UI display)
//   - Cart summary helpers (group by category, find item, etc.)
//   - Order type display labels
//   - Checkout payload builder
//   - Cart persistence guards
// =============================================================================
import type { Database } from '@/types/supabase'
import type {
  CartPromotion,
  CartCredit,
  CartTotals,
  CartState,
  CartSession,
  CheckoutPayload,
  PromoValidationError,
} from '../types/cart.types'
import {
  cartItemKey,
  computeLineTotalCents,
  computeCartTotals,
} from '../types/cart.types'
import type { CartItem, CartModifier } from '../types/cart.types'
// ─────────────────────────────────────────────────────────────────────────────
// Re-exports for convenience — consumers can import everything from cart.utils
// ─────────────────────────────────────────────────────────────────────────────

export { cartItemKey, computeLineTotalCents, computeCartTotals }

// ─────────────────────────────────────────────────────────────────────────────
// Currency formatting
// ─────────────────────────────────────────────────────────────────────────────

const USD_FORMATTER = new Intl.NumberFormat('en-US', {
  style:                 'currency',
  currency:              'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/**
 * Formats a cent value as a USD currency string.
 * @example formatCents(1050) → "$10.50"
 * @example formatCents(0)    → "$0.00"
 */
export function formatCents(cents: number): string {
  return USD_FORMATTER.format(cents / 100)
}

/**
 * Formats a cent value as a compact display string without the dollar sign.
 * Useful for inputs and editable fields.
 * @example formatCentsRaw(1050) → "10.50"
 */
export function formatCentsRaw(cents: number): string {
  return (cents / 100).toFixed(2)
}

/**
 * Parses a dollar string (from an input) → cents integer.
 * Returns 0 on invalid input.
 * @example parseDollarsToCents("10.50") → 1050
 * @example parseDollarsToCents("abc")   → 0
 */
export function parseDollarsToCents(dollarStr: string): number {
  const parsed = parseFloat(dollarStr.replace(/[^0-9.]/g, ''))
  if (isNaN(parsed) || parsed < 0) return 0
  return Math.round(parsed * 100)
}

// ─────────────────────────────────────────────────────────────────────────────
// Promo validation error → human-readable message
// ─────────────────────────────────────────────────────────────────────────────

const PROMO_ERROR_MESSAGES: Record<PromoValidationError, string> = {
  NOT_FOUND:         'Promo code not found. Please check and try again.',
  INACTIVE:          'This promo code is not currently active.',
  EXPIRED:           'This promo code has expired.',
  LIMIT_REACHED:     'This promo code has reached its maximum number of uses.',
  USER_LIMIT_REACHED:'You have already used this promo code the maximum number of times.',
  MIN_ORDER_NOT_MET: 'Your order total does not meet the minimum required for this code.',
  ALREADY_APPLIED:   'This promo code is already applied to your cart.',
}

/**
 * Returns a user-facing error message for a promo validation failure.
 */
export function promoErrorMessage(error: PromoValidationError): string {
  return PROMO_ERROR_MESSAGES[error]
}

/**
 * Returns a user-facing success message for an applied promotion.
 */
export function promoSuccessMessage(promo: CartPromotion): string {
  const discount =
    promo.type === 'percent'
      ? `${promo.value}% off`
      : `${formatCents(promo.value)} off`
  return `Code "${promo.code}" applied — ${discount} your order.`
}

// ─────────────────────────────────────────────────────────────────────────────
// Cart item serialization
// Converts CartItem[] ↔ the JSON stored in pending_carts.items and orders.cart_items
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Serializes CartItem[] to the JSON shape stored in the DB.
 * Recomputes lineTotalCents on the way out to guard against stale values.
 */
export function serializeCartItems(items: CartItem[]): CartItem[] {
  return items.map((i) => ({
    ...i,
    lineTotalCents: computeLineTotalCents(i),
  }))
}

/**
 * Deserializes raw JSON from pending_carts.items or orders.cart_items → CartItem[].
 * Validates each item's shape and recomputes lineTotalCents.
 * Silently drops malformed entries.
 */
export function deserializeCartItems(raw: unknown): CartItem[] {
  if (!Array.isArray(raw)) return []

  return raw.reduce<CartItem[]>((acc, item) => {
    if (!isRawCartItem(item)) return acc

    const modifiers = Array.isArray(item.modifiers)
      ? (item.modifiers as unknown[]).reduce<CartModifier[]>((mAcc, m) => {
          if (isRawModifier(m)) mAcc.push(m as CartModifier)
          return mAcc
        }, [])
      : []

    const cartItem: CartItem = {
      menuItemId:     String(item.menuItemId),
      name:           String(item.name),
      pricingHash: crypto.randomUUID(),
      unitPriceCents: Number(item.unitPriceCents),
      imageUrl:       item.imageUrl != null ? String(item.imageUrl) : null,
      category:       item.category as Database['public']['Enums']['menu_category'],
      modifiers,
      quantity:       Math.max(1, Number(item.quantity)),
      notes:          item.notes != null ? String(item.notes) : null,
      lineTotalCents: 0, // computed below
    }
    cartItem.lineTotalCents = computeLineTotalCents(cartItem)

    acc.push(cartItem)
    return acc
  }, [])
}

// Runtime shape guards

function isRawCartItem(v: unknown): v is Record<string, unknown> {
  if (typeof v !== 'object' || v === null) return false
  const r = v as Record<string, unknown>
  return (
    typeof r['menuItemId']     === 'string' &&
    typeof r['name']           === 'string' &&
    typeof r['unitPriceCents'] === 'number' &&
    typeof r['quantity']       === 'number' &&
    typeof r['category']       === 'string'
  )
}

function isRawModifier(v: unknown): v is CartModifier {
  if (typeof v !== 'object' || v === null) return false
  const r = v as Record<string, unknown>
  return (
    typeof r['id']              === 'string' &&
    typeof r['groupId']         === 'string' &&
    typeof r['name']            === 'string' &&
    typeof r['priceAdjustment'] === 'number'
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// CartSession builder
// Converts in-memory CartState → CartSession for Supabase upsert
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds a CartSession (pending_carts row shape) from the current in-memory state.
 */
export function buildCartSession(
  sessionId: string,
  userId:    string,
  state:     CartState,
  ttlMs      = 1000 * 60 * 60 * 2, // 2 hours default
): CartSession {
  return {
    id:             sessionId,
    userId,
    items:          serializeCartItems(state.items),
    subtotalCents:  state.totals.subtotalCents,
    discountCents:  state.totals.discountCents,
    taxCents:       state.totals.taxCents,
    totalCents:     state.totals.totalCents,
    promoId:        state.promotion?.id  ?? null,
    creditId:       state.credit?.id     ?? null,
    expiresAt:      new Date(Date.now() + ttlMs).toISOString(),
    createdAt:      new Date().toISOString(),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Checkout payload builder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Builds the payload sent to the Stripe / checkout Edge Function.
 * Recomputes totals from scratch to prevent tampered local state from
 * reaching the server — the server should still verify independently.
 */
export function buildCheckoutPayload(
  state:     CartState,
  orderType: CheckoutPayload['orderType'],
  notes:     string | null = null,
  taxRate    = 0.0825,
): CheckoutPayload {
  const items  = serializeCartItems(state.items)
  const totals = computeCartTotals(items, state.promotion, state.credit, taxRate)

  return {
    items,
    promoId:   state.promotion?.id ?? null,
    creditId:  state.credit?.id    ?? null,
    totals,
    orderType,
    notes,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cart summary helpers
// ─────────────────────────────────────────────────────────────────────────────

type MenuCategory = Database['public']['Enums']['menu_category']

const CATEGORY_DISPLAY_NAMES: Record<MenuCategory, string> = {
  breakfast:  'Breakfast',
  lunch:      'Lunch',
  appetizers: 'Appetizers',
  entrees:    'Entrées',
  specials:   'Specials',
  desserts:   'Desserts',
  drinks:     'Drinks',
}

/**
 * Returns the human-readable display name for a menu category.
 */
export function categoryDisplayName(category: MenuCategory): string {
  return CATEGORY_DISPLAY_NAMES[category] ?? category
}

/**
 * Groups CartItem[] by category, in the canonical enum order.
 * Categories with no items are omitted.
 */
const CATEGORY_ORDER: MenuCategory[] = [
  'breakfast',
  'lunch',
  'appetizers',
  'entrees',
  'specials',
  'desserts',
  'drinks',
]

export function groupCartItemsByCategory(
  items: CartItem[],
): Map<MenuCategory, CartItem[]> {
  const map = new Map<MenuCategory, CartItem[]>()

  for (const cat of CATEGORY_ORDER) {
    const group = items.filter((i) => i.category === cat)
    if (group.length > 0) map.set(cat, group)
  }

  return map
}

/**
 * Returns the total quantity across all items in the cart.
 */
export function totalItemCount(items: CartItem[]): number {
  return items.reduce((sum, i) => sum + i.quantity, 0)
}

/**
 * Finds a cart item by its deduplication key.
 * Returns undefined if not found.
 */
export function findCartItem(
  items:       CartItem[],
  menuItemId:  string,
  modifiers:   Pick<CartModifier, 'id'>[],
): CartItem | undefined {
  const key = cartItemKey(menuItemId, modifiers)
  return items.find((i) => cartItemKey(i.menuItemId, i.modifiers) === key)
}

/**
 * Returns true if a specific menu item (regardless of modifiers) is in the cart.
 */
export function isItemInCart(items: CartItem[], menuItemId: string): boolean {
  return items.some((i) => i.menuItemId === menuItemId)
}

/**
 * Returns the total quantity of a specific menu item across all modifier variants.
 */
export function itemQuantityInCart(items: CartItem[], menuItemId: string): number {
  return items
    .filter((i) => i.menuItemId === menuItemId)
    .reduce((sum, i) => sum + i.quantity, 0)
}

// ─────────────────────────────────────────────────────────────────────────────
// Totals display helpers
// ─────────────────────────────────────────────────────────────────────────────

export interface CartTotalsDisplay {
  subtotal:  string
  discount:  string | null  // null when no discount
  credit:    string | null  // null when no credit
  tax:       string
  total:     string
  savings:   string | null  // formatted combined savings, null if none
}

/**
 * Converts CartTotals → display-ready formatted strings.
 */
export function formatCartTotals(totals: CartTotals): CartTotalsDisplay {
  const hasDiscount = totals.discountCents > 0
  const hasCredit   = totals.creditCents   > 0
  const totalSavings = totals.discountCents + totals.creditCents

  return {
    subtotal: formatCents(totals.subtotalCents),
    discount: hasDiscount ? `-${formatCents(totals.discountCents)}` : null,
    credit:   hasCredit   ? `-${formatCents(totals.creditCents)}`   : null,
    tax:      formatCents(totals.taxCents),
    total:    formatCents(totals.totalCents),
    savings:  totalSavings > 0 ? formatCents(totalSavings) : null,
  }
}

/**
 * Formats a single CartItem's line total with modifier breakdown.
 * Returns e.g. "$12.00 + $1.50 (Extra Cheese)" if modifiers are priced.
 */
export function formatLineItemBreakdown(item: CartItem): string {
  const base    = formatCents(item.unitPriceCents)
  const extras = item.modifiers.filter((m: CartModifier) => m.priceAdjustment !== 0)

  if (!extras.length) return base

  const breakdown = extras
    .map((m: CartModifier) => `+${formatCents(m.priceAdjustment)} (${m.name})`)
    .join(', ')

  return `${base} ${breakdown}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Order type display
// ─────────────────────────────────────────────────────────────────────────────

const ORDER_TYPE_LABELS: Record<CheckoutPayload['orderType'], string> = {
  pickup:   'Pickup',
  delivery: 'Delivery',
  dine_in:  'Dine In',
}

export function orderTypeLabel(type: CheckoutPayload['orderType']): string {
  return ORDER_TYPE_LABELS[type]
}

// ─────────────────────────────────────────────────────────────────────────────
// Persistence guards
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true if the cart should be synced to Supabase.
 * Guards against syncing empty carts, guest carts, or carts with no prices.
 */
export function shouldSyncCart(
  items:   CartItem[],
  userId:  string | null | undefined,
): boolean {
  if (!userId)           return false
  if (items.length === 0) return false
  if (items.some((i) => i.unitPriceCents <= 0)) return false
  return true
}

/**
 * Returns true if a CartSession fetched from Supabase is still valid
 * (not expired, has items, and belongs to the expected user).
 */
export function isCartSessionValid(
  session: CartSession,
  userId:  string,
): boolean {
  if (session.userId !== userId)          return false
  if (!session.items.length)              return false
  if (session.expiresAt == null)          return true
  return new Date(session.expiresAt).getTime() > Date.now()
}

// ─────────────────────────────────────────────────────────────────────────────
// Modifier summary
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns a compact comma-separated string of selected modifier names.
 * Used for cart line item previews.
 * @example modifierSummary([{name: "Extra Cheese"}, {name: "No Onions"}]) → "Extra Cheese, No Onions"
 */
export function modifierSummary(modifiers: CartModifier[]): string {
  return modifiers.map((m) => m.name).join(', ')
}

/**
 * Returns the total price adjustment from all selected modifiers, in cents.
 */
export function totalModifierAdjustment(modifiers: CartModifier[]): number {
  return modifiers.reduce((sum, m) => sum + m.priceAdjustment, 0)
}