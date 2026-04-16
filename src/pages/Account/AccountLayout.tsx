// src/pages/Account/AccountLayout.tsx
// =============================================================================
// ACCOUNT LAYOUT — 2026 App Shell
// =============================================================================
// Three render states:
//   1. loading    → spinner
//   2. !isAuthed  → LoginGate (passwordless — Google + magic link)
//   3. isAuthed   → full account layout
// =============================================================================

import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { User, ClipboardList, Edit3, ShieldCheck, LogOut } from 'lucide-react';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useModal } from '@/components/ui/useModal';
import { canAccessAdmin } from '@/security/permissions';
import { GoogleSignInButton } from '@/features/auth/components/GoogleSignInButton';
import { supabase } from '@/lib/supabase/supabaseClient';
import { useState, type FormEvent } from 'react';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

// ─── Nav config ──────────────────────────────────────────────────────────────

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

// ─── LoginGate ────────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
type MagicStage = 'idle' | 'sending' | 'sent' | 'error';

function LoginGate() {
  const modal = useModal();
  const [email, setEmail] = useState('');
  const [stage, setStage] = useState<MagicStage>('idle');
  const [error, setError] = useState('');

  const emailValid = EMAIL_RE.test(email.trim());

  const handleMagicLink = async (e: FormEvent) => {
    e.preventDefault();
    if (!emailValid || stage === 'sending') return;
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
      if (err) throw err;
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
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-ember-500)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
            <polyline points="22,6 12,13 2,6" />
          </svg>
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
        <button
          type="button"
          onClick={() => {
            setStage('idle');
            setEmail('');
          }}
          className="text-sm font-medium"
          style={{ color: 'var(--color-brand)' }}
        >
          ← Use a different email
        </button>
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
            {error && (
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
            )}

            <div>
              <label
                htmlFor="gate-email"
                className="block text-xs font-semibold uppercase tracking-wider mb-1.5"
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

// ─── Main layout ──────────────────────────────────────────────────────────────

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
          className="h-6 w-6 animate-spin rounded-full border-2 border-(--color-cream-300) border-t-(--color-ember-500)"
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
        <div className="-mx-4 mb-5 overflow-x-auto px-4 scrollbar-none">
          <nav className="flex gap-2 pb-0.5" role="navigation" aria-label="Account navigation">
            {navItems.map((item) => (
              <MobileTab key={item.to} item={item} />
            ))}
          </nav>
        </div>
        <div className="rounded-2xl border border-(--color-cream-300) bg-white p-4 shadow-(--shadow-sm)">
          <Outlet />
        </div>
        <button
          type="button"
          onClick={() => void handleSignOut()}
          className={cx(
            'mt-4 flex w-full items-center justify-center gap-2',
            'rounded-xl border border-(--color-cream-300) bg-white py-2.5 px-4',
            'text-sm font-medium text-(--color-ink-500)',
            'transition-all hover:border-(--color-ink-200) hover:text-(--color-ink-800)',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-gold-400)',
          )}
        >
          <LogOut className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Sign out
        </button>
      </div>

      {/* Desktop */}
      <div className="hidden md:grid md:grid-cols-[220px_1fr] md:gap-6">
        <aside className="flex flex-col gap-2">
          <div className="rounded-2xl border border-(--color-cream-300) bg-white p-4 shadow-(--shadow-sm)">
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
              'border border-(--color-cream-300) bg-white px-3 py-2.5',
              'text-sm font-medium text-(--color-ink-500)',
              'transition-all hover:border-(--color-ink-200) hover:bg-(--color-cream-50) hover:text-(--color-ink-800)',
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
        <section className="min-w-0 rounded-2xl border border-(--color-cream-300) bg-white p-6 shadow-(--shadow-sm)">
          <Outlet />
        </section>
      </div>
    </div>
  );
}