// =============================================================================
// PATH: src/modules/admin/orders/admin-orders.constants.ts
// =============================================================================
// All static config for the admin orders feature.
// Import from here — never hardcode these values elsewhere.
// =============================================================================

// ─── Polling ──────────────────────────────────────────────────────────────────

/** Interval (ms) between automatic order list refreshes. */
export const AUTO_REFRESH_MS = 20_000;

// ─── Priority thresholds ──────────────────────────────────────────────────────

/** Minutes since creation before an active order is considered high priority. */
export const HIGH_PRIORITY_MINUTES = 12;

/** Minutes since creation before an active order is considered urgent. */
export const URGENT_PRIORITY_MINUTES = 20;

// ─── Status sets ─────────────────────────────────────────────────────────────

/**
 * Statuses that are displayed under the "New" filter tab.
 * Both 'confirmed' (Stripe-verified) and 'pending' (unverified) map to "New".
 */
export const NEW_STATUSES = new Set<string>(['confirmed', 'pending']);

/** Statuses that are considered terminal — no further progression is possible. */
export const TERMINAL_STATUSES = new Set<string>(['delivered', 'cancelled']);

// ─── Status progression ───────────────────────────────────────────────────────

/**
 * Maps each order status to the next valid status in the kitchen workflow.
 * null means the order has reached a terminal state.
 */
export const NEXT_STATUS: Readonly<Record<string, string | null>> = {
  pending:   'preparing',
  confirmed: 'preparing',
  preparing: 'ready',
  ready:     'delivered',
  delivered: null,
  cancelled: null,
};

// ─── Filter tabs ──────────────────────────────────────────────────────────────

export type FilterTab = 'all' | 'new' | 'preparing' | 'ready' | 'delivered' | 'cancelled';

export const FILTER_TABS: ReadonlyArray<{ key: FilterTab; label: string }> = [
  { key: 'all',       label: 'All'       },
  { key: 'new',       label: 'New'       },
  { key: 'preparing', label: 'Cooking'   },
  { key: 'ready',     label: 'Ready'     },
  { key: 'delivered', label: 'Delivered' },
  { key: 'cancelled', label: 'Cancelled' },
] as const;

// ─── Realtime ─────────────────────────────────────────────────────────────────

/** Supabase realtime channel name for the admin orders page. */
export const REALTIME_CHANNEL = 'admin-orders-page';

/** Milliseconds before a live announcement is cleared from the ARIA live region. */
export const LIVE_ANNOUNCEMENT_TTL_MS = 4_000;

// ─── Audio ────────────────────────────────────────────────────────────────────

/** Path to the new-order notification sound asset. */
export const NOTIFICATION_SOUND_SRC = '/notification.mp3';