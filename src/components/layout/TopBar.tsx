// src/components/layout/TopBar.tsx
// =============================================================================
// TOP BAR — Premium Mobile-First Shell
// =============================================================================
// Goals:
//   - Keep initial shell lightweight.
//   - Keep cart UI lightweight through useCartUiStore.
//   - Use TopBarBrand for real logo + identity + kitchen status.
//   - Prevent mobile controls from squeezing the brand.
//   - Preserve order intent, search, auth, cart, and modal behavior.
//   - Preserve dark/light theme support.
// =============================================================================

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Clock3, LogOut, Search, ShoppingCart, User, X } from 'lucide-react';

import { useActiveOrderId } from '@/app/ActiveOrderContext';
import TopBarBrand from '@/components/layout/TopBarBrand';
import { Button } from '@/components/ui/Button';
import { useModal } from '@/components/ui/useModal';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useTranslation } from '@/i18n/useTranslation';
import { useCartUiStore } from '@/modules/cart/store/cartUi.store';
import MenuHeaderSearch from '@/modules/menu/components/MenuHeaderSearch';
import { useMenuUi } from '@/modules/menu/store/menuUi.store';
import {
  getPickupTimingLabel,
  useOrderIntentStore,
} from '@/modules/orders/store/orderIntent.store';
import { canAccessAdmin } from '@/security/permissions';

const OrderIntentSelector = lazy(() => import('@/modules/orders/components/OrderIntentSelector'));
const MobileOrderIntentSheet = lazy(() => import('@/modules/orders/components/MobileOrderIntentSheet'));

type NavLinkKey = 'home' | 'menu' | 'deals' | 'about' | 'contact';
type NavLink = { path: string; key: NavLinkKey };

const NAV_LINKS: NavLink[] = [
  { path: '/', key: 'home' },
  { path: '/menu', key: 'menu' },
  { path: '/deals', key: 'deals' },
  { path: '/about', key: 'about' },
  { path: '/contact', key: 'contact' },
];

const SEARCH_DEBOUNCE_MS = 150;
const HIDDEN_ON = ['/admin', '/kitchen', '/expo'];

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

function isHiddenRoute(pathname: string): boolean {
  return HIDDEN_ON.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

function readCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

export default function TopBar() {
  const { t } = useTranslation();
  const { pathname } = useLocation();

  const isMenu = pathname === '/menu' || pathname.startsWith('/menu/');
  const hidden = isHiddenRoute(pathname);

  const { user, profile, signOut } = useAuth();
  const modal = useModal();
  const activeOrderId = useActiveOrderId();

  const itemCount = useCartUiStore((state) => state.itemCount);
  const openCart = useCartUiStore((state) => state.open);

  const menuSearchText = useMenuUi((state) => state.searchText);
  const setMenuSearchText = useMenuUi((state) => state.setSearchText);

  const pickupTiming = useOrderIntentStore((state) => state.pickupTiming);
  const mobileSheetOpen = useOrderIntentStore((state) => state.mobileSheetOpen);
  const [isDesktopNav, setIsDesktopNav] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(min-width: 768px)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const media = window.matchMedia('(min-width: 768px)');
    const sync = () => setIsDesktopNav(media.matches);

    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);
  const fulfillmentType = useOrderIntentStore((state) => state.fulfillmentType);
  const deliveryAvailability = useOrderIntentStore((state) => state.deliveryAvailability);
  const openOrderIntentSheet = useOrderIntentStore((state) => state.openMobileSheet);

  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [draftSearch, setDraftSearch] = useState(menuSearchText);

  const debounceRef = useRef<number | null>(null);
  const mobileSearchBtnRef = useRef<HTMLButtonElement | null>(null);
  const mobileSearchPanelRef = useRef<HTMLDivElement | null>(null);
  const mobileSearchInputRef = useRef<HTMLInputElement | null>(null);

  const count = readCount(itemCount);
  const isAuthed = Boolean(user);
  const isAdmin = profile?.role ? canAccessAdmin(profile.role) : false;

  const mobileTriggerLabel = useMemo(() => {
    if (fulfillmentType === 'delivery' && deliveryAvailability === 'available') {
      return 'Delivery';
    }

    return getPickupTimingLabel(pickupTiming);
  }, [fulfillmentType, deliveryAvailability, pickupTiming]);

  const displayName = useMemo(
    () => profile?.full_name?.trim() || user?.name?.trim() || user?.email || null,
    [profile?.full_name, user?.name, user?.email],
  );

  const cartAriaLabel = useMemo(() => {
    if (count === 0) return t('header.cart.ariaEmpty');
    if (count === 1) return t('header.cart.ariaSingular');
    return t('header.cart.ariaPlural', { count });
  }, [count, t]);

  const isActive = useCallback(
    (path: string) =>
      path === '/' ? pathname === '/' : pathname === path || pathname.startsWith(`${path}/`),
    [pathname],
  );

  const handleSignOut = useCallback(async () => {
    try {
      await signOut();
    } catch (error) {
      console.warn('[TopBar] Sign out failed', error);
    }
  }, [signOut]);

  const openModalSafe = useCallback(
    (type: 'login' | 'signup') => {
      modal?.openModal?.(type);
    },
    [modal],
  );

  const closeMobileSearch = useCallback(() => {
    setMobileSearchOpen(false);
    queueMicrotask(() => mobileSearchBtnRef.current?.focus());
  }, []);

  const openMobileSearch = useCallback(() => {
    if (isMenu) setMobileSearchOpen(true);
  }, [isMenu]);

  useEffect(() => {
    setMobileSearchOpen(false);
  }, [pathname]);

  useEffect(() => {
    setDraftSearch(menuSearchText);
  }, [menuSearchText]);

  useEffect(() => {
    if (!isMenu) return;

    if (debounceRef.current) window.clearTimeout(debounceRef.current);

    debounceRef.current = window.setTimeout(() => {
      setMenuSearchText(draftSearch);
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [draftSearch, isMenu, setMenuSearchText]);

  useEffect(() => {
    if (!mobileSearchOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeMobileSearch();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileSearchOpen, closeMobileSearch]);

  useEffect(() => {
    if (!mobileSearchOpen) return;

    queueMicrotask(() => mobileSearchInputRef.current?.focus());

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;

      if (mobileSearchPanelRef.current?.contains(target)) return;
      if (mobileSearchBtnRef.current?.contains(target)) return;

      closeMobileSearch();
    };

    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [mobileSearchOpen, closeMobileSearch]);

  useEffect(() => {
    if (!isMenu) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;

      const el = document.activeElement as HTMLElement | null;
      const tagName = el?.tagName?.toLowerCase();

      if (tagName === 'input' || tagName === 'textarea' || el?.isContentEditable) return;

      event.preventDefault();
      openMobileSearch();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isMenu, openMobileSearch]);

  if (hidden) return null;

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-60 focus:rounded-2xl focus:bg-white focus:px-4 focus:py-2 focus:shadow-(--shadow-xl) focus:ring-2 focus:ring-(--color-gold-400)"
      >
        {t('nav.skipToContent')}
      </a>

      <header
        className={cx(
          'sticky top-0 z-30',
          'border-b border-white/40',
          'bg-white/72 shadow-[0_1px_0_rgba(255,255,255,0.55),0_14px_40px_rgba(46,24,12,0.075)]',
          'backdrop-blur-2xl supports-[backdrop-filter]:bg-white/64',
          'dark:border-white/10 dark:bg-(--color-ink-950)/70',
          'dark:shadow-[0_1px_0_rgba(255,255,255,0.06),0_18px_44px_rgba(0,0,0,0.32)]',
        )}
      >
        <div className="mx-auto max-w-7xl px-2.5 py-1.5 sm:px-4">
          <div
            className={cx(
              'flex h-12 items-center gap-2 rounded-[1.35rem] px-1.5',
              'bg-white/52 ring-1 ring-white/70',
              'shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]',
              'dark:bg-white/[0.035] dark:ring-white/10 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]',
              'md:h-13 md:px-2',
            )}
          >
            <TopBarBrand ariaLabel={t('header.logo.aria')} />

            <nav
              className="hidden items-center gap-1 md:flex"
              role="navigation"
              aria-label="Primary links"
            >
              {NAV_LINKS.map(({ path, key }) => {
                const active = isActive(path);

                return (
                  <Link
                    key={path}
                    to={path}
                    aria-label={t(`nav.links.${key}.aria`)}
                    aria-current={active ? 'page' : undefined}
                    className={cx(
                      'rounded-full px-3 py-2 text-sm font-bold transition-all',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-gold-400) focus-visible:ring-offset-2',
                      active
                        ? 'bg-(--color-ember-600) text-white shadow-[0_8px_18px_rgba(168,69,32,0.22)]'
                        : 'text-(--color-ink-600) hover:bg-white/85 hover:text-(--color-ember-700) dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white',
                    )}
                  >
                    {t(`nav.links.${key}.label`)}
                  </Link>
                );
              })}

              {isAuthed && isAdmin && (
                <Link
                  to="/admin"
                  className={cx(
                    'rounded-full px-3 py-2 text-sm font-bold text-(--color-gold-700)',
                    'transition-colors hover:bg-(--color-gold-50) hover:text-(--color-gold-600)',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-gold-400) focus-visible:ring-offset-2',
                    'dark:text-(--color-gold-300) dark:hover:bg-white/10',
                  )}
                >
                  {t('header.auth.admin')}
                </Link>
              )}
            </nav>

            <div className="ml-auto flex min-w-0 shrink-0 items-center gap-1.5">
              {isMenu && (
                <div className="hidden w-64 max-w-[30vw] lg:block">
                  <MenuHeaderSearch
                    value={draftSearch}
                    onChange={setDraftSearch}
                    placeholder={t('header.search.placeholder')}
                  />
                </div>
              )}

              {isMenu && (
                <button
                  ref={mobileSearchBtnRef}
                  type="button"
                  onClick={openMobileSearch}
                  aria-label={t('header.search.openAria')}
                  aria-haspopup="dialog"
                  aria-expanded={mobileSearchOpen}
                  className={cx(
                    'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                    'border border-white/70 bg-white/82 text-(--color-ink-700)',
                    'shadow-[0_8px_20px_rgba(46,24,12,0.08)] backdrop-blur-xl',
                    'transition hover:bg-white active:scale-95',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-gold-400)/40',
                    'dark:border-white/10 dark:bg-white/8 dark:text-white/80 dark:hover:bg-white/12',
                    'lg:hidden',
                  )}
                >
                  <Search className="h-4 w-4" aria-hidden="true" />
                </button>
              )}

              <button
                type="button"
                onClick={openOrderIntentSheet}
                aria-label="Open order setup"
                aria-haspopup="dialog"
                className={cx(
                  'inline-flex h-9 max-w-[7.35rem] shrink-0 touch-manipulation items-center gap-1.5 rounded-full',
                  'border border-white/70 bg-white/82 px-2 text-(--color-ink-700)',
                  'shadow-[0_8px_20px_rgba(46,24,12,0.08)] backdrop-blur-xl',
                  'transition hover:bg-white active:scale-95',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-gold-400)/40',
                  'dark:border-white/10 dark:bg-white/8 dark:text-white/80 dark:hover:bg-white/12',
                  'md:hidden',
                )}
              >
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-(--color-ember-50) dark:bg-(--color-ember-500)/15"
                  aria-hidden="true"
                >
                  <Clock3 className="h-3.5 w-3.5 text-(--color-ember-600) dark:text-(--color-ember-300)" />
                </span>

                <span className="min-w-0 flex-1 text-left">
                  <span className="block text-[8px] font-black uppercase leading-none tracking-[0.14em] text-(--color-ink-600) dark:text-white/70">
                    Pickup
                  </span>
                  <span className="mt-0.5 block truncate text-[10.5px] font-black leading-none">
                    {mobileTriggerLabel}
                  </span>
                </span>
              </button>

              {isDesktopNav ? (
                <Suspense fallback={null}>
                  <OrderIntentSelector />
                </Suspense>
              ) : null}

              {!isAuthed && (
                <Link
                  to="/find-order"
                  className={cx(
                    'hidden items-center gap-1.5 rounded-full border border-white/70',
                    'bg-white/82 px-3 py-1.5 text-xs font-bold text-(--color-ink-600)',
                    'shadow-[0_8px_20px_rgba(46,24,12,0.08)] transition',
                    'hover:bg-white hover:text-(--color-ember-700)',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-gold-400) focus-visible:ring-offset-2',
                    'md:flex',
                  )}
                >
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-(--color-ember-400) opacity-60" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-(--color-ember-500)" />
                  </span>
                  Track Order
                </Link>
              )}

              {isAuthed && activeOrderId && (
                <Link
                  to={`/order-status/${activeOrderId}`}
                  className="hidden items-center gap-1.5 rounded-full border border-(--color-ember-200) bg-(--color-ember-50) px-3 py-1.5 text-xs font-bold text-(--color-ember-700) transition hover:bg-(--color-ember-100) md:flex"
                >
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-(--color-ember-400) opacity-75" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-(--color-ember-500)" />
                  </span>
                  {t('header.auth.trackOrder')}
                </Link>
              )}

              <button
                onClick={openCart}
                type="button"
                aria-label={cartAriaLabel}
                className={cx(
                  'relative rounded-full p-2 text-(--color-ink-700) transition-all',
                  'hover:bg-white/85 hover:text-(--color-ember-700)',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-gold-400) focus-visible:ring-offset-2',
                  'dark:text-white/75 dark:hover:bg-white/10 dark:hover:text-white',
                  'hidden md:inline-flex',
                )}
              >
                <ShoppingCart className="h-5 w-5" aria-hidden="true" />

                {count > 0 && (
                  <span
                    className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-(--color-ember-600) px-1 text-[9px] font-black leading-none text-white shadow-(--shadow-xs)"
                    aria-hidden="true"
                  >
                    {count > 99 ? '99+' : count}
                  </span>
                )}
              </button>

              <div className="hidden items-center gap-1.5 md:flex">
                {isAuthed ? (
                  <>
                    <Link
                      to="/account"
                      aria-label={t('header.auth.account')}
                      className="flex items-center gap-2 rounded-full bg-white/72 px-3 py-1.5 shadow-[0_8px_20px_rgba(46,24,12,0.06)] transition hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-gold-400) focus-visible:ring-offset-2 dark:bg-white/8 dark:hover:bg-white/12"
                    >
                      <User className="h-4 w-4 text-(--color-ink-500)" aria-hidden="true" />

                      {displayName && (
                        <span className="max-w-120px truncate text-sm font-bold text-(--color-ink-700) dark:text-white/75">
                          {displayName}
                        </span>
                      )}
                    </Link>

                    <button
                      type="button"
                      onClick={() => void handleSignOut()}
                      aria-label={t('header.auth.signOut')}
                      className="flex items-center gap-1.5 rounded-full border border-white/70 bg-white/60 px-2.5 py-1.5 text-xs font-bold text-(--color-ink-500) transition hover:bg-white hover:text-(--color-ink-800) focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-gold-400) focus-visible:ring-offset-2 dark:border-white/10 dark:bg-white/6 dark:text-white/55 dark:hover:bg-white/10 dark:hover:text-white"
                    >
                      <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                      {t('header.auth.signOut')}
                    </button>
                  </>
                ) : (
                  <>
                    <Button
                      onClick={() => openModalSafe('login')}
                      variant="secondary"
                      size="sm"
                      type="button"
                    >
                      {t('header.auth.logIn')}
                    </Button>

                    <Button
                      onClick={() => openModalSafe('signup')}
                      variant="primary"
                      size="sm"
                      type="button"
                    >
                      {t('header.auth.signUp')}
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {isMenu && mobileSearchOpen && (
        <div
          className="fixed inset-0 z-40"
          role="dialog"
          aria-modal="true"
          aria-label={t('header.search.aria')}
        >
          <div className="absolute inset-0 bg-black/45 backdrop-blur-[3px]" aria-hidden="true" />

          <div className="absolute inset-x-0 top-0 p-3">
            <div
              ref={mobileSearchPanelRef}
              className={cx(
                'mx-auto max-w-2xl overflow-hidden rounded-[1.5rem]',
                'border border-white/10 bg-stone-950/96 text-white',
                'shadow-[0_26px_80px_rgba(0,0,0,0.45)] backdrop-blur-2xl',
              )}
            >
              <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/45"
                      aria-hidden="true"
                    />

                    <input
                      ref={mobileSearchInputRef}
                      value={draftSearch}
                      onChange={(event) => setDraftSearch(event.target.value)}
                      placeholder={t('header.search.placeholder')}
                      className="h-11 w-full rounded-2xl border border-white/10 bg-white/8 pl-10 pr-10 text-sm font-semibold text-white outline-none placeholder:text-white/35 focus:border-(--color-gold-400)/40 focus:ring-2 focus:ring-(--color-gold-400)/20"
                      type="search"
                      inputMode="search"
                      autoComplete="off"
                      aria-label={t('header.search.aria')}
                    />

                    {draftSearch.trim().length > 0 && (
                      <button
                        type="button"
                        onClick={() => setDraftSearch('')}
                        className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-white/10 bg-white/8 text-white/80 transition hover:bg-white/12 focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-gold-400)/40"
                        aria-label={t('header.search.clear')}
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={closeMobileSearch}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/8 text-white transition hover:bg-white/12 focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-gold-400)/40"
                  aria-label={t('header.search.close')}
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>

              <div className="px-4 py-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/40">
                  {t('header.search.tip')}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {mobileSheetOpen ? (
        <Suspense fallback={null}>
          <MobileOrderIntentSheet />
        </Suspense>
      ) : null}
    </>
  );
}