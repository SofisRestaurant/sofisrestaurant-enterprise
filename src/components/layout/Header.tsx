// src/components/layout/Header.tsx
// =============================================================================
// FUSED HARDENED VERSION
//
// Sources:
//   Doc1 (Senior)      — isMounted pattern, openModalSafe, clean channel style
//   Doc2 (Bulletproof) — useAuth single-call, canAccessAdmin, profile.full_name,
//                        cart badge cap, skip link, ESC/click-outside/route-change,
//                        full aria attributes
//
// Hardening applied:
//   ✅ 1. Zero localStorage trust — useActiveOrder reads DB only
//   ✅ 2. No sensitive data logging — all console.log/error stripped
//   ✅ 3. Active order logic in useActiveOrder hook
//   ✅ 4. Single admin link — canAccessAdmin gate, no duplicate
//   ✅ 5. Role rendering via canAccessAdmin(profile.role), not boolean flag
//   ✅ 6. Memory-safe channel cleanup lives in useActiveOrder
//   ✅ 7. Defensive guards on modal, user, profile at every access
//   ✅ 8. No console spam — zero console.* calls
//   ✅ 9. Side-effect deterministic — no setTimeout, no alert()
// =============================================================================

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, ShoppingCart, LogOut, User } from 'lucide-react';

import { useAuth } from '@/features/auth/useAuth';
import { useCart } from '@/hooks/useCart';
import { useModal } from '@/components/ui/useModal';
import { CartDrawer } from '@/components/cart/CartDrawer';
import { Button } from '@/components/ui/Button';
import { useActiveOrder } from '@/features/orders/useActiveOrder';
import { canAccessAdmin } from '@/security/permissions';

// ── Types ─────────────────────────────────────────────────────────────────────
type NavLink = {
  path: string;
  label: string;
  ariaLabel: string;
};

// ── Utility ───────────────────────────────────────────────────────────────────
function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

// ── Constants ─────────────────────────────────────────────────────────────────
const NAV_LINKS: NavLink[] = [
  { path: '/', label: 'Home', ariaLabel: 'Go to homepage' },
  { path: '/menu', label: 'Menu', ariaLabel: 'View our menu' },
  { path: '/about', label: 'About', ariaLabel: 'Learn about us' },
  { path: '/contact', label: 'Contact', ariaLabel: 'Contact us' },
];

// ── Component ─────────────────────────────────────────────────────────────────
export default function Header() {
  const location = useLocation();

  // Single auth call — provides user, profile, and signOut together
  const { user, profile, signOut } = useAuth();
  const { itemCount } = useCart();
  const modal = useModal();

  // Active order from DB only — zero localStorage
  const activeOrderId = useActiveOrder(user?.id ?? null);

  const [cartOpen, setCartOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const mobileToggleRef = useRef<HTMLButtonElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  // ── Derived values ───────────────────────────────────────────────────────
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
      path === '/'
        ? location.pathname === '/'
        : location.pathname === path || location.pathname.startsWith(`${path}/`),
    [location.pathname],
  );

  // ── Handlers ─────────────────────────────────────────────────────────────
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

  // Defensive guard: only call if modal is properly initialised
  const openModalSafe = useCallback(
    (type: 'login' | 'signup') => {
      if (typeof modal?.openModal !== 'function') return;
      closeMobileMenu();
      modal.openModal(type);
    },
    [modal, closeMobileMenu],
  );

  // ── Side effects ─────────────────────────────────────────────────────────

  // Auto-close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  // ESC closes mobile menu
  useEffect(() => {
    if (!mobileMenuOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        closeMobileMenu();
        mobileToggleRef.current?.focus();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileMenuOpen, closeMobileMenu]);

  // Click outside closes mobile menu
  useEffect(() => {
    if (!mobileMenuOpen) return;

    function handlePointerDown(e: PointerEvent) {
      const target = e.target as Node | null;
      if (!target) return;

      if (mobileMenuRef.current?.contains(target) || mobileToggleRef.current?.contains(target))
        return;

      closeMobileMenu();
    }

    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [mobileMenuOpen, closeMobileMenu]);

  // ── Render ───────────────────────────────────────────────────────────────
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
              className="rounded-lg px-2 py-1 text-2xl font-bold text-orange-700 transition-colors hover:text-orange-800 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2"
              aria-label="Sofi's Restaurant - Go to homepage"
            >
              Sofi&apos;s Restaurant
            </Link>

            {/* Desktop navigation */}
            <div className="hidden items-center gap-2 md:flex" role="menubar">
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

            {/* Right-side actions */}
            <div className="flex items-center gap-2 md:gap-3">
              {/* Cart */}
              <button
                onClick={handleOpenCart}
                type="button"
                aria-label={cartAriaLabel}
                className="relative rounded-lg p-2 text-gray-700 transition-all hover:bg-gray-50 hover:text-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2"
              >
                <ShoppingCart className="h-6 w-6" aria-hidden="true" />
                {(itemCount ?? 0) > 0 && (
                  <span
                    className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-orange-600 px-1 text-[11px] font-bold text-white shadow-sm"
                    aria-hidden="true"
                  >
                    {(itemCount ?? 0) > 99 ? '99+' : itemCount}
                  </span>
                )}
              </button>

              {/* Desktop auth */}
              <div className="hidden items-center gap-2 md:flex">
                {user ? (
                  <>
                    {activeOrderId && (
                      <Link
                        to={`/order-status/${activeOrderId}`}
                        className="rounded-lg px-3 py-2 text-sm font-semibold text-orange-600 transition hover:text-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2"
                      >
                        Track Order
                      </Link>
                    )}

                    {isAdmin && (
                      <Link
                        to="/admin"
                        className="rounded-lg px-3 py-2 text-sm font-semibold text-amber-600 transition hover:text-amber-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2"
                      >
                        Admin
                      </Link>
                    )}

                    <Link
                      to="/account"
                      aria-label="Go to your account"
                      className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 transition-all hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2"
                    >
                      <User className="h-4 w-4 text-gray-600" aria-hidden="true" />
                      {displayName && (
                        <span className="text-sm font-medium text-gray-700">Hi, {displayName}</span>
                      )}
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

          {/* Mobile menu */}
          {mobileMenuOpen && (
            <div
              ref={mobileMenuRef}
              id="mobile-menu"
              role="menu"
              className="mt-4 rounded-2xl border border-gray-200 bg-white p-3 shadow-lg md:hidden"
            >
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

                <div className="my-2 border-t border-gray-200" />

                {user ? (
                  <>
                    {activeOrderId && (
                      <Link
                        to={`/order-status/${activeOrderId}`}
                        onClick={closeMobileMenu}
                        className="block rounded-xl bg-orange-50 px-4 py-3 text-sm font-semibold text-orange-700 transition hover:bg-orange-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
                      >
                        Track Order
                      </Link>
                    )}

                    {isAdmin && (
                      <Link
                        to="/admin"
                        onClick={closeMobileMenu}
                        className="block rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700 transition hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
                      >
                        Admin Panel
                      </Link>
                    )}

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
                      {user.email && <p className="text-xs text-gray-600">{user.email}</p>}
                    </Link>

                    <Button
                      onClick={handleSignOut}
                      variant="secondary"
                      type="button"
                      className="mt-2 w-full"
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
          )}
        </nav>
      </header>

      <CartDrawer isOpen={cartOpen} onClose={handleCloseCart} />
    </>
  );
}
