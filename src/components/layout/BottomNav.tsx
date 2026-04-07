import { useCallback, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, UtensilsCrossed, ClipboardList, User } from 'lucide-react';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useCart } from '@/modules/cart/hooks/useCart';
import { useActiveOrder } from '@/modules/orders/hooks/useActiveOrder';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

type TabId = 'home' | 'menu' | 'orders' | 'account';

type Tab = {
  id: TabId;
  path: string;
  label: string;
  icon: React.ElementType;
  /** Match prefix — e.g. '/menu' matches '/menu/...' */
  matchPrefix?: string;
};

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

// -----------------------------------------------------------------------------
// Tab definitions (order = left-to-right render order)
// -----------------------------------------------------------------------------

const TABS: Tab[] = [
  {
    id: 'home',
    path: '/',
    label: 'Home',
    icon: Home,
  },
  {
    id: 'menu',
    path: '/menu',
    label: 'Menu',
    icon: UtensilsCrossed,
    matchPrefix: '/menu',
  },
  {
    id: 'orders',
    path: '/account/orders',
    label: 'Orders',
    icon: ClipboardList,
    matchPrefix: '/order',
  },
  {
    id: 'account',
    path: '/account',
    label: 'Account',
    icon: User,
    matchPrefix: '/account',
  },
];

// Routes where the bottom nav should be hidden completely
// (full-screen flows that own their own chrome)
const HIDDEN_ON: string[] = [
  '/admin',
  '/kitchen',
  '/expo',
  '/checkout',
  '/update-password',
  '/auth/callback',
];

function useIsNavHidden(pathname: string): boolean {
  return HIDDEN_ON.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function useActiveTab(pathname: string): TabId | null {
  // Most specific match wins
  if (pathname === '/') return 'home';
  if (pathname.startsWith('/menu')) return 'menu';
  if (
    pathname.startsWith('/order-status') ||
    pathname.startsWith('/order-success') ||
    pathname.startsWith('/order-canceled')
  )
    return 'orders';
  if (pathname.startsWith('/account')) return 'account';
  return null;
}

// -----------------------------------------------------------------------------
// Sub-components
// -----------------------------------------------------------------------------

type TabButtonProps = {
  tab: Tab;
  isActive: boolean;
  badge?: number | null;
  hasLivePulse?: boolean;
  onClick?: () => void;
};

function TabButton({ tab, isActive, badge, hasLivePulse, onClick }: TabButtonProps) {
  const Icon = tab.icon;

  return (
    <Link
      to={tab.path}
      onClick={onClick}
      aria-label={tab.label}
      aria-current={isActive ? 'page' : undefined}
      className={cx(
        // Layout
        'relative flex flex-1 flex-col items-center justify-center gap-0.5',
        'py-2 px-1 min-w-0',
        // Touch target
        'min-h-56px',
        // Transitions
        'transition-all duration-(--duration-base)',
        // Focus ring
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-gold-400) focus-visible:ring-inset rounded-lg',
        // Active scale press
        'active:scale-95',
      )}
    >
      {/* Icon container */}
      <div
        className={cx(
          'relative flex items-center justify-center',
          'h-7 w-7 rounded-xl',
          'transition-all duration-(--duration-base)',
          isActive
            ? 'bg-(--color-ember-50) scale-110'
            : 'bg-transparent',
        )}
      >
        <Icon
          className={cx(
            'h-[1.1rem] w-[1.1rem] transition-colors duration-(--duration-base)',
            isActive
              ? 'text-(--color-ember-600)'
              : 'text-(--color-ink-400)',
          )}
          strokeWidth={isActive ? 2.2 : 1.75}
          aria-hidden="true"
        />

        {/* Cart / notification badge */}
        {badge != null && badge > 0 && (
          <span
            className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-(--color-ember-600) px-1 text-[9px] font-bold leading-none text-white shadow-(--shadow-xs)"
            aria-hidden="true"
          >
            {badge > 99 ? '99+' : badge}
          </span>
        )}

        {/* Live order pulse dot */}
        {hasLivePulse && (
          <span
            className="absolute -right-0.5 -top-0.5 flex h-2 w-2"
            aria-hidden="true"
          >
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-(--color-ember-400) opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-(--color-ember-500)" />
          </span>
        )}
      </div>

      {/* Label */}
      <span
        className={cx(
          'text-[10px] font-medium leading-none tracking-wide transition-colors duration-(--duration-base)',
          isActive
            ? 'text-(--color-ember-600)'
            : 'text-(--color-ink-400)',
        )}
      >
        {tab.label}
      </span>

      {/* Active underline pip */}
      <span
        className={cx(
          'absolute bottom-0 left-1/2 h-2px -translate-x-1/2 rounded-full',
          'transition-all duration-(--duration-base)',
          isActive
            ? 'w-6 bg-(--color-ember-500) opacity-100'
            : 'w-0 opacity-0',
        )}
        aria-hidden="true"
      />
    </Link>
  );
}

// -----------------------------------------------------------------------------
// Main component
// -----------------------------------------------------------------------------

export default function BottomNav() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const { itemCount } = useCart();
  const activeOrderId = useActiveOrder(user?.id ?? null);

  const isHidden = useIsNavHidden(pathname);
  const activeTab = useActiveTab(pathname);

  // Only show live-order pulse when user has an active order in progress
  const hasLiveOrder = Boolean(activeOrderId);

  const getTabProps = useCallback(
    (tab: Tab) => {
      const isActive = activeTab === tab.id;

      // Menu tab gets the cart badge
      const badge = tab.id === 'menu' ? (itemCount ?? 0) : null;

      // Orders tab gets the live pulse when tracking
      const hasLivePulse = tab.id === 'orders' && hasLiveOrder;

      // Orders tab: navigate to active order if tracking, else order history
      const path =
        tab.id === 'orders' && activeOrderId
          ? `/order-status/${activeOrderId}`
          : tab.path;

      return { isActive, badge, hasLivePulse, path };
    },
    [activeTab, itemCount, hasLiveOrder, activeOrderId],
  );

  // Resolved tabs with dynamic paths
  const resolvedTabs = useMemo(
    () =>
      TABS.map((tab) => {
        const { isActive, badge, hasLivePulse, path } = getTabProps(tab);
        return { ...tab, path, isActive, badge, hasLivePulse };
      }),
    [getTabProps],
  );

  if (isHidden) return null;

  return (
    <>
      {/*
        Spacer — prevents page content from being hidden behind the nav bar.
        Height = nav bar height (56px) + iOS safe area.
        Must live in the document flow (not fixed) so flex-1 pages push it down.
      */}
      <div
        className="h-[calc(56px+env(safe-area-inset-bottom,0px))] shrink-0 md:hidden"
        aria-hidden="true"
      />

      <nav
        role="navigation"
        aria-label="App navigation"
        className={cx(
          // Position
          'fixed bottom-0 left-0 right-0 z-30',
          // Only show on mobile — desktop uses TopBar links
          'md:hidden',
          // Background + border
          'border-t border-(--color-cream-300)',
          'bg-white/95 backdrop-blur-md',
          // Safe area padding for iPhone home indicator
          'pb-[env(safe-area-inset-bottom,0px)]',
          // Shadow
          'shadow-[0_-1px_0_0_var(--color-cream-300),0_-4px_16px_-2px_rgb(26_18_9/0.08)]',
        )}
      >
        <div className="flex items-stretch">
          {resolvedTabs.map((tab) => (
            <TabButton
              key={tab.id}
              tab={tab}
              isActive={tab.isActive}
              badge={tab.badge}
              hasLivePulse={tab.hasLivePulse}
            />
          ))}
        </div>
      </nav>
    </>
  );
}