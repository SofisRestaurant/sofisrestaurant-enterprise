// src/pages/Deals/Deals.tsx
// =============================================================================
// Sofi's Deals — dedicated customer-facing deals destination.
//
// Data:
//   useActiveCampaignsState — live campaign data with caching, refresh,
//   window-focus refetch, and reconnect refetch built in.
//
// Layout:
//   1. Hero card     — title, description, stats, refresh button.
//   2. Featured card — highlighted if the API returns a featured campaign.
//   3. Error banner  — displayed beneath the hero if the fetch fails.
//   4. Deals section — full DealsRail with all active campaigns.
//   5. Empty state   — shown when deals.length === 0 and not loading.
//
// Theme:
//   All chrome uses var(--app-*) tokens for correct light/dark rendering.
//   Decorative orbs use inline rgba() to avoid Tailwind opacity-modifier
//   edge cases with CSS custom property values.
//   DealsRail cards maintain their own dark aesthetic regardless of page theme.
// =============================================================================

import { useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowUpRight, Clock3, RefreshCw, Sparkles, Star, Tag } from 'lucide-react';

import DealsRail from '@/modules/menu/components/DealsRail';
import { campaignsToDeals } from '@/modules/menu/mappers/campaignsToDeals.mapper';
import { useActiveCampaignsState } from '@/modules/menu/hooks/useActiveCampaigns';

// ── Helpers ───────────────────────────────────────────────────────────────────

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

const DATE_FMT = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

function fmtDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    return DATE_FMT.format(new Date(iso));
  } catch {
    return null;
  }
}

function fmtSchedule(
  startsAt: string | null | undefined,
  endsAt: string | null | undefined,
): string | null {
  const s = fmtDate(startsAt);
  const e = fmtDate(endsAt);
  if (s && e) return `${s} – ${e}`;
  if (e) return `Ends ${e}`;
  if (s) return `Starts ${s}`;
  return null;
}

// ── StatCard ──────────────────────────────────────────────────────────────────

type StatCardProps = {
  label: string;
  value: string;
  compact?: boolean;
};

function StatCard({ label, value, compact = false }: StatCardProps) {
  return (
    <div className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] p-3 sm:p-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--app-muted)]">
        {label}
      </p>
      <p
        className={cx(
          'mt-1.5 font-black text-[var(--app-text)]',
          compact ? 'text-sm leading-snug' : 'text-2xl tabular-nums sm:text-3xl',
        )}
      >
        {value}
      </p>
    </div>
  );
}

// ── Deals page ────────────────────────────────────────────────────────────────

export default function Deals() {
  const navigate = useNavigate();

  const {
    campaigns,
    featured,
    loading,
    refreshing,
    error,
    asOf,
    refresh,
  } = useActiveCampaignsState({
    placement:           'menu_deals_rail',
    limit:               24,
    featured:            true,
    ttlMs:               30_000,
    staleMs:             5 * 60_000,
    refreshOnWindowFocus: true,
    refreshOnReconnect:   true,
  });

  // Map campaigns once; memoised so DealsRail doesn't receive new references on unrelated renders.
  const deals = useMemo(() => campaignsToDeals(campaigns), [campaigns]);

  // Map the featured campaign if present.
  const featuredDeal = useMemo(
    () => (featured ? (campaignsToDeals([featured])[0] ?? null) : null),
    [featured],
  );

  const featuredCount = useMemo(
    () => deals.filter((d) => d.featured).length,
    [deals],
  );

  const formattedAsOf = useMemo(() => fmtDate(asOf), [asOf]);

  // Navigate from deal deepLinks — internal paths via React Router, external via href.
const handleDeepLink = useCallback(
  (link: string | null | undefined) => {
    if (!link) return;

    if (link.startsWith('/')) {
      void navigate(link);
      return;
    }

    window.location.assign(link);
  },
  [navigate],
);

  return (
    <main
      id="main-content"
      className="min-h-screen bg-[var(--app-bg)] px-4 pb-32 pt-6 text-[var(--app-text)] transition-colors sm:px-6 lg:px-8"
    >
      <div className="mx-auto max-w-5xl space-y-6">

        {/* ── Hero card ───────────────────────────────────────────────────── */}
        <section aria-labelledby="deals-heading">
          <div
            className="relative overflow-hidden rounded-[2rem] border border-[var(--app-border)] bg-[var(--app-card)] p-6 sm:p-8"
            style={{
              boxShadow: '0 16px 56px rgba(0,0,0,0.12), 0 4px 16px rgba(0,0,0,0.06)',
            }}
          >
            {/* Decorative orbs */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -left-20 -top-20 h-64 w-64 rounded-full blur-3xl"
              style={{ background: 'rgba(212,175,55,0.08)' }}
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -bottom-16 -right-16 h-48 w-48 rounded-full blur-3xl"
              style={{ background: 'rgba(168,69,32,0.07)' }}
            />

            <div className="relative">
              {/* Eyebrow label */}
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-1.5">
                <Sparkles
                  className="h-3.5 w-3.5 text-[var(--color-gold-500)]"
                  aria-hidden="true"
                />
                <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--color-gold-600)]">
                  Sofi's Specials
                </span>
              </div>

              {/* Title + Refresh row */}
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h1
                    id="deals-heading"
                    className="text-balance font-display text-3xl font-black leading-tight text-[var(--app-text)] sm:text-4xl lg:text-5xl"
                  >
                    Deals &amp; limited-time
                    <br className="hidden sm:block" /> offers
                  </h1>
                  <p className="mt-3 max-w-lg text-sm leading-6 text-[var(--app-muted)]">
                    Browse today's featured specials, limited-time savings, and
                    seasonal Sofi's Restaurant offers — all in one place.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => void refresh()}
                  disabled={refreshing}
                  aria-label={refreshing ? 'Refreshing deals' : 'Refresh deals'}
                  className={cx(
                    'inline-flex shrink-0 items-center gap-2 rounded-2xl border border-[var(--app-border)]',
                    'bg-[var(--app-surface)] px-4 py-2.5 text-sm font-semibold text-[var(--app-text)]',
                    'transition-colors hover:bg-[var(--app-surface-hover)]',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-400)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--app-bg)]',
                    'active:scale-[0.98]',
                    refreshing && 'cursor-wait opacity-60',
                  )}
                >
                  <RefreshCw
                    className={cx('h-4 w-4', refreshing && 'animate-spin')}
                    aria-hidden="true"
                  />
                  {refreshing ? 'Refreshing…' : 'Refresh'}
                </button>
              </div>

              {/* Stats row */}
              <div className="mt-6 grid grid-cols-3 gap-3">
                <StatCard
                  label="Active deals"
                  value={loading ? '…' : String(deals.length)}
                />
                <StatCard
                  label="Featured"
                  value={
                    loading
                      ? '…'
                      : featuredCount > 0
                        ? String(featuredCount)
                        : featuredDeal
                          ? '1'
                          : '—'
                  }
                />
                <StatCard
                  label="Updated"
                  value={formattedAsOf ?? (loading ? '…' : 'Just now')}
                  compact
                />
              </div>
            </div>
          </div>
        </section>

        {/* ── Error banner ────────────────────────────────────────────────── */}
        {error && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-2xl border border-[var(--color-ember-600)]/20 bg-[var(--color-ember-50)] px-4 py-3 text-sm text-[var(--color-ember-700)]"
          >
            <span className="mt-0.5 shrink-0 text-base" aria-hidden="true">
              ⚠️
            </span>
            <div>
              <p className="font-semibold">Could not load deals</p>
              <p className="mt-0.5 text-xs opacity-80">{error}</p>
            </div>
            <button
              type="button"
              onClick={() => void refresh()}
              className="ml-auto shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ember-600)]"
            >
              Retry
            </button>
          </div>
        )}

        {/* ── Featured deal card ──────────────────────────────────────────── */}
        {featuredDeal && (
          <section aria-labelledby="featured-deal-heading">
            {/* Section eyebrow */}
            <div className="mb-3 flex items-center gap-3">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl shadow-sm"
                style={{
                  background:
                    'linear-gradient(135deg, var(--color-gold-300), var(--color-gold-400), var(--color-ember-600))',
                  boxShadow: '0 4px 12px rgba(212,175,55,0.30)',
                }}
              >
                <Star
                  className="h-4 w-4 text-[var(--color-stone-900)]"
                  aria-hidden="true"
                />
              </span>
              <div>
                <h2
                  id="featured-deal-heading"
                  className="text-sm font-black text-[var(--app-text)]"
                >
                  Featured Special
                </h2>
                <p className="text-xs text-[var(--app-muted)]">
                  Sofi's top pick right now
                </p>
              </div>
            </div>

            {/* Featured card body */}
            <div
              className="relative overflow-hidden rounded-3xl border p-5 sm:p-6"
              style={{
                borderColor: 'rgba(212,175,55,0.28)',
                background:
                  'linear-gradient(135deg, rgba(212,175,55,0.06) 0%, rgba(168,69,32,0.04) 100%)',
                boxShadow:
                  '0 0 0 1px rgba(212,175,55,0.08), 0 8px 32px rgba(212,175,55,0.06)',
              }}
            >
              {/* Decorative glow */}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full blur-2xl"
                style={{ background: 'rgba(212,175,55,0.12)' }}
              />

              <div className="relative">
                {/* Badges */}
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em]"
                    style={{
                      borderColor: 'rgba(212,175,55,0.30)',
                      background: 'rgba(212,175,55,0.10)',
                      color: 'var(--color-gold-600)',
                    }}
                  >
                    <Star className="h-3 w-3" aria-hidden="true" />
                    Featured
                  </span>

                  {featuredDeal.badge && featuredDeal.badge !== 'DEAL' && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-[var(--app-border)] bg-[var(--app-surface)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--app-muted)]">
                      <Tag className="h-3 w-3" aria-hidden="true" />
                      {featuredDeal.badge}
                    </span>
                  )}
                </div>

                {/* Title */}
                <h3 className="text-xl font-black text-[var(--app-text)] sm:text-2xl">
                  {featuredDeal.title}
                </h3>

                {/* Subtitle */}
                {featuredDeal.subtitle && (
                  <p className="mt-2 max-w-lg text-sm leading-6 text-[var(--app-muted)]">
                    {featuredDeal.subtitle}
                  </p>
                )}

                {/* Schedule */}
                {(featuredDeal.startsAt || featuredDeal.endsAt) && (
                  <div className="mt-3 flex items-center gap-2 text-xs text-[var(--app-muted)]">
                    <Clock3 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>{fmtSchedule(featuredDeal.startsAt, featuredDeal.endsAt)}</span>
                  </div>
                )}

                {/* CTA row */}
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  {featuredDeal.deepLink ? (
                    <button
                      type="button"
                      onClick={() => handleDeepLink(featuredDeal.deepLink)}
                      className={cx(
                        'inline-flex items-center gap-2 rounded-2xl px-5 py-2.5',
                        'text-sm font-bold text-[var(--color-stone-900)]',
                        'transition-shadow active:scale-[0.98]',
                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-400)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--app-bg)]',
                      )}
                      style={{
                        background:
                          'linear-gradient(to right, var(--color-gold-400), var(--color-ember-500))',
                        boxShadow: '0 4px 16px rgba(212,175,55,0.32)',
                      }}
                    >
                      {featuredDeal.ctaLabel ?? 'See deal'}
                      <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                    </button>
                  ) : (
                    <Link
                      to="/menu"
                      className={cx(
                        'inline-flex items-center gap-2 rounded-2xl px-5 py-2.5',
                        'text-sm font-bold text-[var(--color-stone-900)]',
                        'transition-shadow active:scale-[0.98]',
                        'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-400)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--app-bg)]',
                      )}
                      style={{
                        background:
                          'linear-gradient(to right, var(--color-gold-400), var(--color-ember-500))',
                        boxShadow: '0 4px 16px rgba(212,175,55,0.32)',
                      }}
                    >
                      {featuredDeal.ctaLabel ?? 'Browse menu'}
                      <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  )}

                  {featuredDeal.menuItemId && (
                    <span className="text-xs text-[var(--app-muted)]">Menu item linked</span>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ── All deals section ────────────────────────────────────────────── */}
        <section aria-labelledby="all-deals-heading">
          <div
            className="rounded-[2rem] border border-[var(--app-border)] bg-[var(--app-card)] p-5 sm:p-6"
            style={{
              boxShadow: '0 8px 32px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)',
            }}
          >
            {/* Section header */}
            <div className="mb-5 flex items-center gap-3">
              <span
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl"
                style={{
                  background:
                    'linear-gradient(135deg, var(--color-gold-300), var(--color-gold-400), var(--color-ember-600))',
                  boxShadow: '0 4px 16px rgba(212,175,55,0.28)',
                }}
              >
                <Tag
                  className="h-5 w-5 text-[var(--color-stone-900)]"
                  aria-hidden="true"
                />
              </span>
              <div>
                <h2
                  id="all-deals-heading"
                  className="text-lg font-black text-[var(--app-text)]"
                >
                  Current Sofi's Deals
                </h2>
                <p className="text-sm text-[var(--app-muted)]">
                  Limited-time specials and savings
                </p>
              </div>
            </div>

            {/* DealsRail handles its own loading skeleton, empty state, and scroll nav */}
            <DealsRail
              deals={deals}
              loading={loading}
              title="Active deals"
              subtitle="Scroll to explore all current offers"
              emptyTitle="No active deals right now"
              emptyHint="Check back soon — fresh Sofi's specials appear here automatically."
              ariaLabel="Sofi's current deals"
              onNavigate={(deepLink, deal) => {
                void handleDeepLink(deal.deepLink ?? deepLink);
              }}
              onSelect={() => undefined}
            />

            {/* Empty state — shown when fetch is complete and there are no deals */}
            {!loading && !error && deals.length === 0 && (
              <div className="mt-6 flex flex-col items-center gap-4 py-10 text-center">
                <span
                  className="flex h-16 w-16 items-center justify-center rounded-3xl text-3xl"
                  style={{ background: 'rgba(212,175,55,0.10)' }}
                  aria-hidden="true"
                >
                  🏷️
                </span>
                <div>
                  <p className="font-bold text-[var(--app-text)]">
                    No active deals right now
                  </p>
                  <p className="mt-1 max-w-xs text-sm text-[var(--app-muted)]">
                    Fresh Sofi's specials appear here as they launch. Check back
                    soon or explore the full menu.
                  </p>
                </div>
                <div className="flex flex-wrap justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => void refresh()}
                    disabled={refreshing}
                    className="inline-flex items-center gap-2 rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] px-4 py-2 text-sm font-semibold text-[var(--app-text)] transition-colors hover:bg-[var(--app-surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-400)]"
                  >
                    <RefreshCw
                      className={cx('h-4 w-4', refreshing && 'animate-spin')}
                      aria-hidden="true"
                    />
                    Check again
                  </button>
                  <Link
                    to="/menu"
                    className="inline-flex items-center gap-2 rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface)] px-4 py-2 text-sm font-semibold text-[var(--app-text)] transition-colors hover:bg-[var(--app-surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-400)]"
                  >
                    Browse menu
                    <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </div>
              </div>
            )}
          </div>
        </section>

      </div>
    </main>
  );
}