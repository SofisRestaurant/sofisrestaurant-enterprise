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

type NavLink = {
  path: string;
  label: string;
  ariaLabel: string;
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

const NAV_LINKS: NavLink[] = [
  { path: '/', label: 'Home', ariaLabel: 'Go to homepage' },
  { path: '/menu', label: 'Menu', ariaLabel: 'View our menu' },
  { path: '/about', label: 'About', ariaLabel: 'Learn about us' },
  { path: '/contact', label: 'Contact', ariaLabel: 'Contact us' },
];

const SEARCH_DEBOUNCE_MS = 150;

export default function Header() {
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
    return `Shopping cart with ${count} ${count === 1 ? 'item' : 'items'}`;
  }, [itemCount]);

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
    // restore focus to the search icon (clean + deterministic)
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

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Accessibility skip link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-100 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:shadow-xl focus:ring-2 focus:ring-orange-500"
      >
        Skip to main content
      </a>

      <header className="sticky top-0 z-40 border-b border-gray-100 bg-white/95 shadow-sm backdrop-blur-md">
        <nav className="mx-auto max-w-7xl px-4 py-4" role="navigation" aria-label="Main navigation">
          <div className="flex items-center justify-between gap-3">
            {/* Logo */}
            <Link
              to="/"
              className="text-script rounded-lg px-2 py-1 text-2xl text-orange-700 transition-colors hover:text-orange-800 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2"
              aria-label="Sofi's Restaurant - Go to homepage"
            >
              Sofi&apos;s Restaurant
            </Link>

            {/* Desktop navigation */}
            <div
              className="hidden items-center gap-2 md:flex"
              role="menubar"
              aria-label="Primary links"
            >
              {NAV_LINKS.map(({ path, label, ariaLabel }) => {
                const active = isActive(path);
                return (
                  <Link
                    key={path}
                    to={path}
                    role="menuitem"
                    aria-label={ariaLabel}
                    aria-current={active ? 'page' : undefined}
                    className={cx(
                      'rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200',
                      'focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2',
                      active
                        ? 'bg-orange-50 text-orange-700'
                        : 'text-gray-700 hover:bg-gray-50 hover:text-orange-700',
                    )}
                  >
                    {label}
                  </Link>
                );
              })}
            </div>

            {/* Right-side actions (luxury cluster) */}
            <div className="flex items-center gap-2 md:gap-3">
              {/* Desktop: show full search input only on /menu (kept calm + premium) */}
              {isMenu ? (
                <div className="hidden w-28rem max-w-[38vw] lg:block">
                  <MenuHeaderSearch
                    value={draftSearch}
                    onChange={setDraftSearch}
                    placeholder="Search tacos, breakfast, spicy…"
                  />
                </div>
              ) : null}

              {/* Mobile: magnifying glass icon NEXT TO CART only on /menu */}
              {isMenu ? (
                <button
                  ref={mobileSearchBtnRef}
                  type="button"
                  onClick={() => {
                    // don’t stack overlays
                    setMobileMenuOpen(false);
                    openMobileSearch();
                  }}
                  aria-label="Search menu"
                  aria-haspopup="dialog"
                  aria-expanded={mobileSearchOpen ? 'true' : 'false'}
                  className={cx(
                    'inline-flex h-10 w-10 items-center justify-center rounded-2xl',
                    'border border-gray-200 bg-white text-gray-800 shadow-sm',
                    'hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-orange-500/40',
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
                className="relative rounded-lg p-2 text-gray-700 transition-all hover:bg-gray-50 hover:text-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2"
              >
                <ShoppingCart className="h-6 w-6" aria-hidden="true" />
                {(itemCount ?? 0) > 0 ? (
                  <span
                    className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-orange-600 px-1 text-[11px] font-bold text-white shadow-sm"
                    aria-hidden="true"
                  >
                    {(itemCount ?? 0) > 99 ? '99+' : itemCount}
                  </span>
                ) : null}
              </button>

              {/* Desktop auth */}
              <div className="hidden items-center gap-2 md:flex">
                {isAuthed ? (
                  <>
                    {activeOrderId ? (
                      <Link
                        to={`/order-status/${activeOrderId}`}
                        className="rounded-lg px-3 py-2 text-sm font-semibold text-orange-600 transition hover:text-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2"
                      >
                        Track Order
                      </Link>
                    ) : null}

                    {isAdmin ? (
                      <Link
                        to="/admin"
                        className="rounded-lg px-3 py-2 text-sm font-semibold text-amber-600 transition hover:text-amber-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2"
                      >
                        Admin
                      </Link>
                    ) : null}

                    <Link
                      to="/account"
                      aria-label="Go to your account"
                      className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 transition-all hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2"
                    >
                      <User className="h-4 w-4 text-gray-600" aria-hidden="true" />
                      {displayName ? (
                        <span className="text-sm font-medium text-gray-700">Hi, {displayName}</span>
                      ) : null}
                    </Link>

                    <Button
                      onClick={handleSignOut}
                      variant="secondary"
                      size="sm"
                      type="button"
                      aria-label="Sign out"
                      className="flex items-center gap-2"
                    >
                      <LogOut className="h-4 w-4" aria-hidden="true" />
                      Sign Out
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      onClick={() => openModalSafe('login')}
                      variant="secondary"
                      size="sm"
                      type="button"
                      aria-label="Sign in to your account"
                    >
                      Log In
                    </Button>
                    <Button
                      onClick={() => openModalSafe('signup')}
                      variant="primary"
                      size="sm"
                      type="button"
                      aria-label="Create a new account"
                    >
                      Sign Up
                    </Button>
                  </>
                )}
              </div>

              {/* Mobile menu toggle */}
              <button
                ref={mobileToggleRef}
                onClick={toggleMobileMenu}
                type="button"
                aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
                aria-expanded={mobileMenuOpen}
                aria-controls="mobile-menu"
                className="rounded-lg p-2 text-gray-700 transition-all hover:bg-gray-50 hover:text-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 md:hidden"
              >
                {mobileMenuOpen ? (
                  <X className="h-6 w-6" aria-hidden="true" />
                ) : (
                  <Menu className="h-6 w-6" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          {/* Mobile menu (NO search inside here) */}
          {mobileMenuOpen ? (
            <div
              ref={mobileMenuRef}
              id="mobile-menu"
              role="menu"
              className="mt-4 rounded-2xl border border-gray-200 bg-white p-3 shadow-lg md:hidden"
            >
              <div className="flex flex-col gap-2">
                <div className="flex flex-col gap-1">
                  {NAV_LINKS.map(({ path, label, ariaLabel }) => {
                    const active = isActive(path);
                    return (
                      <Link
                        key={path}
                        to={path}
                        role="menuitem"
                        onClick={closeMobileMenu}
                        aria-label={ariaLabel}
                        aria-current={active ? 'page' : undefined}
                        className={cx(
                          'rounded-xl px-4 py-3 text-sm font-medium transition-all',
                          'focus:outline-none focus:ring-2 focus:ring-orange-500',
                          active
                            ? 'bg-orange-50 text-orange-700'
                            : 'text-gray-700 hover:bg-gray-50 hover:text-orange-700',
                        )}
                      >
                        {label}
                      </Link>
                    );
                  })}
                </div>

                <div className="my-1 border-t border-gray-200" />

                {user ? (
                  <>
                    {activeOrderId ? (
                      <Link
                        to={`/order-status/${activeOrderId}`}
                        onClick={closeMobileMenu}
                        className="block rounded-xl bg-orange-50 px-4 py-3 text-sm font-semibold text-orange-700 transition hover:bg-orange-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
                      >
                        Track Order
                      </Link>
                    ) : null}

                    {isAdmin ? (
                      <Link
                        to="/admin"
                        onClick={closeMobileMenu}
                        className="block rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700 transition hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
                      >
                        Admin Panel
                      </Link>
                    ) : null}

                    <Link
                      to="/account"
                      onClick={closeMobileMenu}
                      aria-label="Go to your account"
                      className="block rounded-xl bg-gray-50 px-4 py-3 transition-all hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    >
                      <div className="mb-1 flex items-center gap-2">
                        <User className="h-4 w-4 text-gray-600" aria-hidden="true" />
                        <span className="text-sm font-semibold text-gray-900">{displayName}</span>
                      </div>
                      {user.email ? <p className="text-xs text-gray-600">{user.email}</p> : null}
                    </Link>

                    <Button
                      onClick={handleSignOut}
                      variant="secondary"
                      type="button"
                      className="mt-1 w-full"
                    >
                      <span className="flex items-center justify-center gap-2">
                        <LogOut className="h-4 w-4" aria-hidden="true" />
                        Sign Out
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
                      Log In
                    </Button>
                    <Button
                      onClick={() => openModalSafe('signup')}
                      variant="primary"
                      type="button"
                      className="w-full"
                    >
                      Sign Up
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </nav>
      </header>

      {/* Mobile Search Overlay (only on /menu) */}
      {isMenu && mobileSearchOpen ? (
        <div
          className="fixed inset-0 z-50"
          role="dialog"
          aria-modal="true"
          aria-label="Search menu"
        >
          <div className="absolute inset-0 bg-black/40" aria-hidden="true" />
          <div className="absolute inset-x-0 top-0 p-3">
            <div
              ref={mobileSearchPanelRef}
              className="mx-auto max-w-2xl overflow-hidden rounded-2xl border border-white/10 bg-neutral-950 text-white shadow-2xl"
            >
              <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500"
                      aria-hidden="true"
                    />
                    <input
                      ref={mobileSearchInputRef}
                      value={draftSearch}
                      onChange={(e) => setDraftSearch(e.target.value)}
                      placeholder="Search tacos, breakfast, spicy…"
                      className={cx(
                        'h-11 w-full rounded-2xl border border-white/10 bg-white/5 pl-10 pr-10 text-sm text-white outline-none',
                        'placeholder:text-zinc-500 focus-visible:ring-2 focus-visible:ring-amber-500/25 focus-visible:border-amber-500/30',
                      )}
                      type="search"
                      inputMode="search"
                      autoComplete="off"
                      aria-label="Search menu"
                    />
                    {draftSearch.trim().length > 0 ? (
                      <button
                        type="button"
                        onClick={() => setDraftSearch('')}
                        className={cx(
                          'absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-xl',
                          'border border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10',
                          'focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/25',
                        )}
                        aria-label="Clear search"
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </button>
                    ) : null}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={closeMobileSearch}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/25"
                  aria-label="Close search"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>

              <div className="px-4 py-3">
                <p className="text-xs text-zinc-400">Tip: Press “/” to search instantly.</p>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <CartDrawer isOpen={cartOpen} onClose={handleCloseCart} />
    </>
  );
}
