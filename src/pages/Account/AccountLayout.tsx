// src/pages/Account/AccountLayout.tsx
// =============================================================================
// ACCOUNT LAYOUT — 2026 App Shell
// =============================================================================
// Mobile: horizontal pill tabs at top (no sidebar — it was website-style)
// Desktop: left sidebar (unchanged behaviour, refined visual)
//
// Integrates with BottomNav — the Account tab is the entry point,
// so this layout assumes it's already inside a page with the app shell.
//
// Sign-out lives here (Account tab owns user session actions).
// Admin shortcut here for admins (no longer in public nav).
// =============================================================================

import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { User, ClipboardList, Edit3, ShieldCheck, LogOut } from 'lucide-react';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { canAccessAdmin } from '@/security/permissions';

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
// Sub-components
// -----------------------------------------------------------------------------

// Mobile horizontal pill tab
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

// Desktop sidebar link
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
  const { user, profile, signOut } = useAuth();

  const isAdmin = profile?.role ? canAccessAdmin(profile.role) : false;

  const displayName = profile?.full_name?.trim() || user?.name?.trim() || user?.email || 'Account';

  const handleSignOut = async () => {
    try {
      await signOut();
      void navigate('/');
    } catch {
      // fail silently — auth state will update
    }
  };

  // Nav items (admin shortcut appended for admins)
  const navItems: AccountNavItem[] = [
    ...BASE_NAV,
    ...(isAdmin ? [{ to: '/admin', label: 'Admin Panel', icon: ShieldCheck }] : []),
  ];

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-8 md:py-8">
      {/* ── Mobile: horizontal pill tabs + user header ──────────────────── */}
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
        <div className="mb-5 -mx-4 overflow-x-auto px-4 scrollbar-none">
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

        {/* Sign out — bottom of mobile layout */}
        <button
          type="button"
          onClick={() => void handleSignOut()}
          className={cx(
            'mt-4 flex w-full items-center justify-center gap-2',
            'rounded-xl border border-(--color-cream-300) py-2.5 px-4',
            'text-sm font-medium text-(--color-ink-500)',
            'transition-all duration-(--duration-base)',
            'hover:border-(--color-ink-200) hover:text-(--color-ink-800)',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-gold-400)',
          )}
        >
          <LogOut className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Sign out
        </button>
      </div>

      {/* ── Desktop: left sidebar + content ────────────────────────────── */}
      <div className="hidden md:grid md:grid-cols-[220px_1fr] md:gap-6">
        {/* Sidebar */}
        <aside className="flex flex-col gap-2">
          <div className="rounded-2xl border border-(--color-cream-300) bg-white p-4 shadow-(--shadow-sm)">
            {/* User info */}
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

            {/* Nav links */}
            <nav className="space-y-0.5" role="navigation" aria-label="Account navigation">
              {navItems.map((item) => (
                <SidebarLink key={item.to} item={item} />
              ))}
            </nav>
          </div>

          {/* Sign out — separate card, bottom of sidebar */}
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