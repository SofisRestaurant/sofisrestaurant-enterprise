// src/components/layout/BottomNav.tsx
// =============================================================================
// Mobile bottom navigation
//
// Professional behavior:
// 1. Hidden on admin/kitchen/expo/checkout/auth utility routes.
// 2. Auto-hides only after intentional downward scrolling, not immediately.
// 3. Reappears when scrolling up, near the top of the page, after resize, or
//    when route changes.
// 4. Exposes --bottom-nav-offset so FloatingCartPill can move with it.
// 5. Keeps iOS Safari performance stable:
//    - no backdrop-blur on the fixed nav
//    - translate3d compositor isolation
//    - transition only transform/colors
// 6. Respects safe-area inset for modern iPhones.
// =============================================================================

import { useEffect, useMemo, useRef, useState, type ElementType } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, ShoppingBag, User, UtensilsCrossed } from 'lucide-react';

import { useActiveOrderId } from '@/app/ActiveOrderContext';
import { useCart } from '@/modules/cart/hooks/useCart';
import { useCartUiStore } from '@/modules/cart/store/cartUi.store';

type TabId = 'home' | 'menu' | 'cart' | 'account';

type Tab = {
  id: TabId;
  path: string;
  label: string;
  icon: ElementType;
  isButton?: boolean;
};

type TabButtonProps = {
  tab: Tab;
  isActive: boolean;
  badge?: number | null;
  hasLivePulse?: boolean;
  onCartClick?: () => void;
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

const TABS: Tab[] = [
  { id: 'home', path: '/', label: 'Home', icon: Home },
  { id: 'menu', path: '/menu', label: 'Menu', icon: UtensilsCrossed },
  { id: 'cart', path: '', label: 'Cart', icon: ShoppingBag, isButton: true },
  { id: 'account', path: '/account', label: 'Account', icon: User },
];

const HIDDEN_ON = [
  '/admin',
  '/kitchen',
  '/expo',
  '/checkout',
  '/update-password',
  '/auth/callback',
];

const TOP_LOCK_THRESHOLD_PX = 140;
const INTENTIONAL_DOWN_SCROLL_PX = 72;
const SCROLL_DELTA_THRESHOLD_PX = 6;
const MIN_VISIBLE_TIME_MS = 420;

const BOTTOM_NAV_VISIBLE_OFFSET = '56px';
const BOTTOM_NAV_COLLAPSED_OFFSET = '18px';

function useIsNavHidden(pathname: string) {
  return HIDDEN_ON.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function useActiveTab(pathname: string): TabId | null {
  if (pathname === '/') return 'home';
  if (pathname.startsWith('/menu')) return 'menu';
  if (pathname.startsWith('/account') || pathname.startsWith('/order')) return 'account';

  return null;
}

function useAutoHideBottomNav(isRouteHidden: boolean, pathname: string) {
  const [isAutoHidden, setIsAutoHidden] = useState(false);

  const lastScrollYRef = useRef(0);
  const accumulatedDownScrollRef = useRef(0);
  const lastShownAtRef = useRef(Date.now());
  const tickingRef = useRef(false);

  useEffect(() => {
    setIsAutoHidden(false);
    accumulatedDownScrollRef.current = 0;
    lastScrollYRef.current = Math.max(window.scrollY, 0);
    lastShownAtRef.current = Date.now();
  }, [isRouteHidden, pathname]);

  useEffect(() => {
    if (isRouteHidden) {
      return;
    }

    function showNav(currentScrollY: number) {
      setIsAutoHidden(false);
      accumulatedDownScrollRef.current = 0;
      lastShownAtRef.current = Date.now();
      lastScrollYRef.current = currentScrollY;
    }

    function updateNavVisibility() {
      const currentScrollY = Math.max(window.scrollY, 0);
      const previousScrollY = lastScrollYRef.current;
      const delta = currentScrollY - previousScrollY;

      tickingRef.current = false;

      if (currentScrollY < TOP_LOCK_THRESHOLD_PX) {
        showNav(currentScrollY);
        return;
      }

      if (Math.abs(delta) < SCROLL_DELTA_THRESHOLD_PX) {
        return;
      }

      if (delta < 0) {
        showNav(currentScrollY);
        return;
      }

      accumulatedDownScrollRef.current += delta;

      const hasScrolledWithIntent = accumulatedDownScrollRef.current >= INTENTIONAL_DOWN_SCROLL_PX;

      const hasStayedVisibleLongEnough = Date.now() - lastShownAtRef.current >= MIN_VISIBLE_TIME_MS;

      if (hasScrolledWithIntent && hasStayedVisibleLongEnough) {
        setIsAutoHidden(true);
      }

      lastScrollYRef.current = currentScrollY;
    }

    function handleScroll() {
      if (tickingRef.current) {
        return;
      }

      tickingRef.current = true;
      window.requestAnimationFrame(updateNavVisibility);
    }

    function handleResize() {
      setIsAutoHidden(false);
      accumulatedDownScrollRef.current = 0;
      lastScrollYRef.current = Math.max(window.scrollY, 0);
      lastShownAtRef.current = Date.now();
    }

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
    };
  }, [isRouteHidden]);

  return isAutoHidden;
}

function TabButton({ tab, isActive, badge, hasLivePulse, onCartClick }: TabButtonProps) {
  const Icon = tab.icon;

  const inner = (
    <>
      <div
        className={cx(
          'relative flex h-7 w-7 shrink-0 items-center justify-center rounded-xl',
          'transition-colors duration-200',
          isActive ? 'bg-(--color-ember-50)' : 'bg-transparent',
        )}
      >
        <Icon
          className={cx(
            'h-5 w-5 shrink-0 transition-colors duration-200',
            isActive ? 'text-(--color-ember-600)' : 'text-[var(--app-muted)]',
          )}
          strokeWidth={isActive ? 2.2 : 1.75}
          aria-hidden="true"
        />

        {badge != null && badge > 0 && (
          <span
            className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-(--color-ember-600) px-1 text-[9px] font-bold leading-none text-white shadow-(--shadow-xs)"
            aria-hidden="true"
          >
            {badge > 99 ? '99+' : badge}
          </span>
        )}

        {hasLivePulse && (
          <span className="absolute -right-0.5 -top-0.5 flex h-2 w-2" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-(--color-ember-400) opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-(--color-ember-500)" />
          </span>
        )}
      </div>

      <span
        className={cx(
          'text-[10px] font-medium leading-none tracking-wide transition-colors duration-200',
          isActive ? 'text-(--color-ember-600)' : 'text-[var(--app-muted)]',
        )}
      >
        {tab.label}
      </span>

      <span
        className={cx(
          'absolute bottom-0 left-1/2 h-px -translate-x-1/2 rounded-full transition-[width,opacity] duration-200',
          isActive ? 'w-6 bg-(--color-ember-500) opacity-100' : 'w-0 opacity-0',
        )}
        aria-hidden="true"
      />
    </>
  );

  const baseClass = cx(
    'relative flex min-h-[56px] min-w-0 flex-col items-center justify-center gap-0.5',
    'rounded-lg px-1 py-2',
    'text-[var(--app-muted)] transition-colors duration-200',
    'active:scale-95',
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-gold-400) focus-visible:ring-inset',
  );

  if (tab.isButton) {
    return (
      <button
        type="button"
        onClick={onCartClick}
        aria-label={`${tab.label}${badge ? ` (${badge})` : ''}`}
        className={baseClass}
      >
        {inner}
      </button>
    );
  }

  return (
    <Link
      to={tab.path}
      aria-label={tab.label}
      aria-current={isActive ? 'page' : undefined}
      className={baseClass}
    >
      {inner}
    </Link>
  );
}

export default function BottomNav() {
  const { pathname } = useLocation();
  const { itemCount } = useCart();
  const activeOrderId = useActiveOrderId();
  const openCart = useCartUiStore((state) => state.open);

  const isRouteHidden = useIsNavHidden(pathname);
  const isAutoHidden = useAutoHideBottomNav(isRouteHidden, pathname);
  const activeTab = useActiveTab(pathname);

  const hasLiveOrder = Boolean(activeOrderId);
  const cartCount = itemCount ?? 0;

  useEffect(() => {
    const root = document.documentElement;

    if (isRouteHidden) {
      root.style.setProperty('--bottom-nav-offset', '0px');
      root.dataset.bottomNav = 'hidden';
      return;
    }

    if (isAutoHidden) {
      root.style.setProperty('--bottom-nav-offset', BOTTOM_NAV_COLLAPSED_OFFSET);
      root.dataset.bottomNav = 'collapsed';
      return;
    }

    root.style.setProperty('--bottom-nav-offset', BOTTOM_NAV_VISIBLE_OFFSET);
    root.dataset.bottomNav = 'visible';

    return () => {
      root.style.removeProperty('--bottom-nav-offset');
      delete root.dataset.bottomNav;
    };
  }, [isRouteHidden, isAutoHidden]);

  const resolvedTabs = useMemo(
    () =>
      TABS.map((tab) => ({
        ...tab,
        isActive: activeTab === tab.id,
        badge: tab.id === 'cart' ? (cartCount > 0 ? cartCount : null) : null,
        hasLivePulse: tab.id === 'account' && hasLiveOrder,
      })),
    [activeTab, cartCount, hasLiveOrder],
  );

  if (isRouteHidden) {
    return null;
  }

  return (
    <>
      <div
        className="h-[calc(56px+env(safe-area-inset-bottom,0px))] shrink-0 md:hidden"
        aria-hidden="true"
      />

      <nav
        role="navigation"
        aria-label="App navigation"
        data-state={isAutoHidden ? 'collapsed' : 'visible'}
        className={cx(
          'fixed bottom-0 left-0 right-0 z-30 md:hidden',
          'border-t border-[var(--app-divider)] bg-[var(--app-header)]',
          'pb-[env(safe-area-inset-bottom,0px)]',
          'transition-[transform,background-color,border-color] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]',
          'motion-reduce:transition-none',
        )}
        style={{
          transform: isAutoHidden
            ? 'translate3d(0, calc(92% + env(safe-area-inset-bottom, 0px)), 0)'
            : 'translate3d(0, 0, 0)',
          willChange: 'transform',
        }}
      >
        <div className="grid grid-cols-4">
          {resolvedTabs.map((tab) => (
            <TabButton
              key={tab.id}
              tab={tab}
              isActive={tab.isActive}
              badge={tab.badge}
              hasLivePulse={tab.hasLivePulse}
              onCartClick={openCart}
            />
          ))}
        </div>
      </nav>
    </>
  );
}