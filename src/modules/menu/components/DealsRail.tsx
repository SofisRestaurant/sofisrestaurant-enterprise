import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight,
  BadgeDollarSign,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Sparkles,
  Tag,
} from 'lucide-react';

export type CampaignLike = {
  id: string;
  campaign_name: string;
  hero_title?: string | null;
  hero_subtitle?: string | null;
  badge?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  cta_label?: string | null;
  deep_link?: string | null;
  is_featured?: boolean | null;
  menu_item_id?: string | null;
  placement?: string | null;
};

export type DealCard = {
  id: string;
  title: string;
  subtitle?: string | null;
  badge?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  ctaLabel?: string | null;
  deepLink?: string | null;
  featured?: boolean;
  menuItemId?: string | null;
  placement?: string | null;
};

export type DealsRailProps = {
  deals: DealCard[];
  onSelect?: (dealId: string) => void;
  onActivateDeal?: (deal: DealCard) => void;
  onNavigate?: (deepLink: string, deal: DealCard) => void;
  onViewAll?: () => void;
  /** Called when a deal card is clicked — use for analytics/event tracking */
  onTrackActivation?: (dealId: string, placement: string | null | undefined) => void;
  /** Called when a deal card enters the viewport — use for impression tracking */
  onTrackImpression?: (dealId: string, placement: string | null | undefined) => void;
  className?: string;
  loading?: boolean;
  emptyHint?: string;
  emptyTitle?: string;
  ariaLabel?: string;
  title?: string;
  subtitle?: string;
  viewAllLabel?: string;
  loadingLabel?: string;
  selectedDealId?: string | null;
};

// ── Stable skeleton keys — avoids react/no-array-index-key ────────────────────

const SKELETON_KEYS = ['deal-sk-0', 'deal-sk-1', 'deal-sk-2', 'deal-sk-3'] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

function safeDateLabel(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const timestamp = Date.parse(iso);
  if (!Number.isFinite(timestamp)) return null;
  return DATE_TIME_FORMATTER.format(new Date(timestamp));
}

function formatScheduleLabel(
  startsAt: string | null | undefined,
  endsAt: string | null | undefined,
): string | null {
  const starts = safeDateLabel(startsAt);
  const ends = safeDateLabel(endsAt);

  if (starts && ends) return `Starts ${starts} • Ends ${ends}`;
  if (starts) return `Starts ${starts}`;
  if (ends) return `Ends ${ends}`;
  return null;
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function getSafeHref(value: string | null | undefined): string | null {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2048) return null;
  for (let i = 0; i < trimmed.length; i++) {
    const code = trimmed.charCodeAt(i);

    // Control chars: 0–31 and 127
    if ((code >= 0 && code <= 31) || code === 127) {
      return null;
    }
  }

  if (trimmed.includes('\\')) return null;

  try {
    const url = new URL(trimmed);
    if (url.protocol === 'https:' || url.protocol === 'http:') return url.toString();
    return null;
  } catch {
    return null;
  }
}

// ── Horizontal rail hook ───────────────────────────────────────────────────────

function useHorizontalRail(itemCount: number) {
  const railRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);

  const updateScrollState = useCallback(() => {
    const rail = railRef.current;
    if (!rail) {
      setCanScrollPrev(false);
      setCanScrollNext(false);
      return;
    }

    const maxScrollLeft = Math.max(rail.scrollWidth - rail.clientWidth, 0);
    const currentScrollLeft = Math.max(rail.scrollLeft, 0);

    setCanScrollPrev(currentScrollLeft > 4);
    setCanScrollNext(currentScrollLeft < maxScrollLeft - 4);
  }, []);

  const scheduleUpdate = useCallback(() => {
    if (typeof window === 'undefined') {
      updateScrollState();
      return;
    }

    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
    }

    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      updateScrollState();
    });
  }, [updateScrollState]);

  const scrollByAmount = useCallback((delta: number) => {
    const rail = railRef.current;
    if (!rail) return;
    rail.scrollBy({ left: delta, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }, []);

  const scrollToStart = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    rail.scrollTo({ left: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }, []);

  const scrollToEnd = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    rail.scrollTo({ left: rail.scrollWidth, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }, []);

  useEffect(() => {
    scheduleUpdate();
  }, [itemCount, scheduleUpdate]);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return undefined;

    const handleScroll = () => {
      scheduleUpdate();
    };

    rail.addEventListener('scroll', handleScroll, { passive: true });

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        scheduleUpdate();
      });
      resizeObserver.observe(rail);
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('resize', scheduleUpdate);
    }

    scheduleUpdate();

    return () => {
      rail.removeEventListener('scroll', handleScroll);
      resizeObserver?.disconnect();
      if (typeof window !== 'undefined') {
        window.removeEventListener('resize', scheduleUpdate);
        if (frameRef.current !== null) {
          window.cancelAnimationFrame(frameRef.current);
        }
      }
    };
  }, [scheduleUpdate]);

  return { railRef, canScrollPrev, canScrollNext, scrollByAmount, scrollToStart, scrollToEnd };
}

// ── Campaign → DealCard mappers ───────────────────────────────────────────────

export function campaignToDealCard(campaign: CampaignLike): DealCard {
  const title = campaign.hero_title?.trim() || campaign.campaign_name;
  return {
    id: campaign.id,
    title,
    subtitle: campaign.hero_subtitle ?? null,
    badge: campaign.badge ?? null,
    startsAt: campaign.starts_at ?? null,
    endsAt: campaign.ends_at ?? null,
    ctaLabel: campaign.cta_label ?? null,
    deepLink: campaign.deep_link ?? null,
    featured: Boolean(campaign.is_featured),
    menuItemId: campaign.menu_item_id ?? null,
    placement: campaign.placement ?? null,
  };
}

export function campaignsToDealCards(campaigns: CampaignLike[]): DealCard[] {
  return campaigns.map(campaignToDealCard);
}

// ── Component ─────────────────────────────────────────────────────────────────

function DealsRailImpl({
  deals,
  onSelect,
  onActivateDeal,
  onNavigate,
  onViewAll,
  className,
  loading = false,
  onTrackActivation,
  onTrackImpression,
  emptyHint = 'No active deals right now. Check back soon!',
  emptyTitle = 'No active deals',
  ariaLabel = 'Deals',
  title = 'Deals',
  subtitle = 'Limited-time specials & savings',
  viewAllLabel = 'View all',
  loadingLabel = 'Loading active deals',
  selectedDealId = null,
}: DealsRailProps) {
  const itemCount = Array.isArray(deals) ? deals.length : 0;
  const hasDeals = itemCount > 0;
  const { railRef, canScrollPrev, canScrollNext, scrollByAmount, scrollToStart, scrollToEnd } =
    useHorizontalRail(itemCount);

  const announcement = useMemo(() => {
    if (loading) return loadingLabel;
    if (!hasDeals) return emptyTitle;
    return `${itemCount} active deal${itemCount === 1 ? '' : 's'} available`;
  }, [emptyTitle, hasDeals, itemCount, loading, loadingLabel]);

  useEffect(() => {
    if (!hasDeals) return;
    scrollToStart();
  }, [deals, hasDeals, scrollToStart]);

  const handleDealActivation = useCallback(
    (deal: DealCard) => {
      onSelect?.(deal.id);
      onActivateDeal?.(deal);
      // Emit analytics event — wire to your analytics provider or Supabase event table
      onTrackActivation?.(deal.id, deal.placement);
    },
    [onActivateDeal, onSelect, onTrackActivation],
  );

  // Impression tracking via IntersectionObserver — uses the existing railRef
  const observedDeals = useRef<Map<string, boolean>>(new Map());

  useEffect(() => {
    if (!onTrackImpression || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const dealId = (entry.target as HTMLElement).dataset.dealId;
          const placement = (entry.target as HTMLElement).dataset.dealPlacement;
          if (!dealId || observedDeals.current.get(dealId)) continue;
          observedDeals.current.set(dealId, true);
          onTrackImpression(dealId, placement ?? null);
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.5 },
    );

    // Observe all deal cards in the rail
    const rail = railRef.current;
    if (rail) {
      for (const card of Array.from(rail.querySelectorAll('[data-deal-id]'))) {
        observer.observe(card);
      }
    }

    return () => observer.disconnect();
  }, [deals, onTrackImpression]);

  const renderCard = useCallback(
    (deal: DealCard) => {
      const scheduleLabel = formatScheduleLabel(deal.startsAt, deal.endsAt);
      const safeHref = getSafeHref(deal.deepLink);
      const isSelected = selectedDealId !== null && selectedDealId === deal.id;

      const sharedClassName = cx(
        'group relative flex h-full min-h-[160px] w-[18.5rem] shrink-0 snap-start flex-col justify-between overflow-hidden rounded-2xl border',
        deal.featured ? 'border-amber-400/35' : 'border-white/10',
        isSelected ? 'ring-2 ring-amber-400/35' : 'ring-0',
        'bg-linear-to-br from-neutral-950 via-neutral-900 to-neutral-900 p-4 text-left shadow-sm transition',
        'hover:border-amber-300/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/40',
      );

      const cardBody = (
        <>
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  {deal.featured ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/25 bg-amber-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-amber-200">
                      <Sparkles className="h-3 w-3" aria-hidden="true" />
                      Featured
                    </span>
                  ) : null}

                  {deal.badge ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-200">
                      <Tag className="h-3 w-3" aria-hidden="true" />
                      {deal.badge}
                    </span>
                  ) : null}
                </div>

                <p className="mt-3 line-clamp-2 text-sm font-semibold text-white">{deal.title}</p>

                {deal.subtitle ? (
                  <p className="mt-1 line-clamp-3 text-xs leading-5 text-neutral-400">
                    {deal.subtitle}
                  </p>
                ) : null}
              </div>

              {safeHref ? (
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-neutral-200 transition group-hover:border-amber-300/30 group-hover:text-amber-200">
                  <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                </span>
              ) : null}
            </div>

            {/* min-h-[20px] — arbitrary value requires bracket syntax */}
            <div className="min-h-20px">
              {scheduleLabel ? (
                <div className="flex items-center gap-2 text-[11px] text-neutral-400">
                  <Clock3 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span className="line-clamp-2">{scheduleLabel}</span>
                </div>
              ) : (
                <div className="text-[11px] text-neutral-500">Limited time</div>
              )}
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3">
            <span className="text-xs font-semibold text-amber-200">
              {deal.ctaLabel ?? 'See details'}
            </span>
            {deal.menuItemId ? (
              <span className="rounded-full bg-white/5 px-2 py-1 text-[10px] text-neutral-400">
                Menu linked
              </span>
            ) : null}
          </div>

          <span
            aria-hidden="true"
            className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-amber-500/10 blur-2xl transition group-hover:bg-amber-400/15"
          />
        </>
      );

      if (safeHref && !onSelect && !onActivateDeal) {
        return (
          <a
            href={safeHref}
            className={sharedClassName}
            aria-label={`Open deal: ${deal.title}`}
            onClick={(event) => {
              if (!onNavigate) return;
              event.preventDefault();
              onNavigate(safeHref, deal);
            }}
          >
            {cardBody}
          </a>
        );
      }

      return (
        <button
          type="button"
          className={sharedClassName}
          aria-label={`Open deal: ${deal.title}`}
          onClick={() => {
            handleDealActivation(deal);
            if (safeHref && onNavigate) {
              onNavigate(safeHref, deal);
            }
          }}
        >
          {cardBody}
        </button>
      );
    },
    [handleDealActivation, onActivateDeal, onNavigate, onSelect, selectedDealId],
  );

  return (
    <section className={cx('space-y-3', className)} aria-label={ariaLabel}>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>

      {/* Header row */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-amber-400/20 bg-amber-500/10 text-amber-300">
            <BadgeDollarSign className="h-5 w-5" aria-hidden="true" />
          </span>

          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{title}</p>
            <p className="truncate text-[11px] text-neutral-500">{subtitle}</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {onViewAll ? (
            <button
              type="button"
              onClick={onViewAll}
              className="rounded-xl px-3 py-2 text-xs font-semibold text-amber-200 transition hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/35"
            >
              {viewAllLabel}
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => scrollByAmount(-320)}
            disabled={!canScrollPrev}
            className={cx(
              'hidden rounded-xl border p-2 transition sm:inline-flex',
              canScrollPrev
                ? 'border-white/10 bg-white/5 text-neutral-100 hover:bg-white/10'
                : 'cursor-not-allowed border-white/5 bg-white/3 text-neutral-600',
            )}
            aria-label="Scroll deals left"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={() => scrollByAmount(320)}
            disabled={!canScrollNext}
            className={cx(
              'hidden rounded-xl border p-2 transition sm:inline-flex',
              canScrollNext
                ? 'border-white/10 bg-white/5 text-neutral-100 hover:bg-white/10'
                : 'cursor-not-allowed border-white/5 bg-white/3 text-neutral-600',
            )}
            aria-label="Scroll deals right"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Content states */}
      {loading ? (
        <div className="flex gap-3 overflow-hidden" aria-hidden="true">
          {SKELETON_KEYS.map((key) => (
            <div
              key={key}
              className="h-160px w-18.5rem shrink-0 animate-pulse rounded-2xl border border-white/10 bg-white/5"
            />
          ))}
        </div>
      ) : !hasDeals ? (
        <div
          className="rounded-2xl border border-white/10 bg-white/3 p-4"
          role="status"
          aria-live="polite"
        >
          <p className="text-sm font-medium text-white">{emptyTitle}</p>
          <p className="mt-1 text-sm text-neutral-400">{emptyHint}</p>
        </div>
      ) : (
        <div className="relative">
          <div
            ref={railRef}
            className={cx(
              'flex gap-3 overflow-x-auto pb-2 scroll-smooth snap-x snap-mandatory',
              'scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent',
            )}
            tabIndex={0}
            role="list"
            aria-label={`${ariaLabel} list`}
            onKeyDown={(event) => {
              if (event.key === 'ArrowLeft') {
                event.preventDefault();
                scrollByAmount(-240);
              } else if (event.key === 'ArrowRight') {
                event.preventDefault();
                scrollByAmount(240);
              } else if (event.key === 'Home') {
                event.preventDefault();
                scrollToStart();
              } else if (event.key === 'End') {
                event.preventDefault();
                scrollToEnd();
              }
            }}
          >
            {deals.map((deal) => (
              <div
                key={deal.id}
                role="listitem"
                className="shrink-0"
                data-deal-id={deal.id}
                data-deal-placement={deal.placement ?? undefined}
              >
                {renderCard(deal)}
              </div>
            ))}
          </div>

          {/* Scroll fade overlays */}
          <div
            aria-hidden="true"
            className={cx(
              'pointer-events-none absolute inset-y-0 left-0 w-8 bg-linear-to-r from-neutral-950 to-transparent transition-opacity',
              canScrollPrev ? 'opacity-100' : 'opacity-0',
            )}
          />
          <div
            aria-hidden="true"
            className={cx(
              'pointer-events-none absolute inset-y-0 right-0 w-8 bg-linear-to-l from-neutral-950 to-transparent transition-opacity',
              canScrollNext ? 'opacity-100' : 'opacity-0',
            )}
          />
        </div>
      )}
    </section>
  );
}

export const DealsRail = memo(DealsRailImpl);
export default DealsRail;