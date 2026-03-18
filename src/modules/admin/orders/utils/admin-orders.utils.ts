// =============================================================================
// PATH: src/modules/admin/orders/admin-orders.utils.ts
// =============================================================================
// Small shared utility helpers for the admin orders feature.
// Pure functions — no React, no side effects.
// =============================================================================

/**
 * Formats a Date (or null) as a short time string for the "last updated" label.
 * Returns '—' when the date is null.
 *
 * @example formatLastUpdated(new Date()) → "02:45 PM"
 */
export function formatLastUpdated(date: Date | null): string {
  if (!date) return '—';
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Formats a ISO date string as a short human-readable date + time.
 * Used in the order detail meta grid.
 *
 * @example formatOrderCreatedAt("2026-03-17T14:30:00Z") → "Mar 17, 02:30 PM"
 */
export function formatOrderCreatedAt(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Builds the live announcement string for a new incoming order.
 * Used by the realtime INSERT handler to populate the ARIA live region.
 */
export function buildNewOrderAnnouncement(
  orderNumber: string | null,
  customerName: string | null,
  customerEmail: string | null,
): string {
  const orderLabel = orderNumber ?? 'received';
  const customerLabel = customerName ?? customerEmail ?? 'guest';
  return `New order ${orderLabel} from ${customerLabel}.`;
}