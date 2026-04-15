// =============================================================================
// src/modules/cart/store/cart.store.ts
// Cart store — Zustand + persist middleware (production-ready, type-safe)
// Security upgrades:
//  - Enforces UUID sessionId via requireSessionId() (safe wrapper prevents UI crashes)
//  - Never persists sessionId (only cart contents)
//  - Debounced, best-effort Supabase writes (won’t spam backend)
//  - Strict JSON parsing from pending_carts.items (no unsafe casts)
//  - Defensive recompute of totals + line totals (never trust stored totals)
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

const TAX_RATE = 0.095;
const PERSIST_KEY = 'sofis-cart-v1';
const SYNC_DEBOUNCE = 600;
const PENDING_CART_TTL_MS = 2 * 60 * 60 * 1000;
const DEFAULT_CURRENCY = 'USD';
const MAX_ITEM_QUANTITY = 20;
const MAX_NOTES_LENGTH = 1200;

type UnknownRecord = Record<string, unknown>;
type PendingCartInsert = Database['public']['Tables']['pending_carts']['Insert'];
type AbandonedCartSessionInsert =
  Database['public']['Tables']['abandoned_cart_sessions']['Insert'];

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
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
}

function dateMs(value: unknown): number | null {
  if (typeof value !== 'string') {
    return null;
  }

  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizePromoType(value: unknown): CartPromotion['type'] | null {
  return value === 'percent' || value === 'fixed' ? value : null;
}

function coerceCurrencyCode(value: unknown): string {
  if (typeof value !== 'string') {
    return DEFAULT_CURRENCY;
  }

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

// Never allow sessionId exceptions to crash the UI.
// If sessionId is invalid, we skip remote actions safely.
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
    promotion:
      promotion === null
        ? null
        : {
            id: promotion.id,
            code: promotion.code,
            type: promotion.type,
            value: promotion.value,
            minOrderCents: promotion.minOrderCents,
            expiresAt: promotion.expiresAt,
            discountCents: promotion.discountCents,
          },
    credit:
      credit === null
        ? null
        : {
            id: credit.id,
            amountCents: credit.amountCents,
            source: credit.source,
            expiresAt: credit.expiresAt,
          },
    totals: {
      subtotalCents: totals.subtotalCents,
      discountCents: totals.discountCents,
      creditCents: totals.creditCents,
      taxCents: totals.taxCents,
      totalCents: totals.totalCents,
    },
    items: items.map((item) => ({
      menuItemId: item.menuItemId,
      name: item.name,
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      lineTotalCents: item.lineTotalCents,
      modifiers: item.modifiers.map((modifier) => ({
        id: modifier.id,
        groupId: modifier.groupId,
        name: modifier.name,
        priceAdjustmentCents: modifier.priceAdjustmentCents,
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
  const id = str(row.id).trim();
  const code = str(row.code).trim();
  const type = normalizePromoType(row.type);

  if (!id || !code || !type) {
    throw new Error('Invalid promo configuration');
  }

  const value = num(row.value, 0);
  const minOrderCents = num(row.min_order_cents, 0);

  const discountCents =
    type === 'percent'
      ? Math.min(subtotalCents, Math.round(subtotalCents * (value / 100)))
      : Math.min(subtotalCents, Math.round(value));

  return {
    id,
    code,
    type,
    value,
    minOrderCents,
    expiresAt: expiry,
    discountCents,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Pending carts JSON parsing
// ─────────────────────────────────────────────────────────────────────────────

function isCartModifierLike(value: unknown): value is CartItem['modifiers'][number] {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === 'string' &&
    typeof value.groupId === 'string' &&
    typeof value.name === 'string' &&
    typeof value.priceAdjustmentCents === 'number'
  );
}

function isCartItemLike(value: unknown): value is CartItem {
  if (!isRecord(value)) {
    return false;
  }

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
  if (!Array.isArray(raw)) {
    return [];
  }

  const items: CartItem[] = [];

  for (const item of raw) {
    if (isCartItemLike(item)) {
      items.push(item);
    }
  }

  return items;
}

// ─────────────────────────────────────────────────────────────────────────────
// Store interface
// ─────────────────────────────────────────────────────────────────────────────

export interface CartStore extends CartState {
  itemCount: number;
  isEmpty: boolean;

  addItem: (item: Omit<CartItem, 'lineTotalCents'>) => void;
  removeItem: (menuItemId: string, itemKey: string) => void;
  updateQuantity: (menuItemId: string, itemKey: string, quantity: number) => void;
  updateNotes: (menuItemId: string, itemKey: string, notes: string) => void;
  clearCart: () => void;

  applyPromoCode: (code: string, userId: string) => Promise<PromoValidationResult>;
  removePromo: () => void;

  applyCredit: (userId: string) => Promise<boolean>;
  removeCredit: () => void;

  hydrateFromSupabase: (userId: string) => Promise<void>;

  syncToSupabase: (userId: string, sessionId: string) => void;
  clearSupabaseCart: (sessionId: string) => Promise<void>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Zero state
// ─────────────────────────────────────────────────────────────────────────────

const EMPTY_TOTALS: CartTotals = {
  subtotalCents: 0,
  discountCents: 0,
  creditCents: 0,
  taxCents: 0,
  totalCents: 0,
};

const INITIAL_STATE: CartState = {
  items: [],
  promotion: null,
  credit: null,
  totals: EMPTY_TOTALS,
};

// ─────────────────────────────────────────────────────────────────────────────
// Totals / state helpers
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
    totals: recompute(items, promotion, credit),
    itemCount: computeItemCount(items),
    isEmpty: items.length === 0,
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
  if (!sid) {
    return;
  }

  if (syncTimer !== null) {
    clearTimeout(syncTimer);
  }

  syncTimer = setTimeout(() => {
    void flushSyncToSupabase(userId, sid, getState);
  }, SYNC_DEBOUNCE);
}

async function flushSyncToSupabase(
  userId: string,
  sessionId: string,
  getState: () => CartStore,
): Promise<void> {
  const sid = safeSessionId(sessionId);
  if (!sid) {
    return;
  }

  const { items, promotion, credit, totals } = getState();

  if (items.length === 0) {
    const deleteResult = await supabase.from('pending_carts').delete().eq('id', sid);

    if (deleteResult.error) {
      console.warn('[cart.store] pending_carts delete failed:', deleteResult.error.message);
    }

    return;
  }

  const currency = coerceCurrencyCode(DEFAULT_CURRENCY);

  const pendingCartPayload: PendingCartInsert = {
    id: sid,
    user_id: userId,
    currency,
    items: serializeCartItems(items),
    pricing_snapshot: buildPricingSnapshot(items, promotion, credit, totals, currency),
    subtotal_cents: totals.subtotalCents,
    discount_cents: totals.discountCents,
    tax_cents: totals.taxCents,
    total_cents: totals.totalCents,
    promo_id: promotion?.id ?? null,
    credit_id: credit?.id ?? null,
    expires_at: new Date(Date.now() + PENDING_CART_TTL_MS).toISOString(),
  };

  const upsertResult = await supabase
    .from('pending_carts')
    .upsert(pendingCartPayload, { onConflict: 'id' });

  if (upsertResult.error) {
    console.error('[cart.store] pending_carts upsert failed:', upsertResult.error.message);
  }

  fireAndForget(async () => {
    const abandonedPayload: AbandonedCartSessionInsert = {
      id: sid,
      user_id: userId,
      cart_value_cents: totals.subtotalCents,
      last_activity: nowIso(),
      recovered: false,
    };

    const abandonedResult = await supabase
      .from('abandoned_cart_sessions')
      .upsert(abandonedPayload, { onConflict: 'id' });

    if (abandonedResult.error) {
      console.warn(
        '[cart.store] abandoned_cart_sessions upsert failed:',
        abandonedResult.error.message,
      );
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
            (entry) => cartItemKey(entry.menuItemId, entry.modifiers) === key,
          );

          let nextItems: CartItem[];

          if (existing) {
            nextItems = state.items.map((entry) => {
              if (cartItemKey(entry.menuItemId, entry.modifiers) !== key) {
                return entry;
              }

              const quantity = clampQuantity(entry.quantity + item.quantity);
              return {
                ...entry,
                quantity,
                lineTotalCents: computeLineTotalCents({
                  ...entry,
                  quantity,
                }),
              };
            });
          } else {
            const quantity = clampQuantity(item.quantity);

            nextItems = [
              ...state.items,
              {
                ...item,
                quantity,
                lineTotalCents: computeLineTotalCents({
                  ...item,
                  quantity,
                }),
              },
            ];
          }

          return {
            ...buildDerivedState(nextItems, state.promotion, state.credit),
          };
        });
      },

      removeItem: (menuItemId, itemKey) => {
        set((state) => {
          const nextItems = state.items.filter((entry) => {
            if (entry.menuItemId !== menuItemId) {
              return true;
            }

            return cartItemKey(entry.menuItemId, entry.modifiers) !== itemKey;
          });

          const nextPromotion = nextItems.length > 0 ? state.promotion : null;
          const nextCredit = nextItems.length > 0 ? state.credit : null;

          return {
            ...buildDerivedState(nextItems, nextPromotion, nextCredit),
          };
        });
      },

      updateQuantity: (menuItemId, itemKey, quantity) => {
        const normalizedQuantity = Math.trunc(quantity);

        if (normalizedQuantity <= 0) {
          get().removeItem(menuItemId, itemKey);
          return;
        }

        const clampedQuantity = clampQuantity(normalizedQuantity);

        set((state) => {
          const nextItems = state.items.map((entry) => {
            const key = cartItemKey(entry.menuItemId, entry.modifiers);

            if (!(entry.menuItemId === menuItemId && key === itemKey)) {
              return entry;
            }

            return {
              ...entry,
              quantity: clampedQuantity,
              lineTotalCents: computeLineTotalCents({
                ...entry,
                quantity: clampedQuantity,
              }),
            };
          });

          return {
            ...buildDerivedState(nextItems, state.promotion, state.credit),
          };
        });
      },

      updateNotes: (menuItemId, itemKey, notes) => {
        const safeNotes = String(notes ?? '').slice(0, MAX_NOTES_LENGTH);

        set((state) => ({
          items: state.items.map((entry) => {
            const key = cartItemKey(entry.menuItemId, entry.modifiers);

            if (!(entry.menuItemId === menuItemId && key === itemKey)) {
              return entry;
            }

            return {
              ...entry,
              notes: safeNotes,
            };
          }),
        }));
      },

      clearCart: () => {
        set({
          ...INITIAL_STATE,
          itemCount: 0,
          isEmpty: true,
        });
      },

      applyPromoCode: async (code, userId) => {
        const { items, promotion: existingPromotion } = get();

        const normalizedCode = code.trim();
        if (normalizedCode.length === 0) {
          return { valid: false, error: 'NOT_FOUND' };
        }

        if (existingPromotion?.code.toLowerCase() === normalizedCode.toLowerCase()) {
          return { valid: false, error: 'ALREADY_APPLIED' };
        }

        const promotionResult = await supabase
          .from('promotions')
          .select(
            'id, code, type, value, active, min_order_cents, max_uses, current_uses, per_user_limit, starts_at, ends_at, expires_at',
          )
          .eq('code', normalizedCode)
          .limit(1)
          .returns<PromotionRow[]>();

        if (promotionResult.error) {
          return { valid: false, error: 'NOT_FOUND' };
        }

        const promotionRow = promotionResult.data?.[0];
        if (!promotionRow) {
          return { valid: false, error: 'NOT_FOUND' };
        }

        if (promotionRow.active !== true) {
          return { valid: false, error: 'INACTIVE' };
        }

        const now = Date.now();

        const startsAtMs = dateMs(promotionRow.starts_at);
        if (startsAtMs !== null && startsAtMs > now) {
          return { valid: false, error: 'INACTIVE' };
        }

        const expiry = nullableStr(promotionRow.expires_at) ?? nullableStr(promotionRow.ends_at);
        const expiryMs = dateMs(expiry);
        if (expiryMs !== null && expiryMs < now) {
          return { valid: false, error: 'EXPIRED' };
        }

        const maxUses = promotionRow.max_uses == null ? null : num(promotionRow.max_uses);
        const currentUses = num(promotionRow.current_uses);
        if (maxUses !== null && currentUses >= maxUses) {
          return { valid: false, error: 'LIMIT_REACHED' };
        }

        const subtotalCents = items.reduce((sum, entry) => sum + entry.lineTotalCents, 0);
        const minOrderCents = num(promotionRow.min_order_cents, 0);
        if (subtotalCents < minOrderCents) {
          return { valid: false, error: 'MIN_ORDER_NOT_MET' };
        }

        const perUserLimit = num(promotionRow.per_user_limit, 0);
        if (perUserLimit > 0) {
          const redemptionResult = await supabase
            .from('promo_redemptions')
            .select('id', { count: 'exact', head: true })
            .eq('promotion_id', promotionRow.id)
            .eq('user_id', userId);

          if (redemptionResult.error) {
            return { valid: false, error: 'NOT_FOUND' };
          }

          if ((redemptionResult.count ?? 0) >= perUserLimit) {
            return { valid: false, error: 'USER_LIMIT_REACHED' };
          }
        }

        let cartPromotion: CartPromotion;
        try {
          cartPromotion = buildCartPromotionFromRow(promotionRow, subtotalCents, expiry ?? null);
        } catch {
          return { valid: false, error: 'NOT_FOUND' };
        }

        set((state) => ({
          ...buildDerivedState(state.items, cartPromotion, state.credit),
        }));

        return { valid: true, promo: cartPromotion };
      },

      removePromo: () => {
        set((state) => ({
          ...buildDerivedState(state.items, null, state.credit),
        }));
      },

      applyCredit: async (userId) => {
        const creditResult = await supabase
          .from('user_credits')
          .select('id, amount_cents, source, expires_at')
          .eq('user_id', userId)
          .eq('used', false)
          .or(`expires_at.is.null,expires_at.gt.${nowIso()}`)
          .order('created_at', { ascending: true })
          .limit(1);

        if (creditResult.error || !creditResult.data?.length) {
          return false;
        }

        const row = creditResult.data[0];

        const credit: CartCredit = {
          id: row.id,
          amountCents: row.amount_cents ?? 0,
          source: row.source ?? '',
          expiresAt: row.expires_at ?? null,
        };

        set((state) => ({
          ...buildDerivedState(state.items, state.promotion, credit),
        }));

        return true;
      },

      removeCredit: () => {
        set((state) => ({
          ...buildDerivedState(state.items, state.promotion, null),
        }));
      },

      hydrateFromSupabase: async (userId) => {
        const result = await supabase
          .from('pending_carts')
          .select('id, items, promo_id, credit_id, expires_at, currency')
          .eq('user_id', userId)
          .gt('expires_at', nowIso())
          .order('created_at', { ascending: false })
          .limit(1);

        if (result.error || !result.data?.length) {
          return;
        }

        const row = result.data[0];
        const restoredCurrency = coerceCurrencyCode(row.currency);

        const parsedItems = parseCartItemsFromJson(row.items);
        if (parsedItems.length === 0) {
          return;
        }

        const hydratedItems: CartItem[] = parsedItems.map((entry) => ({
          ...entry,
          lineTotalCents: computeLineTotalCents(entry),
        }));

        let promotion: CartPromotion | null = null;
        if (row.promo_id) {
          const promotionResult = await supabase
            .from('promotions')
            .select('id, code, type, value, min_order_cents, expires_at, ends_at, active')
            .eq('id', row.promo_id)
            .limit(1)
            .returns<PromotionRow[]>();

          const promotionRow = promotionResult.data?.[0];
          if (promotionRow?.active === true) {
            const subtotalCents = hydratedItems.reduce(
              (sum, entry) => sum + entry.lineTotalCents,
              0,
            );
            const expiry =
              nullableStr(promotionRow.expires_at) ?? nullableStr(promotionRow.ends_at);

            try {
              promotion = buildCartPromotionFromRow(promotionRow, subtotalCents, expiry ?? null);
            } catch {
              promotion = null;
            }
          }
        }

        let credit: CartCredit | null = null;
        if (row.credit_id) {
          const creditResult = await supabase
            .from('user_credits')
            .select('id, amount_cents, source, expires_at')
            .eq('id', row.credit_id)
            .eq('used', false)
            .limit(1);

          const restoredCredit = creditResult.data?.[0];
          if (restoredCredit) {
            credit = {
              id: restoredCredit.id,
              amountCents: restoredCredit.amount_cents ?? 0,
              source: restoredCredit.source ?? restoredCurrency,
              expiresAt: restoredCredit.expires_at ?? null,
            };
          }
        }

        set({
          ...buildDerivedState(hydratedItems, promotion, credit),
        });
      },

      syncToSupabase: (userId, sessionId) => {
        scheduleSyncToSupabase(userId, sessionId, get);
      },

      clearSupabaseCart: async (sessionId) => {
        const sid = safeSessionId(sessionId);
        if (!sid) {
          return;
        }

        const deleteResult = await supabase.from('pending_carts').delete().eq('id', sid);
        if (deleteResult.error) {
          console.warn('[cart.store] pending_carts delete failed:', deleteResult.error.message);
        }
      },
    }),
    {
      name: PERSIST_KEY,
      storage: createJSONStorage(() => localStorage),

      partialize: (state) => ({
        items: state.items,
        promotion: state.promotion,
        credit: state.credit,
        totals: state.totals,
      }),

      onRehydrateStorage: () => (state) => {
        if (!state) {
          return;
        }

        const hydratedItems = (state.items ?? []).map((entry) => ({
          ...entry,
          lineTotalCents: computeLineTotalCents(entry),
        }));

        const nextPromotion = state.promotion ?? null;
        const nextCredit = state.credit ?? null;
        const nextState = buildDerivedState(hydratedItems, nextPromotion, nextCredit);

        state.items = nextState.items;
        state.promotion = nextState.promotion;
        state.credit = nextState.credit;
        state.totals = nextState.totals;
        state.itemCount = nextState.itemCount;
        state.isEmpty = nextState.isEmpty;
      },
    },
  ),
);

// ─────────────────────────────────────────────────────────────────────────────
// Selectors
// ─────────────────────────────────────────────────────────────────────────────

export const selectItems = (state: CartStore) => state.items;
export const selectTotals = (state: CartStore) => state.totals;
export const selectPromotion = (state: CartStore) => state.promotion;
export const selectCredit = (state: CartStore) => state.credit;
export const selectItemCount = (state: CartStore) => state.itemCount;
export const selectIsEmpty = (state: CartStore) => state.isEmpty;

export const selectItemByKey = (key: string) => (state: CartStore) =>
  state.items.find((entry) => cartItemKey(entry.menuItemId, entry.modifiers) === key) ?? null;

export const selectItemsByCategory = (category: string) => (state: CartStore) =>
  state.items.filter((entry) => entry.category === category);


// DEV ONLY DEBUG ACCESS
export function attachCartDebugTools() {
  if (typeof window === 'undefined') return;

  if (import.meta.env.DEV) {
    (window as any).cartStore = useCartStore;
    (window as any).cartItemKey = cartItemKey;
    (window as any).computeLineTotalCents = computeLineTotalCents; // 👈 ADD THIS
  }
}
if (import.meta.env.DEV) {
  attachCartDebugTools();
}