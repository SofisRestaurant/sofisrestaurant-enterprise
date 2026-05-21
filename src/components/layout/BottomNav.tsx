// src/components/layout/BottomNav.tsx
// =============================================================================
// Premium floating dock — 5-tab mobile navigation
// =============================================================================
// PERF FIX:
//   - Removed `useCart` import → replaced with `useCartUiStore` selector.
//     This removes cart.store.ts / Supabase / auth from the initial shell bundle.
//   - All other behavior preserved exactly.
// =============================================================================

import { memo, useMemo, type CSSProperties, type ElementType } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, ShoppingBag, Tag, User, UtensilsCrossed } from 'lucide-react';

import { useActiveOrderId } from '@/app/ActiveOrderContext';
import { useBottomDockState, type BottomDockTabId } from '@/components/layout/useBottomDockState';
import { useCartUiStore } from '@/modules/cart/store/cartUi.store';

// ── Types ─────────────────────────────────────────────────────────────────────

type TabId = BottomDockTabId;

type Tab = {
  id: TabId;
  path: string;
  label: string;
  icon: ElementType;
  isButton?: boolean;
};

type ResolvedTab = Tab & {
  isActive: boolean;
  badge: number | null;
  hasLivePulse: boolean;
};

type StandardTabProps = {
  tab: ResolvedTab;
};

type CartButtonProps = {
  badge: number | null;
  onCartClick: () => void;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

function formatCartLabel(count: number | null): string {
  if (count == null || count <= 0) return 'Cart';
  return `Cart — ${count} item${count === 1 ? '' : 's'}`;
}

// ── Config ────────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'home', path: '/', label: 'Home', icon: Home },
  { id: 'menu', path: '/menu', label: 'Menu', icon: UtensilsCrossed },
  { id: 'cart', path: '', label: 'Cart', icon: ShoppingBag, isButton: true },
  { id: 'deals', path: '/deals', label: 'Deals', icon: Tag },
  { id: 'account', path: '/account', label: 'Account', icon: User },
] as const satisfies readonly Tab[];

const DOCK_TRANSITION =
  'transition-[transform,opacity] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]';

const FOCUS_RING =
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-400)] focus-visible:ring-inset';

const TAB_BASE = cx(
  'group relative flex min-h-[56px] min-w-0 flex-col items-center justify-center gap-1',
  'touch-manipulation select-none rounded-[1.75rem] px-1.5 py-2',
  '[-webkit-tap-highlight-color:transparent]',
);

const DOCK_SHELL_STYLE: CSSProperties = {
  boxShadow:
    '0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.10), inset 0 1px 0 rgba(255,255,255,0.08)',
};

const CART_BUTTON_STYLE: CSSProperties = {
  boxShadow: '0 4px 16px rgba(212,175,55,0.42), 0 1px 4px rgba(0,0,0,0.22)',
};

// ── Standard tab ──────────────────────────────────────────────────────────────

const StandardTab = memo(function StandardTab({ tab }: StandardTabProps) {
  const Icon = tab.icon;

  return (
    <Link
      to={tab.path}
      aria-label={tab.label}
      aria-current={tab.isActive ? 'page' : undefined}
      prefetch="intent"
      className={cx(TAB_BASE, 'transition-colors duration-200 active:scale-95', FOCUS_RING)}
    >
      <span
        className={cx(
          'relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
          'transition-colors duration-200',
          tab.isActive
            ? 'bg-(--color-ember-50)'
            : 'bg-transparent group-hover:bg-[var(--app-surface-hover)]',
        )}
      >
        <Icon
          className={cx(
            'h-5 w-5 transition-colors duration-200',
            tab.isActive ? 'text-(--color-ember-600)' : 'text-(--color-ink-600)',
          )}
          strokeWidth={tab.isActive ? 2.25 : 1.8}
          aria-hidden="true"
        />

        {tab.hasLivePulse && (
          <span className="absolute -right-0.5 -top-0.5 flex h-2.5 w-2.5" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-(--color-ember-400) opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-(--color-ember-500)" />
          </span>
        )}
      </span>

      <span
        className={cx(
          'max-w-full truncate text-[10px] font-semibold leading-none tracking-wide',
          'transition-colors duration-200',
          tab.isActive ? 'text-(--color-ember-600)' : 'text-(--color-ink-600)',
        )}
      >
        {tab.label}
      </span>

      <span
        className={cx(
          'absolute bottom-1 left-1/2 h-0.5 -translate-x-1/2 rounded-full',
          'transition-[width,opacity] duration-200',
          tab.isActive ? 'w-6 bg-(--color-ember-500) opacity-100' : 'w-0 opacity-0',
        )}
        aria-hidden="true"
      />
    </Link>
  );
});

// ── Center cart button ────────────────────────────────────────────────────────

const CartButton = memo(function CartButton({ badge, onCartClick }: CartButtonProps) {
  const hasItems = badge != null && badge > 0;

  return (
    <button
      type="button"
      onClick={onCartClick}
      aria-label={formatCartLabel(badge)}
      className={cx(TAB_BASE, 'transition-transform duration-150 active:scale-95', FOCUS_RING)}
    >
      <span
        className={cx(
          'relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full',
          'bg-gradient-to-br from-[var(--color-gold-300)] via-[var(--color-gold-400)] to-[var(--color-ember-600)]',
          'transition-[box-shadow,transform] duration-200',
          'group-hover:scale-[1.03]',
        )}
        style={CART_BUTTON_STYLE}
      >
        <ShoppingBag
          className="h-5 w-5 text-[var(--color-stone-900)]"
          strokeWidth={2.25}
          aria-hidden="true"
        />

        {hasItems && (
          <span
            className={cx(
              'absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center',
              'rounded-full bg-(--color-ember-600) px-1',
              'text-[9px] font-bold leading-none text-white',
              'ring-2 ring-[var(--app-header)]',
            )}
            aria-hidden="true"
          >
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </span>

      <span className="max-w-full truncate text-[10px] font-bold leading-none tracking-wide text-[var(--color-gold-500)]">
        Cart
      </span>
    </button>
  );
});

// ── Component ─────────────────────────────────────────────────────────────────

export default function BottomNav() {
  const { pathname } = useLocation();

  // PERF: Read itemCount from lightweight UI store instead of heavy useCart hook
  const itemCount = useCartUiStore((s) => s.itemCount);
  const openCart = useCartUiStore((state) => state.open);

  const activeOrderId = useActiveOrderId();

  const cartCount = itemCount ?? 0;
  const hasCartItems = cartCount > 0;
  const hasLiveOrder = Boolean(activeOrderId);

  const { isRouteHidden, dockState, isCollapsed, activeTab, dockTranslateY, dockOpacity } =
    useBottomDockState({
      pathname,
      keepVisible: hasCartItems,
    });

  const dockStyle = useMemo<CSSProperties>(
    () => ({
      transform: `translate3d(0, ${dockTranslateY}, 0)`,
      WebkitTransform: `translate3d(0, ${dockTranslateY}, 0)`,
      opacity: dockOpacity,
      willChange: isCollapsed ? 'transform, opacity' : 'auto',
      backfaceVisibility: 'hidden',
      WebkitBackfaceVisibility: 'hidden',
      contain: 'layout paint style',
    }),
    [dockOpacity, dockTranslateY, isCollapsed],
  );

  const resolvedTabs = useMemo<ResolvedTab[]>(
    () =>
      TABS.map((tab) => ({
        ...tab,
        isActive: tab.id !== 'cart' && activeTab === tab.id,
        badge: tab.id === 'cart' && hasCartItems ? cartCount : null,
        hasLivePulse: tab.id === 'account' && hasLiveOrder,
      })),
    [activeTab, cartCount, hasCartItems, hasLiveOrder],
  );

  if (isRouteHidden) return null;

  return (
    <>
      <div
        className="h-[calc(76px+env(safe-area-inset-bottom,0px))] shrink-0 md:hidden"
        aria-hidden="true"
      />

      <div
        data-bottom-nav-dock="true"
        data-state={dockState}
        className={cx(
          'fixed bottom-0 left-0 right-0 z-30 md:hidden',
          DOCK_TRANSITION,
          'motion-reduce:transition-none',
        )}
        style={dockStyle}
      >
        <div className="px-3 pb-[max(env(safe-area-inset-bottom,0px),12px)] pt-2 min-[390px]:px-4">
          <nav
            role="navigation"
            aria-label="App navigation"
            className={cx(
              'grid grid-cols-5',
              'rounded-[2.5rem]',
              'border border-[var(--app-divider)] bg-[var(--app-header)]',
              'px-1 py-1',
              'transition-colors duration-200',
              'motion-reduce:transition-none',
            )}
            style={DOCK_SHELL_STYLE}
          >
            {resolvedTabs.map((tab) =>
              tab.isButton ? (
                <CartButton key={tab.id} badge={tab.badge} onCartClick={openCart} />
              ) : (
                <StandardTab key={tab.id} tab={tab} />
              ),
            )}
          </nav>
        </div>
      </div>
    </>
  );
}