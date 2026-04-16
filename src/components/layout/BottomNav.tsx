// src/components/layout/BottomNav.tsx
// Cart tab added — replaces Orders tab (orders accessible via Account).
// Badge moved from Menu to Cart. Cart tap opens cartUi.store.
import { useCallback, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, UtensilsCrossed, ShoppingBag, User } from 'lucide-react';
import { useCart } from '@/modules/cart/hooks/useCart';
import { useCartUiStore } from '@/modules/cart/store/cartUi.store';
import { useActiveOrderId } from '@/app/ActiveOrderContext';

type TabId = 'home' | 'menu' | 'cart' | 'account';

type Tab = {
  id: TabId;
  path: string;
  label: string;
  icon: React.ElementType;
  isButton?: boolean;
};

function cx(...c: (string | false | null | undefined)[]): string {
  return c.filter(Boolean).join(' ');
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

function useIsNavHidden(p: string) {
  return HIDDEN_ON.some((prefix) => p === prefix || p.startsWith(`${prefix}/`));
}

function useActiveTab(p: string): TabId | null {
  if (p === '/') return 'home';
  if (p.startsWith('/menu')) return 'menu';
  if (p.startsWith('/account') || p.startsWith('/order')) return 'account';
  return null;
}

type TabButtonProps = {
  tab: Tab;
  isActive: boolean;
  badge?: number | null;
  hasLivePulse?: boolean;
  onCartClick?: () => void;
};

function TabButton({ tab, isActive, badge, hasLivePulse, onCartClick }: TabButtonProps) {
  const Icon = tab.icon;
  const inner = (
    <>
      <div
        className={cx(
          'relative flex items-center justify-center h-7 w-7 rounded-xl transition-all',
          isActive ? 'bg-(--color-ember-50) scale-110' : 'bg-transparent',
        )}
      >
        <Icon
          className={cx(
            'h-[1.1rem] w-[1.1rem] transition-colors',
            isActive ? 'text-(--color-ember-600)' : 'text-(--color-ink-400)',
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
          'text-[10px] font-medium leading-none tracking-wide transition-colors',
          isActive ? 'text-(--color-ember-600)' : 'text-(--color-ink-400)',
        )}
      >
        {tab.label}
      </span>
      <span
        className={cx(
          'absolute bottom-0 left-1/2 h-2px -translate-x-1/2 rounded-full transition-all',
          isActive ? 'w-6 bg-(--color-ember-500) opacity-100' : 'w-0 opacity-0',
        )}
        aria-hidden="true"
      />
    </>
  );

  const baseClass = cx(
    'relative flex flex-1 flex-col items-center justify-center gap-0.5 py-2 px-1 min-w-0 min-h-[56px] transition-all active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-gold-400) focus-visible:ring-inset rounded-lg',
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
  const openCart = useCartUiStore((s) => s.open);
  const isHidden = useIsNavHidden(pathname);
  const activeTab = useActiveTab(pathname);
  const hasLiveOrder = Boolean(activeOrderId);
  const cartCount = itemCount ?? 0;

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

  if (isHidden) return null;

  return (
    <>
      <div
        className="h-[calc(56px+env(safe-area-inset-bottom,0px))] shrink-0 md:hidden"
        aria-hidden="true"
      />
      <nav
        role="navigation"
        aria-label="App navigation"
        className={cx(
          'fixed bottom-0 left-0 right-0 z-30 md:hidden',
          'border-t border-(--color-cream-300)',
          'bg-white/95 backdrop-blur-md',
          'pb-[env(safe-area-inset-bottom,0px)]',
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
              onCartClick={openCart}
            />
          ))}
        </div>
      </nav>
    </>
  );
}
