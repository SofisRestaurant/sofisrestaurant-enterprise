// src/components/layout/Header.tsx - BULLETPROOF VERSION

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, ShoppingCart, LogOut, User } from 'lucide-react';

import { useAuth } from '@/features/auth/useAuth';
import { useCart } from '@/hooks/useCart';
import { useModal } from '@/components/ui/useModal';
import { CartDrawer } from '@/components/cart/CartDrawer';
import { Button } from '@/components/ui/Button';

import { supabase } from '@/lib/supabase/supabaseClient';
import { OrderStatus } from '@/domain/orders/order.types';

type NavLink = {
  path: string;
  label: string;
  ariaLabel?: string;
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

/**
 * Header - Bulletproof Edition
 *
 * GUARANTEED MODAL OPENING - Multiple fail-safes
 */
export default function Header() {
  const location = useLocation();
  const { user, profile, signOut } = useAuth(); // ✅ include profile here (single useAuth call)
  const { itemCount } = useCart();
  const modal = useModal();

  const [cartOpen, setCartOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const mobileToggleRef = useRef<HTMLButtonElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);



// ============================================================================
// LOAD ACTIVE ORDER FOR HEADER TRACK BUTTON
// ============================================================================
useEffect(() => {
  if (!user?.id) {
    setActiveOrderId(null);
    return;
  }
    const storedOrderId = localStorage.getItem('lastOrderId')

if (storedOrderId) {
  setActiveOrderId(storedOrderId)
}
console.log('Header user id:', user?.id)
  
  let mounted = true;

  const loadActiveOrder = async () => {
    const { data, error } = await supabase
  .from('orders')
  .select('id, status, payment_status')
  .eq('customer_uid', user.id)
  .eq('payment_status', 'paid') // ✅ CRITICAL FIX
  .in('status', [
    OrderStatus.CONFIRMED,
    OrderStatus.PREPARING,
    OrderStatus.READY,
    OrderStatus.SHIPPED,
  ])
  .order('created_at', { ascending: false })
  .limit(1)
  .maybeSingle();

    if (!mounted) return;

    if (!error && data?.id) {
      setActiveOrderId(data.id);
    } else {
      setActiveOrderId(null);
    }
  };

  loadActiveOrder();

  return () => {
    mounted = false;
  };
}, [user?.id,])


// ============================================================================
// REALTIME: REMOVE TRACK BUTTON WHEN ORDER COMPLETES OR PAYMENT INVALID
// ============================================================================
useEffect(() => {
  if (!activeOrderId) return;

  const channel = supabase
    .channel(`header-order-${activeOrderId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'orders',
        filter: `id=eq.${activeOrderId}`,
      },
      (payload) => {
        const newStatus = payload.new?.status as OrderStatus | undefined;
        const newPaymentStatus = payload.new?.payment_status as string | undefined;

        // Remove track button if order is no longer trackable
        if (
          newStatus === OrderStatus.CANCELLED ||
          newStatus === OrderStatus.DELIVERED ||
          newPaymentStatus !== 'paid'
        ) {
          localStorage.removeItem('lastOrderId');
          setActiveOrderId(null);
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}, [activeOrderId]);

  const navLinks: NavLink[] = useMemo(
    () => [
      { path: '/', label: 'Home', ariaLabel: 'Go to homepage' },
      { path: '/menu', label: 'Menu', ariaLabel: 'View our menu' },
      { path: '/about', label: 'About', ariaLabel: 'Learn about us' },
      { path: '/contact', label: 'Contact', ariaLabel: 'Contact us' },
    ],
    []
  );

  const isActive = useCallback(
    (path: string) => {
      if (path === '/') return location.pathname === '/';
      return location.pathname === path || location.pathname.startsWith(`${path}/`);
    },
    [location.pathname]
  );

  // ============================================================================
  // CRITICAL FIX #1: Verify modal hook works on mount
  // ============================================================================
  useEffect(() => {
    if (import.meta.env.DEV) {
      console.log('[Header] Modal hook state:', {
        hasOpenModal: typeof modal.openModal === 'function',
        hasCloseModal: typeof modal.closeModal === 'function',
        activeModal: modal.activeModal,
      });

      if (typeof modal.openModal !== 'function') {
        console.error('❌ CRITICAL: modal.openModal is not a function!');
        console.error('Check that ModalProvider wraps your app in main.tsx');
      }
    }
  }, [modal]);

  const closeMobileMenu = useCallback(() => {
    setMobileMenuOpen(false);
  }, []);

  const toggleMobileMenu = useCallback(() => {
    setMobileMenuOpen((prev) => !prev);
  }, []);

  const handleOpenCart = useCallback(() => setCartOpen(true), []);
  const handleCloseCart = useCallback(() => setCartOpen(false), []);

  const handleSignOut = useCallback(async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('[Header] Sign out error:', error);
    } finally {
      closeMobileMenu();
    }
  }, [signOut, closeMobileMenu]);

  // ============================================================================
  // CRITICAL FIX #2: Bulletproof modal opening with validation
  // ============================================================================
  const handleOpenLogin = useCallback(() => {
    console.log('[Header] Opening login modal...');

    // Validation check
    if (typeof modal.openModal !== 'function') {
      console.error('❌ Cannot open login - modal.openModal is not a function');
      alert('Error: Modal system not initialized. Please refresh the page.');
      return;
    }

    try {
      // Close mobile menu first
      closeMobileMenu();

      // Small delay to ensure menu closes
      setTimeout(() => {
        modal.openModal('login');
        console.log('✅ Login modal opened');
      }, 50);
    } catch (error) {
      console.error('❌ Error opening login modal:', error);
      alert('Error opening login. Please try again.');
    }
  }, [modal, closeMobileMenu]);

  const handleOpenSignup = useCallback(() => {
    console.log('[Header] Opening signup modal...');

    if (typeof modal.openModal !== 'function') {
      console.error('❌ Cannot open signup - modal.openModal is not a function');
      alert('Error: Modal system not initialized. Please refresh the page.');
      return;
    }

    try {
      closeMobileMenu();

      setTimeout(() => {
        modal.openModal('signup');
        console.log('✅ Signup modal opened');
      }, 50);
    } catch (error) {
      console.error('❌ Error opening signup modal:', error);
      alert('Error opening signup. Please try again.');
    }
  }, [modal, closeMobileMenu]);

  // ✅ Prefer DB name (profiles.full_name), fallback to app user name/email
  const displayName = useMemo(() => {
    const dbName = profile?.full_name?.trim();
    if (dbName) return dbName;

    const appName = user?.name?.trim();
    if (appName) return appName;

    return user?.email ?? null;
  }, [profile?.full_name, user?.name, user?.email]);

  const cartAriaLabel = useMemo(() => {
    const count = itemCount ?? 0;
    return `Shopping cart with ${count} ${count === 1 ? 'item' : 'items'}`;
  }, [itemCount]);

  // Auto-close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  // Mobile menu: ESC key closes
  useEffect(() => {
    if (!mobileMenuOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeMobileMenu();
        mobileToggleRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileMenuOpen, closeMobileMenu]);

  // Mobile menu: click outside closes
  useEffect(() => {
    if (!mobileMenuOpen) return;

    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;

      if (
        mobileMenuRef.current?.contains(target) ||
        mobileToggleRef.current?.contains(target)
      ) {
        return;
      }

      closeMobileMenu();
    };

    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [mobileMenuOpen, closeMobileMenu]);

  return (
    <>
      {/* Skip link */}
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

            {/* Desktop Navigation */}
            <div className="hidden items-center gap-2 md:flex" role="menubar">
              {navLinks.map(({ path, label, ariaLabel }) => {
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
                        : 'text-gray-700 hover:bg-gray-50 hover:text-orange-700'
                    )}
                  >
                    {label}
                  </Link>
                );
              })}
            </div>

            {/* Right side actions */}
            <div className="flex items-center gap-2 md:gap-3">
              {/* Cart Button */}
              <button
                onClick={handleOpenCart}
                className="relative rounded-lg p-2 text-gray-700 transition-all hover:bg-gray-50 hover:text-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2"
                aria-label={cartAriaLabel}
                type="button"
              >
                <ShoppingCart className="h-6 w-6" aria-hidden="true" />
                {itemCount > 0 && (
                  <span
                    className="absolute -right-1 -top-1 flex h-5 min-w-1.25rem items-center justify-center rounded-full bg-orange-600 px-1 text-[11px] font-bold text-white shadow-sm"
                    aria-hidden="true"
                  >
                    {itemCount > 99 ? '99+' : itemCount}
                  </span>
                )}
              </button>

              {/* Desktop Auth */}
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
                    <Link
                      to="/account"
                      className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 transition-all hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2"
                      aria-label="Go to your account"
                    >
                      <User className="h-4 w-4 text-gray-600" aria-hidden="true" />
                      <span className="text-sm font-medium text-gray-700">Hi, {displayName}</span>
                    </Link>

                    <Button
                      onClick={handleSignOut}
                      variant="secondary"
                      size="sm"
                      type="button"
                      className="flex items-center gap-2"
                      aria-label="Sign out"
                    >
                      <LogOut className="h-4 w-4" aria-hidden="true" />
                      Sign Out
                    </Button>

                  </>
                ) : (
                  <>
                    <Button
                      onClick={handleOpenLogin}
                      variant="secondary"
                      size="sm"
                      type="button"
                      aria-label="Sign in to your account"
                    >
                      Log In
                    </Button>
                    <Button
                      onClick={handleOpenSignup}
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

              {/* Mobile Menu Toggle */}
              <button
                ref={mobileToggleRef}
                onClick={toggleMobileMenu}
                className="rounded-lg p-2 text-gray-700 transition-all hover:bg-gray-50 hover:text-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 md:hidden"
                aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
                aria-expanded={mobileMenuOpen}
                aria-controls="mobile-menu"
                type="button"
              >
                {mobileMenuOpen ? (
                  <X className="h-6 w-6" aria-hidden="true" />
                ) : (
                  <Menu className="h-6 w-6" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          {/* Mobile Menu */}
          {mobileMenuOpen && (
            <div
              ref={mobileMenuRef}
              id="mobile-menu"
              className="mt-4 rounded-2xl border border-gray-200 bg-white p-3 shadow-lg md:hidden"
              role="menu"
            >
              <div className="flex flex-col gap-1">
                {navLinks.map(({ path, label, ariaLabel }) => {
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
                          : 'text-gray-700 hover:bg-gray-50 hover:text-orange-700'
                      )}
                    >
                      {label}
                    </Link>
                  );
                })}

                <div className="my-2 border-t border-gray-200" />

                              {/* Mobile Auth */}
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

                    <Link
                      to="/account"
                      onClick={closeMobileMenu}
                      className="block rounded-xl bg-gray-50 px-4 py-3 transition-all hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
                      aria-label="Go to your account"
                    >
                      <div className="mb-1 flex items-center gap-2">
                        <User className="h-4 w-4 text-gray-600" aria-hidden="true" />
                        <span className="text-sm font-semibold text-gray-900">
                          {displayName}
                        </span>
                      </div>
                      <p className="text-xs text-gray-600">{user.email}</p>
                    </Link>

                    <Button
                      onClick={handleSignOut}
                      variant="secondary"
                      className="mt-2 w-full"
                      type="button"
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
                      onClick={handleOpenLogin}
                      variant="secondary"
                      className="w-full"
                      type="button"
                    >
                      Log In
                    </Button>
                    <Button
                      onClick={handleOpenSignup}
                      variant="primary"
                      className="w-full"
                      type="button"
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