// src/modules/orders/pages/OrderCanceled.tsx
// =============================================================================
// ORDER CANCELED — 2026 — Sofis Design System
// Built with: React 19, TypeScript strict, Tailwind v4, Supabase, Stripe
//
// Design tokens: tokens.css · components.css · animations.css · effects.css
// Font stack:    --font-display (Playfair Display) · --font-sans (DM Sans)
//
// Reality check (Stripe Checkout):
// - Card declines happen INSIDE Stripe — user stays on Stripe page.
// - Users land here when they: cancel, let the session expire, or close/return.
//
// What this page does:
// - Validates session_id from URL (never logs full token)
// - Calls Edge Function `get-checkout-session` via invokeEdge
// - Renders one of four states: loading -> ready/cancel | expired | ok | error
// - Exposes support-safe prefix-only session ID for copy
// =============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Copy,
  Mail,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  XCircle,
} from 'lucide-react';
import { invokeEdge } from '@/lib/supabase/invoke';

// -----------------------------------------------------------------------------
// Local utility — cn does not exist in this codebase, inlined here
// -----------------------------------------------------------------------------

function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

type StripeSessionStatus = 'open' | 'complete' | 'expired' | null;
type StripePaymentStatus = 'paid' | 'unpaid' | 'no_payment_required' | null;

type GetCheckoutSessionResp = {
  id: string;
  status: StripeSessionStatus;
  payment_status: StripePaymentStatus;
  amount_total: number | null;
  currency: string | null;
  customer_email: string | null;
  created: number | null;
  expires_at: number | null;
};

type ViewState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; session: GetCheckoutSessionResp | null }
  | { kind: 'error'; message: string };

type IconKind = 'ok' | 'time' | 'warn' | 'cancel';

type DerivedState = {
  title: string;
  subtitle: string;
  detail: string;
  icon: IconKind;
  badge: string | null;
  retryLabel: string;
};

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const STRIPE_SESSION_RE = /^cs_(test|live)_[a-zA-Z0-9]+$/;
const SUPPORT_EMAIL = 'sofisrestaurante@gmail.com';
const COPY_RESET_MS = 1_400;

// -----------------------------------------------------------------------------
// Pure helpers
// -----------------------------------------------------------------------------

function safeSessionId(raw: string | null): string | null {
  const s = (raw ?? '').trim();
  if (!s || s.length > 200 || !STRIPE_SESSION_RE.test(s)) return null;
  return s;
}

function sessionPrefix(id: string | null | undefined, n = 8): string | null {
  return id ? id.slice(0, n) : null;
}

function formatMoney(cents: number | null, currency: string | null): string {
  if (cents == null || !Number.isFinite(cents)) return '';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: (currency ?? 'usd').toUpperCase(),
  }).format(cents / 100);
}

function formatWhen(unixSeconds: number | null): string {
  if (!unixSeconds || !Number.isFinite(unixSeconds)) return '';
  return new Date(unixSeconds * 1_000).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// NOTE: All apostrophes in string literals below use straight quotes (')
// to avoid the smart-quote corruption that caused TS2002/TS18004 errors.
function derivedFromSession(
  sessionId: string | null,
  session: GetCheckoutSessionResp | null,
): DerivedState {
  if (!sessionId) {
    return {
      title: 'Checkout canceled',
      subtitle: "We couldn't verify the payment session.",
      detail: 'Return to checkout to try again.',
      icon: 'warn',
      badge: null,
      retryLabel: 'Return to Checkout',
    };
  }

  if (!session) {
    return {
      title: 'Checkout canceled',
      subtitle: "We couldn't load your session details.",
      detail: 'Return to checkout to try again.',
      icon: 'warn',
      badge: `Session ${sessionPrefix(sessionId)?.toUpperCase() ?? ''}`,
      retryLabel: 'Return to Checkout',
    };
  }

  const isPaid = session.payment_status === 'paid';
  const isExpired = session.status === 'expired';
  const isOpen = session.status === 'open';
  const isComplete = session.status === 'complete';

  if (isPaid && isComplete) {
    return {
      title: 'Payment received',
      subtitle: "Your payment went through \u2014 we're finalizing your order.",
      detail: "If you don't see it in Order History within a minute, refresh or contact us.",
      icon: 'ok',
      badge: `Paid ${formatMoney(session.amount_total, session.currency)}`,
      retryLabel: 'View My Orders',
    };
  }

  if (isExpired) {
    return {
      title: 'Checkout expired',
      subtitle: 'Your session expired before the payment was completed.',
      detail: 'No charge was made. Sessions expire after 30 minutes \u2014 start a fresh one.',
      icon: 'time',
      badge: session.expires_at ? `Expired ${formatWhen(session.expires_at)}` : 'Expired',
      retryLabel: 'Start New Checkout',
    };
  }

  if (isOpen && !isPaid) {
    return {
      title: 'Checkout canceled',
      subtitle: "Your payment wasn't completed.",
      detail: 'You can try again \u2014 your cart is still here.',
      icon: 'cancel',
      badge: session.amount_total
        ? `Attempted ${formatMoney(session.amount_total, session.currency)}`
        : null,
      retryLabel: 'Return to Checkout',
    };
  }

  return {
    title: 'Checkout canceled',
    subtitle: "Your payment wasn't completed.",
    detail: 'You can return to checkout to try again.',
    icon: 'cancel',
    badge: session.amount_total
      ? `Attempted ${formatMoney(session.amount_total, session.currency)}`
      : null,
    retryLabel: 'Return to Checkout',
  };
}

// -----------------------------------------------------------------------------
// Sub-components
// -----------------------------------------------------------------------------

// -- Icon ring -----------------------------------------------------------------

type IconRingProps = { kind: IconKind | 'loading' };

const ICON_RING_CLASSES: Record<IconKind | 'loading', string> = {
  ok: 'bg-[color-mix(in_srgb,var(--color-success)_8%,transparent)] ring-[color-mix(in_srgb,var(--color-success)_18%,transparent)]',
  time: 'bg-[color-mix(in_srgb,var(--color-warning)_10%,transparent)] ring-[color-mix(in_srgb,var(--color-warning)_22%,transparent)]',
  warn: 'bg-[color-mix(in_srgb,var(--color-warning)_10%,transparent)] ring-[color-mix(in_srgb,var(--color-warning)_22%,transparent)]',
  cancel:
    'bg-[color-mix(in_srgb,var(--color-error)_8%,transparent)] ring-[color-mix(in_srgb,var(--color-error)_18%,transparent)]',
  loading: 'bg-(--color-cream-200) ring-(--color-cream-300)',
};

const ICON_COLOR_CLASSES: Record<IconKind | 'loading', string> = {
  ok: 'text-(--color-success)',
  time: 'text-(--color-warning)',
  warn: 'text-(--color-warning)',
  cancel: 'text-(--color-error)',
  loading: 'text-(--color-ink-400)',
};

const ICON_COMPONENTS: Record<IconKind, React.ElementType> = {
  ok: ShieldCheck,
  time: Clock,
  warn: AlertCircle,
  cancel: XCircle,
};

function IconRing({ kind }: IconRingProps): React.ReactElement {
  const IconEl = kind !== 'loading' ? ICON_COMPONENTS[kind] : RefreshCw;

  return (
    <div
      className={cn(
        // h-18 / w-18 = 4.5rem in Tailwind v4 (canonical over h-[4.5rem])
        'flex h-18 w-18 items-center justify-center rounded-full',
        'ring-[6px] transition-all duration-500',
        'animate-confirm-pop',
        ICON_RING_CLASSES[kind],
      )}
      aria-hidden="true"
    >
      <IconEl
        className={cn(
          'h-8 w-8 transition-colors duration-500',
          kind === 'loading' && 'animate-spin',
          ICON_COLOR_CLASSES[kind],
        )}
        strokeWidth={1.75}
      />
    </div>
  );
}

// -- Status banner (3px top color strip) --------------------------------------

type BannerProps = { kind: IconKind | 'loading' };

const BANNER_CLASSES: Record<IconKind | 'loading', string> = {
  ok: 'from-(--color-success) to-[color-mix(in_srgb,var(--color-success)_70%,var(--color-gold-400))]',
  time: 'from-(--color-warning) to-(--color-gold-300)',
  warn: 'from-(--color-warning) to-(--color-gold-300)',
  cancel: 'from-(--color-error) to-(--color-ember-400)',
  // bg-linear-to-r is the Tailwind v4 canonical form of bg-gradient-to-r
  loading:
    'from-(--color-cream-300) via-(--color-cream-200) to-(--color-cream-300) animate-shimmer bg-[length:300%_100%]',
};

function StatusBanner({ kind }: BannerProps): React.ReactElement {
  return (
    <div
      role="presentation"
      className={cn(
        // bg-linear-to-r = Tailwind v4 canonical (was bg-gradient-to-r)
        'h-3px w-full bg-linear-to-r transition-all duration-700',
        BANNER_CLASSES[kind],
      )}
    />
  );
}

// -- Session pill --------------------------------------------------------------

type SessionPillProps = {
  sessionId: string;
  badge: string | null;
};

function SessionPill({ sessionId, badge }: SessionPillProps): React.ReactElement {
  const prefix = sessionPrefix(sessionId)?.toUpperCase() ?? '';

  return (
    <div
      // rounded-(--radius-pill) is the Tailwind v4 canonical form of rounded-[var(--radius-pill)]
      className="inline-flex items-center gap-2 rounded-(--radius-pill) border border-(--color-cream-300) bg-(--color-cream-100) px-3 py-1.5 font-mono text-[0.7rem] text-(--color-ink-500)"
    >
      <span>cs_&hellip;{prefix}</span>
      {badge && (
        <>
          {/* h-0.75 / w-0.75 is the Tailwind v4 canonical form of h-[3px] / w-[3px] */}
          <span className="h-0.75 w-0.75 rounded-full bg-(--color-ink-300)" />
          <span className="font-sans font-normal not-italic">{badge}</span>
        </>
      )}
    </div>
  );
}

// -- Skeleton loader -----------------------------------------------------------

function LoadingSkeleton(): React.ReactElement {
  return (
    <div
      className="w-full space-y-3 text-center"
      aria-busy="true"
      aria-label="Loading payment status"
    >
      {/* .skeleton class from components.css — cream shimmer keyframe */}
      <div className="skeleton mx-auto h-8 w-2/3 rounded-lg" />
      <div className="skeleton mx-auto h-4 w-4/5 rounded-md" />
      <div className="skeleton mx-auto h-4 w-3/5 rounded-md" />
      <div className="skeleton mx-auto mt-5 h-7 w-40 rounded-(--radius-pill)" />
    </div>
  );
}

// -- Utility action row --------------------------------------------------------

type UtilActionsProps = {
  sessionId: string | null;
  copied: boolean;
  onCopy: () => void;
};

function UtilActions({ sessionId, copied, onCopy }: UtilActionsProps): React.ReactElement {
  return (
    <div className="mt-1 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
      {sessionId && (
        <>
          <button
            type="button"
            onClick={onCopy}
            className="inline-flex items-center gap-1.5 font-sans text-xs text-(--color-ink-400) transition-colors hover:text-(--color-ink-700)"
          >
            {copied ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-(--color-success)" strokeWidth={2} />
            ) : (
              <Copy className="h-3.5 w-3.5" strokeWidth={1.75} />
            )}
            <span className={copied ? 'animate-fade-in text-(--color-success)' : ''}>
              {copied ? 'Copied' : 'Copy support ID'}
            </span>
          </button>

          <span className="h-0.75 w-0.75 rounded-full bg-(--color-ink-200)" aria-hidden="true" />
        </>
      )}

      <a
        href={`mailto:${SUPPORT_EMAIL}`}
        className="inline-flex items-center gap-1.5 text-xs text-(--color-ink-400) transition-colors hover:text-(--color-ink-700)"
      >
        <Mail className="h-3.5 w-3.5" strokeWidth={1.75} />
        Email support
      </a>

      <span className="h-0.75 w-0.75 rounded-full bg-(--color-ink-200)" aria-hidden="true" />

      <Link
        to="/account/orders"
        className="text-xs text-(--color-ink-400) transition-colors hover:text-(--color-ink-700)"
      >
        Order history
      </Link>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Main page component
// -----------------------------------------------------------------------------

export default function OrderCanceled(): React.ReactElement {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Session ID from URL
  const rawSessionId = useMemo(() => searchParams.get('session_id'), [searchParams]);
  const sessionId = useMemo(() => safeSessionId(rawSessionId), [rawSessionId]);

  // Component state
  const [view, setView] = useState<ViewState>({ kind: 'idle' });
  const [copied, setCopied] = useState(false);

  // Prevent setState after unmount
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // Data fetch
  const loadSession = useCallback(async (): Promise<void> => {
    if (!sessionId) {
      setView({ kind: 'ready', session: null });
      return;
    }

    setView({ kind: 'loading' });

    try {
      const data = await invokeEdge<GetCheckoutSessionResp>('get-checkout-session', {
        session_id: sessionId,
      });

      if (!aliveRef.current) return;
      setView({ kind: 'ready', session: data ?? null });
    } catch {
      if (!aliveRef.current) return;
      setView({
        kind: 'error',
        message: 'Unable to verify the payment session. Please try again.',
      });
    }
  }, [sessionId]);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  // Navigation — state-aware: paid+complete goes to orders, otherwise checkout
  const handleRetry = useCallback((): void => {
    const isPaidComplete =
      view.kind === 'ready' &&
      view.session?.payment_status === 'paid' &&
      view.session?.status === 'complete';

    void navigate(isPaidComplete ? '/account/orders' : '/checkout');
  }, [navigate, view]);

  const handleMenu = useCallback((): void => {
    void navigate('/menu');
  }, [navigate]);

  // Copy support ID to clipboard
  const copySupportId = useCallback(async (): Promise<void> => {
    const id = sessionId ? `checkout_session:${sessionId}` : 'checkout_session:missing';

    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      window.setTimeout(() => setCopied(false), COPY_RESET_MS);
    } catch {
      // clipboard unavailable — fail silently
    }
  }, [sessionId]);

  // Derived display state
  const derived = useMemo((): DerivedState | null => {
    if (view.kind !== 'ready') return null;
    return derivedFromSession(sessionId, view.session);
  }, [view, sessionId]);

  const iconKind: IconKind | 'loading' = useMemo(() => {
    if (view.kind === 'loading') return 'loading';
    return derived?.icon ?? 'cancel';
  }, [view.kind, derived?.icon]);

  return (
    <main
      role="main"
      aria-labelledby="order-canceled-title"
      // surface-noise from effects.css — grain texture overlay via ::before
      className="surface-noise relative flex min-h-dvh items-center justify-center bg-(--color-cream-100) px-4 py-16"
    >
      {/* overlay-luxury from effects.css — decorative radial gold/ember glows */}
      <div className="overlay-luxury pointer-events-none" aria-hidden="true" />

      {/* Brand mark */}
      <div className="animate-fade-down absolute top-8 left-1/2 -translate-x-1/2">
        {/* section-eyebrow from components.css — gets ::before gold line rule */}
        <span className="section-eyebrow text-(--color-gold-500)">Sofi&apos;s Restaurante</span>
      </div>

      {/* Card — .card from components.css: radius-card, shadow, hover-lift */}
      <section
        className={cn(
          'card animate-fade-up w-full max-w-lg',
          'border border-(--color-cream-300)',
          'bg-(--color-surface)',
          'overflow-hidden',
        )}
        aria-live="polite"
      >
        {/* 3px color band encoding current state */}
        <StatusBanner kind={iconKind} />

        {/* State icon */}
        <div className="flex justify-center px-10 pt-10 pb-5">
          <IconRing kind={iconKind} />
        </div>

        {/* Body content */}
        <div className="px-10 pb-2 text-center">
          {view.kind === 'loading' && <LoadingSkeleton />}

          {view.kind === 'error' && (
            <>
              <h1
                id="order-canceled-title"
                className="animate-fade-up-1 font-display mb-2 text-(length:--text-3xl) font-normal tracking-tight text-(--color-ink-900)"
              >
                Something went wrong
              </h1>
              <p className="animate-fade-up-2 mb-6 text-sm leading-relaxed text-(--color-ink-500)">
                {view.message}
              </p>
            </>
          )}

          {view.kind === 'ready' && derived && (
            <>
              {/* Eyebrow — .eyebrow from typography.css */}
              <p className="animate-fade-up-1 eyebrow mb-3 text-(--color-gold-500)">
                {iconKind === 'ok'
                  ? 'Payment confirmed'
                  : iconKind === 'time'
                    ? 'Session timed out'
                    : 'Payment not completed'}
              </p>

              {/* Headline — font-display pulls --font-display (Playfair Display) */}
              <h1
                id="order-canceled-title"
                className="animate-fade-up-2 font-display mb-3 text-[clamp(1.75rem,4vw,2.5rem)] font-normal leading-[1.1] tracking-[-0.02em] text-(--color-ink-900)"
              >
                {derived.title}
              </h1>

              <p className="animate-fade-up-3 mb-1 text-[0.9rem] font-medium leading-snug text-(--color-ink-700)">
                {derived.subtitle}
              </p>

              <p className="animate-fade-up-4 mb-6 text-sm leading-relaxed text-(--color-ink-400)">
                {derived.detail}
              </p>

              {sessionId && (
                <div className="animate-fade-up-5 mb-7 flex justify-center">
                  <SessionPill sessionId={sessionId} badge={derived.badge} />
                </div>
              )}
            </>
          )}

          {view.kind === 'idle' && (
            <h1
              id="order-canceled-title"
              className="font-display mb-6 text-(length:--text-3xl) font-normal tracking-tight text-(--color-ink-900)"
            >
              Checking payment&hellip;
            </h1>
          )}
        </div>

        {/* CTAs */}
        {view.kind !== 'loading' && (
          <div className="animate-fade-up-6 flex flex-col gap-3 px-10 pb-2 sm:flex-row">
            <button
              type="button"
              onClick={handleRetry}
              className={cn(
                'btn btn-ghost-light flex-1',
                'border-(--color-cream-400) text-(--color-ink-700)',
                'hover:border-(--color-gold-400) hover:text-(--color-gold-500)',
              )}
            >
              <RefreshCw className="h-4 w-4 shrink-0" strokeWidth={1.75} />
              <span>{derived?.retryLabel ?? 'Return to Checkout'}</span>
            </button>

            <button type="button" onClick={handleMenu} className="btn btn-primary flex-1">
              <ShoppingBag className="h-4 w-4 shrink-0" strokeWidth={1.75} />
              <span>Back to Menu</span>
            </button>
          </div>
        )}

        {/* Gold divider — .divider-gold from utilities.css */}
        <div className="px-10 py-5">
          <hr className="divider-gold" />
        </div>

        {/* Utility links */}
        <div className="px-10 pb-7">
          <UtilActions
            sessionId={sessionId}
            copied={copied}
            onCopy={() => {
              void copySupportId();
            }}
          />
        </div>

        {/* Trust footer */}
        <footer className="border-t border-(--color-cream-200) bg-(--color-cream-100) px-10 py-4">
          <div className="flex items-start gap-3">
            <ShieldCheck
              className="mt-0.5 h-3.5 w-3.5 shrink-0 text-(--color-success)"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <p className="text-[0.7rem] leading-[1.6] text-(--color-ink-400)">
              Secure checkout by Stripe.{' '}
              {iconKind === 'ok'
                ? 'Your payment is confirmed and your order is being prepared.'
                : 'If you canceled or the session expired, no charge was made to your card.'}
            </p>
          </div>
        </footer>

        {/* Re-check — only visible once session data has loaded */}
        {view.kind === 'ready' && (
          <div className="border-t border-(--color-cream-200) py-2.5 text-center">
            <button
              type="button"
              onClick={() => {
                void loadSession();
              }}
              className="text-[0.65rem] tracking-wide text-(--color-ink-300) underline underline-offset-2 transition-colors hover:text-(--color-ink-600)"
            >
              Re-check session status
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
