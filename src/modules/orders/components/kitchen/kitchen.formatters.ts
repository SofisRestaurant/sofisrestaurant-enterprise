// =============================================================================
// PATH: src/modules/orders/components/kitchen/kitchen.formatters.ts
// =============================================================================

import type { DisplayModifierSelection } from './kitchen.types';

export function formatCurrency(cents: number): string {
  const safeCents = Number.isFinite(cents) ? cents : 0;

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(safeCents / 100);
}

export function getSelectionPriceLabel(selection: DisplayModifierSelection): string | null {
  if (!Number.isFinite(selection.priceAdjustment) || selection.priceAdjustment === 0) {
    return null;
  }

  const prefix = selection.priceAdjustment > 0 ? '+' : '-';
  return `${prefix}${formatCurrency(Math.abs(selection.priceAdjustment))}`;
}

export function getTimeSince(timestamp: string): string {
  const minutes = Math.floor((Date.now() - new Date(timestamp).getTime()) / 60_000);
  if (minutes < 1) {
    return 'Just now';
  }
  if (minutes === 1) {
    return '1 min ago';
  }
  return `${minutes} mins ago`;
}