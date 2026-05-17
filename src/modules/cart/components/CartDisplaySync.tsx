// src/modules/cart/components/CartDisplaySync.tsx
// =============================================================================
// Cart Display Sync — bridges real cart state → lightweight cartUi.store
// =============================================================================
//
// Purpose:
//   Shell components (TopBar, Header, BottomNav, FloatingCartPill) need
//   itemCount and subtotalCents for badge display. They must NOT import
//   the heavy useCart hook.
//
// Professional sync behavior:
//   - selectItemCount is the source of truth for badge count.
//   - selectTotals is the preferred source for subtotalCents.
//   - selectItems is intentionally used as a fallback/validation source in case
//     totals are briefly unavailable during hydration, reset, clear, or restore.
//   - subtotalCents is DISPLAY-ONLY. Checkout/payment remains server-authoritative.
//
// Safety:
//   - No checkout/payment logic is changed.
//   - No auth/session logic here.
//   - No DOM output.
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
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : fallback;
}

function safeFingerprintPart(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value === null || value === undefined) return fallback;
  return fallback;
}

function readLineTotalCents(item: CartItem): number {
  const record = item as unknown as Record<string, unknown>;

  // Prefer already-computed line total if the cart item has it.
  const directLineTotal = safeNumber(record.lineTotalCents, -1);
  if (directLineTotal >= 0) return directLineTotal;

  // Fallbacks for alternate cart shapes. These are display-only.
  const priceCents = safeNumber(record.priceCents ?? record.unitPriceCents, 0);
  const quantity = safeNumber(record.quantity ?? record.qty, 1);

  return priceCents * Math.max(1, quantity);
}

function computeFallbackSubtotalCents(items: readonly CartItem[]): number {
  return items.reduce((sum, item) => sum + readLineTotalCents(item), 0);
}

function buildItemsVersion(items: readonly CartItem[]): string {
  // Stable fingerprint for meaningful cart display changes.
  // Uses explicit primitive conversion to satisfy no-base-to-string.
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

export default function CartDisplaySync() {
  const itemCount = useCartStore(selectItemCount);
  const items = useCartStore(selectItems);
  const totals = useCartStore(selectTotals);

  const safeItems = Array.isArray(items) ? items : [];

  const subtotalCents = useMemo(() => {
    const totalsSubtotal = safeNumber(totals?.subtotalCents, -1);

    if (totalsSubtotal >= 0) {
      return totalsSubtotal;
    }

    return computeFallbackSubtotalCents(safeItems);
  }, [safeItems, totals?.subtotalCents]);

  const itemsVersion = useMemo(() => buildItemsVersion(safeItems), [safeItems]);

  useEffect(() => {
    useCartUiStore.getState().syncDisplayData(safeNumber(itemCount, 0), subtotalCents);
  }, [itemCount, subtotalCents, itemsVersion]);

  return null;
}