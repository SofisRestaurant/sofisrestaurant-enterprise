// src/modules/menu/components/DealsRail.tsx
// ============================================================================
// DEALS RAIL — Production (2026) — Restaurant UX + Repo-Compatible Exports
// ----------------------------------------------------------------------------
// Fixes your TS import errors by exporting BOTH:
//   ✅ Named export: DealsRail
//   ✅ Default export: DealsRail
//
// Purpose:
// - Horizontally scrollable rail for active deals / specials / promos
// - Presentational only (parent owns data + actions)
// - A11y: focusable cards, aria labels, keyboard support, reduced motion-safe
// - Mobile-first: swipe scroll, snap-ish layout, clean empty/loading states
//
// Notes:
// - This component DOES NOT assume business truth.
// - If you need to “activate” a deal, parent decides what that means (filter, open modal, etc).
// ============================================================================

import React, { memo, useCallback, useEffect, useMemo, useRef } from 'react'
import { BadgeDollarSign, ChevronLeft, ChevronRight, Clock, Tag } from 'lucide-react'

export type DealCard = {
  id: string
  title: string
  subtitle?: string | null
  badge?: string | null // e.g., "Happy Hour", "2$ Tuesday", "Bundle"
  startsAt?: string | null // ISO
  endsAt?: string | null // ISO
  ctaLabel?: string | null // e.g., "Apply", "See details"
}

export type DealsRailProps = {
  deals: DealCard[]
  onSelect?: (dealId: string) => void
  onViewAll?: () => void
  className?: string

  // Optional UX knobs
  loading?: boolean
  emptyHint?: string
  ariaLabel?: string
}

function cx(...c: Array<string | false | null | undefined>) {
  return c.filter(Boolean).join(' ')
}

function safeDateLabel(iso: string | null | undefined): string | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return null
  const d = new Date(t)
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

function useHorizontalRail() {
  const ref = useRef<HTMLDivElement | null>(null)

  const scrollBy = useCallback((dx: number) => {
    const el = ref.current
    if (!el) return
    el.scrollBy({
      left: dx,
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    })
  }, [])

  const scrollToStart = useCallback(() => {
    const el = ref.current
    if (!el) return
    el.scrollTo({ left: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  }, [])

  return { ref, scrollBy, scrollToStart }
}

function DealsRailImpl({
  deals,
  onSelect,
  onViewAll,
  className,
  loading = false,
  emptyHint,
  ariaLabel = 'Deals',
}: DealsRailProps) {
  const { ref, scrollBy, scrollToStart } = useHorizontalRail()

  const hasDeals = Array.isArray(deals) && deals.length > 0

  // If deals change (e.g., filter refresh), gently reset scroll so user sees new content.
  useEffect(() => {
    if (!hasDeals) return
    scrollToStart()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasDeals, deals.length])

  const headerRight = useMemo(() => {
    return (
      <div className="flex items-center gap-2">
        {onViewAll ? (
          <button
            type="button"
            onClick={onViewAll}
            className={cx(
              'rounded-lg px-2 py-1 text-xs font-semibold',
              'text-amber-200 hover:bg-white/8',
              'focus:outline-none focus:ring-2 focus:ring-amber-500/25',
            )}
          >
            View all
          </button>
        ) : null}

        <button
          type="button"
          onClick={() => scrollBy(-360)}
          className={cx(
            'hidden sm:inline-flex',
            'rounded-lg border border-white/10 bg-white/5 p-2 text-neutral-200',
            'hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-amber-500/25',
          )}
          aria-label="Scroll deals left"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>

        <button
          type="button"
          onClick={() => scrollBy(360)}
          className={cx(
            'hidden sm:inline-flex',
            'rounded-lg border border-white/10 bg-white/5 p-2 text-neutral-200',
            'hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-amber-500/25',
          )}
          aria-label="Scroll deals right"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    )
  }, [onViewAll, scrollBy])

  return (
    <section className={cx('space-y-3', className)} aria-label={ariaLabel}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/15 ring-1 ring-amber-500/25">
            <BadgeDollarSign className="h-4 w-4 text-amber-300" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white">Deals</p>
            <p className="text-[11px] text-neutral-500">Limited-time specials & savings</p>
          </div>
        </div>
        {headerRight}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex gap-3 overflow-hidden" aria-hidden="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-24 w-72 shrink-0 animate-pulse rounded-2xl border border-white/10 bg-white/5"
            />
          ))}
        </div>
      ) : !hasDeals ? (
        <div className="rounded-2xl border border-white/10 bg-white/3 p-4 text-sm text-neutral-400">
          {emptyHint ?? 'No active deals right now. Check back soon!'}
        </div>
      ) : (
        <div
          ref={ref}
          className={cx(
            'flex gap-3 overflow-x-auto pb-2',
            // keep it lightweight: scrollbar styling is optional and safe
            'scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent',
          )}
          role="list"
          tabIndex={0}
          aria-label="Deals list"
          onKeyDown={(e) => {
            // Keyboard-friendly rail
            if (e.key === 'ArrowLeft') {
              e.preventDefault()
              scrollBy(-240)
            }
            if (e.key === 'ArrowRight') {
              e.preventDefault()
              scrollBy(240)
            }
            if (e.key === 'Home') {
              e.preventDefault()
              scrollToStart()
            }
          }}
        >
          {deals.map((d) => {
            const starts = safeDateLabel(d.startsAt)
            const ends = safeDateLabel(d.endsAt)

            return (
              <button
                key={d.id}
                type="button"
                onClick={() => onSelect?.(d.id)}
                className={cx(
                  'group relative w-72 shrink-0 overflow-hidden rounded-2xl border border-amber-500/20',
                  'bg-linear-to-br from-amber-950/40 via-neutral-900 to-neutral-900',
                  'p-4 text-left shadow-sm transition',
                  'hover:border-amber-500/35 hover:bg-white/4',
                  'focus:outline-none focus:ring-2 focus:ring-amber-500/25',
                )}
                role="listitem"
                aria-label={`Deal: ${d.title}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{d.title}</p>
                    {d.subtitle ? (
                      <p className="mt-1 line-clamp-2 text-xs text-neutral-400">{d.subtitle}</p>
                    ) : null}
                  </div>

                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-1 text-[10px] font-bold text-amber-200">
                    <Tag className="h-3 w-3" aria-hidden="true" />
                    {d.badge ?? 'DEAL'}
                  </span>
                </div>

                {starts || ends ? (
                  <div className="mt-3 flex items-center gap-2 text-[11px] text-neutral-500">
                    <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="truncate">
                      {starts ? `Starts ${starts}` : ''}
                      {starts && ends ? ' • ' : ''}
                      {ends ? `Ends ${ends}` : ''}
                    </span>
                  </div>
                ) : (
                  <div className="mt-3 text-[11px] text-neutral-600">Limited time</div>
                )}

                <div className="mt-3">
                  <span className="text-xs font-semibold text-amber-200">{d.ctaLabel ?? 'See details'}</span>
                </div>

                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-amber-500/10 blur-2xl transition group-hover:bg-amber-500/15"
                />
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}

/**
 * ✅ Named export for: `import { DealsRail } from ...`
 * ✅ Default export for: `import DealsRail from ...`
 */
export const DealsRail = memo(DealsRailImpl)
export default DealsRail