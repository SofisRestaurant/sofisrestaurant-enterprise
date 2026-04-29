// =============================================================================
// src/modules/cart/store/cart.store.ts
// Cart store — Zustand + persist middleware (production-ready, attack-resistant)
//
// Security model:
//  - safeStorage: measures JSON size before every localStorage.setItem.
//    Aborts write silently if payload exceeds MAX_STORAGE_BYTES (200 KB).
//    Prevents QuotaExceededError from crashing the app.
//
//  - sanitizeItemsForPersist: called inside partialize before every write.
//    Enforces MAX_ITEMS, MAX_MODIFIERS_PER_ITEM, and strips any item with
//    invalid quantity or unitPriceCents. This is the storage gate — no
//    oversized or corrupt data can reach localStorage regardless of how
//    state was written (including raw setState() calls from devtools/attacks).
//
//  - onRehydrateStorage: revalidates items read back from localStorage.
//    Guards against data written by older app versions.
//
//  - All write actions (addItem, updateQuantity) go through clampQuantity
//    and computeLineTotalCents — they never trust caller-supplied totals.
//
//  - sessionId enforced via requireSessionId() on all remote sync paths.
//  - sessionId never persisted (excluded from partialize).
//
// ABANDONED CART FIXES:
//
//   BUG 3 — email never written:
//     flushSyncToSupabase() now reads supabase.auth.getUser() and writes
//     email to abandoned_cart_sessions. The read is fire-and-forget inside
//     the abandoned cart upsert, so it never blocks the main sync path.
//     For guest sessions, email in abandoned_cart_sessions will remain null
//     (guest email is on pending_carts.guest_email; growth.service.ts enriches
//     it at read time).
//
//   BUG 4 — item_count not a DB column:
//     item_count does NOT exist in abandoned_cart_sessions. We do NOT write it
//     here. growth.service.ts derives item_count from pending_carts.items at
//     fetch time. No schema change required.
//
//   BUG 5 — recovered never updated:
//     clearSupabaseCart() now also updates abandoned_cart_sessions
//     recovered = true for the same session id. This is called by
//     OrderSuccess.tsx after a successful checkout, closing the recovery loop.
//     The update is best-effort (non-fatal on error) so it never blocks cart
//     clearing or order confirmation flow.
// =============================================================================

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { supabase } from '@/lib/supabase/supabaseClient';
import { requireSessionId } from '@/security/auth/sessionId';
import type { Database, Json } from '@/types/supabase';

import {
  cartItemKey,
  computeCartTotals,
  computeLineTotalCents,
  type CartCredit,
  type CartItem,
  type CartPromotion,
  type CartState,
  type CartTotals,
  type PromoValidationResult,
  type PromotionRow,
} from '../types/cart.types';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const TAX_RATE            = 0.095;
const PERSIST_KEY         = 'sofis-cart-v1';
const SYNC_DEBOUNCE       = 600;
const PENDING_CART_TTL_MS = 2 * 60 * 60 * 1000;
const DEFAULT_CURRENCY    = 'USD';
const MAX_ITEM_QUANTITY   = 20;
const MAX_NOTES_LENGTH    = 1200;

/** Hard cap applied before every localStorage write. 200 KB leaves headroom
 *  for other keys while preventing QuotaExceededError on any realistic cart. */
const MAX_STORAGE_BYTES = 200_000;

/** Maximum cart line items — enforced in partialize and onRehydrateStorage. */
const MAX_ITEMS = 200;

/** Maximum modifiers per line item — enforced in partialize. */
const MAX_MODIFIERS_PER_ITEM = 40;

type UnknownRecord   = Record<string, unknown>;
type PendingCartInsert = Database['public']['Tables']['pending_carts']['Insert'];
type AbandonedCartSessionInsert =
  Database['public']['Tables']['abandoned_cart_sessions']['Insert'];

// ─────────────────────────────────────────────────────────────────────────────
// Safe localStorage wrapper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Drop-in replacement for localStorage that measures payload size before
 * writing. If the serialised value exceeds MAX_STORAGE_BYTES the write is
 * silently skipped — the app keeps running with stale persisted state rather
 * than crashing with QuotaExceededError.
 *
 * This is the outermost defense layer. sanitizeItemsForPersist (below) is the
 * inner layer that prevents oversized payloads from being formed in the first
 * place; safeStorage is the last-resort catch for anything that slips through.
 */
const safeStorage: Storage = {
  getItem:    (key)        => localStorage.getItem(key),
  removeItem: (key)        => localStorage.removeItem(key),
  setItem:    (key, value) => {
    if (typeof value === 'string' && value.length > MAX_STORAGE_BYTES) {
      console.warn(
        `[cart.store] Skipping localStorage write for "${key}": ` +
        `payload ${value.length} bytes exceeds ${MAX_STORAGE_BYTES} byte limit.`,
      );
      return;
    }
    try {
      localStorage.setItem(key, value);
    } catch (err) {
      // Catch any quota error that slips past the size check (e.g. other keys
      // have filled storage since the check ran).
      console.warn('[cart.store] localStorage.setItem failed:', err);
    }
  },
  clear:  () => localStorage.clear(),
  key:    (n) => localStorage.key(n),
  get length() { return localStorage.length; },
};

// ─────────────────────────────────────────────────────────────────────────────
// Persist sanitizer — runs before every localStorage write
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validates and caps a single CartItem for persistence.
 * Returns null if the item has invalid pricing or identity fields — such items
 * are silently dropped rather than stored in a corrupt form.
 */
function sanitizeItemForPersist(item: CartItem): CartItem | null {
  if (
    typeof item.menuItemId !== 'string' || !item.menuItemId ||
    typeof item.unitPriceCents !== 'number' || !Number.isFinite(item.unitPriceCents) ||
    item.unitPriceCents < 0 ||
    typeof item.quantity !== 'number' || !Number.isFinite(item.quantity) ||
    item.quantity < 1
  ) {
    return null;
  }

  const quantity = Math.min(MAX_ITEM_QUANTITY, Math.max(1, Math.trunc(item.quantity)));

  const modifiers = item.modifiers
    .slice(0, MAX_MODIFIERS_PER_ITEM)
    .filter(
      (m) =>
        typeof m.id === 'string' && m.id.length > 0 &&
        typeof m.priceAdjustmentCents === 'number' &&
        Number.isFinite(m.priceAdjustmentCents),
    );

  return {
    ...item,
    quantity,
    modifiers,
    lineTotalCents: computeLineTotalCents({ ...item, quantity, modifiers }),
  };
}

/**
 * Sanitize the full items array before it is written to localStorage.
 * Enforces MAX_ITEMS and drops any item that fails validation.
 * This runs inside partialize on every state change — it is the primary
 * defense that prevents oversized or corrupt carts from reaching storage.
 */
function sanitizeItemsForPersist(items: readonly CartItem[]): CartItem[] {
  return items
    .slice(0, MAX_ITEMS)
    .map(sanitizeItemForPersist)
    .filter((item): item is CartItem => item !== null);
}

// ─────────────────────────────────────────────────────────────────────────────
// Runtime helpers
// ─────────────────────────────────────────────────────────────────────────────

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function nullableStr(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function num(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function dateMs(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizePromoType(value: unknown): CartPromotion['type'] | null {
  return value === 'percent' || value === 'fixed' ? value : null;
}

function coerceCurrencyCode(value: unknown): string {
  if (typeof value !== 'string') return DEFAULT_CURRENCY;
  const normalized = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : DEFAULT_CURRENCY;
}

function nowIso(): string {
  return new Date().toISOString();
}

function computeItemCount(items: readonly CartItem[]): number {
  return items.reduce((count, item) => count + Math.max(0, Math.trunc(item.quantity)), 0);
}

function clampQuantity(quantity: number): number {
  return Math.min(MAX_ITEM_QUANTITY, Math.max(1, Math.trunc(quantity)));
}

function safeSessionId(sessionId: string): string | null {
  try {
    return requireSessionId(sessionId);
  } catch {
    console.warn('[cart.store] invalid sessionId; skipping remote sync');
    return null;
  }
}

function fireAndForget(task: () => Promise<unknown>): void {
  void task().catch(() => {});
}

// ─────────────────────────────────────────────────────────────────────────────
// JSON serialization helpers
// ─────────────────────────────────────────────────────────────────────────────

function serializeCartModifier(modifier: CartItem['modifiers'][number]): Json {
  return {
    id: modifier.id,
    groupId: modifier.groupId,
    name: modifier.name,
    priceAdjustmentCents: modifier.priceAdjustmentCents,
  };
}

function serializeCartItem(item: CartItem): Json {
  return {
    menuItemId: item.menuItemId,
    name: item.name,
    unitPriceCents: item.unitPriceCents,
    quantity: item.quantity,
    imageUrl: item.imageUrl,
    category: item.category,
    notes: item.notes,
    lineTotalCents: item.lineTotalCents,
    modifiers: item.modifiers.map(serializeCartModifier),
  };
}

function serializeCartItems(items: readonly CartItem[]): Json {
  return items.map(serializeCartItem);
}

function buildPricingSnapshot(
  items: readonly CartItem[],
  promotion: CartPromotion | null,
  credit: CartCredit | null,
  totals: CartTotals,
  currency: string,
): Json {
  return {
    taxRate: TAX_RATE,
    currency,
    itemCount: computeItemCount(items),
    promotion: promotion === null ? null : {
      id: promotion.id, code: promotion.code, type: promotion.type,
      value: promotion.value, minOrderCents: promotion.minOrderCents,
      expiresAt: promotion.expiresAt, discountCents: promotion.discountCents,
    },
    credit: credit === null ? null : {
      id: credit.id, amountCents: credit.amountCents,
      source: credit.source, expiresAt: credit.expiresAt,
    },
    totals: {
      subtotalCents: totals.subtotalCents, discountCents: totals.discountCents,
      creditCents: totals.creditCents, taxCents: totals.taxCents,
      totalCents: totals.totalCents,
    },
    items: items.map((item) => ({
      menuItemId: item.menuItemId, name: item.name, quantity: item.quantity,
      unitPriceCents: item.unitPriceCents, lineTotalCents: item.lineTotalCents,
      modifiers: item.modifiers.map((m) => ({
        id: m.id, groupId: m.groupId, name: m.name,
        priceAdjustmentCents: m.priceAdjustmentCents,
      })),
    })),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Promotion builder
// ─────────────────────────────────────────────────────────────────────────────

function buildCartPromotionFromRow(
  row: PromotionRow,
  subtotalCents: number,
  expiry: string | null,
): CartPromotion {
  const id   = str(row.id).trim();
  const code = str(row.code).trim();
  const type = normalizePromoType(row.type);

  if (!id || !code || !type) throw new Error('Invalid promo configuration');

  const value         = num(row.value, 0);
  const minOrderCents = num(row.min_order_cents, 0);
  const discountCents =
    type === 'percent'
      ? Math.min(subtotalCents, Math.round(subtotalCents * (value / 100)))
      : Math.min(subtotalCents, Math.round(value));

  return { id, code, type, value, minOrderCents, expiresAt: expiry, discountCents };
}

// ─────────────────────────────────────────────────────────────────────────────
// Pending carts JSON parsing
// ─────────────────────────────────────────────────────────────────────────────

function isCartModifierLike(value: unknown): value is CartItem['modifiers'][number] {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    typeof value.groupId === 'string' &&
    typeof value.name === 'string' &&
    typeof value.priceAdjustmentCents === 'number'
  );
}

function isCartItemLike(value: unknown): value is CartItem {
  if (!isRecord(value)) return false;
  const modifiers = value.modifiers;
  return (
    typeof value.menuItemId === 'string' &&
    typeof value.name === 'string' &&
    typeof value.unitPriceCents === 'number' &&
    typeof value.quantity === 'number' &&
    (value.imageUrl === null || typeof value.imageUrl === 'string') &&
    typeof value.category === 'string' &&
    (value.notes === null || typeof value.notes === 'string') &&
    typeof value.lineTotalCents === 'number' &&
    Array.isArray(modifiers) &&
    modifiers.every(isCartModifierLike)
  );
}

function parseCartItemsFromJson(raw: unknown): CartItem[] {
  if (!Array.isArray(raw)) return [];
  const items: CartItem[] = [];
  for (const item of raw) {
    if (isCartItemLike(item)) items.push(item);
  }
  return items;
}

// ─────────────────────────────────────────────────────────────────────────────
// Store interface
// ─────────────────────────────────────────────────────────────────────────────

export interface CartStore extends CartState {
  itemCount: number;
  isEmpty: boolean;

  addItem:        (item: Omit<CartItem, 'lineTotalCents'>) => void;
  removeItem:     (menuItemId: string, itemKey: string) => void;
  updateQuantity: (menuItemId: string, itemKey: string, quantity: number) => void;
  updateNotes:    (menuItemId: string, itemKey: string, notes: string) => void;
  clearCart:      () => void;

  applyPromoCode: (code: string, userId: string) => Promise<PromoValidationResult>;
  removePromo:    () => void;
  applyCredit:    (userId: string) => Promise<boolean>;
  removeCredit:   () => void;

  hydrateFromSupabase: (userId: string) => Promise<void>;
  syncToSupabase:      (userId: string, sessionId: string) => void;
  clearSupabaseCart:   (sessionId: string) => Promise<void>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Zero state
// ─────────────────────────────────────────────────────────────────────────────

const EMPTY_TOTALS: CartTotals = {
  subtotalCents: 0, discountCents: 0, creditCents: 0, taxCents: 0, totalCents: 0,
};

const INITIAL_STATE: CartState = { items: [], promotion: null, credit: null, totals: EMPTY_TOTALS };

// ─────────────────────────────────────────────────────────────────────────────
// State helpers
// ─────────────────────────────────────────────────────────────────────────────

function recompute(
  items: CartItem[],
  promotion: CartPromotion | null,
  credit: CartCredit | null,
): CartTotals {
  return computeCartTotals(items, promotion, credit, TAX_RATE);
}

function buildDerivedState(
  items: CartItem[],
  promotion: CartPromotion | null,
  credit: CartCredit | null,
): Pick<CartStore, 'items' | 'promotion' | 'credit' | 'totals' | 'itemCount' | 'isEmpty'> {
  return {
    items,
    promotion,
    credit,
    totals:    recompute(items, promotion, credit),
    itemCount: computeItemCount(items),
    isEmpty:   items.length === 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Debounced remote sync
// ─────────────────────────────────────────────────────────────────────────────

let syncTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSyncToSupabase(
  userId: string,
  sessionId: string,
  getState: () => CartStore,
): void {
  const sid = safeSessionId(sessionId);
  if (!sid) return;
  if (syncTimer !== null) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => { void flushSyncToSupabase(userId, sid, getState); }, SYNC_DEBOUNCE);
}

async function flushSyncToSupabase(
  userId: string,
  sessionId: string,
  getState: () => CartStore,
): Promise<void> {
  const sid = safeSessionId(sessionId);
  if (!sid) return;

  const { items, promotion, credit, totals } = getState();

  if (items.length === 0) {
    const { error } = await supabase.from('pending_carts').delete().eq('id', sid);
    if (error) console.warn('[cart.store] pending_carts delete failed:', error.message);
    return;
  }

  const currency = coerceCurrencyCode(DEFAULT_CURRENCY);
  const payload: PendingCartInsert = {
    id: sid, user_id: userId, currency,
    items:            serializeCartItems(items),
    pricing_snapshot: buildPricingSnapshot(items, promotion, credit, totals, currency),
    subtotal_cents:   totals.subtotalCents,
    discount_cents:   totals.discountCents,
    tax_cents:        totals.taxCents,
    total_cents:      totals.totalCents,
    promo_id:         promotion?.id ?? null,
    credit_id:        credit?.id ?? null,
    expires_at:       new Date(Date.now() + PENDING_CART_TTL_MS).toISOString(),
  };

  const { error } = await supabase.from('pending_carts').upsert(payload, { onConflict: 'id' });
  if (error) console.error('[cart.store] pending_carts upsert failed:', error.message);

  // ── Abandoned cart session upsert ─────────────────────────────────────────
  // BUG 3 FIX: write email to abandoned_cart_sessions.
  //   Read the authenticated user's email from the current session and include
  //   it in the upsert. This is the only place we have the email without an
  //   extra DB round-trip. For guest sessions (no auth), email stays null —
  //   growth.service.ts enriches it from pending_carts.guest_email at read time.
  //
  // NOTE: item_count is NOT a column in abandoned_cart_sessions (confirmed by
  //   live schema). We do NOT write it here. growth.service.ts derives it from
  //   pending_carts.items at fetch time (BUG 4 handled there).
  //
  // recovered is always false here — it is set to true in clearSupabaseCart()
  // when the order completes (BUG 5 fix below).
  fireAndForget(async () => {
    // Read current user's email — non-blocking, fail-safe
    let userEmail: string | null = null;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      userEmail = user?.email ?? null;
    } catch {
      // Non-fatal: email will be null for this sync cycle
    }

    const abandoned: AbandonedCartSessionInsert = {
      id:               sid,
      user_id:          userId,
      email:            userEmail,            // BUG 3 FIX: was missing
      cart_value_cents: totals.subtotalCents,
      last_activity:    nowIso(),
      recovered:        false,
    };

    const { error: aErr } = await supabase
      .from('abandoned_cart_sessions')
      .upsert(abandoned, { onConflict: 'id' });

    if (aErr) {
      console.warn('[cart.store] abandoned_cart_sessions upsert failed:', aErr.message);
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────────────────────────────────────

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      ...INITIAL_STATE,
      itemCount: 0,
      isEmpty: true,

      addItem: (item) => {
        const key = cartItemKey(item.menuItemId, item.modifiers);
        set((state) => {
          const existing = state.items.find(
            (e) => cartItemKey(e.menuItemId, e.modifiers) === key,
          );
          let nextItems: CartItem[];

          if (existing) {
            nextItems = state.items.map((e) => {
              if (cartItemKey(e.menuItemId, e.modifiers) !== key) return e;
              const quantity = clampQuantity(e.quantity + item.quantity);
              return { ...e, quantity, lineTotalCents: computeLineTotalCents({ ...e, quantity }) };
            });
          } else {
            const quantity = clampQuantity(item.quantity);
            nextItems = [
              ...state.items,
              { ...item, quantity, lineTotalCents: computeLineTotalCents({ ...item, quantity }) },
            ];
          }

          return buildDerivedState(nextItems, state.promotion, state.credit);
        });
      },

      removeItem: (menuItemId, itemKey) => {
        set((state) => {
          const nextItems = state.items.filter(
            (e) => !(e.menuItemId === menuItemId && cartItemKey(e.menuItemId, e.modifiers) === itemKey),
          );
          return buildDerivedState(
            nextItems,
            nextItems.length > 0 ? state.promotion : null,
            nextItems.length > 0 ? state.credit : null,
          );
        });
      },

      updateQuantity: (menuItemId, itemKey, quantity) => {
        const normalized = Math.trunc(quantity);
        if (normalized <= 0) { get().removeItem(menuItemId, itemKey); return; }
        const clamped = clampQuantity(normalized);
        set((state) => ({
          ...buildDerivedState(
            state.items.map((e) => {
              if (!(e.menuItemId === menuItemId && cartItemKey(e.menuItemId, e.modifiers) === itemKey)) return e;
              return { ...e, quantity: clamped, lineTotalCents: computeLineTotalCents({ ...e, quantity: clamped }) };
            }),
            state.promotion, state.credit,
          ),
        }));
      },

      updateNotes: (menuItemId, itemKey, notes) => {
        const safeNotes = String(notes ?? '').slice(0, MAX_NOTES_LENGTH);
        set((state) => ({
          items: state.items.map((e) => {
            if (!(e.menuItemId === menuItemId && cartItemKey(e.menuItemId, e.modifiers) === itemKey)) return e;
            return { ...e, notes: safeNotes };
          }),
        }));
      },

      clearCart: () => { set({ ...INITIAL_STATE, itemCount: 0, isEmpty: true }); },

      applyPromoCode: async (code, userId) => {
        const { items, promotion: existing } = get();
        const normalized = code.trim();
        if (!normalized) return { valid: false, error: 'NOT_FOUND' };
        if (existing?.code.toLowerCase() === normalized.toLowerCase()) return { valid: false, error: 'ALREADY_APPLIED' };

        const { data, error } = await supabase
          .from('promotions')
          .select('id, code, type, value, active, min_order_cents, max_uses, current_uses, per_user_limit, starts_at, ends_at, expires_at')
          .eq('code', normalized).limit(1).returns<PromotionRow[]>();

        if (error || !data?.length) return { valid: false, error: 'NOT_FOUND' };
        const row = data[0];

        if (row.active !== true) return { valid: false, error: 'INACTIVE' };
        const now = Date.now();
        const startsMs = dateMs(row.starts_at);
        if (startsMs !== null && startsMs > now) return { valid: false, error: 'INACTIVE' };
        const expiry = nullableStr(row.expires_at) ?? nullableStr(row.ends_at);
        const expiryMs = dateMs(expiry);
        if (expiryMs !== null && expiryMs < now) return { valid: false, error: 'EXPIRED' };
        const maxUses = row.max_uses == null ? null : num(row.max_uses);
        if (maxUses !== null && num(row.current_uses) >= maxUses) return { valid: false, error: 'LIMIT_REACHED' };
        const subtotal = items.reduce((s, e) => s + e.lineTotalCents, 0);
        if (subtotal < num(row.min_order_cents, 0)) return { valid: false, error: 'MIN_ORDER_NOT_MET' };
        const perUserLimit = num(row.per_user_limit, 0);
        if (perUserLimit > 0) {
          const { count, error: cErr } = await supabase.from('promo_redemptions')
            .select('id', { count: 'exact', head: true })
            .eq('promotion_id', row.id).eq('user_id', userId);
          if (cErr) return { valid: false, error: 'NOT_FOUND' };
          if ((count ?? 0) >= perUserLimit) return { valid: false, error: 'USER_LIMIT_REACHED' };
        }

        let promo: CartPromotion;
        try { promo = buildCartPromotionFromRow(row, subtotal, expiry ?? null); }
        catch { return { valid: false, error: 'NOT_FOUND' }; }

        set((state) => buildDerivedState(state.items, promo, state.credit));
        return { valid: true, promo };
      },

      removePromo:  () => { set((s) => buildDerivedState(s.items, null, s.credit)); },
      removeCredit: () => { set((s) => buildDerivedState(s.items, s.promotion, null)); },

      applyCredit: async (userId) => {
        const { data, error } = await supabase
          .from('user_credits')
          .select('id, amount_cents, source, expires_at')
          .eq('user_id', userId).eq('used', false)
          .or(`expires_at.is.null,expires_at.gt.${nowIso()}`)
          .order('created_at', { ascending: true }).limit(1);
        if (error || !data?.length) return false;
        const row = data[0];
        const credit: CartCredit = {
          id: row.id, amountCents: row.amount_cents ?? 0,
          source: row.source ?? '', expiresAt: row.expires_at ?? null,
        };
        set((state) => buildDerivedState(state.items, state.promotion, credit));
        return true;
      },

      hydrateFromSupabase: async (userId) => {
        const { data, error } = await supabase
          .from('pending_carts')
          .select('id, items, promo_id, credit_id, expires_at, currency')
          .eq('user_id', userId).gt('expires_at', nowIso())
          .order('created_at', { ascending: false }).limit(1);

        if (error || !data?.length) return;
        const row = data[0];
        const parsed = parseCartItemsFromJson(row.items);
        if (!parsed.length) return;

        const hydratedItems = parsed.map((e) => ({ ...e, lineTotalCents: computeLineTotalCents(e) }));

        let promotion: CartPromotion | null = null;
        if (row.promo_id) {
          const { data: pData } = await supabase.from('promotions')
            .select('id, code, type, value, min_order_cents, expires_at, ends_at, active')
            .eq('id', row.promo_id).limit(1).returns<PromotionRow[]>();
          const pRow = pData?.[0];
          if (pRow?.active === true) {
            const subtotal = hydratedItems.reduce((s, e) => s + e.lineTotalCents, 0);
            const expiry = nullableStr(pRow.expires_at) ?? nullableStr(pRow.ends_at);
            try { promotion = buildCartPromotionFromRow(pRow, subtotal, expiry ?? null); } catch { promotion = null; }
          }
        }

        let credit: CartCredit | null = null;
        if (row.credit_id) {
          const { data: cData } = await supabase.from('user_credits')
            .select('id, amount_cents, source, expires_at')
            .eq('id', row.credit_id).eq('used', false).limit(1);
          const cRow = cData?.[0];
          if (cRow) credit = { id: cRow.id, amountCents: cRow.amount_cents ?? 0, source: cRow.source ?? '', expiresAt: cRow.expires_at ?? null };
        }

        set(buildDerivedState(hydratedItems, promotion, credit));
      },

      syncToSupabase: (userId, sessionId) => { scheduleSyncToSupabase(userId, sessionId, get); },

      clearSupabaseCart: async (sessionId) => {
        const sid = safeSessionId(sessionId);
        if (!sid) return;

        // Delete the pending cart row (existing behaviour)
        const { error } = await supabase.from('pending_carts').delete().eq('id', sid);
        if (error) console.warn('[cart.store] pending_carts delete failed:', error.message);

        // BUG 5 FIX: mark the abandoned_cart_sessions row as recovered.
        //   This is called by OrderSuccess.tsx after a successful order, so
        //   the session id is the same uuid used throughout the cart lifetime.
        //   Best-effort: if the row doesn't exist (guest who never synced) the
        //   update silently affects 0 rows, which is correct.
        fireAndForget(async () => {
          const { error: recErr } = await supabase
            .from('abandoned_cart_sessions')
            .update({ recovered: true })
            .eq('id', sid)
            .eq('recovered', false); // only update if not already marked

          if (recErr) {
            console.warn('[cart.store] abandoned_cart_sessions recovery update failed:', recErr.message);
          }
        });
      },
    }),

    {
      name:    PERSIST_KEY,
      storage: createJSONStorage(() => safeStorage),

      /**
       * Called on every state change before writing to storage.
       * sanitizeItemsForPersist is the primary guard against oversized or
       * corrupt data reaching localStorage — it runs regardless of how state
       * was written (actions, devtools, raw setState).
       */
      partialize: (state) => ({
        items:     sanitizeItemsForPersist(state.items),
        promotion: state.promotion,
        credit:    state.credit,
        totals:    state.totals,
      }),

      onRehydrateStorage: () => (state) => {
        if (!state) return;

        const hydratedItems = sanitizeItemsForPersist(
          (state.items ?? []).map((e) => ({ ...e, lineTotalCents: computeLineTotalCents(e) })),
        );

        const next = buildDerivedState(hydratedItems, state.promotion ?? null, state.credit ?? null);
        state.items     = next.items;
        state.promotion = next.promotion;
        state.credit    = next.credit;
        state.totals    = next.totals;
        state.itemCount = next.itemCount;
        state.isEmpty   = next.isEmpty;
      },
    },
  ),
);

// ─────────────────────────────────────────────────────────────────────────────
// Selectors
// ─────────────────────────────────────────────────────────────────────────────

export const selectItems            = (s: CartStore) => s.items;
export const selectTotals           = (s: CartStore) => s.totals;
export const selectPromotion        = (s: CartStore) => s.promotion;
export const selectCredit           = (s: CartStore) => s.credit;
export const selectItemCount        = (s: CartStore) => s.itemCount;
export const selectIsEmpty          = (s: CartStore) => s.isEmpty;
export const selectItemByKey        = (key: string) => (s: CartStore) =>
  s.items.find((e) => cartItemKey(e.menuItemId, e.modifiers) === key) ?? null;
export const selectItemsByCategory  = (cat: string) => (s: CartStore) =>
  s.items.filter((e) => e.category === cat);