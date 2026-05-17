// =============================================================================
// src/modules/menu/components/PopularRail.tsx
// =============================================================================
// POPULAR RAIL — 2026 (CLS-safe)
// =============================================================================
//
// PERFORMANCE FIXES:
//   1. Removed animate-fade-rise entry animation — held cards at opacity 0
//      with up to 320ms staggered delay, blocking above-fold content.
//   2. Replaced nanoid() skeleton keys with stable indices — nanoid in render
//      generated new keys every re-render, causing React to remount skeletons.
//   3. Added min-h-[12rem] to section — prevents layout shift when the rail
//      first mounts with content, stabilizing the grid below it.
//   4. Skeleton count uses module-level constant array (no allocation in render).
//
// All type contracts, callbacks, visual design, and accessibility unchanged.
// =============================================================================

import React, { memo, useCallback, useEffect, useMemo, useRef } from 'react';
import { ChevronLeft, ChevronRight, Flame, Star } from 'lucide-react';

// ── Types (unchanged contracts) ───────────────────────────────────────────────

export type BaseItem = {
  id?: string;
  name?: string;
};

export type PopularRailProps<TItem extends BaseItem = BaseItem> = {
  items: TItem[];
  onOpenItem: (item: TItem) => void;
  getPriceCents: (item: TItem) => number;
  getAvailable: (item: TItem) => boolean;

  emptyHintActionLabel: string;
  onEmptyHintAction: () => void;

  className?: string;
  title?: string;
  subtitle?: string;
  maxItems?: number;
  loading?: boolean;
  ariaLabel?: string;
};

export type Props = PopularRailProps<BaseItem>;

// ── Constants ─────────────────────────────────────────────────────────────────

/** Stable keys for skeleton cards — never changes between renders. */
const SKELETON_KEYS = ['skel-0', 'skel-1', 'skel-2', 'skel-3'] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function cx(...c: Array<string | false | null | undefined>) {
  return c.filter(Boolean).join(' ');
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function safeStr(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function safeId(item: BaseItem, idx: number): string {
  const id = safeStr(item?.id, '').trim();
  if (id) return id;
  const name = safeStr(item?.name, '').trim();
  return name ? `name:${name}:${idx}` : `idx:${idx}`;
}

function formatCents(cents: number): string {
  const n = Number.isFinite(cents) ? Math.max(0, Math.round(cents)) : 0;
  return (n / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

// ── Rail scroll hook ──────────────────────────────────────────────────────────

function useHorizontalRail() {
  const ref = useRef<HTMLDivElement | null>(null);

  const scrollBy = useCallback((dx: number) => {
    ref.current?.scrollBy({ left: dx, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }, []);

  const scrollToStart = useCallback(() => {
    ref.current?.scrollTo({ left: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }, []);

  return { ref, scrollBy, scrollToStart };
}

// ── Skeleton card ─────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div
      className="h-[8.5rem] w-56 shrink-0 rounded-2xl border border-white/[0.05] bg-gradient-to-br from-white/[0.03] to-white/[0.02] animate-pulse"
      aria-hidden="true"
    />
  );
}

// ── Popular item card ─────────────────────────────────────────────────────────

type PopularCardProps = {
  name: string;
  priceCents: number;
  available: boolean;
  onClick: () => void;
};

function PopularCard({ name, priceCents, available, onClick }: PopularCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!available}
      className={cx(
        'group relative w-56 shrink-0 overflow-hidden rounded-2xl border text-left',
        'transition-all duration-300',
        available
          ? cx(
              'border-white/[0.08] bg-[#1e1b16]',
              'hover:border-amber-400/[0.22] hover:shadow-[0_8px_32px_rgb(0_0_0/0.40),_0_0_24px_rgb(212_175_55/0.08)]',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/30',
              'active:scale-[0.97]',
            )
          : 'cursor-not-allowed border-white/[0.05] bg-[#19170f] opacity-55',
      )}
      role="listitem"
      aria-label={`${name}${available ? '' : ', unavailable'} — ${formatCents(priceCents)}`}
    >
      {/* Warm ambient shimmer — appears on hover */}
      {available && (
        <div
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
          aria-hidden="true"
        >
          <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-amber-400/[0.07] blur-2xl" />
          <div className="absolute -bottom-6 -left-6 h-20 w-20 rounded-full bg-amber-600/[0.05] blur-xl" />
        </div>
      )}

      {/* Inner ring — appears on hover */}
      <div
        className={cx(
          'pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset transition-all duration-300',
          available ? 'ring-white/[0.04] group-hover:ring-amber-400/[0.12]' : 'ring-white/[0.03]',
        )}
        aria-hidden="true"
      />

      {/* Card content */}
      <div className="relative z-10 p-4">
        {/* Name + badge row */}
        <div className="flex items-start justify-between gap-2">
          <p
            className={cx(
              'truncate text-sm font-semibold leading-snug',
              available ? 'text-white' : 'text-zinc-400',
            )}
          >
            {name}
          </p>
          <span
            className={cx(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider flex-shrink-0',
              available
                ? 'bg-amber-400/[0.10] text-amber-300 ring-1 ring-amber-400/[0.18]'
                : 'bg-white/[0.04] text-zinc-600',
            )}
          >
            <Flame className="h-2.5 w-2.5" aria-hidden="true" />
            {available ? 'Popular' : 'Sold out'}
          </span>
        </div>

        {/* Price */}
        <p
          className={cx(
            'mt-2 text-base font-bold tabular-nums',
            available ? 'text-amber-300/80' : 'text-zinc-600',
          )}
        >
          {formatCents(priceCents)}
        </p>

        {/* CTA hint */}
        <div className="mt-3 flex items-center gap-1.5">
          {available ? (
            <>
              <div
                className={cx(
                  'h-1.5 w-1.5 rounded-full bg-green-400/70 transition-all duration-300',
                  'group-hover:bg-green-400 group-hover:shadow-[0_0_6px_rgb(74_222_128/0.6)]',
                )}
                aria-hidden="true"
              />
              <span className="text-[10px] text-zinc-500 group-hover:text-zinc-400 transition-colors duration-300">
                Tap to customize
              </span>
            </>
          ) : (
            <span className="text-[10px] text-red-400/60">Out of stock</span>
          )}
        </div>
      </div>
    </button>
  );
}

// ── Scroll arrow button ───────────────────────────────────────────────────────

function ScrollArrow({ direction, onClick }: { direction: 'left' | 'right'; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'hidden sm:inline-flex items-center justify-center',
        'h-8 w-8 rounded-xl',
        'border border-white/[0.10] bg-white/[0.04]',
        'text-zinc-400 transition-all duration-200',
        'hover:border-white/[0.18] hover:bg-white/[0.08] hover:text-white',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/30',
        'active:scale-90',
      )}
      aria-label={`Scroll popular items ${direction}`}
    >
      {direction === 'left' ? (
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
      ) : (
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      )}
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

function PopularRailImpl<TItem extends BaseItem>({
  items,
  onOpenItem,
  getPriceCents,
  getAvailable,
  emptyHintActionLabel,
  onEmptyHintAction,
  className,
  title = 'Popular',
  subtitle = 'Fan favorites and top picks',
  maxItems = 12,
  loading = false,
  ariaLabel = 'Popular items',
}: PopularRailProps<TItem>): React.ReactElement | null {
  const { ref, scrollBy, scrollToStart } = useHorizontalRail();

  const list = useMemo(() => {
    const arr = Array.isArray(items) ? items : [];
    const cap = Math.max(0, Math.min(maxItems, 50));
    return arr.slice(0, cap);
  }, [items, maxItems]);

  const hasItems = list.length > 0;

  useEffect(() => {
    if (hasItems) scrollToStart();
  }, [hasItems, list.length, scrollToStart]);

  // ── CLS FIX: min-h-[12rem] reserves stable space so the grid ──
  // ── below does not shift when this section mounts or transitions ──
  // ── between loading / empty / loaded states.                      ──

  return (
    <section className={cx('min-h-[12rem] space-y-4', className)} aria-label={ariaLabel}>
      {/* ── Section header ── */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {/* Icon */}
          <div className="relative flex-shrink-0">
            <div className="h-9 w-9 rounded-xl bg-amber-400/[0.10] ring-1 ring-amber-400/[0.20] flex items-center justify-center">
              <Star className="h-4 w-4 text-amber-300" aria-hidden="true" />
            </div>
            {/* Ambient glow behind icon */}
            <div
              className="pointer-events-none absolute inset-0 rounded-xl bg-amber-400/20 blur-lg opacity-40"
              aria-hidden="true"
            />
          </div>

          <div className="min-w-0">
            <p className="text-sm font-bold text-white leading-none">{title}</p>
            <p className="mt-1 text-[11px] text-zinc-500">{subtitle}</p>
          </div>
        </div>

        {/* Scroll arrows */}
        {hasItems && (
          <div className="flex items-center gap-1.5">
            <ScrollArrow direction="left" onClick={() => scrollBy(-360)} />
            <ScrollArrow direction="right" onClick={() => scrollBy(360)} />
          </div>
        )}
      </div>

      {/* ── Rail ── */}
      {loading ? (
        <div className="flex gap-3 overflow-hidden" aria-hidden="true">
          {SKELETON_KEYS.map((key) => (
            <SkeletonCard key={key} />
          ))}
        </div>
      ) : !hasItems ? (
        /* Empty state */
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white">Nothing trending yet</p>
              <p className="mt-1 text-xs text-zinc-500 leading-relaxed">
                Browse the full menu or clear active filters.
              </p>
            </div>
            <button
              type="button"
              onClick={onEmptyHintAction}
              className="flex-shrink-0 rounded-xl border border-white/[0.10] bg-white/[0.05] px-3 py-2 text-xs font-semibold text-white transition-all hover:border-white/[0.18] hover:bg-white/[0.08] focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/30"
            >
              {emptyHintActionLabel}
            </button>
          </div>
        </div>
      ) : (
        /* Scrollable cards — no entry animation, renders immediately */
        <div
          ref={ref}
          className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1"
          style={{ scrollbarWidth: 'none' }}
          role="list"
          tabIndex={0}
          aria-label="Popular items list"
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') {
              e.preventDefault();
              scrollBy(-240);
            }
            if (e.key === 'ArrowRight') {
              e.preventDefault();
              scrollBy(240);
            }
            if (e.key === 'Home') {
              e.preventDefault();
              scrollToStart();
            }
          }}
        >
          {list.map((it, idx) => (
            <PopularCard
              key={safeId(it, idx)}
              name={safeStr(it?.name, 'Item')}
              priceCents={getPriceCents(it)}
              available={getAvailable(it)}
              onClick={() => onOpenItem(it)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// ── Exports ───────────────────────────────────────────────────────────────────

export function PopularRail<TItem extends BaseItem>(props: PopularRailProps<TItem>) {
  return <PopularRailImpl {...props} />;
}

const PopularRailMemo = memo(PopularRail) as unknown as (props: Props) => React.ReactElement | null;
export default PopularRailMemo;