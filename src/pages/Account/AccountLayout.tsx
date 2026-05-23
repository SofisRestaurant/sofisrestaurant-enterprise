// src/pages/Account/AccountLayout.tsx
// =============================================================================
// ACCOUNT LAYOUT
// =============================================================================
// Three render states:
//   1. loading   -> spinner
//   2. guest     -> LoginGate, passwordless Google + magic link
//   3. authed    -> full account layout
//
// Guest order recovery:
//   - Guests can track an order through /find-order.
//   - Logged-in users do not see the guest recovery CTA.
// =============================================================================

import { useCallback, useId, useState, type ElementType, type FormEvent } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  ClipboardList,
  Edit3,
  LogOut,
  Mail,
  Search,
  ShieldCheck,
  User,
} from 'lucide-react';

import { GoogleSignInButton } from '@/features/auth/components/GoogleSignInButton';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { supabase } from '@/lib/supabase/supabaseClient';
import { canAccessAdmin } from '@/security/permissions';

// ── Helpers ──────────────────────────────────────────────────────────────────

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SAFE_SEND_ERROR =
  "We couldn't send the sign-in link. Please check your email and try again.";

const appFontStyle = {
  fontFamily: 'var(--font-sans)',
  color: 'var(--app-text)',
};

const displayFontStyle = {
  fontFamily: 'var(--font-sans)',
  color: 'var(--app-text)',
};

const mutedTextStyle = {
  color: 'var(--app-muted)',
};

const iconToneStyle = {
  color: 'var(--color-ember-600)',
};

// ── Nav config ───────────────────────────────────────────────────────────────

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

// ── Shared surfaces ──────────────────────────────────────────────────────────

const CARD = cx(
  'rounded-2xl border shadow-[var(--app-shadow)] backdrop-blur-2xl',
  'border-[var(--app-border)] bg-[var(--app-card)] text-[var(--app-text)]',
);

const CARD_SOFT = cx(
  'rounded-2xl border shadow-[var(--shadow-sm)] backdrop-blur-xl',
  'border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--app-text)]',
);

const SOFT_BUTTON = cx(
  'rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)]',
  'text-[var(--app-muted)] backdrop-blur-md transition-all',
  'hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)]',
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-400)]',
  'active:scale-[0.985]',
);

const FOCUS_RING =
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-400)]';

// ── LoginGate ────────────────────────────────────────────────────────────────

type MagicStage = 'idle' | 'sending' | 'sent' | 'error';

function LoginGate() {
  const [email, setEmail] = useState('');
  const [stage, setStage] = useState<MagicStage>('idle');
  const [error, setError] = useState('');

  const emailInputId = useId();
  const emailErrorId = useId();

  const normalizedEmail = email.trim().toLowerCase();
  const emailValid = EMAIL_RE.test(normalizedEmail);
  const isSending = stage === 'sending';

  const handleMagicLink = useCallback(
    async (event: FormEvent<HTMLFormElement>): Promise<void> => {
      event.preventDefault();

      if (!emailValid || isSending) return;

      setStage('sending');
      setError('');

      try {
        const { error: signInError } = await supabase.auth.signInWithOtp({
          email: normalizedEmail,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
            shouldCreateUser: true,
          },
        });

        if (signInError) throw signInError;

        setStage('sent');
      } catch {
        setError(SAFE_SEND_ERROR);
        setStage('error');
      }
    },
    [emailValid, isSending, normalizedEmail],
  );

  if (stage === 'sent') {
    return (
      <div
        className="flex min-h-[68vh] flex-col items-center justify-center px-5 py-12"
        data-ui-component
        style={appFontStyle}
      >
        <div className={cx(CARD, 'w-full max-w-sm p-8 text-center')}>
          <div className="mx-auto mb-6 flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-full bg-[var(--color-ember-50)] dark:bg-white/[0.08]">
            <Mail
              className="h-7 w-7 animate-[gentlePulse_2.4s_ease-in-out_infinite]"
              style={iconToneStyle}
              aria-hidden="true"
            />
          </div>

          <h2
            className="mb-1.5 text-[1.6rem] font-extrabold leading-snug tracking-tight"
            style={displayFontStyle}
          >
            Check your inbox
          </h2>

          <p className="text-[13px] leading-relaxed" style={mutedTextStyle}>
            We sent a sign-in link to
          </p>

          <p className="mt-0.5 text-[13px] font-semibold text-[var(--app-text)]">
            {normalizedEmail}
          </p>

          <p
            className="mx-auto mt-5 max-w-[16rem] text-[11.5px] leading-relaxed"
            style={mutedTextStyle}
          >
            Tap the link in your email to sign in. It expires in 10 minutes. Check your spam folder
            if you do not see it.
          </p>

          <div className="mt-7 space-y-2.5">
            <button
              type="button"
              onClick={() => {
                setStage('idle');
                setEmail('');
                setError('');
              }}
              className={cx(SOFT_BUTTON, 'w-full px-4 py-2.5 text-[13px] font-medium')}
            >
              Use a different email
            </button>

            <GuestOrderLink compact />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex min-h-[68vh] flex-col items-center justify-center px-5 py-12"
      data-ui-component
      style={appFontStyle}
    >
      <div className="w-full max-w-sm">
        <div className="mb-9 text-center">
          <h1
            className="mb-2 text-[1.9rem] font-extrabold leading-tight tracking-tight"
            style={displayFontStyle}
          >
            Welcome back
          </h1>

          <p className="text-[13px] leading-relaxed" style={mutedTextStyle}>
            Sign in to track orders, earn points, and manage your profile.
          </p>
        </div>

        <div className={cx(CARD, 'p-5')}>
          <div className="space-y-4">
            <GoogleSignInButton label="Continue with Google" redirectPath="/account" />

            <div className="flex items-center gap-3" role="separator" aria-label="or email">
              <div className="h-px flex-1 bg-[var(--app-divider)]" />
              <span className="select-none text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--app-muted)]">
                or email
              </span>
              <div className="h-px flex-1 bg-[var(--app-divider)]" />
            </div>

            <form
              onSubmit={(event) => {
                void handleMagicLink(event);
              }}
              noValidate
              className="space-y-3"
            >
              {error ? (
                <div
                  role="alert"
                  className="rounded-xl border border-[var(--color-error)] bg-[var(--color-error-50)] px-4 py-3 text-[13px] leading-snug text-[var(--color-error)]"
                >
                  {error}
                </div>
              ) : null}

              <div>
                <label
                  htmlFor={emailInputId}
                  className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--app-muted)]"
                >
                  Email address
                </label>

                <input
                  id={emailInputId}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    if (error) setError('');
                    if (stage === 'error') setStage('idle');
                  }}
                  placeholder="you@example.com"
                  aria-invalid={stage === 'error' ? 'true' : undefined}
                  aria-describedby={error ? emailErrorId : undefined}
                  className={cx(
                    'w-full px-4 py-2.5 text-sm outline-none transition-all',
                    'placeholder:text-[var(--app-muted)]',
                    'focus:ring-2 focus:ring-[var(--color-gold-400)]/50',
                  )}
                  style={{
                    fontFamily: 'var(--font-sans)',
                    borderRadius: 'var(--radius-input)',
                    border: '1px solid var(--app-input-border)',
                    background: 'var(--app-input)',
                    color: 'var(--app-text)',
                  }}
                />

                {error ? (
                  <span id={emailErrorId} className="sr-only">
                    {error}
                  </span>
                ) : null}
              </div>

              <button
                type="submit"
                disabled={!emailValid || isSending}
                className={cx(
                  'w-full py-2.5 text-sm font-semibold transition-all',
                  FOCUS_RING,
                  'active:scale-[0.985]',
                  (!emailValid || isSending) && 'pointer-events-none opacity-45',
                )}
                style={{
                  fontFamily: 'var(--font-sans)',
                  borderRadius: 'var(--radius-btn)',
                  background: emailValid ? 'var(--color-accent)' : 'var(--app-input-border)',
                  color: emailValid ? 'var(--color-stone-950)' : 'var(--app-muted)',
                  boxShadow: emailValid ? 'var(--shadow-gold)' : 'none',
                  cursor: emailValid && !isSending ? 'pointer' : 'not-allowed',
                }}
                aria-disabled={!emailValid || isSending ? 'true' : undefined}
              >
                {isSending ? 'Sending...' : 'Send sign-in link'}
              </button>
            </form>

            <p className="text-center text-[11.5px] leading-relaxed" style={mutedTextStyle}>
              No password needed. We will email you a secure link.
            </p>
          </div>
        </div>

        <div className="mt-4">
          <GuestOrderLink />
        </div>

        <div className={cx(CARD_SOFT, 'mt-4 flex items-center gap-3 px-4 py-3.5')}>
          <svg
            width="15"
            height="15"
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

          <p className="text-[12px]" style={mutedTextStyle}>
            Members earn points on every order
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Guest order recovery link ────────────────────────────────────────────────

function GuestOrderLink({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <Link
        to="/find-order"
        className={cx(
          'group flex w-full items-center justify-between rounded-xl',
          'border border-[var(--app-border)] bg-[var(--app-surface)]',
          'px-4 py-3 text-left text-[var(--app-text)] transition-all',
          'hover:bg-[var(--app-surface-hover)]',
          FOCUS_RING,
          'active:scale-[0.99]',
        )}
        style={{ fontFamily: 'var(--font-sans)' }}
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-ember-50)] text-[var(--color-ember-600)] shadow-[var(--shadow-xs)] dark:bg-white/[0.08]">
            <Search className="h-3.5 w-3.5" aria-hidden="true" />
          </span>

          <span className="min-w-0">
            <span className="block text-[13px] font-semibold text-[var(--app-text)]">
              Just checking an order?
            </span>
            <span className="block text-[11px] text-[var(--app-muted)]">
              Track with your order number and email.
            </span>
          </span>
        </span>

        <ArrowRight
          className="h-3.5 w-3.5 shrink-0 text-[var(--color-ember-600)] transition-transform group-hover:translate-x-0.5"
          aria-hidden="true"
        />
      </Link>
    );
  }

  return (
    <Link
      to="/find-order"
      className={cx(
        'group relative block overflow-hidden rounded-2xl p-4',
        'border border-[var(--app-border)]',
        'bg-gradient-to-br from-[var(--color-ember-50)] via-[var(--color-cream-100)] to-white',
        'dark:from-white/[0.08] dark:via-white/[0.05] dark:to-white/[0.03]',
        'shadow-[var(--shadow-sm)] transition-all',
        'hover:-translate-y-px hover:border-[var(--color-ember-300)] hover:shadow-[var(--shadow-md)]',
        FOCUS_RING,
        'focus-visible:ring-offset-2 active:scale-[0.995]',
      )}
      style={{ fontFamily: 'var(--font-sans)' }}
    >
      <div
        className="pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full bg-[var(--color-ember-200)]/35 blur-2xl dark:bg-[var(--color-ember-400)]/10"
        aria-hidden="true"
      />

      <div className="relative flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-[var(--color-ember-600)] shadow-[var(--shadow-xs)] dark:bg-white/[0.08]">
            <span className="absolute right-2 top-2 flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-ember-400)] opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--color-ember-500)]" />
            </span>
            <Search className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
          </span>

          <span className="min-w-0">
            <span className="block text-[13.5px] font-bold text-[var(--app-text)]">
              Track an order
            </span>
            <span className="mt-0.5 block text-[11.5px] leading-relaxed text-[var(--app-muted)]">
              No account needed. Use your order number and checkout email.
            </span>
          </span>
        </div>

        <ArrowRight
          className="h-4 w-4 shrink-0 text-[var(--color-ember-600)] transition-transform group-hover:translate-x-0.5"
          strokeWidth={1.9}
          aria-hidden="true"
        />
      </div>
    </Link>
  );
}

// ── Nav components ───────────────────────────────────────────────────────────

function MobileTab({ item }: { item: AccountNavItem }) {
  const Icon = item.icon;

  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        cx(
          'flex items-center gap-1.5 whitespace-nowrap rounded-full',
          'px-4 py-2 text-[13px] font-semibold',
          'transition-all duration-200',
          FOCUS_RING,
          'active:scale-[0.97]',
          isActive
            ? 'bg-[var(--color-ember-600)] text-white shadow-[0_4px_14px_rgba(180,80,30,0.22)]'
            : 'text-[var(--app-muted)] hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)]',
        )
      }
      style={{ fontFamily: 'var(--font-sans)' }}
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
          'flex items-center gap-2.5 rounded-xl px-3 py-2.5',
          'text-[13.5px] font-medium transition-all duration-200',
          FOCUS_RING,
          'active:scale-[0.985]',
          isActive
            ? 'bg-[var(--color-ember-600)] text-white shadow-[0_4px_14px_rgba(180,80,30,0.18)]'
            : 'text-[var(--app-muted)] hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)]',
        )
      }
      style={{ fontFamily: 'var(--font-sans)' }}
    >
      <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
      {item.label}
    </NavLink>
  );
}

// ── Loading state ────────────────────────────────────────────────────────────

function AccountLoadingState() {
  return (
    <div
      className="flex min-h-[60vh] flex-col items-center justify-center gap-4"
      data-ui-component
      style={appFontStyle}
    >
      <div className="relative flex h-12 w-12 items-center justify-center">
        <div
          className="absolute inset-0 animate-ping rounded-full bg-[var(--color-ember-300)] opacity-20"
          aria-hidden="true"
        />

        <div
          className="h-7 w-7 animate-spin rounded-full border-[2.5px] border-[var(--app-border)] border-t-[var(--color-ember-500)]"
          role="status"
          aria-label="Loading your account"
        />
      </div>

      <p className="animate-pulse text-[12px] font-medium" style={mutedTextStyle}>
        Loading your account
      </p>
    </div>
  );
}

// ── Main layout ──────────────────────────────────────────────────────────────

export default function AccountLayout() {
  const navigate = useNavigate();
  const { user, profile, loading, signOut } = useAuth();

  const isAdmin = profile?.role ? canAccessAdmin(profile.role) : false;
  const isAuthed = Boolean(user);
  const displayName = profile?.full_name?.trim() || user?.name?.trim() || user?.email || 'Account';

  const handleSignOut = useCallback(async (): Promise<void> => {
    try {
      await signOut();
      void navigate('/');
    } catch {
      // Auth provider owns state cleanup.
    }
  }, [navigate, signOut]);

  const navItems: AccountNavItem[] = [
    ...BASE_NAV,
    ...(isAdmin ? [{ to: '/admin', label: 'Admin Panel', icon: ShieldCheck }] : []),
  ];

  if (loading) {
    return (
      <div
        className="mx-auto w-full max-w-5xl px-4 py-6 md:px-8 md:py-8"
        data-ui-component
        style={appFontStyle}
      >
        <AccountLoadingState />
      </div>
    );
  }

  if (!isAuthed) {
    return (
      <div
        className="mx-auto w-full max-w-5xl px-4 py-6 md:px-8 md:py-8"
        data-ui-component
        style={appFontStyle}
      >
        <LoginGate />
      </div>
    );
  }

  return (
    <div
      className="mx-auto w-full max-w-5xl px-4 py-6 md:px-8 md:py-8"
      data-ui-component
      style={appFontStyle}
    >
      <div className="md:hidden">
        <div className={cx(CARD, 'mb-4 flex items-center gap-3.5 p-4')}>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--color-ember-100)] dark:bg-white/[0.08]">
            <User className="h-5 w-5" style={iconToneStyle} strokeWidth={1.75} aria-hidden="true" />
          </div>

          <div className="min-w-0">
            <p className="truncate text-[14.5px] font-semibold text-[var(--app-text)]">
              {displayName}
            </p>

            {user?.email ? (
              <p className="truncate text-[12px] text-[var(--app-muted)]">{user.email}</p>
            ) : null}
          </div>
        </div>

        <div className="-mx-4 mb-5 overflow-x-auto px-4 scrollbar-none">
          <nav className="flex gap-2 pb-0.5" role="navigation" aria-label="Account navigation">
            {navItems.map((item) => (
              <MobileTab key={item.to} item={item} />
            ))}
          </nav>
        </div>

        <section className={cx(CARD, 'p-4 text-[var(--app-text)]')}>
          <Outlet />
        </section>

        <button
          type="button"
          onClick={() => void handleSignOut()}
          className={cx(
            'mt-4 flex w-full items-center justify-center gap-2',
            SOFT_BUTTON,
            'px-4 py-2.5 text-[13px] font-medium',
          )}
        >
          <LogOut className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Sign out
        </button>
      </div>

      <div className="hidden md:grid md:grid-cols-[230px_1fr] md:gap-6">
        <aside className="flex flex-col gap-3">
          <div className={cx(CARD, 'p-4')}>
            <div className="mb-4 flex items-center gap-3 border-b border-[var(--app-divider)] pb-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-ember-100)] dark:bg-white/[0.08]">
                <User
                  className="h-[1.1rem] w-[1.1rem]"
                  style={iconToneStyle}
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              </div>

              <div className="min-w-0">
                <p className="truncate text-[14px] font-semibold text-[var(--app-text)]">
                  {displayName}
                </p>

                {user?.email ? (
                  <p className="truncate text-[11.5px] text-[var(--app-muted)]">{user.email}</p>
                ) : null}
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
              'flex w-full items-center gap-2.5',
              SOFT_BUTTON,
              'px-3 py-2.5 text-[13px] font-medium',
            )}
          >
            <LogOut
              className="h-4 w-4 shrink-0 text-[var(--app-muted)]"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            Sign out
          </button>
        </aside>

        <section className={cx(CARD, 'min-w-0 p-6 text-[var(--app-text)]')}>
          <Outlet />
        </section>
      </div>
    </div>
  );
}