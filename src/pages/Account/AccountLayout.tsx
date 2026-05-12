// src/pages/Account/AccountLayout.tsx
// =============================================================================
// ACCOUNT LAYOUT — 2026 App Shell
// =============================================================================
// Three render states:
//   1. loading    → spinner
//   2. !isAuthed  → LoginGate (passwordless — Google + magic link)
//   3. isAuthed   → full account layout
//
// Guest order recovery:
//   - Guests who land here looking for an order get a clear, modern
//     "Track an order" path to /find-order.
//   - Logged-in users do not see this guest recovery CTA.
//   - No auth, router, database, Supabase, Stripe, or order logic is changed.
// =============================================================================

import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  User,
  ClipboardList,
  Edit3,
  ShieldCheck,
  LogOut,
  Search,
  ArrowRight,
  Mail,
} from 'lucide-react';
import { useState, type ElementType, type FormEvent } from 'react';

import { useAuth } from '@/features/auth/hooks/useAuth';
import { canAccessAdmin } from '@/security/permissions';
import { GoogleSignInButton } from '@/features/auth/components/GoogleSignInButton';
import { supabase } from '@/lib/supabase/supabaseClient';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

// ─── Nav config ──────────────────────────────────────────────────────────────

type AccountNavItem = {
  to: string;
  label: string;
  icon: ElementType;
  end?: boolean;
};

const BASE_NAV: AccountNavItem[] = [
  { to: '/account', label: 'Overview', icon: User, end: true },
  { to: '/account/edit', label: 'Edit Profile', icon: Edit3 },
  { to: '/account/orders', label: 'Order History', icon: ClipboardList },
];

// ─── LoginGate ────────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
type MagicStage = 'idle' | 'sending' | 'sent' | 'error';

function LoginGate() {
  const [email, setEmail] = useState('');
  const [stage, setStage] = useState<MagicStage>('idle');
  const [error, setError] = useState('');

  const emailValid = EMAIL_RE.test(email.trim());

  const handleMagicLink = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();

    if (!emailValid || stage === 'sending') {
      return;
    }

    setStage('sending');
    setError('');

    try {
      const { error: err } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          shouldCreateUser: true,
        },
      });

      if (err) {
        throw err;
      }

      setStage('sent');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setStage('error');
    }
  };

  // ── Sent state ───────────────────────────────────────────────────────────

  if (stage === 'sent') {
    return (
      <div className="flex min-h-[72vh] flex-col items-center justify-center px-6 py-14 text-center">
        <div
          className="mb-6 flex h-16 w-16 items-center justify-center rounded-full"
          style={{ background: 'var(--color-ember-50)' }}
        >
          <Mail className="h-7 w-7" style={{ color: 'var(--color-ember-500)' }} aria-hidden />
        </div>

        <h2
          className="mb-2 text-2xl font-normal tracking-tight"
          style={{ fontFamily: 'var(--font-display)', color: 'var(--color-ink-900)' }}
        >
          Check your email
        </h2>

        <p className="mb-1 text-sm" style={{ color: 'var(--color-ink-500)' }}>
          We sent a sign-in link to
        </p>

        <p className="mb-6 text-sm font-semibold" style={{ color: 'var(--color-ink-800)' }}>
          {email.trim()}
        </p>

        <p className="mb-6 max-w-xs text-xs" style={{ color: 'var(--color-ink-400)' }}>
          Click the link in your email to sign in. It expires in 10 minutes.
        </p>

        <div className="w-full max-w-sm space-y-3">
          <button
            type="button"
            onClick={() => {
              setStage('idle');
              setEmail('');
            }}
            className="w-full rounded-xl border border-cream-300 bg-white px-4 py-2.5 text-sm font-medium text-ink-600 transition hover:border-ink-200 hover:text-ink-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
          >
            ← Use a different email
          </button>

          <Link
            to="/find-order"
            className="group flex w-full items-center justify-between rounded-2xl border border-ember-200 bg-ember-50 px-4 py-3 text-left transition hover:bg-ember-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
          >
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-ember-600 shadow-(--shadow-xs)">
                <Search className="h-4 w-4" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-ember-800">
                  Just checking an order?
                </span>
                <span className="block text-xs text-ember-700/75">
                  Track it with your order number and email.
                </span>
              </span>
            </span>
            <ArrowRight
              className="h-4 w-4 shrink-0 text-ember-600 transition group-hover:translate-x-0.5"
              aria-hidden
            />
          </Link>
        </div>
      </div>
    );
  }

  // ── Main gate ─────────────────────────────────────────────────────────────

  return (
    <div className="flex min-h-[72vh] flex-col items-center justify-center px-6 py-14">
      <div className="w-full max-w-sm">
        {/* Heading */}
        <div className="mb-8 text-center">
          <h1
            className="mb-2 text-[1.75rem] font-normal tracking-tight"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--color-ink-900)' }}
          >
            Your account
          </h1>

          <p className="text-sm" style={{ color: 'var(--color-ink-400)' }}>
            Sign in to track orders, earn points, and manage your profile.
          </p>
        </div>

        <div className="space-y-4">
          {/* Guest order helper — contextual, not a bottom-nav item */}
          <Link
            to="/find-order"
            className={cx(
              'group relative block overflow-hidden rounded-3xl border border-ember-200 bg-linear-to-br from-ember-50 via-cream-100 to-white p-4',
              'shadow-(--shadow-sm) transition hover:-translate-y-0.5 hover:border-ember-300 hover:shadow-(--shadow-md)',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2',
            )}
          >
            <div
              className="pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full bg-ember-200/35 blur-2xl"
              aria-hidden
            />

            <div className="relative flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-ember-600 shadow-(--shadow-xs)">
                  <span className="absolute right-2 top-2 flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ember-400 opacity-60" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-ember-500" />
                  </span>
                  <Search className="h-5 w-5" strokeWidth={1.8} aria-hidden />
                </span>

                <span className="min-w-0">
                  <span className="block text-sm font-bold text-ink-900">Track an order</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-ink-500">
                    No account needed. Use your order number and checkout email.
                  </span>
                </span>
              </div>

              <ArrowRight
                className="h-4 w-4 shrink-0 text-ember-600 transition group-hover:translate-x-0.5"
                strokeWidth={1.9}
                aria-hidden
              />
            </div>
          </Link>

          {/* Google — primary */}
          <GoogleSignInButton label="Continue with Google" redirectPath="/account" />

          {/* Divider */}
          <div className="relative flex items-center gap-3">
            <div className="h-px flex-1" style={{ background: 'var(--color-border)' }} />
            <span
              className="text-xs font-medium uppercase tracking-wider"
              style={{ color: 'var(--color-ink-400)' }}
            >
              or email
            </span>
            <div className="h-px flex-1" style={{ background: 'var(--color-border)' }} />
          </div>

          {/* Magic link form */}
          <form
            onSubmit={(e) => {
              void handleMagicLink(e);
            }}
            noValidate
            className="space-y-3"
          >
            {error ? (
              <div
                role="alert"
                className="rounded-xl px-4 py-3 text-sm"
                style={{
                  background: 'var(--color-error-50)',
                  color: 'var(--color-error)',
                  border: '1px solid var(--color-error)',
                }}
              >
                {error}
              </div>
            ) : null}

            <div>
              <label
                htmlFor="gate-email"
                className="mb-1.5 block text-xs font-semibold uppercase tracking-wider"
                style={{ color: 'var(--color-ink-500)' }}
              >
                Email address
              </label>

              <input
                id="gate-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError('');
                }}
                placeholder="you@example.com"
                className="w-full px-4 py-2.5 text-sm outline-none transition-all"
                style={{
                  borderRadius: 'var(--radius-input)',
                  border: '1px solid var(--color-border-mid)',
                  background: 'var(--color-surface-alt)',
                  color: 'var(--color-ink-900)',
                }}
              />
            </div>

            <button
              type="submit"
              disabled={!emailValid || stage === 'sending'}
              className="w-full py-2.5 text-sm font-semibold transition-all"
              style={{
                borderRadius: 'var(--radius-btn)',
                background: emailValid ? 'var(--color-accent)' : 'var(--color-border-mid)',
                color: emailValid ? 'var(--color-ink-900)' : 'var(--color-ink-500)',
                boxShadow: emailValid ? 'var(--shadow-gold)' : 'none',
                cursor: emailValid ? 'pointer' : 'not-allowed',
              }}
            >
              {stage === 'sending' ? 'Sending…' : 'Send magic link'}
            </button>
          </form>

          <p className="text-center text-xs" style={{ color: 'var(--color-ink-400)' }}>
            No password needed. We'll send you a secure sign-in link.
          </p>
        </div>

        {/* Loyalty nudge */}
        <div
          className="mt-8 flex items-center gap-3 rounded-2xl border px-4 py-3"
          style={{
            borderColor: 'var(--color-cream-300)',
            background: 'var(--color-cream-100)',
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-gold-500)"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>

          <p className="text-xs" style={{ color: 'var(--color-ink-500)' }}>
            Members earn points on every order
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Nav components ───────────────────────────────────────────────────────────

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
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400',
          isActive
            ? 'bg-ember-600 text-white shadow-(--shadow-sm)'
            : 'text-ink-600 hover:bg-cream-200',
        )
      }
    >
      <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
      {item.label}
    </NavLink>
  );
}

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
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400',
          isActive
            ? 'bg-ember-600 text-white shadow-(--shadow-sm)'
            : 'text-ink-700 hover:bg-cream-100 hover:text-ink-900',
        )
      }
    >
      <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
      {item.label}
    </NavLink>
  );
}

// ─── Main layout ──────────────────────────────────────────────────────────────

export default function AccountLayout() {
  const navigate = useNavigate();
  const { user, profile, loading, signOut } = useAuth();

  const isAdmin = profile?.role ? canAccessAdmin(profile.role) : false;
  const isAuthed = Boolean(user);
  const displayName = profile?.full_name?.trim() || user?.name?.trim() || user?.email || 'Account';

  const handleSignOut = async (): Promise<void> => {
    try {
      await signOut();
      void navigate('/');
    } catch {
      /* UserProvider updates state */
    }
  };

  const navItems: AccountNavItem[] = [
    ...BASE_NAV,
    ...(isAdmin ? [{ to: '/admin', label: 'Admin Panel', icon: ShieldCheck }] : []),
  ];

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div
          className="h-6 w-6 animate-spin rounded-full border-2 border-cream-300 border-t-ember-500"
          role="status"
          aria-label="Loading account"
        />
      </div>
    );
  }

  if (!isAuthed) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-8 md:py-8">
        <LoginGate />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-8 md:py-8">
      {/* Mobile */}
      <div className="md:hidden">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ember-100">
            <User className="h-5 w-5 text-ember-600" strokeWidth={1.75} aria-hidden="true" />
          </div>

          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink-900">{displayName}</p>
            {user?.email ? <p className="truncate text-xs text-ink-400">{user.email}</p> : null}
          </div>
        </div>

        <div className="-mx-4 mb-5 overflow-x-auto px-4 scrollbar-none">
          <nav className="flex gap-2 pb-0.5" role="navigation" aria-label="Account navigation">
            {navItems.map((item) => (
              <MobileTab key={item.to} item={item} />
            ))}
          </nav>
        </div>

        <div className="rounded-2xl border border-cream-300 bg-white p-4 shadow-(--shadow-sm)">
          <Outlet />
        </div>

        <button
          type="button"
          onClick={() => void handleSignOut()}
          className={cx(
            'mt-4 flex w-full items-center justify-center gap-2',
            'rounded-xl border border-cream-300 bg-white px-4 py-2.5',
            'text-sm font-medium text-ink-500',
            'transition-all hover:border-ink-200 hover:text-ink-800',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400',
          )}
        >
          <LogOut className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Sign out
        </button>
      </div>

      {/* Desktop */}
      <div className="hidden md:grid md:grid-cols-[220px_1fr] md:gap-6">
        <aside className="flex flex-col gap-2">
          <div className="rounded-2xl border border-cream-300 bg-white p-4 shadow-(--shadow-sm)">
            <div className="mb-4 flex items-center gap-3 border-b border-cream-200 pb-4">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ember-100">
                <User className="h-4 w-4 text-ember-600" strokeWidth={1.75} aria-hidden="true" />
              </div>

              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink-900">{displayName}</p>
                {user?.email ? <p className="truncate text-xs text-ink-400">{user.email}</p> : null}
              </div>
            </div>

            <nav className="space-y-0.5" role="navigation" aria-label="Account navigation">
              {navItems.map((item) => (
                <SidebarLink key={item.to} item={item} />
              ))}
            </nav>
          </div>

          <button
            type="button"
            onClick={() => void handleSignOut()}
            className={cx(
              'flex w-full items-center gap-2.5 rounded-xl',
              'border border-cream-300 bg-white px-3 py-2.5',
              'text-sm font-medium text-ink-500',
              'transition-all hover:border-ink-200 hover:bg-cream-50 hover:text-ink-800',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400',
            )}
          >
            <LogOut
              className="h-4 w-4 shrink-0 text-ink-400"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            Sign out
          </button>
        </aside>

        <section className="min-w-0 rounded-2xl border border-cream-300 bg-white p-6 shadow-(--shadow-sm)">
          <Outlet />
        </section>
      </div>
    </div>
  );
}