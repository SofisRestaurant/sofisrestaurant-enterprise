// src/components/layout/Header.tsx
// Cart state: removed local useState → useCartUiStore (shared store).
// Cart icon hidden on mobile (md:hidden) — BottomNav Cart tab + FloatingCartPill handle mobile.
// CartDrawer removed — rendered once in RootLayout.
// All other logic unchanged from original.

import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, ShoppingCart, LogOut, User, Search } from 'lucide-react';

import { useAuth } from '@/features/auth/hooks/useAuth';
import { useCart } from '@/modules/cart/hooks/useCart';
import { useCartUiStore } from '@/modules/cart/store/cartUi.store';
import { useModal } from '@/components/ui/useModal';
import { Button } from '@/components/ui/Button';
import { useActiveOrder } from '@/modules/orders/hooks/useActiveOrder';
import { canAccessAdmin } from '@/security/permissions';
import MenuHeaderSearch from '@/modules/menu/components/MenuHeaderSearch';
import { useMenuUi } from '@/modules/menu/store/menuUi.store';
import { useTranslation } from '@/i18n/useTranslation';

type NavLinkKey = 'home' | 'menu' | 'about' | 'contact';
type NavLink = { path: string; key: NavLinkKey };
function cx(...c: Array<string | false | null | undefined>) {
  return c.filter(Boolean).join(' ');
}
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
  const openCart = useCartUiStore((s) => s.open);

  const menuSearchText = useMenuUi((s) => s.searchText);
  const setMenuSearchText = useMenuUi((s) => s.setSearchText);

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const mobileSearchBtnRef = useRef<HTMLButtonElement | null>(null);
  const mobileSearchPanelRef = useRef<HTMLDivElement | null>(null);
  const mobileSearchInputRef = useRef<HTMLInputElement | null>(null);
  const mobileToggleRef = useRef<HTMLButtonElement | null>(null);
  const mobileMenuRef = useRef<HTMLDivElement | null>(null);
  const [draftSearch, setDraftSearch] = useState(menuSearchText);
  const debounceRef = useRef<number | null>(null);

  const isAdmin = profile?.role ? canAccessAdmin(profile.role) : false;
  const isAuthed = Boolean(user);
  const displayName = useMemo(
    () => profile?.full_name?.trim() || user?.name?.trim() || user?.email || null,
    [profile?.full_name, user?.name, user?.email],
  );
  const cartAriaLabel = useMemo(() => {
    const n = itemCount ?? 0;
    return n === 0
      ? t('header.cart.ariaEmpty')
      : n === 1
        ? t('header.cart.ariaSingular')
        : t('header.cart.ariaPlural', { count: n });
  }, [itemCount, t]);
  const isActive = useCallback(
    (p: string) => (p === '/' ? pathname === '/' : pathname === p || pathname.startsWith(`${p}/`)),
    [pathname],
  );

  const closeMobileMenu = useCallback(() => setMobileMenuOpen(false), []);
  const toggleMobileMenu = useCallback(() => setMobileMenuOpen((v) => !v), []);
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
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(
      () => setMenuSearchText(draftSearch),
      SEARCH_DEBOUNCE_MS,
    );
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [draftSearch, isMenu, setMenuSearchText]);
  useEffect(() => {
    if (!mobileMenuOpen && !mobileSearchOpen) return;
    const h = (e: KeyboardEvent) => {
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
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [mobileMenuOpen, mobileSearchOpen, closeMobileMenu, closeMobileSearch]);
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const h = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (mobileMenuRef.current?.contains(t) || mobileToggleRef.current?.contains(t)) return;
      closeMobileMenu();
    };
    window.addEventListener('pointerdown', h);
    return () => window.removeEventListener('pointerdown', h);
  }, [mobileMenuOpen, closeMobileMenu]);
  useEffect(() => {
    if (!mobileSearchOpen) return;
    queueMicrotask(() => mobileSearchInputRef.current?.focus());
    const h = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (mobileSearchPanelRef.current?.contains(t) || mobileSearchBtnRef.current?.contains(t))
        return;
      closeMobileSearch();
    };
    window.addEventListener('pointerdown', h);
    return () => window.removeEventListener('pointerdown', h);
  }, [mobileSearchOpen, closeMobileSearch]);
  useEffect(() => {
    if (!isMenu) return;
    const h = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement as HTMLElement | null;
      if (
        el?.tagName?.toLowerCase() === 'input' ||
        el?.tagName?.toLowerCase() === 'textarea' ||
        el?.isContentEditable
      )
        return;
      e.preventDefault();
      openMobileSearch();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [isMenu, openMobileSearch]);

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-60 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:shadow-(--shadow-xl) focus:ring-2 focus:ring-(--color-gold-400)"
      >
        {t('nav.skipToContent')}
      </a>

      <header className="sticky top-0 z-30 border-b border-(--color-border) bg-white/95 shadow-sm backdrop-blur-md">
        <nav
          className="mx-auto max-w-7xl px-4 py-4"
          role="navigation"
          aria-label={t('nav.ariaLabel')}
        >
          <div className="flex items-center justify-between gap-3">
            <Link
              to="/"
              className="text-script rounded-md px-2 py-1 text-2xl text-(--color-ember-700) transition-colors hover:text-(--color-ember-600) focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-gold-400) focus-visible:ring-offset-2"
              aria-label={t('header.logo.aria')}
            >
              {t('common.appName')}
            </Link>

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
                      'rounded-md px-3 py-2 text-sm font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-gold-400) focus-visible:ring-offset-2',
                      active
                        ? 'bg-(--color-ember-50) text-(--color-ember-700)'
                        : 'text-(--color-ink-700) hover:bg-(--color-ink-50) hover:text-(--color-ember-700)',
                    )}
                  >
                    {t(`nav.links.${key}.label`)}
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
                  className="inline-flex h-10 w-10 items-center justify-center rounded-(--radius-pill) border border-(--color-border) bg-white text-(--color-ink-800) shadow-(--shadow-xs) transition-colors hover:bg-(--color-ink-50) focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-gold-400)/40 lg:hidden"
                >
                  <Search className="h-5 w-5" aria-hidden="true" />
                </button>
              )}

              {/*
                Cart button:
                - md+ (desktop/tablet): visible, opens shared cartUi.store
                - mobile (<md): HIDDEN — BottomNav Cart tab + FloatingCartPill handle it
              */}
              <button
                onClick={openCart}
                type="button"
                aria-label={cartAriaLabel}
                className={cx(
                  'relative rounded-md p-2 text-(--color-ink-700) transition-all hover:bg-(--color-ink-50) hover:text-(--color-ember-700) focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-gold-400) focus-visible:ring-offset-2',
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
                        className="link-line rounded-md px-3 py-2 text-sm font-semibold text-(--color-ember-600) transition-colors hover:text-(--color-ember-500) focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-gold-400) focus-visible:ring-offset-2"
                      >
                        {t('header.auth.trackOrder')}
                      </Link>
                    )}
                    {isAdmin && (
                      <Link
                        to="/admin"
                        className="link-line rounded-md px-3 py-2 text-sm font-semibold text-(--color-gold-600) transition-colors hover:text-(--color-gold-500) focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-gold-400) focus-visible:ring-offset-2"
                      >
                        {t('header.auth.admin')}
                      </Link>
                    )}
                    <Link
                      to="/account"
                      aria-label={t('header.auth.account')}
                      className="flex items-center gap-2 rounded-md bg-(--color-ink-50) px-3 py-2 transition-all hover:bg-(--color-ink-100) focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-gold-400) focus-visible:ring-offset-2"
                    >
                      <User className="h-4 w-4 text-(--color-ink-500)" aria-hidden="true" />
                      {displayName && (
                        <span className="text-sm font-medium text-(--color-ink-700)">
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

              <button
                ref={mobileToggleRef}
                onClick={toggleMobileMenu}
                type="button"
                aria-label={mobileMenuOpen ? t('header.auth.closeMenu') : t('header.auth.openMenu')}
                aria-expanded={mobileMenuOpen}
                aria-controls="mobile-menu"
                className="rounded-md p-2 text-(--color-ink-700) transition-all hover:bg-(--color-ink-50) hover:text-(--color-ember-700) focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-gold-400) focus-visible:ring-offset-2 md:hidden"
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
                          'rounded-xl px-4 py-3 text-sm font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-gold-400)',
                          active
                            ? 'bg-(--color-ember-50) text-(--color-ember-700)'
                            : 'text-(--color-ink-700) hover:bg-(--color-ink-50) hover:text-(--color-ember-700)',
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
                    {activeOrderId && (
                      <Link
                        to={`/order-status/${activeOrderId}`}
                        onClick={closeMobileMenu}
                        className="block rounded-xl bg-(--color-ember-50) px-4 py-3 text-sm font-semibold text-(--color-ember-700) transition-colors hover:bg-(--color-ember-100) focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-gold-400)"
                      >
                        {t('header.auth.trackOrder')}
                      </Link>
                    )}
                    {isAdmin && (
                      <Link
                        to="/admin"
                        onClick={closeMobileMenu}
                        className="block rounded-xl bg-(--color-gold-50) px-4 py-3 text-sm font-semibold text-(--color-gold-600) transition-colors hover:bg-(--color-gold-100) focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-gold-400)"
                      >
                        {t('header.auth.adminPanel')}
                      </Link>
                    )}
                    <Link
                      to="/account"
                      onClick={closeMobileMenu}
                      aria-label={t('header.auth.account')}
                      className="block rounded-xl bg-(--color-ink-50) px-4 py-3 transition-all hover:bg-(--color-ink-100) focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-gold-400)"
                    >
                      <div className="mb-1 flex items-center gap-2">
                        <User className="h-4 w-4 text-(--color-ink-500)" aria-hidden="true" />
                        <span className="text-sm font-semibold text-(--color-ink-900)">
                          {displayName}
                        </span>
                      </div>
                      {user.email && <p className="text-xs text-(--color-ink-500)">{user.email}</p>}
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
          <div className="absolute inset-0 bg-black/40" aria-hidden="true" />
          <div className="absolute inset-x-0 top-0 p-3">
            <div
              ref={mobileSearchPanelRef}
              className="mx-auto max-w-2xl overflow-hidden rounded-(--radius-card) border border-white/10 bg-stone-950 text-white shadow-(--shadow-2xl)"
            >
              <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-(--color-ink-400)"
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
                    {draftSearch.trim().length > 0 && (
                      <button
                        type="button"
                        onClick={() => setDraftSearch('')}
                        className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/80 transition-colors hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-gold-400)/40"
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
                  className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white transition-colors hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-gold-400)/40"
                  aria-label={t('header.search.close')}
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
              <div className="px-4 py-3">
                <p className="text-label text-(--color-ink-400)">{t('header.search.tip')}</p>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* CartDrawer is in RootLayout — not here */}
    </>
  );
}