// =============================================================================
// src/hooks/useCart.ts
// useCart — ergonomic consumer hook over useCartStore (production hardened)
// Upgrades:
//  - SessionId is validated (UUID) before any remote write/delete
//  - Uses stable refs for uid/sid to avoid stale closures during async ops
//  - Sync effect depends on items+promo+credit and guards with shouldSyncCart()
//  - Exposes promoMessage + promoErrorMessage (as before)
//  - Keeps store as source of truth; hook does not recompute totals
// =============================================================================

import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  useCartStore,
  selectItems,
  selectTotals,
  selectPromotion,
  selectCredit,
  selectItemCount,
  selectIsEmpty,
} from "@/modules/cart/store/cart.store";

import {
  cartItemKey,
  formatCartTotals,
  formatCents,
  formatLineItemBreakdown,
  modifierSummary,
  isItemInCart,
  itemQuantityInCart,
  findCartItem,
  groupCartItemsByCategory,
  buildCheckoutPayload,
  promoErrorMessage,
  promoSuccessMessage,
  shouldSyncCart,
  orderTypeLabel,
} from "@/modules/cart/utils/cart.utils";

import type {
  CartItem,
  CartModifier,
  CartPromotion,
  CartCredit,
  CheckoutPayload,
  PromoValidationResult,
} from "@/modules/cart/types/cart.types";

import { requireSessionId, isUuid } from "@/security/auth/sessionId";

// ─────────────────────────────────────────────────────────────────────────────
// Hook params
// ─────────────────────────────────────────────────────────────────────────────

interface UseCartOptions {
  userId?: string | null;
  // IMPORTANT: this must be the Supabase session UUID (session_id claim),
  // not the access_token tail and not Stripe session id.
  sessionId?: string | null;
  taxRate?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook return type
// ─────────────────────────────────────────────────────────────────────────────

export interface UseCartReturn {
  items: CartItem[];
  promotion: CartPromotion | null;
  credit: CartCredit | null;
  itemCount: number;
  isEmpty: boolean;

  totalsDisplay: ReturnType<typeof formatCartTotals>;
  subtotalFormatted: string;
  totalFormatted: string;

  addItem: (item: Omit<CartItem, "lineTotalCents">) => void;
  removeItem: (menuItemId: string, modifierKey: string) => void;
  updateQuantity: (menuItemId: string, modifierKey: string, qty: number) => void;
  updateNotes: (menuItemId: string, modifierKey: string, notes: string) => void;
  clearCart: () => void;

  applyPromoCode: (code: string) => Promise<PromoValidationResult>;
  removePromo: () => void;
  promoMessage: string | null;

  applyCredit: () => Promise<boolean>;
  removeCredit: () => void;

  getCheckoutPayload: (orderType: CheckoutPayload["orderType"], notes?: string) => CheckoutPayload;

  findItem: (menuItemId: string, modifiers: Pick<CartModifier, "id">[]) => CartItem | undefined;
  isInCart: (menuItemId: string) => boolean;
  quantityInCart: (menuItemId: string) => number;
  itemLineBreakdown: (item: CartItem) => string;
  itemModifierSummary: (item: CartItem) => string;
  itemsByCategory: ReturnType<typeof groupCartItemsByCategory>;
  cartItemKey: typeof cartItemKey;
  orderTypeLabel: typeof orderTypeLabel;

  sync: () => void;
  hydrateFromDB: () => Promise<void>;
  clearFromDB: () => Promise<void>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

function safeRequireSessionId(sessionId: string | null | undefined): string | null {
  if (!sessionId) return null;
  try {
    return requireSessionId(sessionId);
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useCart(options: UseCartOptions = {}): UseCartReturn {
  const { userId = null, sessionId = null, taxRate = 0.0825 } = options;

  // ── Store slices
  const items = useCartStore(selectItems);
  const rawTotals = useCartStore(selectTotals);
  const promotion = useCartStore(selectPromotion);
  const credit = useCartStore(selectCredit);
  const itemCount = useCartStore(selectItemCount);
  const isEmpty = useCartStore(selectIsEmpty);

  // ── Store actions
  const {
    addItem,
    removeItem,
    updateQuantity,
    updateNotes,
    clearCart,
    applyPromoCode: storeApplyPromo,
    removePromo,
    applyCredit: storeApplyCredit,
    removeCredit,
    syncToSupabase,
    hydrateFromSupabase,
    clearSupabaseCart,
  } = useCartStore();

  // ─────────────────────────────────────────────────────────────────────────
  // Stable refs to avoid stale closures in callbacks
  // ─────────────────────────────────────────────────────────────────────────

  const userIdRef = useRef<string | null>(userId);
  const sessionIdRef = useRef<string | null>(sessionId);

  useEffect(() => {
    userIdRef.current = userId;
    sessionIdRef.current = sessionId;
  }, [userId, sessionId]);

  // Pre-validated session UUID for effects/callbacks
  const validatedSessionId = useMemo(() => safeRequireSessionId(sessionId), [sessionId]);

  // Auto-sync on relevant changes (items/promo/credit)
  useEffect(() => {
    // Must have both identifiers and a valid UUID session id
    if (!userId || !validatedSessionId) return;

    // Local policy for when we sync (you already have this helper)
    if (!shouldSyncCart(items, userId)) return;

    // Store will debounce + best-effort write
    syncToSupabase(userId, validatedSessionId);
  }, [items, promotion, credit, userId, validatedSessionId, syncToSupabase]);

  // ─────────────────────────────────────────────────────────────────────────
  // Wrapped mutations
  // ─────────────────────────────────────────────────────────────────────────

  const applyPromoCode = useCallback(
    async (code: string): Promise<PromoValidationResult> => {
      if (!userId) return { valid: false, error: "NOT_FOUND" };
      return storeApplyPromo(code, userId);
    },
    [userId, storeApplyPromo],
  );

  const applyCredit = useCallback(async (): Promise<boolean> => {
    if (!userId) return false;
    return storeApplyCredit(userId);
  }, [userId, storeApplyCredit]);

  const sync = useCallback(() => {
    const uid = userIdRef.current;
    const sidRaw = sessionIdRef.current;

    if (!uid || !sidRaw) return;
    if (!isUuid(sidRaw)) return; // do not throw inside UI callback
    if (!shouldSyncCart(items, uid)) return;

    syncToSupabase(uid, sidRaw);
  }, [items, syncToSupabase]);

  const hydrateFromDB = useCallback(async () => {
    if (!userId) return;
    await hydrateFromSupabase(userId);
  }, [userId, hydrateFromSupabase]);

  const clearFromDB = useCallback(async () => {
    const sid = validatedSessionId;
    if (!sid) return;
    await clearSupabaseCart(sid);
  }, [validatedSessionId, clearSupabaseCart]);

  const getCheckoutPayload = useCallback(
    (orderType: CheckoutPayload["orderType"], notes?: string): CheckoutPayload =>
      buildCheckoutPayload(
        { items, promotion, credit, totals: rawTotals },
        orderType,
        notes ?? null,
        taxRate,
      ),
    [items, promotion, credit, rawTotals, taxRate],
  );

  // ── Derived / display values
  const totalsDisplay = useMemo(() => formatCartTotals(rawTotals), [rawTotals]);
  const subtotalFormatted = useMemo(() => formatCents(rawTotals.subtotalCents), [rawTotals.subtotalCents]);
  const totalFormatted = useMemo(() => formatCents(rawTotals.totalCents), [rawTotals.totalCents]);

  const promoMessage = useMemo(() => (promotion ? promoSuccessMessage(promotion) : null), [promotion]);

  const itemsByCategory = useMemo(() => groupCartItemsByCategory(items), [items]);

  // ── Query helpers
  const findItem = useCallback(
    (menuItemId: string, mods: Pick<CartModifier, "id">[]) => findCartItem(items, menuItemId, mods),
    [items],
  );

  const isInCart = useCallback((menuItemId: string) => isItemInCart(items, menuItemId), [items]);

  const quantityInCart = useCallback((menuItemId: string) => itemQuantityInCart(items, menuItemId), [items]);

  const itemLineBreakdown = useCallback((item: CartItem) => formatLineItemBreakdown(item), []);

  const itemModifierSummary = useCallback((item: CartItem) => modifierSummary(item.modifiers), []);

  return {
    items,
    promotion,
    credit,
    itemCount,
    isEmpty,

    totalsDisplay,
    subtotalFormatted,
    totalFormatted,

    addItem,
    removeItem,
    updateQuantity,
    updateNotes,
    clearCart,

    applyPromoCode,
    removePromo,
    promoMessage,

    applyCredit,
    removeCredit,

    getCheckoutPayload,

    findItem,
    isInCart,
    quantityInCart,
    itemLineBreakdown,
    itemModifierSummary,
    itemsByCategory,
    cartItemKey,
    orderTypeLabel,

    sync,
    hydrateFromDB,
    clearFromDB,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience sub-hooks
// ─────────────────────────────────────────────────────────────────────────────

export function useCartItemCount(): number {
  return useCartStore(selectItemCount);
}

export function useCartIsEmpty(): boolean {
  return useCartStore(selectIsEmpty);
}

export function useCartTotals() {
  const totals = useCartStore(selectTotals);
  return formatCartTotals(totals);
}

export { promoErrorMessage };