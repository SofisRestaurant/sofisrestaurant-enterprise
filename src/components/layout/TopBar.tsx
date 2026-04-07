import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ShoppingCart, X, Search, User, LogOut } from 'lucide-react';

import { useAuth } from '@/features/auth/hooks/useAuth';
import { useCart } from '@/modules/cart/hooks/useCart';
import { useModal } from '@/components/ui/useModal';
import { CartDrawer } from '@/modules/cart/components/CartDrawer';
import { Button } from '@/components/ui/Button';
import { useActiveOrderId } from '@/app/ActiveOrderContext';
import { canAccessAdmin } from '@/security/permissions';

import MenuHeaderSearch from '@/modules/menu/components/MenuHeaderSearch';
import { useMenuUi } from '@/modules/menu/store/menuUi.store';
import { useTranslation } from '@/i18n/useTranslation';

// -----------------------------------------------------------------------------
// Types + constants
// -----------------------------------------------------------------------------

type NavLinkKey = 'home' | 'menu' | 'about' | 'contact';

type NavLink = {
  path: string;
  key: NavLinkKey;
};

function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

const NAV_LINKS: NavLink[] = [
  { path: '/', key: 'home' },
  { path: '/menu', key: 'menu' },
  { path: '/about', key: 'about' },
  { path: '/contact', key: 'contact' },
];

const SEARCH_DEBOUNCE_MS = 150;

// Routes where the top bar should hide entirely (they own their own chrome)
const HIDDEN_ON: string[] = ['/admin', '/kitchen', '/expo'];

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

export default function TopBar() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const isMenu = pathname === '/menu' || pathname.startsWith('/menu/');

  const { user, profile, signOut } = useAuth();
  const { itemCount } = useCart();
  const modal = useModal();
  // Read from context — single channel, shared with BottomNav
  const activeOrderId = useActiveOrderId();

  const menuSearchText = useMenuUi((s) => s.searchText);
  const setMenuSearchText = useMenuUi((s) => s.setSearchText);

  const [cartOpen, setCartOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  const mobileSearchBtnRef = useRef<HTMLButtonElement | null>(null);
  const mobileSearchPanelRef = useRef<HTMLDivElement | null>(null);
  const mobileSearchInputRef = useRef<HTMLInputElement | null>(null);

  const [draftSearch, setDraftSearch] = useState(menuSearchText);
  const debounceRef = useRef<number | null>(null);

  // ── Derived ────────────────────────────────────────────────────────────────

  const isAdmin = profile?.role ? canAccessAdmin(profile.role) : false;
  const isAuthed = Boolean(user);

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

  // Hidden on admin / kitchen routes — those shells own their chrome
  const isHidden = HIDDEN_ON.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleOpenCart = useCallback(() => setCartOpen(true), []);
  const handleCloseCart = useCallback(() => setCartOpen(false), []);

  const handleSignOut = useCallback(async () => {
    try {
      await signOut();
    } catch {
      // fail silently — auth state will update
    }
  }, [signOut]);

  const openModalSafe = useCallback(
    (type: 'login' | 'signup') => {
      if (typeof modal?.openModal !== 'function') return;
      modal.openModal(type);
    },
    [modal],
  );

  const closeMobileSearch = useCallback(() => {
    setMobileSearchOpen(false);
    queueMicrotask(() => mobileSearchBtnRef.current?.focus());
  }, []);

  const openMobileSearch = useCallback(() => {
    if (!isMenu) return;
    setMobileSearchOpen(true);
  }, [isMenu]);

  // ── Effects ────────────────────────────────────────────────────────────────

  // Route change closes search overlay
  useEffect(() => {
    setMobileSearchOpen(false);
  }, [pathname]);

  // Keep draft in sync when store clears externally
  useEffect(() => {
    setDraftSearch(menuSearchText);
  }, [menuSearchText]);

  // Debounce store writes
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

  // ESC closes search overlay
  useEffect(() => {
    if (!mobileSearchOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeMobileSearch();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileSearchOpen, closeMobileSearch]);

  // Click outside closes search overlay
  useEffect(() => {
    if (!mobileSearchOpen) return;
    queueMicrotask(() => mobileSearchInputRef.current?.focus());

    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (
        mobileSearchPanelRef.current?.contains(target) ||
        mobileSearchBtnRef.current?.contains(target)
      )
        return;
      closeMobileSearch();
    };

    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [mobileSearchOpen, closeMobileSearch]);

  // "/" shortcut opens search on /menu
  useEffect(() => {
    if (!isMenu) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== '/') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement as HTMLElement | null;
      const tag = el?.tagName?.toLowerCase();
      const typing = tag === 'input' || tag === 'textarea' || Boolean(el?.isContentEditable);
      if (typing) return;
      e.preventDefault();
      openMobileSearch();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isMenu, openMobileSearch]);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (isHidden) return null;

  return (
    <>
      {/* Accessibility skip link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-60 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:shadow-(--shadow-xl) focus:ring-2 focus:ring-(--color-gold-400)"
      >
        {t('nav.skipToContent')}
      </a>

      <header
        className={cx(
          'sticky top-0 z-30',
          'border-b border-(--color-cream-300)',
          'bg-white/95 backdrop-blur-md',
          'shadow-[0_1px_0_0_var(--color-cream-300)]',
        )}
      >
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4">
          {/* Logo */}
          <Link
            to="/"
            className="text-script shrink-0 rounded-md px-2 py-1 text-2xl text-(--color-ember-700) transition-colors duration-(--duration-base) hover:text-(--color-ember-600) focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-gold-400) focus-visible:ring-offset-2"
            aria-label={t('header.logo.aria')}
          >
            {t('common.appName')}
          </Link>

          {/* Desktop nav links — hidden on mobile (BottomNav handles it) */}
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
                    'rounded-md px-3 py-2 text-sm font-medium',
                    'transition-all duration-(--duration-base)',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-gold-400) focus-visible:ring-offset-2',
                    active
                      ? 'bg-(--color-ember-50) text-(--color-ember-700)'
                      : 'text-(--color-ink-700) hover:bg-(--color-ink-50) hover:text-(--color-ember-700)',
                  )}
                >
                  {t(`nav.links.${key}.label`)}
                </Link>
              );
            })}

            {/* Admin shortcut — desktop only, admin role only */}
            {isAuthed && isAdmin && (
              <Link
                to="/admin"
                className="rounded-md px-3 py-2 text-sm font-semibold text-(--color-gold-600) transition-colors duration-(--duration-base) hover:bg-(--color-gold-50) hover:text-(--color-gold-500) focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-gold-400) focus-visible:ring-offset-2"
              >
                {t('header.auth.admin')}
              </Link>
            )}
          </nav>

          {/* Right cluster: search · cart · auth */}
          <div className="flex items-center gap-1.5">
            {/* Desktop search — /menu only, lg+ */}
            {isMenu && (
              <div className="hidden w-64 max-w-[30vw] lg:block">
                <MenuHeaderSearch
                  value={draftSearch}
                  onChange={setDraftSearch}
                  placeholder={t('header.search.placeholder')}
                />
              </div>
            )}

            {/* Mobile search icon — /menu only */}
            {isMenu && (
              <button
                ref={mobileSearchBtnRef}
                type="button"
                onClick={openMobileSearch}
                aria-label={t('header.search.openAria')}
                aria-haspopup="dialog"
                aria-expanded={mobileSearchOpen}
                className={cx(
                  'inline-flex h-9 w-9 items-center justify-center',
                  'rounded-(--radius-pill)',
                  'border border-(--color-cream-300) bg-white',
                  'text-(--color-ink-600) shadow-(--shadow-xs)',
                  'transition-colors duration-(--duration-base) hover:bg-(--color-ink-50)',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-gold-400)/40',
                  'lg:hidden',
                )}
              >
                <Search className="h-4 w-4" aria-hidden="true" />
              </button>
            )}

            {/* Active order tracker — compact chip, desktop only */}
            {isAuthed && activeOrderId && (
              <Link
                to={`/order-status/${activeOrderId}`}
                className="hidden items-center gap-1.5 rounded-full border border-(--color-ember-200) bg-(--color-ember-50) px-3 py-1.5 text-xs font-semibold text-(--color-ember-700) transition-colors hover:bg-(--color-ember-100) md:flex"
              >
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-(--color-ember-400) opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-(--color-ember-500)" />
                </span>
                {t('header.auth.trackOrder')}
              </Link>
            )}

            {/* Cart */}
            <button
              onClick={handleOpenCart}
              type="button"
              aria-label={cartAriaLabel}
              className={cx(
                'relative rounded-lg p-2',
                'text-(--color-ink-700)',
                'transition-all duration-(--duration-base)',
                'hover:bg-(--color-ink-50) hover:text-(--color-ember-700)',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-gold-400) focus-visible:ring-offset-2',
              )}
            >
              <ShoppingCart className="h-5 w-5" aria-hidden="true" />
              {(itemCount ?? 0) > 0 && (
                <span
                  className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-(--color-ember-600) px-1 text-[9px] font-bold leading-none text-white shadow-(--shadow-xs)"
                  aria-hidden="true"
                >
                  {(itemCount ?? 0) > 99 ? '99+' : itemCount}
                </span>
              )}
            </button>

            {/* Desktop auth cluster */}
            <div className="hidden items-center gap-1.5 md:flex">
              {isAuthed ? (
                <>
                  <Link
                    to="/account"
                    aria-label={t('header.auth.account')}
                    className={cx(
                      'flex items-center gap-2 rounded-md',
                      'bg-(--color-ink-50) px-3 py-1.5',
                      'transition-all duration-(--duration-base) hover:bg-(--color-ink-100)',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-gold-400) focus-visible:ring-offset-2',
                    )}
                  >
                    <User className="h-4 w-4 text-(--color-ink-500)" aria-hidden="true" />
                    {displayName && (
                      <span className="max-w-120px truncate text-sm font-medium text-(--color-ink-700)">
                        {displayName}
                      </span>
                    )}
                  </Link>

                  <button
                    type="button"
                    onClick={() => void handleSignOut()}
                    aria-label={t('header.auth.signOut')}
                    className={cx(
                      'flex items-center gap-1.5 rounded-md px-2.5 py-1.5',
                      'text-xs font-medium text-(--color-ink-500)',
                      'border border-(--color-cream-300)',
                      'transition-all duration-(--duration-base)',
                      'hover:border-(--color-ink-300) hover:text-(--color-ink-800)',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-gold-400) focus-visible:ring-offset-2',
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
      </header>

      {/* Mobile Search Overlay */}
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
                        className={cx(
                          'absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center',
                          'rounded-lg border border-white/10 bg-white/5 text-white/80',
                          'transition-colors duration-(--duration-base) hover:bg-white/10',
                          'focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-gold-400)/40',
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
                    'inline-flex h-10 w-10 items-center justify-center',
                    'rounded-lg border border-white/10 bg-white/5 text-white',
                    'transition-colors duration-(--duration-base) hover:bg-white/10',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-gold-400)/40',
                  )}
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

      <CartDrawer isOpen={cartOpen} onClose={handleCloseCart} />
    </>
  );
}