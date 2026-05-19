// src/modules/cart/components/CartDisplaySync.tsx
// =============================================================================
// CartDisplaySync
// =============================================================================
// Always-mounted bridge from the real cart store → lightweight cartUi.store.
//
// Purpose:
// - Keeps shell UI synced after reload.
// - Fixes FloatingCartPill disappearing until the drawer/cart is opened.
// - Lets Header, BottomNav, FloatingCartPill, and other shell UI read from
//   cartUi.store without importing heavy cart logic.
//
// Rules:
// - Display-only data.
// - Never used for checkout/payment authority.
// - No auth/session logic.
// - No DOM output.
// =============================================================================

import { useEffect, useMemo } from 'react';

import {
  selectItemCount,
  selectItems,
  selectTotals,
  useCartStore,
} from '@/modules/cart/store/cart.store';
import { useCartUiStore } from '@/modules/cart/store/cartUi.store';
import type { CartItem } from '@/modules/cart/types/cart.types';

// ─── Safe readers ─────────────────────────────────────────────────────────────

function safeNumber(value: unknown, fallback = 0): number {
  const numeric = typeof value === 'number' ? value : Number(value);

  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.max(0, Math.round(numeric));
}

function safeFingerprintPart(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

function readLineTotalCents(item: CartItem): number {
  const record = item as unknown as Record<string, unknown>;

  const directLineTotal = safeNumber(record.lineTotalCents, -1);
  if (directLineTotal >= 0) return directLineTotal;

  const priceCents = safeNumber(record.priceCents ?? record.unitPriceCents, 0);
  const quantity = safeNumber(record.quantity ?? record.qty, 1);

  return priceCents * Math.max(1, quantity);
}

function computeFallbackSubtotalCents(items: readonly CartItem[]): number {
  return items.reduce((sum, item) => sum + readLineTotalCents(item), 0);
}

function buildItemsVersion(items: readonly CartItem[]): string {
  return items
    .map((item) => {
      const record = item as unknown as Record<string, unknown>;

      const id = safeFingerprintPart(record.menuItemId ?? record.id);
      const quantity = safeFingerprintPart(record.quantity ?? record.qty, '1');
      const cents = safeFingerprintPart(
        record.lineTotalCents ?? record.priceCents ?? record.unitPriceCents,
        '0',
      );

      return `${id}:${quantity}:${cents}`;
    })
    .join('|');
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CartDisplaySync() {
  const itemCount = useCartStore(selectItemCount);
  const items = useCartStore(selectItems);
  const totals = useCartStore(selectTotals);

  const safeItems = useMemo<readonly CartItem[]>(
    () => (Array.isArray(items) ? items : []),
    [items],
  );

  const itemsVersion = useMemo(() => buildItemsVersion(safeItems), [safeItems]);

  const subtotalCents = useMemo(() => {
    const totalsSubtotal = safeNumber(totals?.subtotalCents, -1);

    if (totalsSubtotal >= 0) {
      return totalsSubtotal;
    }

    return computeFallbackSubtotalCents(safeItems);
  }, [safeItems, totals?.subtotalCents]);

  useEffect(() => {
    useCartUiStore.getState().syncDisplayData(safeNumber(itemCount, 0), subtotalCents);
  }, [itemCount, subtotalCents, itemsVersion]);

  return null;
}

export default CartDisplaySync;