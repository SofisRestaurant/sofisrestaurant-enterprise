// src/components/layout/Header.tsx
// =============================================================================
// Sofi's Restaurant Header
// =============================================================================
// Premium production header.
// - Keeps cart UI lightweight through useCartUiStore.
// - Keeps brand script limited to the logo wordmark.
// - Adds a warmer, authentic restaurant identity without hurting mobile UX.
// - Improves mobile menu layout, cart access, search behavior, and polish.
// =============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LogOut, Menu, Search, ShoppingCart, User, X } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { useModal } from '@/components/ui/useModal';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useTranslation } from '@/i18n/useTranslation';
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

function BrandWordmark({ label }: { label: string }) {
  const normalizedLabel = label.trim();

  const parts = useMemo(() => {
    const match = normalizedLabel.match(/^(Sofi)(['’]s)?(\s+Restaurant)?$/i);

    if (!match) return null;

    return {
      first: match[1] ?? 'Sofi',
      possessive: match[2] ?? "'s",
      rest: match[3] ?? ' Restaurant',
    };
  }, [normalizedLabel]);

  if (!parts) {
    return <span className="font-brand">{normalizedLabel}</span>;
  }

  return (
    <span className="font-brand whitespace-nowrap" aria-hidden="true">
      <span>{parts.first}</span>
      <span
        style={{
          fontFamily: "'Apple Chancery', 'Segoe Script', 'Brush Script MT', cursive",
          letterSpacing: '0',
        }}
      >
        {parts.possessive}
      </span>
      <span>{parts.rest}</span>
    </span>
  );
}

export default function Header() {
  const { t } = useTranslation();
  const { pathname } = useLocation();

  const isMenu = pathname === '/menu' || pathname.startsWith('/menu/');

  const { user, profile, signOut } = useAuth();

  const itemCount = useCartUiStore((state) => state.itemCount);
  const openCart = useCartUiStore((state) => state.open);

  const modal = useModal();
  const activeOrderId = useActiveOrder(user?.id ?? null);

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

  const appName = t('common.appName');

  const displayName = useMemo(
    () => profile?.full_name?.trim() || user?.name?.trim() || user?.email || null,
    [profile?.full_name, user?.name, user?.email],
  );

  const cartAriaLabel = useMemo(() => {
    const count = itemCount ?? 0;

    if (count === 0) return t('header.cart.ariaEmpty');
    if (count === 1) return t('header.cart.ariaSingular');

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
    setMobileSearchOpen(false);
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
    if (!isMenu) return;

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
    if (!isMenu) return;

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
    const shouldLock = mobileMenuOpen || mobileSearchOpen;

    if (!shouldLock) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileMenuOpen, mobileSearchOpen]);

  useEffect(() => {
    if (!mobileMenuOpen && !mobileSearchOpen) return;

    function handleEscape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;

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
    if (!mobileMenuOpen) return;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node | null;

      if (!target) return;

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
    if (!mobileSearchOpen) return;

    queueMicrotask(() => mobileSearchInputRef.current?.focus());

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node | null;

      if (!target) return;

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
    if (!isMenu) return;

    function handleSearchShortcut(event: KeyboardEvent) {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;

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

  const cartBadge = (itemCount ?? 0) > 99 ? '99+' : itemCount;

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-xl focus:bg-[var(--app-surface-elevated)] focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-[var(--app-text)] focus:shadow-xl focus:outline-none focus:ring-2 focus:ring-(--color-gold-400)"
      >
        {t('nav.skipToContent')}
      </a>

      <header className="sticky top-0 z-30 border-b border-[rgba(120,72,38,0.13)] bg-[rgba(255,250,241,0.92)] shadow-[0_10px_30px_rgba(46,24,12,0.06)] backdrop-blur-xl transition-colors duration-200">
        <div
          className="hidden h-px w-full bg-[linear-gradient(90deg,transparent,rgba(212,175,55,0.55),transparent)] sm:block"
          aria-hidden="true"
        />

        <nav
          className="mx-auto max-w-7xl px-3 py-3 sm:px-4 lg:px-6"
          role="navigation"
          aria-label={t('nav.ariaLabel')}
        >
          <div className="flex min-h-12 items-center justify-between gap-2 sm:gap-3">
            <Link
              to="/"
              className="group flex min-w-0 shrink items-center gap-2 rounded-2xl px-1.5 py-1 text-(--color-ember-700) transition-colors hover:text-(--color-ember-600) focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-gold-400) focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--app-bg)]"
              aria-label={t('header.logo.aria')}
            >
              <span
                className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[rgba(212,175,55,0.28)] bg-[radial-gradient(circle_at_35%_28%,rgba(255,244,203,0.95),rgba(212,175,55,0.18)_48%,rgba(168,69,32,0.10))] text-[0.62rem] font-black uppercase tracking-[0.16em] text-(--color-ember-700) shadow-[0_8px_22px_rgba(120,72,38,0.10)] sm:flex"
                aria-hidden="true"
              >
                SR
              </span>

              <span className="flex min-w-0 flex-col leading-none">
                <span className="text-[1.55rem] sm:text-[1.72rem]">
                  <BrandWordmark label={appName} />
                </span>

                <span className="mt-1 hidden font-body text-[0.56rem] font-bold uppercase tracking-[0.28em] text-[rgba(120,72,38,0.70)] sm:block">
                  Real flavor · True tradition
                </span>
              </span>

              <span className="sr-only">{appName}</span>
            </Link>

            <div
              className="hidden items-center gap-1 rounded-full border border-[rgba(120,72,38,0.10)] bg-white/55 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)] md:flex"
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
                      'relative rounded-full px-3.5 py-2 text-sm font-bold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-gold-400) focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--app-bg)]',
                      active
                        ? 'bg-(--color-ember-600) text-white shadow-[0_8px_18px_rgba(168,69,32,0.20)]'
                        : 'text-[rgba(46,24,12,0.80)] hover:bg-[rgba(255,246,230,0.92)] hover:text-(--color-ember-700)',
                    )}
                  >
                    {t(`nav.links.${key}.label`)}
                  </Link>
                );
              })}
            </div>

            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2 md:gap-3">
              {isMenu && (
                <div className="hidden w-[28rem] max-w-[38vw] lg:block">
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
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[rgba(120,72,38,0.16)] bg-white/75 text-[rgba(46,24,12,0.82)] shadow-sm transition-colors hover:bg-[rgba(255,246,230,0.95)] hover:text-(--color-ember-700) focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-gold-400)/40 lg:hidden"
                >
                  <Search className="h-5 w-5" aria-hidden="true" />
                </button>
              )}

              <button
                onClick={openCart}
                type="button"
                aria-label={cartAriaLabel}
                className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-[rgba(120,72,38,0.16)] bg-white/75 text-[rgba(46,24,12,0.82)] shadow-sm transition-all hover:bg-[rgba(255,246,230,0.95)] hover:text-(--color-ember-700) focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-gold-400) focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--app-bg)] md:h-auto md:w-auto md:rounded-full md:px-3 md:py-2"
              >
                <ShoppingCart
                  className="h-5 w-5 md:h-[1.15rem] md:w-[1.15rem]"
                  aria-hidden="true"
                />

                <span className="ml-2 hidden text-sm font-bold md:inline">Cart</span>

                {(itemCount ?? 0) > 0 && (
                  <span
                    className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-(--color-ember-600) px-1 text-[11px] font-black text-white shadow-sm"
                    aria-hidden="true"
                  >
                    {cartBadge}
                  </span>
                )}
              </button>

              <div className="hidden items-center gap-2 md:flex">
                {isAuthed ? (
                  <>
                    {activeOrderId && (
                      <Link
                        to={`/order-status/${activeOrderId}`}
                        className="rounded-full px-3.5 py-2 text-sm font-bold text-(--color-ember-600) transition-colors hover:bg-[rgba(255,246,230,0.95)] hover:text-(--color-ember-500) focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-gold-400) focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--app-bg)]"
                      >
                        {t('header.auth.trackOrder')}
                      </Link>
                    )}

                    {isAdmin && (
                      <Link
                        to="/admin"
                        className="rounded-full px-3.5 py-2 text-sm font-bold text-(--color-gold-600) transition-colors hover:bg-[rgba(255,246,230,0.95)] hover:text-(--color-gold-500) focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-gold-400) focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--app-bg)]"
                      >
                        {t('header.auth.admin')}
                      </Link>
                    )}

                    <Link
                      to="/account"
                      aria-label={t('header.auth.account')}
                      className="flex items-center gap-2 rounded-full border border-[rgba(120,72,38,0.14)] bg-white/65 px-3 py-2 transition-all hover:bg-[rgba(255,246,230,0.95)] focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-gold-400) focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--app-bg)]"
                    >
                      <User className="h-4 w-4 text-[rgba(120,72,38,0.72)]" aria-hidden="true" />
                      {displayName && (
                        <span className="max-w-32 truncate text-sm font-bold text-[rgba(46,24,12,0.88)]">
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
                      className="flex items-center gap-2 rounded-full"
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
                      className="rounded-full"
                    >
                      {t('header.auth.logIn')}
                    </Button>

                    <Button
                      onClick={() => openModalSafe('signup')}
                      variant="primary"
                      size="sm"
                      type="button"
                      className="rounded-full shadow-[0_10px_22px_rgba(168,69,32,0.18)]"
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
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[rgba(120,72,38,0.16)] bg-white/75 text-[rgba(46,24,12,0.82)] shadow-sm transition-all hover:bg-[rgba(255,246,230,0.95)] hover:text-(--color-ember-700) focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-gold-400) focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--app-bg)] md:hidden"
              >
                {mobileMenuOpen ? (
                  <X className="h-5 w-5" aria-hidden="true" />
                ) : (
                  <Menu className="h-5 w-5" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          {mobileMenuOpen && (
            <div
              ref={mobileMenuRef}
              id="mobile-menu"
              role="menu"
              className="mt-3 overflow-hidden rounded-[1.65rem] border border-[rgba(120,72,38,0.14)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,248,235,0.97))] p-3 shadow-[0_22px_60px_rgba(46,24,12,0.16)] transition-colors md:hidden"
            >
              <div className="mb-3 rounded-[1.25rem] border border-[rgba(212,175,55,0.16)] bg-[rgba(255,246,230,0.72)] px-4 py-3 text-center">
                <p className="font-brand text-2xl leading-none text-(--color-ember-700)">
                  <BrandWordmark label={appName} />
                </p>
                <p className="mt-1 font-body text-[0.62rem] font-black uppercase tracking-[0.24em] text-[rgba(120,72,38,0.70)]">
                  Handmade flavor in Surprise
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <div className="grid grid-cols-2 gap-2">
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
                          'rounded-2xl px-4 py-3 text-center text-sm font-black transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-gold-400)',
                          active
                            ? 'bg-(--color-ember-600) text-white shadow-[0_10px_22px_rgba(168,69,32,0.18)]'
                            : 'bg-white/60 text-[rgba(46,24,12,0.86)] hover:bg-[rgba(255,246,230,0.95)] hover:text-(--color-ember-700)',
                        )}
                      >
                        {t(`nav.links.${key}.label`)}
                      </Link>
                    );
                  })}
                </div>

                <hr className="my-1 border-[rgba(120,72,38,0.12)]" />

                {user ? (
                  <>
                    {activeOrderId && (
                      <Link
                        to={`/order-status/${activeOrderId}`}
                        onClick={closeMobileMenu}
                        className="block rounded-2xl bg-(--color-ember-50) px-4 py-3 text-sm font-black text-(--color-ember-700) transition-colors hover:bg-(--color-ember-100) focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-gold-400)"
                      >
                        {t('header.auth.trackOrder')}
                      </Link>
                    )}

                    {isAdmin && (
                      <Link
                        to="/admin"
                        onClick={closeMobileMenu}
                        className="block rounded-2xl bg-(--color-gold-50) px-4 py-3 text-sm font-black text-(--color-gold-600) transition-colors hover:bg-(--color-gold-100) focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-gold-400)"
                      >
                        {t('header.auth.adminPanel')}
                      </Link>
                    )}

                    <Link
                      to="/account"
                      onClick={closeMobileMenu}
                      aria-label={t('header.auth.account')}
                      className="block rounded-2xl border border-[rgba(120,72,38,0.14)] bg-white/70 px-4 py-3 transition-all hover:bg-[rgba(255,246,230,0.95)] focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-gold-400)"
                    >
                      <div className="mb-1 flex items-center gap-2">
                        <User className="h-4 w-4 text-[rgba(120,72,38,0.72)]" aria-hidden="true" />
                        <span className="truncate text-sm font-black text-[rgba(46,24,12,0.88)]">
                          {displayName ?? user.email}
                        </span>
                      </div>

                      {user.email && (
                        <p className="truncate text-xs text-[rgba(120,72,38,0.66)]">{user.email}</p>
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
                  <div className="grid grid-cols-2 gap-2">
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
          <div
            className="absolute inset-0 bg-[rgba(28,18,8,0.48)] backdrop-blur-sm"
            aria-hidden="true"
          />

          <div className="absolute inset-x-0 top-0 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <div
              ref={mobileSearchPanelRef}
              className="mx-auto max-w-2xl overflow-hidden rounded-[1.65rem] border border-[rgba(120,72,38,0.14)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(255,248,235,0.97))] text-[rgba(46,24,12,0.88)] shadow-[0_24px_70px_rgba(28,18,8,0.22)]"
            >
              <div className="flex items-center gap-2 border-b border-[rgba(120,72,38,0.12)] px-3 py-3 sm:px-4">
                <div className="min-w-0 flex-1">
                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgba(120,72,38,0.62)]"
                      aria-hidden="true"
                    />

                    <input
                      ref={mobileSearchInputRef}
                      value={draftSearch}
                      onChange={(event) => setDraftSearch(event.target.value)}
                      placeholder={t('header.search.placeholder')}
                      className="h-11 w-full rounded-2xl border border-[rgba(120,72,38,0.16)] bg-white/75 pl-10 pr-10 text-[rgba(46,24,12,0.90)] outline-none transition placeholder:text-[rgba(120,72,38,0.46)] focus:ring-2 focus:ring-(--color-gold-400)/40"
                      type="search"
                      inputMode="search"
                      autoComplete="off"
                      aria-label={t('header.search.aria')}
                    />

                    {draftSearch.trim().length > 0 && (
                      <button
                        type="button"
                        onClick={() => setDraftSearch('')}
                        className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-xl border border-[rgba(120,72,38,0.14)] bg-white/80 text-[rgba(120,72,38,0.68)] transition-colors hover:bg-[rgba(255,246,230,0.95)] hover:text-[rgba(46,24,12,0.88)] focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-gold-400)/40"
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
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[rgba(120,72,38,0.14)] bg-white/75 text-[rgba(46,24,12,0.82)] transition-colors hover:bg-[rgba(255,246,230,0.95)] focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-gold-400)/40"
                  aria-label={t('header.search.close')}
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>

              <div className="px-4 py-3">
                <p className="text-xs leading-relaxed text-[rgba(120,72,38,0.68)]">
                  {t('header.search.tip')}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}