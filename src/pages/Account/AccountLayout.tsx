// src/pages/Account/AccountLayout.tsx
// =============================================================================
// ACCOUNT LAYOUT — 2026 App Shell
// =============================================================================
// This layout owns its own auth gate. It does NOT rely on withAuth() in the
// router — that wrapper was removed so mobile users can reach this component.
//
// Three render states:
//   1. loading     → spinner (prevents flash of gate on session restore)
//   2. !isAuthed   → LoginGate (branded login/signup — mobile auth entry point)
//   3. isAuthed    → full account layout (mobile pill tabs / desktop sidebar)
//
// Mobile: horizontal pill tabs, user greeting, sign-out at bottom
// Desktop: left sidebar with user card, nav links, sign-out button
//
// The Account tab in BottomNav is the PRIMARY auth entry point on mobile.
// Sign-out lives here — not in the top bar — consistent with app-shell pattern.
// =============================================================================

import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  User,
  ClipboardList,
  Edit3,
  ShieldCheck,
  LogOut,
  UtensilsCrossed,
  Star,
} from 'lucide-react';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useModal } from '@/components/ui/useModal';
import { canAccessAdmin } from '@/security/permissions';
import { Button } from '@/components/ui/Button';

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

// -----------------------------------------------------------------------------
// Nav items
// -----------------------------------------------------------------------------

type AccountNavItem = {
  to: string;
  label: string;
  icon: React.ElementType;
  end?: boolean;
};

const BASE_NAV: AccountNavItem[] = [
  { to: '/account', label: 'Overview', icon: User, end: true },
  { to: '/account/edit', label: 'Edit Profile', icon: Edit3 },
  { to: '/account/orders', label: 'Order History', icon: ClipboardList },
];

// -----------------------------------------------------------------------------
// LoginGate
// Shown to unauthenticated users instead of redirecting away.
// Opens existing LoginModal / SignupModal via useModal().
// -----------------------------------------------------------------------------

function LoginGate() {
  const modal = useModal();

  const openLogin = () => {
    if (typeof modal?.openModal !== 'function') return;
    modal.openModal('login');
  };

  const openSignup = () => {
    if (typeof modal?.openModal !== 'function') return;
    modal.openModal('signup');
  };

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 py-12 text-center">
      {/* Brand mark */}
      <div className="mb-6 flex h-18 w-18 items-center justify-center rounded-full bg-(--color-ember-50) ring-8 ring-(--color-ember-50)/60">
        <UtensilsCrossed
          className="h-8 w-8 text-(--color-ember-500)"
          strokeWidth={1.5}
          aria-hidden="true"
        />
      </div>

      {/* Headline */}
      <h1 className="font-display mb-2 text-[1.6rem] font-normal tracking-tight text-(--color-ink-900)">
        Welcome back
      </h1>
      <p className="mb-8 max-w-260px text-sm leading-relaxed text-(--color-ink-400)">
        Sign in to track your orders, earn loyalty points, and save your preferences.
      </p>

      {/* Primary CTAs */}
      <div className="flex w-full max-w-280px flex-col gap-3">
        <Button onClick={openLogin} variant="primary" type="button" className="w-full">
          Log in
        </Button>
        <Button onClick={openSignup} variant="secondary" type="button" className="w-full">
          Create account — it&apos;s free
        </Button>
      </div>

      {/* Social proof nudge */}
      <div className="mt-8 flex items-center gap-2 rounded-xl border border-(--color-cream-300) bg-(--color-cream-100) px-4 py-3">
        <Star
          className="h-4 w-4 shrink-0 text-(--color-gold-500)"
          strokeWidth={1.75}
          aria-hidden="true"
        />
        <p className="text-xs text-(--color-ink-500)">Members earn points on every order</p>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Mobile horizontal pill tab
// -----------------------------------------------------------------------------

function MobileTab({ item }: { item: AccountNavItem }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        cx(
          'flex items-center gap-1.5 whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium',
          'transition-all duration-(--duration-base)',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-gold-400)',
          isActive
            ? 'bg-(--color-ember-600) text-white shadow-(--shadow-sm)'
            : 'text-(--color-ink-600) hover:bg-(--color-cream-200)',
        )
      }
    >
      <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
      {item.label}
    </NavLink>
  );
}

// -----------------------------------------------------------------------------
// Desktop sidebar link
// -----------------------------------------------------------------------------

function SidebarLink({ item }: { item: AccountNavItem }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        cx(
          'flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium',
          'transition-all duration-(--duration-base)',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-gold-400)',
          isActive
            ? 'bg-(--color-ember-600) text-white shadow-(--shadow-sm)'
            : 'text-(--color-ink-700) hover:bg-(--color-cream-100) hover:text-(--color-ink-900)',
        )
      }
    >
      <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
      {item.label}
    </NavLink>
  );
}

// -----------------------------------------------------------------------------
// Main layout
// -----------------------------------------------------------------------------

export default function AccountLayout() {
  const navigate = useNavigate();
  const { user, profile, loading, signOut } = useAuth();

  const isAdmin = profile?.role ? canAccessAdmin(profile.role) : false;
  const isAuthed = Boolean(user);

  const displayName = profile?.full_name?.trim() || user?.name?.trim() || user?.email || 'Account';

  const handleSignOut = async () => {
    try {
      await signOut();
      void navigate('/');
    } catch {
      // fail silently — UserProvider updates auth state
    }
  };

  const navItems: AccountNavItem[] = [
    ...BASE_NAV,
    ...(isAdmin ? [{ to: '/admin', label: 'Admin Panel', icon: ShieldCheck }] : []),
  ];

  // ── Loading: prevents LoginGate flash on session restore ───────────────────
  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div
          className="h-6 w-6 animate-spin rounded-full border-2 border-(--color-cream-300) border-t-(--color-ember-500)"
          role="status"
          aria-label="Loading account"
        />
      </div>
    );
  }

  // ── Guest: branded login gate ──────────────────────────────────────────────
  // Reached now that router.tsx no longer wraps /account in withAuth().
  if (!isAuthed) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-8 md:py-8">
        <LoginGate />
      </div>
    );
  }

  // ── Authenticated: full account layout ─────────────────────────────────────
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-8 md:py-8">
      {/* ── Mobile layout ──────────────────────────────────────────────── */}
      <div className="md:hidden">
        {/* User greeting */}
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-(--color-ember-100)">
            <User
              className="h-5 w-5 text-(--color-ember-600)"
              strokeWidth={1.75}
              aria-hidden="true"
            />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-(--color-ink-900)">{displayName}</p>
            {user?.email && <p className="truncate text-xs text-(--color-ink-400)">{user.email}</p>}
          </div>
        </div>

        {/* Horizontal scrollable pill tabs */}
        <div className="-mx-4 mb-5 overflow-x-auto px-4 scrollbar-none">
          <nav className="flex gap-2 pb-0.5" role="navigation" aria-label="Account navigation">
            {navItems.map((item) => (
              <MobileTab key={item.to} item={item} />
            ))}
          </nav>
        </div>

        {/* Page content */}
        <div className="rounded-2xl border border-(--color-cream-300) bg-white p-4 shadow-(--shadow-sm)">
          <Outlet />
        </div>

        {/* Sign out */}
        <button
          type="button"
          onClick={() => void handleSignOut()}
          className={cx(
            'mt-4 flex w-full items-center justify-center gap-2',
            'rounded-xl border border-(--color-cream-300) bg-white py-2.5 px-4',
            'text-sm font-medium text-(--color-ink-500)',
            'transition-all duration-(--duration-base)',
            'hover:border-(--color-ink-200) hover:text-(--color-ink-800)',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-gold-400)',
            'active:scale-[0.98]',
          )}
        >
          <LogOut className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Sign out
        </button>
      </div>

      {/* ── Desktop layout ─────────────────────────────────────────────── */}
      <div className="hidden md:grid md:grid-cols-[220px_1fr] md:gap-6">
        {/* Sidebar */}
        <aside className="flex flex-col gap-2">
          <div className="rounded-2xl border border-(--color-cream-300) bg-white p-4 shadow-(--shadow-sm)">
            {/* User card */}
            <div className="mb-4 flex items-center gap-3 border-b border-(--color-cream-200) pb-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-(--color-ember-100)">
                <User
                  className="h-4 w-4 text-(--color-ember-600)"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-(--color-ink-900)">
                  {displayName}
                </p>
                {user?.email && (
                  <p className="truncate text-xs text-(--color-ink-400)">{user.email}</p>
                )}
              </div>
            </div>

            {/* Nav */}
            <nav className="space-y-0.5" role="navigation" aria-label="Account navigation">
              {navItems.map((item) => (
                <SidebarLink key={item.to} item={item} />
              ))}
            </nav>
          </div>

          {/* Sign out — separate from nav, visually distinct */}
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className={cx(
              'flex w-full items-center gap-2.5 rounded-xl',
              'border border-(--color-cream-300) bg-white px-3 py-2.5',
              'text-sm font-medium text-(--color-ink-500)',
              'transition-all duration-(--duration-base)',
              'hover:border-(--color-ink-200) hover:bg-(--color-cream-50) hover:text-(--color-ink-800)',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-gold-400)',
              'active:scale-[0.98]',
            )}
          >
            <LogOut
              className="h-4 w-4 shrink-0 text-(--color-ink-400)"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            Sign out
          </button>
        </aside>

        {/* Page content */}
        <section className="min-w-0 rounded-2xl border border-(--color-cream-300) bg-white p-6 shadow-(--shadow-sm)">
          <Outlet />
        </section>
      </div>
    </div>
  );
}