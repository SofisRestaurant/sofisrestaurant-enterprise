// src/components/layout/Header.tsx
// =============================================================================
// Sofi’s Restaurant Header
// =============================================================================
// Production notes:
// - Cart state uses shared useCartUiStore.
// - Cart icon is desktop/tablet only. Mobile cart entry is BottomNav/FloatingCartPill.
// - CartDrawer is rendered once in RootLayout.
// - Deals is a real route: /deals.
// - No ThemeToggle. App follows system/device theme only.
// - Header uses semantic app theme variables for light/dark support.
// =============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LogOut, Menu, Search, ShoppingCart, User, X } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { useModal } from '@/components/ui/useModal';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useTranslation } from '@/i18n/useTranslation';
import { useCart } from '@/modules/cart/hooks/useCart';
import { useCartUiStore } from '@/modules/cart/store/cartUi.store';
import MenuHeaderSearch from '@/modules/menu/components/MenuHeaderSearch';
import { useMenuUi } from '@/modules/menu/store/menuUi.store';
import { useActiveOrder } from '@/modules/orders/hooks/useActiveOrder';
import { canAccessAdmin } from '@/security/permissions';

type NavLinkKey = 'home' | 'menu' | 'deals' | 'about' | 'contact';

type NavLink = {
  path: string;
  key: NavLinkKey;
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

const NAV_LINKS: NavLink[] = [
  { path: '/', key: 'home' },
  { path: '/menu', key: 'menu' },
  { path: '/deals', key: 'deals' },
  { path: '/about', key: 'about' },
  { path: '/contact', key: 'contact' },
];

const SEARCH_DEBOUNCE_MS = 150;

export default function Header() {
  const { t } = useTranslation();
  const { pathname } = useLocation();

  const isMenu = pathname === '/menu' || pathname.startsWith('/menu/');

  const { user, profile, signOut } = useAuth();
  const { itemCount } = useCart();
  const modal = useModal();
  const activeOrderId = useActiveOrder(user?.id ?? null);
  const openCart = useCartUiStore((state) => state.open);

  const menuSearchText = useMenuUi((state) => state.searchText);
  const setMenuSearchText = useMenuUi((state) => state.setSearchText);

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [draftSearch, setDraftSearch] = useState(menuSearchText);

  const mobileSearchBtnRef = useRef<HTMLButtonElement | null>(null);
  const mobileSearchPanelRef = useRef<HTMLDivElement | null>(null);
  const mobileSearchInputRef = useRef<HTMLInputElement | null>(null);
  const mobileToggleRef = useRef<HTMLButtonElement | null>(null);
  const mobileMenuRef = useRef<HTMLDivElement | null>(null);
  const debounceRef = useRef<number | null>(null);

  const isAdmin = profile?.role ? canAccessAdmin(profile.role) : false;
  const isAuthed = Boolean(user);

  const displayName = useMemo(
    () => profile?.full_name?.trim() || user?.name?.trim() || user?.email || null,
    [profile?.full_name, user?.name, user?.email],
  );

  const cartAriaLabel = useMemo(() => {
    const count = itemCount ?? 0;

    if (count === 0) {
      return t('header.cart.ariaEmpty');
    }

    if (count === 1) {
      return t('header.cart.ariaSingular');
    }

    return t('header.cart.ariaPlural', { count });
  }, [itemCount, t]);

  const isActive = useCallback(
    (path: string) =>
      path === '/' ? pathname === '/' : pathname === path || pathname.startsWith(`${path}/`),
    [pathname],
  );

  const closeMobileMenu = useCallback(() => {
    setMobileMenuOpen(false);
  }, []);

  const toggleMobileMenu = useCallback(() => {
    setMobileMenuOpen((isOpen) => !isOpen);
  }, []);

  const handleSignOut = useCallback(async () => {
    try {
      await signOut();
    } finally {
      closeMobileMenu();
    }
  }, [signOut, closeMobileMenu]);

  const openModalSafe = useCallback(
    (type: 'login' | 'signup') => {
      modal?.openModal?.(type);
      closeMobileMenu();
    },
    [modal, closeMobileMenu],
  );

  const closeMobileSearch = useCallback(() => {
    setMobileSearchOpen(false);
    queueMicrotask(() => mobileSearchBtnRef.current?.focus());
  }, []);

  const openMobileSearch = useCallback(() => {
    if (!isMenu) {
      return;
    }

    setMobileMenuOpen(false);
    setMobileSearchOpen(true);
  }, [isMenu]);

  useEffect(() => {
    setMobileMenuOpen(false);
    setMobileSearchOpen(false);
  }, [pathname]);

  useEffect(() => {
    setDraftSearch(menuSearchText);
  }, [menuSearchText]);

  useEffect(() => {
    if (!isMenu) {
      return;
    }

    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }

    debounceRef.current = window.setTimeout(() => {
      setMenuSearchText(draftSearch);
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) {
        window.clearTimeout(debounceRef.current);
      }
    };
  }, [draftSearch, isMenu, setMenuSearchText]);

  useEffect(() => {
    if (!mobileMenuOpen && !mobileSearchOpen) {
      return;
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') {
        return;
      }

      if (mobileSearchOpen) {
        event.preventDefault();
        closeMobileSearch();
        return;
      }

      if (mobileMenuOpen) {
        event.preventDefault();
        closeMobileMenu();
        mobileToggleRef.current?.focus();
      }
    }

    window.addEventListener('keydown', handleEscape);

    return () => {
      window.removeEventListener('keydown', handleEscape);
    };
  }, [mobileMenuOpen, mobileSearchOpen, closeMobileMenu, closeMobileSearch]);

  useEffect(() => {
    if (!mobileMenuOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node | null;

      if (!target) {
        return;
      }

      if (mobileMenuRef.current?.contains(target) || mobileToggleRef.current?.contains(target)) {
        return;
      }

      closeMobileMenu();
    }

    window.addEventListener('pointerdown', handlePointerDown);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [mobileMenuOpen, closeMobileMenu]);

  useEffect(() => {
    if (!mobileSearchOpen) {
      return;
    }

    queueMicrotask(() => mobileSearchInputRef.current?.focus());

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node | null;

      if (!target) {
        return;
      }

      if (
        mobileSearchPanelRef.current?.contains(target) ||
        mobileSearchBtnRef.current?.contains(target)
      ) {
        return;
      }

      closeMobileSearch();
    }

    window.addEventListener('pointerdown', handlePointerDown);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [mobileSearchOpen, closeMobileSearch]);

  useEffect(() => {
    if (!isMenu) {
      return;
    }

    function handleSearchShortcut(event: KeyboardEvent) {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      const activeElement = document.activeElement as HTMLElement | null;
      const activeTag = activeElement?.tagName?.toLowerCase();

      if (activeTag === 'input' || activeTag === 'textarea' || activeElement?.isContentEditable) {
        return;
      }

      event.preventDefault();
      openMobileSearch();
    }

    window.addEventListener('keydown', handleSearchShortcut);

    return () => {
      window.removeEventListener('keydown', handleSearchShortcut);
    };
  }, [isMenu, openMobileSearch]);

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-60 focus:rounded-xl focus:bg-[var(--app-surface-elevated)] focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-[var(--app-text)] focus:shadow-(--shadow-xl) focus:outline-none focus:ring-2 focus:ring-(--color-gold-400)"
      >
        {t('nav.skipToContent')}
      </a>

      <header className="sticky top-0 z-30 border-b border-[var(--app-border)] bg-[var(--app-header)] shadow-sm backdrop-blur-md transition-colors duration-200">
        <nav
          className="mx-auto max-w-7xl px-4 py-3.5"
          role="navigation"
          aria-label={t('nav.ariaLabel')}
        >
          <div className="flex items-center justify-between gap-3">
            <Link
              to="/"
              className="text-script rounded-xl px-2 py-1 text-2xl text-(--color-ember-700) transition-colors hover:text-(--color-ember-600) focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-gold-400) focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--app-bg)]"
              aria-label={t('header.logo.aria')}
            >
              {t('common.appName')}
            </Link>

            <div
              className="hidden items-center gap-1.5 md:flex"
              role="menubar"
              aria-label="Primary links"
            >
              {NAV_LINKS.map(({ path, key }) => {
                const active = isActive(path);

                return (
                  <Link
                    key={path}
                    to={path}
                    role="menuitem"
                    aria-label={t(`nav.links.${key}.aria`)}
                    aria-current={active ? 'page' : undefined}
                    className={cx(
                      'relative rounded-xl px-3 py-2 text-sm font-semibold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-gold-400) focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--app-bg)]',
                      active
                        ? 'bg-(--color-ember-50) text-(--color-ember-700)'
                        : 'text-[var(--app-text)] hover:bg-[var(--app-surface-hover)] hover:text-(--color-ember-700)',
                    )}
                  >
                    {t(`nav.links.${key}.label`)}

                    {active && (
                      <span
                        className="absolute inset-x-3 -bottom-1 h-0.5 rounded-full bg-(--color-ember-500)"
                        aria-hidden="true"
                      />
                    )}
                  </Link>
                );
              })}
            </div>

            <div className="flex items-center gap-2 md:gap-3">
              {isMenu && (
                <div className="hidden w-28rem max-w-[38vw] lg:block">
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
                  onClick={() => {
                    setMobileMenuOpen(false);
                    openMobileSearch();
                  }}
                  aria-label={t('header.search.openAria')}
                  aria-haspopup="dialog"
                  aria-expanded={mobileSearchOpen}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-(--radius-pill) border border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--app-text)] shadow-(--shadow-xs) transition-colors hover:bg-[var(--app-surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-gold-400)/40 lg:hidden"
                >
                  <Search className="h-5 w-5" aria-hidden="true" />
                </button>
              )}

              <button
                onClick={openCart}
                type="button"
                aria-label={cartAriaLabel}
                className={cx(
                  'relative rounded-xl p-2 text-[var(--app-text)] transition-all hover:bg-[var(--app-surface-hover)] hover:text-(--color-ember-700) focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-gold-400) focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--app-bg)]',
                  'hidden md:inline-flex',
                )}
              >
                <ShoppingCart className="h-6 w-6" aria-hidden="true" />
                {(itemCount ?? 0) > 0 && (
                  <span
                    className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-(--radius-pill) bg-(--color-ember-600) px-1 text-[11px] font-bold text-white shadow-(--shadow-xs)"
                    aria-hidden="true"
                  >
                    {(itemCount ?? 0) > 99 ? '99+' : itemCount}
                  </span>
                )}
              </button>

              <div className="hidden items-center gap-2 md:flex">
                {isAuthed ? (
                  <>
                    {activeOrderId && (
                      <Link
                        to={`/order-status/${activeOrderId}`}
                        className="rounded-xl px-3 py-2 text-sm font-semibold text-(--color-ember-600) transition-colors hover:bg-[var(--app-surface-hover)] hover:text-(--color-ember-500) focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-gold-400) focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--app-bg)]"
                      >
                        {t('header.auth.trackOrder')}
                      </Link>
                    )}

                    {isAdmin && (
                      <Link
                        to="/admin"
                        className="rounded-xl px-3 py-2 text-sm font-semibold text-(--color-gold-600) transition-colors hover:bg-[var(--app-surface-hover)] hover:text-(--color-gold-500) focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-gold-400) focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--app-bg)]"
                      >
                        {t('header.auth.admin')}
                      </Link>
                    )}

                    <Link
                      to="/account"
                      aria-label={t('header.auth.account')}
                      className="flex items-center gap-2 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2 transition-all hover:bg-[var(--app-surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-gold-400) focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--app-bg)]"
                    >
                      <User className="h-4 w-4 text-[var(--app-muted)]" aria-hidden="true" />
                      {displayName && (
                        <span className="max-w-32 truncate text-sm font-semibold text-[var(--app-text)]">
                          {t('header.auth.greeting', { name: displayName })}
                        </span>
                      )}
                    </Link>

                    <Button
                      onClick={handleSignOut}
                      variant="secondary"
                      size="sm"
                      type="button"
                      aria-label={t('header.auth.signOut')}
                      className="flex items-center gap-2 rounded-xl"
                    >
                      <LogOut className="h-4 w-4" aria-hidden="true" />
                      {t('header.auth.signOut')}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      onClick={() => openModalSafe('login')}
                      variant="secondary"
                      size="sm"
                      type="button"
                      className="rounded-xl"
                    >
                      {t('header.auth.logIn')}
                    </Button>

                    <Button
                      onClick={() => openModalSafe('signup')}
                      variant="primary"
                      size="sm"
                      type="button"
                      className="rounded-xl"
                    >
                      {t('header.auth.signUp')}
                    </Button>
                  </>
                )}
              </div>

              <button
                ref={mobileToggleRef}
                onClick={toggleMobileMenu}
                type="button"
                aria-label={mobileMenuOpen ? t('header.auth.closeMenu') : t('header.auth.openMenu')}
                aria-expanded={mobileMenuOpen}
                aria-controls="mobile-menu"
                className="rounded-xl p-2 text-[var(--app-text)] transition-all hover:bg-[var(--app-surface-hover)] hover:text-(--color-ember-700) focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-gold-400) focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--app-bg)] md:hidden"
              >
                {mobileMenuOpen ? (
                  <X className="h-6 w-6" aria-hidden="true" />
                ) : (
                  <Menu className="h-6 w-6" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          {mobileMenuOpen && (
            <div
              ref={mobileMenuRef}
              id="mobile-menu"
              role="menu"
              className="mt-4 overflow-hidden rounded-[1.5rem] border border-[var(--app-border)] bg-[var(--app-card)] p-3 shadow-(--shadow-xl) transition-colors md:hidden"
              style={{ transform: 'none' }}
            >
              <div className="flex flex-col gap-2">
                <div className="flex flex-col gap-1">
                  {NAV_LINKS.map(({ path, key }) => {
                    const active = isActive(path);

                    return (
                      <Link
                        key={path}
                        to={path}
                        role="menuitem"
                        onClick={closeMobileMenu}
                        aria-label={t(`nav.links.${key}.aria`)}
                        aria-current={active ? 'page' : undefined}
                        className={cx(
                          'rounded-2xl px-4 py-3 text-sm font-semibold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-gold-400)',
                          active
                            ? 'bg-(--color-ember-50) text-(--color-ember-700)'
                            : 'text-[var(--app-text)] hover:bg-[var(--app-surface-hover)] hover:text-(--color-ember-700)',
                        )}
                      >
                        {t(`nav.links.${key}.label`)}
                      </Link>
                    );
                  })}
                </div>

                <hr className="my-1 border-[var(--app-divider)]" />

                {user ? (
                  <>
                    {activeOrderId && (
                      <Link
                        to={`/order-status/${activeOrderId}`}
                        onClick={closeMobileMenu}
                        className="block rounded-2xl bg-(--color-ember-50) px-4 py-3 text-sm font-semibold text-(--color-ember-700) transition-colors hover:bg-(--color-ember-100) focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-gold-400)"
                      >
                        {t('header.auth.trackOrder')}
                      </Link>
                    )}

                    {isAdmin && (
                      <Link
                        to="/admin"
                        onClick={closeMobileMenu}
                        className="block rounded-2xl bg-(--color-gold-50) px-4 py-3 text-sm font-semibold text-(--color-gold-600) transition-colors hover:bg-(--color-gold-100) focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-gold-400)"
                      >
                        {t('header.auth.adminPanel')}
                      </Link>
                    )}

                    <Link
                      to="/account"
                      onClick={closeMobileMenu}
                      aria-label={t('header.auth.account')}
                      className="block rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] px-4 py-3 transition-all hover:bg-[var(--app-surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-gold-400)"
                    >
                      <div className="mb-1 flex items-center gap-2">
                        <User className="h-4 w-4 text-[var(--app-muted)]" aria-hidden="true" />
                        <span className="text-sm font-semibold text-[var(--app-text)]">
                          {displayName}
                        </span>
                      </div>
                      {user.email && (
                        <p className="text-xs text-[var(--app-muted)]">{user.email}</p>
                      )}
                    </Link>

                    <Button
                      onClick={handleSignOut}
                      variant="secondary"
                      type="button"
                      className="mt-1 w-full rounded-2xl"
                    >
                      <span className="flex items-center justify-center gap-2">
                        <LogOut className="h-4 w-4" aria-hidden="true" />
                        {t('header.auth.signOut')}
                      </span>
                    </Button>
                  </>
                ) : (
                  <div className="space-y-2">
                    <Button
                      onClick={() => openModalSafe('login')}
                      variant="secondary"
                      type="button"
                      className="w-full rounded-2xl"
                    >
                      {t('header.auth.logIn')}
                    </Button>

                    <Button
                      onClick={() => openModalSafe('signup')}
                      variant="primary"
                      type="button"
                      className="w-full rounded-2xl"
                    >
                      {t('header.auth.signUp')}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </nav>
      </header>

      {isMenu && mobileSearchOpen && (
        <div
          className="fixed inset-0 z-40"
          role="dialog"
          aria-modal="true"
          aria-label={t('header.search.aria')}
        >
          <div className="absolute inset-0 bg-[var(--app-overlay)]" aria-hidden="true" />

          <div className="absolute inset-x-0 top-0 p-3">
            <div
              ref={mobileSearchPanelRef}
              className="mx-auto max-w-2xl overflow-hidden rounded-[1.5rem] border border-[var(--app-border)] bg-[var(--app-card)] text-[var(--app-text)] shadow-(--shadow-2xl)"
            >
              <div className="flex items-center gap-2 border-b border-[var(--app-border)] px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--app-muted)]"
                      aria-hidden="true"
                    />

                    <input
                      ref={mobileSearchInputRef}
                      value={draftSearch}
                      onChange={(event) => setDraftSearch(event.target.value)}
                      placeholder={t('header.search.placeholder')}
                      className="h-11 w-full rounded-2xl border border-[var(--app-input-border)] bg-[var(--app-input)] pl-10 pr-10 text-[var(--app-text)] outline-none transition focus:ring-2 focus:ring-(--color-gold-400)/40"
                      type="search"
                      inputMode="search"
                      autoComplete="off"
                      aria-label={t('header.search.aria')}
                    />

                    {draftSearch.trim().length > 0 && (
                      <button
                        type="button"
                        onClick={() => setDraftSearch('')}
                        className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--app-muted)] transition-colors hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-gold-400)/40"
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
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--app-text)] transition-colors hover:bg-[var(--app-surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-gold-400)/40"
                  aria-label={t('header.search.close')}
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>

              <div className="px-4 py-3">
                <p className="text-xs text-[var(--app-muted)]">{t('header.search.tip')}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CartDrawer is rendered once in RootLayout — not here */}
    </>
  );
}