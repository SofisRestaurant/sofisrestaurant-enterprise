// src/components/layout/TopBar.tsx
// =============================================================================
// TOP BAR — Lightweight Premium Shell
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

const SEARCH_DEBOUNCE_MS = 120;
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

const surfaceButtonClass = cx(
  'border border-[rgba(61,42,32,0.08)] bg-[rgba(255,255,255,0.58)] text-[#4d382e]',
  'shadow-[0_8px_18px_rgba(46,24,12,0.055)] backdrop-blur-xl',
  'transition-[background-color,color,box-shadow,transform] duration-200 ease-out',
  'hover:bg-white/78 hover:text-[#2f1f18] active:scale-[0.985]',
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c79a3b]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-white',
  'dark:border-white/10 dark:bg-white/[0.065] dark:text-white/72 dark:hover:bg-white/10 dark:hover:text-white dark:focus-visible:ring-offset-[#0f0d0c]',
);

function StatusDot() {
  return (
    <span className="relative flex h-1.5 w-1.5 shrink-0" aria-hidden="true">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#c79a3b] opacity-45" />
      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#8a5a24] dark:bg-[#f4dec0]" />
    </span>
  );
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

    queueMicrotask(() => mobileSearchInputRef.current?.focus());

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeMobileSearch();
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (mobileSearchPanelRef.current?.contains(target)) return;
      if (mobileSearchBtnRef.current?.contains(target)) return;
      closeMobileSearch();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointerdown', onPointerDown);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointerdown', onPointerDown);
    };
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
        className={cx(
          'sr-only focus:not-sr-only',
          'focus:fixed focus:left-4 focus:top-4 focus:z-[60]',
          'focus:rounded-2xl focus:bg-white focus:px-4 focus:py-2',
          'focus:text-sm focus:font-semibold focus:text-[#2f1f18]',
          'focus:shadow-[0_16px_40px_rgba(46,24,12,0.16)] focus:ring-2 focus:ring-[#c79a3b]/40',
        )}
      >
        {t('nav.skipToContent')}
      </a>

      <header
        className={cx(
          'sticky top-0 z-50',
          'border-b border-[rgba(61,42,32,0.08)]',
          'bg-[rgba(255,250,244,0.78)] shadow-[0_1px_0_rgba(255,255,255,0.72),0_10px_28px_rgba(46,24,12,0.06)]',
          'backdrop-blur-2xl supports-[backdrop-filter]:bg-[rgba(255,250,244,0.66)]',
          'dark:border-white/10 dark:bg-[rgba(15,13,12,0.74)]',
          'dark:shadow-[0_1px_0_rgba(255,255,255,0.06),0_16px_34px_rgba(0,0,0,0.30)]',
        )}
      >
        <div className="mx-auto max-w-7xl px-2.5 py-1.5 sm:px-4">
          <div
            className={cx(
              'flex h-12 items-center gap-2 rounded-[1.45rem] px-1.5',
              'border border-[rgba(61,42,32,0.07)] bg-[rgba(255,255,255,0.50)]',
              'shadow-[inset_0_1px_0_rgba(255,255,255,0.82)]',
              'dark:border-white/10 dark:bg-white/[0.045]',
              'dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.07)]',
              'md:h-13 md:px-2',
            )}
          >
            <TopBarBrand ariaLabel={t('header.logo.aria')} />

            <nav
              className={cx(
                'hidden items-center gap-0.5 rounded-full p-1 md:flex',
                'border border-[rgba(61,42,32,0.08)] bg-[rgba(255,255,255,0.58)]',
                'shadow-[inset_0_1px_0_rgba(255,255,255,0.82),0_10px_26px_rgba(46,24,12,0.055)]',
                'backdrop-blur-2xl supports-[backdrop-filter]:bg-[rgba(255,255,255,0.52)]',
                'dark:border-white/10 dark:bg-white/[0.055]',
                'dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_14px_32px_rgba(0,0,0,0.28)]',
              )}
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
                      'relative inline-flex min-h-10 items-center justify-center rounded-full',
                      'px-3.5 text-[13px] font-semibold tracking-[-0.01em]',
                      'transition-[color,background-color,box-shadow,transform] duration-200 ease-out',
                      'touch-manipulation select-none',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c79a3b]/35 focus-visible:ring-offset-2',
                      'focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#0f0d0c]',
                      active
                        ? [
                            'bg-[#3f2418] text-[#fff8ee]',
                            'shadow-[0_8px_18px_rgba(63,36,24,0.18),inset_0_1px_0_rgba(255,255,255,0.16)]',
                            'dark:bg-[#f4dec0] dark:text-[#21130d]',
                            'dark:shadow-[0_10px_22px_rgba(0,0,0,0.30),inset_0_1px_0_rgba(255,255,255,0.50)]',
                          ].join(' ')
                        : [
                            'text-[#4d382e]',
                            'hover:bg-[rgba(255,255,255,0.72)] hover:text-[#2f1f18]',
                            'active:scale-[0.985]',
                            'dark:text-white/72 dark:hover:bg-white/10 dark:hover:text-white',
                          ].join(' '),
                    )}
                  >
                    <span className="relative z-10">{t(`nav.links.${key}.label`)}</span>
                  </Link>
                );
              })}

              {isAuthed && isAdmin && (
                <Link
                  to="/admin"
                  className={cx(
                    'inline-flex min-h-10 items-center justify-center rounded-full px-3.5',
                    'text-[13px] font-semibold tracking-[-0.01em]',
                    'text-[#6b4a19] transition-[color,background-color,box-shadow,transform] duration-200 ease-out',
                    'hover:bg-[rgba(255,255,255,0.72)] hover:text-[#4a3413] active:scale-[0.985]',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c79a3b]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-white',
                    'dark:text-[#f4dec0] dark:hover:bg-white/10 dark:hover:text-white dark:focus-visible:ring-offset-[#0f0d0c]',
                  )}
                >
                  {t('header.auth.admin')}
                </Link>
              )}
            </nav>

            <div className="ml-auto flex min-w-0 shrink-0 items-center gap-1.5">
              {isMenu && (
                <button
                  ref={mobileSearchBtnRef}
                  type="button"
                  onClick={openMobileSearch}
                  aria-label={t('header.search.openAria')}
                  aria-haspopup="dialog"
                  aria-expanded={mobileSearchOpen}
                  className={cx(
                    'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                    surfaceButtonClass,
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
                  'inline-flex h-10 max-w-[7.75rem] shrink-0 touch-manipulation items-center gap-1.5 rounded-full px-2',
                  surfaceButtonClass,
                  'md:hidden',
                )}
              >
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#f6eadc] text-[#4d382e] dark:bg-white/10 dark:text-white/80"
                  aria-hidden="true"
                >
                  <Clock3 className="h-3.5 w-3.5" />
                </span>

                <span className="min-w-0 flex-1 text-left">
                  <span className="block text-[8px] font-bold uppercase leading-none tracking-[0.14em] text-[#7c6559] dark:text-white/52">
                    Pickup
                  </span>
                  <span className="mt-0.5 block truncate text-[10.5px] font-semibold leading-none text-current">
                    {mobileTriggerLabel}
                  </span>
                </span>
              </button>

              <div className="hidden md:block">
                <Suspense fallback={null}>
                  <OrderIntentSelector />
                </Suspense>
              </div>

              {!isAuthed && (
                <Link
                  to="/find-order"
                  className={cx(
                    'hidden h-10 items-center gap-1.5 rounded-full px-3 text-xs font-semibold md:flex',
                    surfaceButtonClass,
                  )}
                >
                  <StatusDot />
                  Track Order
                </Link>
              )}

              {isAuthed && activeOrderId && (
                <Link
                  to={`/order-status/${activeOrderId}`}
                  className={cx(
                    'hidden h-10 items-center gap-1.5 rounded-full px-3 text-xs font-semibold md:flex',
                    surfaceButtonClass,
                  )}
                >
                  <StatusDot />
                  {t('header.auth.trackOrder')}
                </Link>
              )}

              <button
                onClick={openCart}
                type="button"
                aria-label={cartAriaLabel}
                className={cx(
                  'relative hidden h-10 w-10 items-center justify-center rounded-full md:inline-flex',
                  surfaceButtonClass,
                )}
              >
                <ShoppingCart className="h-5 w-5" aria-hidden="true" />

                {count > 0 && (
                  <span
                    className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#3f2418] px-1 text-[9px] font-black leading-none text-[#fff8ee] shadow-[0_4px_10px_rgba(63,36,24,0.24)] dark:bg-[#f4dec0] dark:text-[#21130d]"
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
                      className={cx(
                        'flex h-10 items-center gap-2 rounded-full px-3 text-sm font-semibold',
                        surfaceButtonClass,
                      )}
                    >
                      <User className="h-4 w-4 text-current opacity-70" aria-hidden="true" />

                      {displayName && (
                        <span className="max-w-[120px] truncate text-current">{displayName}</span>
                      )}
                    </Link>

                    <button
                      type="button"
                      onClick={() => void handleSignOut()}
                      aria-label={t('header.auth.signOut')}
                      className={cx(
                        'flex h-10 items-center gap-1.5 rounded-full px-3 text-xs font-semibold',
                        'border border-[rgba(61,42,32,0.08)] bg-[rgba(255,255,255,0.46)] text-[#6a5145]',
                        'shadow-[0_8px_18px_rgba(46,24,12,0.045)]',
                        'transition-[background-color,color,box-shadow,transform] duration-200 ease-out',
                        'hover:bg-white/74 hover:text-[#2f1f18] active:scale-[0.985]',
                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c79a3b]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-white',
                        'dark:border-white/10 dark:bg-white/[0.055] dark:text-white/62 dark:hover:bg-white/10 dark:hover:text-white dark:focus-visible:ring-offset-[#0f0d0c]',
                      )}
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
                      className="rounded-full"
                    >
                      {t('header.auth.logIn')}
                    </Button>

                    <Button
                      onClick={() => openModalSafe('signup')}
                      variant="primary"
                      size="sm"
                      type="button"
                      className="rounded-full"
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
          <div
            className="absolute inset-0 bg-[rgba(47,31,24,0.34)] backdrop-blur-[5px]"
            aria-hidden="true"
          />

          <div className="absolute inset-x-0 top-0 p-3">
            <div
              ref={mobileSearchPanelRef}
              className={cx(
                'mx-auto max-w-2xl overflow-hidden rounded-[1.65rem]',
                'border border-[rgba(61,42,32,0.10)] bg-[rgba(255,250,244,0.94)] text-[#2f1f18]',
                'shadow-[0_24px_70px_rgba(46,24,12,0.18)] backdrop-blur-2xl',
                'dark:border-white/10 dark:bg-[rgba(15,13,12,0.92)] dark:text-white',
              )}
            >
              <div className="flex items-center gap-2 border-b border-[rgba(61,42,32,0.08)] px-4 py-3 dark:border-white/10">
                <div className="min-w-0 flex-1">
                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a7468] dark:text-white/45"
                      aria-hidden="true"
                    />

                    <input
                      ref={mobileSearchInputRef}
                      value={draftSearch}
                      onChange={(event) => setDraftSearch(event.target.value)}
                      placeholder={t('header.search.placeholder')}
                      className={cx(
                        'h-11 w-full rounded-2xl border border-[rgba(61,42,32,0.10)] bg-white/70',
                        'pl-10 pr-10 text-sm font-semibold text-[#2f1f18] outline-none',
                        'placeholder:text-[#8a7468] transition',
                        'focus:border-[#c79a3b]/45 focus:ring-2 focus:ring-[#c79a3b]/20',
                        'dark:border-white/10 dark:bg-white/[0.075] dark:text-white dark:placeholder:text-white/35',
                      )}
                      type="search"
                      inputMode="search"
                      autoComplete="off"
                      aria-label={t('header.search.aria')}
                    />

                    {draftSearch.trim().length > 0 && (
                      <button
                        type="button"
                        onClick={() => setDraftSearch('')}
                        className={cx(
                          'absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full',
                          'border border-[rgba(61,42,32,0.10)] bg-white/64 text-[#6a5145]',
                          'transition hover:bg-white hover:text-[#2f1f18]',
                          'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c79a3b]/35',
                          'dark:border-white/10 dark:bg-white/[0.075] dark:text-white/70 dark:hover:bg-white/12 dark:hover:text-white',
                        )}
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
                  className={cx(
                    'inline-flex h-10 w-10 items-center justify-center rounded-full',
                    'border border-[rgba(61,42,32,0.10)] bg-white/64 text-[#6a5145]',
                    'transition hover:bg-white hover:text-[#2f1f18]',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c79a3b]/35',
                    'dark:border-white/10 dark:bg-white/[0.075] dark:text-white/70 dark:hover:bg-white/12 dark:hover:text-white',
                  )}
                  aria-label={t('header.search.close')}
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>

              <div className="px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8a7468] dark:text-white/40">
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