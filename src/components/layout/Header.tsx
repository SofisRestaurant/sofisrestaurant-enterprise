// src/components/layout/Header.tsx
// =============================================================================
// HEADER — Luxury UX (2026) + Hardened Systems (Mobile-Maxxed)
// =============================================================================
// ✅ Menu-aware Header Search: active only on /menu
// ✅ Mobile: magnifying-glass icon NEXT TO CART opens a compact search overlay
// ✅ No search rendered inside the mobile menu panel
// ✅ No duplicate Filters button in Header (MenuPage owns Filters)
// ✅ Power UX: "/" opens search on /menu (when not typing)
// ✅ Premium: debounce store writes (reduces jank)
// ✅ A11y: skip link, aria-current, ESC + click-outside + route-close
// ✅ Deterministic: no console.*, no localStorage trust
// ✅ CSS system: all colors/tokens/classes aligned to tokens.css + components.css
// ✅ i18n: all user-visible strings via useTranslation()
// =============================================================================

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, ShoppingCart, LogOut, User, Search } from 'lucide-react';

import { useAuth } from '@/modules/auth/hooks/useAuth';
import { useCart } from '@/modules/cart/hooks/useCart';
import { useModal } from '@/components/ui/useModal';
import { CartDrawer } from '@/modules/cart/components/CartDrawer';
import { Button } from '@/components/ui/Button';
import { useActiveOrder } from '@/modules/orders/hooks/useActiveOrder';
import { canAccessAdmin } from '@/security/permissions';

import MenuHeaderSearch from '@/modules/menu/components/MenuHeaderSearch';
import { useMenuUi } from '@/modules/menu/store/menuUi.store';
import { useTranslation } from '@/i18n/useTranslation';

type NavLinkKey = 'home' | 'menu' | 'about' | 'contact';

type NavLink = {
  path: string;
  key: NavLinkKey;
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

// Keys only — labels and aria strings come from the translation system
const NAV_LINKS: NavLink[] = [
  { path: '/', key: 'home' },
  { path: '/menu', key: 'menu' },
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

  // Shared menu search store (single source of truth)
  const menuSearchText = useMenuUi((s) => s.searchText);
  const setMenuSearchText = useMenuUi((s) => s.setSearchText);

  const [cartOpen, setCartOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Mobile search overlay
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const mobileSearchBtnRef = useRef<HTMLButtonElement | null>(null);
  const mobileSearchPanelRef = useRef<HTMLDivElement | null>(null);
  const mobileSearchInputRef = useRef<HTMLInputElement | null>(null);
  const lastFocusRef = useRef<HTMLElement | null>(null);

  const mobileToggleRef = useRef<HTMLButtonElement | null>(null);
  const mobileMenuRef = useRef<HTMLDivElement | null>(null);

  // Debounced input draft (prevents grid jank on every keystroke)
  const [draftSearch, setDraftSearch] = useState(menuSearchText);
  const debounceRef = useRef<number | null>(null);

  // ── Derived ────────────────────────────────────────────────────────────────
  const isAdmin = profile?.role ? canAccessAdmin(profile.role) : false;

  const displayName = useMemo(() => {
    return profile?.full_name?.trim() || user?.name?.trim() || user?.email || null;
  }, [profile?.full_name, user?.name, user?.email]);

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

  const isAuthed = Boolean(user);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const closeMobileMenu = useCallback(() => setMobileMenuOpen(false), []);
  const toggleMobileMenu = useCallback(() => setMobileMenuOpen((prev) => !prev), []);

  const handleOpenCart = useCallback(() => setCartOpen(true), []);
  const handleCloseCart = useCallback(() => setCartOpen(false), []);

  const handleSignOut = useCallback(async () => {
    try {
      await signOut();
    } finally {
      closeMobileMenu();
    }
  }, [signOut, closeMobileMenu]);

  const openModalSafe = useCallback(
    (type: 'login' | 'signup') => {
      if (typeof modal?.openModal !== 'function') return;
      closeMobileMenu();
      modal.openModal(type);
    },
    [modal, closeMobileMenu],
  );

  const closeMobileSearch = useCallback(() => {
    setMobileSearchOpen(false);
    queueMicrotask(() => mobileSearchBtnRef.current?.focus());
  }, []);

  const openMobileSearch = useCallback(() => {
    if (!isMenu) return;
    lastFocusRef.current =
      typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setMobileSearchOpen(true);
  }, [isMenu]);

  // ── Effects ────────────────────────────────────────────────────────────────

  // Route change closes overlays
  useEffect(() => {
    setMobileMenuOpen(false);
    setMobileSearchOpen(false);
  }, [pathname]);

  // Keep draft in sync when store changes externally (e.g. clearing elsewhere)
  useEffect(() => {
    setDraftSearch(menuSearchText);
  }, [menuSearchText]);

  // Debounce store writes while overlay is open OR while on menu (desktop search)
  useEffect(() => {
    if (!isMenu) return;

    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      setMenuSearchText(draftSearch);
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    };
  }, [draftSearch, isMenu, setMenuSearchText]);

  // ESC closes mobile menu + mobile search overlay
  useEffect(() => {
    if (!mobileMenuOpen && !mobileSearchOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;

      if (mobileSearchOpen) {
        e.preventDefault();
        closeMobileSearch();
        return;
      }

      if (mobileMenuOpen) {
        e.preventDefault();
        closeMobileMenu();
        mobileToggleRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileMenuOpen, mobileSearchOpen, closeMobileMenu, closeMobileSearch]);

  // Click outside closes mobile menu
  useEffect(() => {
    if (!mobileMenuOpen) return;

    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;

      if (mobileMenuRef.current?.contains(target) || mobileToggleRef.current?.contains(target)) {
        return;
      }

      closeMobileMenu();
    };

    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [mobileMenuOpen, closeMobileMenu]);

  // Mobile search: focus input on open + click outside closes
  useEffect(() => {
    if (!mobileSearchOpen) return;

    queueMicrotask(() => mobileSearchInputRef.current?.focus());

    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;

      if (
        mobileSearchPanelRef.current?.contains(target) ||
        mobileSearchBtnRef.current?.contains(target)
      ) {
        return;
      }

      closeMobileSearch();
    };

    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [mobileSearchOpen, closeMobileSearch]);

  // Power UX: "/" opens search on /menu when not typing
  useEffect(() => {
    if (!isMenu) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== '/') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const el = document.activeElement as HTMLElement | null;
      const tag = el?.tagName?.toLowerCase();
      const typing = tag === 'input' || tag === 'textarea' || Boolean(el && el.isContentEditable);

      if (typing) return;

      e.preventDefault();
      setMobileMenuOpen(false);
      openMobileSearch();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isMenu, openMobileSearch]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Accessibility skip link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-[var(--radius-lg)] focus:bg-white focus:px-4 focus:py-2 focus:shadow-[var(--shadow-xl)] focus:ring-2 focus:ring-[var(--color-gold-400)]"
      >
        {t('nav.skipToContent')}
      </a>

      <header className="sticky top-0 z-[30] border-b border-[var(--color-border)] bg-white/95 shadow-sm backdrop-blur-md">
        <nav
          className="mx-auto max-w-7xl px-4 py-4"
          role="navigation"
          aria-label={t('nav.ariaLabel')}
        >
          <div className="flex items-center justify-between gap-3">
            {/* Logo */}
            <Link
              to="/"
              className="text-script rounded-[var(--radius-md)] px-2 py-1 text-2xl text-[var(--color-ember-700)] transition-colors duration-[var(--duration-base)] hover:text-[var(--color-ember-600)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-400)] focus-visible:ring-offset-2"
              aria-label={t('header.logo.aria')}
            >
              {t('common.appName')}
            </Link>

            {/* Desktop navigation */}
            <div
              className="hidden items-center gap-2 md:flex"
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
                      'rounded-[var(--radius-md)] px-3 py-2 text-sm font-medium',
                      'transition-all duration-[var(--duration-base)]',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-400)] focus-visible:ring-offset-2',
                      active
                        ? 'bg-[var(--color-ember-50)] text-[var(--color-ember-700)]'
                        : 'text-[var(--color-ink-700)] hover:bg-[var(--color-ink-50)] hover:text-[var(--color-ember-700)]',
                    )}
                  >
                    {t(`nav.links.${key}.label`)}
                  </Link>
                );
              })}
            </div>

            {/* Right-side actions */}
            <div className="flex items-center gap-2 md:gap-3">
              {/* Desktop search — only on /menu, lg+ */}
              {isMenu ? (
                <div className="hidden w-[28rem] max-w-[38vw] lg:block">
                  <MenuHeaderSearch
                    value={draftSearch}
                    onChange={setDraftSearch}
                    placeholder={t('header.search.placeholder')}
                  />
                </div>
              ) : null}

              {/* Mobile search icon — only on /menu, hidden on lg+ */}
              {isMenu ? (
                <button
                  ref={mobileSearchBtnRef}
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    openMobileSearch();
                  }}
                  aria-label={t('header.search.openAria')}
                  aria-haspopup="dialog"
                  aria-expanded={mobileSearchOpen ? 'true' : 'false'}
                  className={cx(
                    'inline-flex h-10 w-10 items-center justify-center',
                    'rounded-[var(--radius-pill)]',
                    'border border-[var(--color-border)] bg-white',
                    'text-[var(--color-ink-800)] shadow-[var(--shadow-xs)]',
                    'transition-colors duration-[var(--duration-base)] hover:bg-[var(--color-ink-50)]',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-400)]/40',
                    'lg:hidden',
                  )}
                >
                  <Search className="h-5 w-5" aria-hidden="true" />
                </button>
              ) : null}

              {/* Cart */}
              <button
                onClick={handleOpenCart}
                type="button"
                aria-label={cartAriaLabel}
                className={cx(
                  'relative rounded-[var(--radius-md)] p-2',
                  'text-[var(--color-ink-700)]',
                  'transition-all duration-[var(--duration-base)]',
                  'hover:bg-[var(--color-ink-50)] hover:text-[var(--color-ember-700)]',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-400)] focus-visible:ring-offset-2',
                )}
              >
                <ShoppingCart className="h-6 w-6" aria-hidden="true" />
                {(itemCount ?? 0) > 0 ? (
                  <span
                    className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-[var(--radius-pill)] bg-[var(--color-ember-600)] px-1 text-[11px] font-bold text-white shadow-[var(--shadow-xs)]"
                    aria-hidden="true"
                  >
                    {(itemCount ?? 0) > 99 ? '99+' : itemCount}
                  </span>
                ) : null}
              </button>

              {/* Desktop auth cluster */}
              <div className="hidden items-center gap-2 md:flex">
                {isAuthed ? (
                  <>
                    {activeOrderId ? (
                      <Link
                        to={`/order-status/${activeOrderId}`}
                        className="link-line rounded-[var(--radius-md)] px-3 py-2 text-sm font-semibold text-[var(--color-ember-600)] transition-colors duration-[var(--duration-base)] hover:text-[var(--color-ember-500)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-400)] focus-visible:ring-offset-2"
                      >
                        {t('header.auth.trackOrder')}
                      </Link>
                    ) : null}

                    {isAdmin ? (
                      <Link
                        to="/admin"
                        className="link-line rounded-[var(--radius-md)] px-3 py-2 text-sm font-semibold text-[var(--color-gold-600)] transition-colors duration-[var(--duration-base)] hover:text-[var(--color-gold-500)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-400)] focus-visible:ring-offset-2"
                      >
                        {t('header.auth.admin')}
                      </Link>
                    ) : null}

                    <Link
                      to="/account"
                      aria-label={t('header.auth.account')}
                      className={cx(
                        'flex items-center gap-2 rounded-[var(--radius-md)]',
                        'bg-[var(--color-ink-50)] px-3 py-2',
                        'transition-all duration-[var(--duration-base)] hover:bg-[var(--color-ink-100)]',
                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-400)] focus-visible:ring-offset-2',
                      )}
                    >
                      <User className="h-4 w-4 text-[var(--color-ink-500)]" aria-hidden="true" />
                      {displayName ? (
                        <span className="text-sm font-medium text-[var(--color-ink-700)]">
                          {t('header.auth.greeting', { name: displayName })}
                        </span>
                      ) : null}
                    </Link>

                    <Button
                      onClick={handleSignOut}
                      variant="secondary"
                      size="sm"
                      type="button"
                      aria-label={t('header.auth.signOut')}
                      className="flex items-center gap-2"
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

              {/* Mobile menu toggle */}
              <button
                ref={mobileToggleRef}
                onClick={toggleMobileMenu}
                type="button"
                aria-label={mobileMenuOpen ? t('header.auth.closeMenu') : t('header.auth.openMenu')}
                aria-expanded={mobileMenuOpen}
                aria-controls="mobile-menu"
                className={cx(
                  'rounded-[var(--radius-md)] p-2',
                  'text-[var(--color-ink-700)]',
                  'transition-all duration-[var(--duration-base)]',
                  'hover:bg-[var(--color-ink-50)] hover:text-[var(--color-ember-700)]',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-400)] focus-visible:ring-offset-2',
                  'md:hidden',
                )}
              >
                {mobileMenuOpen ? (
                  <X className="h-6 w-6" aria-hidden="true" />
                ) : (
                  <Menu className="h-6 w-6" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          {/* Mobile menu panel */}
          {mobileMenuOpen ? (
            <div
              ref={mobileMenuRef}
              id="mobile-menu"
              role="menu"
              className="card mt-4 p-3 md:hidden"
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
                          'rounded-[var(--radius-xl)] px-4 py-3 text-sm font-medium',
                          'transition-all duration-[var(--duration-base)]',
                          'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-400)]',
                          active
                            ? 'bg-[var(--color-ember-50)] text-[var(--color-ember-700)]'
                            : 'text-[var(--color-ink-700)] hover:bg-[var(--color-ink-50)] hover:text-[var(--color-ember-700)]',
                        )}
                      >
                        {t(`nav.links.${key}.label`)}
                      </Link>
                    );
                  })}
                </div>

                <hr className="divider-cream my-1" />

                {user ? (
                  <>
                    {activeOrderId ? (
                      <Link
                        to={`/order-status/${activeOrderId}`}
                        onClick={closeMobileMenu}
                        className="block rounded-[var(--radius-xl)] bg-[var(--color-ember-50)] px-4 py-3 text-sm font-semibold text-[var(--color-ember-700)] transition-colors duration-[var(--duration-base)] hover:bg-[var(--color-ember-100)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-400)]"
                      >
                        {t('header.auth.trackOrder')}
                      </Link>
                    ) : null}

                    {isAdmin ? (
                      <Link
                        to="/admin"
                        onClick={closeMobileMenu}
                        className="block rounded-[var(--radius-xl)] bg-[var(--color-gold-50)] px-4 py-3 text-sm font-semibold text-[var(--color-gold-600)] transition-colors duration-[var(--duration-base)] hover:bg-[var(--color-gold-100)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-400)]"
                      >
                        {t('header.auth.adminPanel')}
                      </Link>
                    ) : null}

                    <Link
                      to="/account"
                      onClick={closeMobileMenu}
                      aria-label={t('header.auth.account')}
                      className="block rounded-[var(--radius-xl)] bg-[var(--color-ink-50)] px-4 py-3 transition-all duration-[var(--duration-base)] hover:bg-[var(--color-ink-100)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-400)]"
                    >
                      <div className="mb-1 flex items-center gap-2">
                        <User className="h-4 w-4 text-[var(--color-ink-500)]" aria-hidden="true" />
                        <span className="text-sm font-semibold text-[var(--color-ink-900)]">
                          {displayName}
                        </span>
                      </div>
                      {user.email ? (
                        <p className="text-xs text-[var(--color-ink-500)]">{user.email}</p>
                      ) : null}
                    </Link>

                    <Button
                      onClick={handleSignOut}
                      variant="secondary"
                      type="button"
                      className="mt-1 w-full"
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
                      className="w-full"
                    >
                      {t('header.auth.logIn')}
                    </Button>
                    <Button
                      onClick={() => openModalSafe('signup')}
                      variant="primary"
                      type="button"
                      className="w-full"
                    >
                      {t('header.auth.signUp')}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </nav>
      </header>

      {/* Mobile Search Overlay */}
      {isMenu && mobileSearchOpen ? (
        <div
          className="fixed inset-0 z-[40]"
          role="dialog"
          aria-modal="true"
          aria-label={t('header.search.aria')}
        >
          <div className="absolute inset-0 bg-black/40" aria-hidden="true" />
          <div className="absolute inset-x-0 top-0 p-3">
            <div
              ref={mobileSearchPanelRef}
              className="mx-auto max-w-2xl overflow-hidden rounded-[var(--radius-card)] border border-white/10 bg-[var(--color-stone-950)] text-white shadow-[var(--shadow-2xl)]"
            >
              <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-ink-400)]"
                      aria-hidden="true"
                    />
                    <input
                      ref={mobileSearchInputRef}
                      value={draftSearch}
                      onChange={(e) => setDraftSearch(e.target.value)}
                      placeholder={t('header.search.placeholder')}
                      className="input input-dark h-11 w-full pl-10 pr-10"
                      type="search"
                      inputMode="search"
                      autoComplete="off"
                      aria-label={t('header.search.aria')}
                    />
                    {draftSearch.trim().length > 0 ? (
                      <button
                        type="button"
                        onClick={() => setDraftSearch('')}
                        className={cx(
                          'absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center',
                          'rounded-[var(--radius-lg)] border border-white/10 bg-white/5 text-white/80',
                          'transition-colors duration-[var(--duration-base)] hover:bg-white/10',
                          'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-400)]/40',
                        )}
                        aria-label={t('header.search.clear')}
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </button>
                    ) : null}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={closeMobileSearch}
                  className={cx(
                    'inline-flex h-10 w-10 items-center justify-center',
                    'rounded-[var(--radius-lg)] border border-white/10 bg-white/5 text-white',
                    'transition-colors duration-[var(--duration-base)] hover:bg-white/10',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-400)]/40',
                  )}
                  aria-label={t('header.search.close')}
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>

              <div className="px-4 py-3">
                <p className="text-label text-[var(--color-ink-400)]">{t('header.search.tip')}</p>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <CartDrawer isOpen={cartOpen} onClose={handleCloseCart} />
    </>
  );
}