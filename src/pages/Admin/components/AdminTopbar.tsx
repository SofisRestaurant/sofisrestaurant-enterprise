// =============================================================================
// src/pages/Admin/components/AdminTopbar.tsx
// =============================================================================
// Top navigation bar for the admin layout.
//
// Renders:
//   - Mobile hamburger (opens sidebar)
//   - Breadcrumb: Admin / {page}
//   - Pending orders chip (live pulse, links to /admin/orders)
//   - Abandoned carts chip (links to /admin/marketing/abandoned)
//   - Pending carts chip (softer signal)
//   - Notification bell with unread badge
//
// Props are intentionally flat — no hook calls, no context.
// All data flows down from AdminLayout.
// =============================================================================

import { useNavigate } from 'react-router-dom';
import { fmtCount } from '../admin-layout.utils';
import type { AdminLayoutSnapshot } from '../admin-layout.types';

// ── Inline SVGs ───────────────────────────────────────────────────────────────

const IconBurger = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none"
    stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
    <path d="M2 4h14M2 9h14M2 14h14" />
  </svg>
);

const IconBell = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
    stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
    <path d="M5.5 11.5a1.5 1.5 0 003 0" />
    <path d="M7 2a3.5 3.5 0 013.5 3.5c0 2.5 1 3.5 1 3.5H2.5s1-1 1-3.5A3.5 3.5 0 017 2z" />
  </svg>
);

const IconCart = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"
    stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
    <path d="M1 1h1.5l1.3 5.5h5.5l.9-3.5H3.5" />
    <circle cx="5" cy="10" r=".9" />
    <circle cx="9.5" cy="10" r=".9" />
  </svg>
);

// ── Live pulse dot ────────────────────────────────────────────────────────────

function PulseDot() {
  return (
    <span className="relative flex h-1.5 w-1.5">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-amber-500" />
    </span>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface AdminTopbarProps {
  /** Derived from location.pathname — the last path segment */
  pageTitle: string;
  snapshot: AdminLayoutSnapshot | null;
  /** True while initial data loads — hides action chips to avoid empty flash */
  isLoading: boolean;
  /** Called when the mobile hamburger button is pressed */
  onOpenSidebar: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AdminTopbar({
  pageTitle,
  snapshot,
  isLoading,
  onOpenSidebar,
}: AdminTopbarProps) {
  const navigate = useNavigate();

  return (
    <header className="h-14 shrink-0 border-b border-zinc-800 bg-zinc-900/40 flex items-center justify-between px-5">

      {/* ── Left: hamburger + breadcrumb ─────────────────────────────── */}
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenSidebar}
          className="lg:hidden text-zinc-400 hover:text-white transition-colors"
          aria-label="Open sidebar"
        >
          <IconBurger />
        </button>

        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs">
          <span className="text-zinc-600">Admin</span>
          {pageTitle && (
            <>
              <span className="text-zinc-700" aria-hidden>/</span>
              <span className="text-zinc-300 font-semibold capitalize">{pageTitle}</span>
            </>
          )}
        </nav>
      </div>

      {/* ── Right: action chips + bell ───────────────────────────────── */}
      <div className="flex items-center gap-2">

        {/* Pending orders — highest urgency, amber pulse */}
        {!isLoading && snapshot && snapshot.pending_orders > 0 && (
          <button
            onClick={() => navigate('/admin/orders')}
            className="hidden sm:flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20 transition-colors"
            aria-label={`${snapshot.pending_orders} pending orders`}
          >
            <PulseDot />
            {fmtCount(snapshot.pending_orders)} pending
          </button>
        )}

        {/* Abandoned carts — orange signal */}
        {!isLoading && snapshot && snapshot.abandoned_carts > 0 && (
          <button
            onClick={() => navigate('/admin/marketing/abandoned')}
            className="hidden sm:flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-400 hover:bg-orange-500/20 transition-colors"
            aria-label={`${snapshot.abandoned_carts} abandoned carts`}
          >
            <IconCart />
            {fmtCount(snapshot.abandoned_carts)} abandoned
          </button>
        )}

        {/* Pending carts — softer zinc signal */}
        {!isLoading && snapshot && snapshot.pending_carts > 0 && (
          <button
            onClick={() => navigate('/admin/marketing/abandoned')}
            className="hidden md:flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-zinc-700/40 border border-zinc-700 text-zinc-400 hover:bg-zinc-700/60 transition-colors"
            aria-label={`${snapshot.pending_carts} carts in progress`}
          >
            {fmtCount(snapshot.pending_carts)} in cart
          </button>
        )}

        {/* Notification bell with unread badge */}
        <button
          onClick={() => navigate('/admin/notifications')}
          className="relative p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors"
          title="Notifications"
          aria-label={
            snapshot && snapshot.unread_notifications > 0
              ? `${snapshot.unread_notifications} unread notifications`
              : 'Notifications'
          }
        >
          <IconBell />
          {!isLoading && snapshot && snapshot.unread_notifications > 0 && (
            <span
              className="absolute top-1 right-1 h-3.5 w-3.5 flex items-center justify-center bg-amber-500 text-black text-[8px] font-black rounded-full leading-none"
              aria-hidden
            >
              {snapshot.unread_notifications > 9
                ? '9+'
                : fmtCount(snapshot.unread_notifications)}
            </span>
          )}
        </button>
      </div>
    </header>
  );
}