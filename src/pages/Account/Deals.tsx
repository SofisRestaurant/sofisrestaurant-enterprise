// PATH: src/pages/Account/Deals.tsx
// =============================================================================
// ACCOUNT • DEALS — Production (2026)
// =============================================================================
// Purpose:
// - Customer-facing “Deals” page under Account
// - Shows active promos/specials with search + filters
// - Safe + defensive against partial/unknown data
// - No business-truth on client: this is informational UI only
//
// Assumptions (repo-compatible):
// - Supabase client exists at: "@/lib/supabase/supabaseClient"
// - Promotions live in public table "promotions" with common fields:
//   id, code, active, type, value, min_order_cents, starts_at, ends_at, expires_at,
//   max_uses, current_uses, title, description, banner_text, image_url
//
// If your promotions table differs, adjust the SELECT list only.
// =============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { BadgeDollarSign, Copy, Search, Tag, X } from 'lucide-react'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { supabase } from '@/lib/supabase/supabaseClient'
import Spinner from '@/components/ui/Spinner'
import { Button } from '@/components/ui/Button'

type PromoType = 'percent' | 'fixed' | 'unknown'

type Deal = {
  id: string
  code: string | null
  title: string
  description: string | null
  bannerText: string | null
  imageUrl: string | null
  type: PromoType
  value: number | null
  minOrderCents: number | null
  startsAt: string | null
  endsAt: string | null
  expiresAt: string | null
  maxUses: number | null
  currentUses: number | null
  active: boolean
}

type DealsFilterState = {
  q: string
  showExpired: boolean
  type: 'any' | 'percent' | 'fixed'
  minOrder: 'any' | 'under25' | 'under50' | '50plus'
}

function cx(...c: Array<string | false | null | undefined>) {
  return c.filter(Boolean).join(' ')
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function safeString(v: unknown, max = 500): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  if (!s) return null
  return s.length > max ? s.slice(0, max) : s
}

function safeBool(v: unknown): boolean {
  return v === true
}

function safeNumber(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isFinite(n) ? n : null
}

function safeInt(v: unknown): number | null {
  const n = safeNumber(v)
  if (n == null) return null
  return Math.trunc(n)
}

function safeCents(v: unknown): number | null {
  const n = safeNumber(v)
  if (n == null) return null
  const c = Math.round(n)
  return c >= 0 ? c : 0
}

function formatCents(cents: number): string {
  const safe = Number.isFinite(cents) ? cents : 0
  return (safe / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

function formatDateTime(iso: string | null): string | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return null
  return new Date(t).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function isExpired(nowMs: number, endsAt: string | null, expiresAt: string | null): boolean {
  const end = endsAt ? new Date(endsAt).getTime() : NaN
  const exp = expiresAt ? new Date(expiresAt).getTime() : NaN
  const t = Number.isFinite(exp) ? exp : Number.isFinite(end) ? end : NaN
  if (!Number.isFinite(t)) return false
  return t < nowMs
}

function inferPromoType(typeRaw: unknown): PromoType {
  const s = typeof typeRaw === 'string' ? typeRaw.trim().toLowerCase() : ''
  if (s === 'percent') return 'percent'
  if (s === 'fixed') return 'fixed'
  return 'unknown'
}

function dealFromRow(row: unknown): Deal | null {
  if (!isRecord(row)) return null

  const id = safeString(row.id, 128)
  if (!id) return null

  const code = safeString(row.code, 64)
  const title =
    safeString(row.title, 140) ??
    safeString(row.banner_text, 140) ??
    (code ? `Promo: ${code}` : 'Special Offer')

  return {
    id,
    code,
    title,
    description: safeString(row.description, 800),
    bannerText: safeString(row.banner_text, 160),
    imageUrl: safeString(row.image_url, 1000),
    type: inferPromoType(row.type),
    value: safeNumber(row.value),
    minOrderCents: safeCents(row.min_order_cents),
    startsAt: safeString(row.starts_at, 64),
    endsAt: safeString(row.ends_at, 64),
    expiresAt: safeString(row.expires_at, 64),
    maxUses: safeInt(row.max_uses),
    currentUses: safeInt(row.current_uses),
    active: safeBool(row.active),
  }
}

function matchesQuery(d: Deal, q: string): boolean {
  const needle = q.trim().toLowerCase()
  if (!needle) return true
  const hay = [
    d.title,
    d.code ?? '',
    d.bannerText ?? '',
    d.description ?? '',
    d.type,
  ]
    .join(' ')
    .toLowerCase()
  return hay.includes(needle)
}

function typeLabel(d: Deal): string {
  if (d.type === 'percent' && d.value != null) return `${Math.max(0, Math.min(100, d.value))}% OFF`
  if (d.type === 'fixed' && d.value != null) return `${formatCents(Math.max(0, Math.round(d.value)))} OFF`
  return 'Special'
}

function minOrderLabel(minOrderCents: number | null): string | null {
  if (minOrderCents == null || minOrderCents <= 0) return null
  return `Min order ${formatCents(minOrderCents)}`
}

function usageLabel(d: Deal): string | null {
  if (d.maxUses == null || d.currentUses == null) return null
  if (!Number.isFinite(d.maxUses) || d.maxUses <= 0) return null
  const used = Math.max(0, Math.min(d.maxUses, d.currentUses))
  return `${used}/${d.maxUses} used`
}

export default function Deals() {
  const mountedRef = useRef(true)

  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [deals, setDeals] = useState<Deal[]>([])

  const [filters, setFilters] = useState<DealsFilterState>({
    q: '',
    showExpired: false,
    type: 'any',
    minOrder: 'any',
  })

  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const loadDeals = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      // Keep SELECT list conservative + safe. Adjust if your schema differs.
      const { data, error: dbErr } = await supabase
        .from('promotions')
        .select(
          'id, code, active, type, value, min_order_cents, starts_at, ends_at, expires_at, max_uses, current_uses, title, description, banner_text, image_url',
        )
        .order('starts_at', { ascending: false })
        .limit(200)

      if (dbErr) throw new Error(dbErr.message)

      const rows = Array.isArray(data) ? data : []
      const parsed = rows.map(dealFromRow).filter((x): x is Deal => Boolean(x))

      if (!mountedRef.current) return
      setDeals(parsed)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load deals'
      if (!mountedRef.current) return
      setError(msg)
      setDeals([])
    } finally {
      if (!mountedRef.current) return
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadDeals()
  }, [loadDeals])

  const nowMs = Date.now()

  const filtered = useMemo(() => {
    const q = filters.q
    const wantExpired = filters.showExpired

    let list = deals.slice()

    // Active window filtering (client-side display only)
    list = list.filter((d) => {
      const startsOk = d.startsAt ? new Date(d.startsAt).getTime() <= nowMs : true
      const expired = isExpired(nowMs, d.endsAt, d.expiresAt)
      const activeFlag = d.active === true

      if (!wantExpired) {
        // show only active-ish deals by default
        return activeFlag && startsOk && !expired
      }

      // show everything if asked (still prefer active first)
      return startsOk || activeFlag || expired
    })

    if (filters.type !== 'any') {
      list = list.filter((d) => d.type === filters.type)
    }

    if (filters.minOrder !== 'any') {
      list = list.filter((d) => {
        const min = d.minOrderCents ?? 0
        if (filters.minOrder === 'under25') return min > 0 && min < 2500
        if (filters.minOrder === 'under50') return min > 0 && min < 5000
        return min >= 5000
      })
    }

    list = list.filter((d) => matchesQuery(d, q))

    // Stable sort: active first, then nearest ending, then title
    list.sort((a, b) => {
      const aExp = isExpired(nowMs, a.endsAt, a.expiresAt)
      const bExp = isExpired(nowMs, b.endsAt, b.expiresAt)
      if (aExp !== bExp) return aExp ? 1 : -1

      const aEnd = a.expiresAt ?? a.endsAt ?? ''
      const bEnd = b.expiresAt ?? b.endsAt ?? ''
      const ta = aEnd ? new Date(aEnd).getTime() : Number.POSITIVE_INFINITY
      const tb = bEnd ? new Date(bEnd).getTime() : Number.POSITIVE_INFINITY
      if (ta !== tb) return ta - tb

      return a.title.localeCompare(b.title)
    })

    return list
  }, [deals, filters, nowMs])

  const clearSearch = useCallback(() => {
    setFilters((p) => ({ ...p, q: '' }))
  }, [])

  const clearAll = useCallback(() => {
    setFilters({ q: '', showExpired: false, type: 'any', minOrder: 'any' })
  }, [])

  const copyCode = useCallback(async (deal: Deal) => {
    if (!deal.code) return
    try {
      await navigator.clipboard.writeText(deal.code)
      setCopiedId(deal.id)
      window.setTimeout(() => setCopiedId((prev) => (prev === deal.id ? null : prev)), 1200)
    } catch {
      // ignore (clipboard may be blocked); still provide visual feedback
      setCopiedId(deal.id)
      window.setTimeout(() => setCopiedId((prev) => (prev === deal.id ? null : prev)), 1200)
    }
  }, [])

  const hasActiveFilters = useMemo(() => {
    return (
      filters.q.trim().length > 0 ||
      filters.showExpired ||
      filters.type !== 'any' ||
      filters.minOrder !== 'any'
    )
  }, [filters])

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8">
      <header className="mb-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-neutral-900">Deals</h1>
            <p className="mt-1 text-sm text-neutral-600">
              Specials and promo codes you can use at checkout.
            </p>
          </div>
          <div className="shrink-0">
            <Button variant="secondary" onClick={loadDeals}>
              Refresh
            </Button>
          </div>
        </div>

        {/* Search + filters */}
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="relative">
            <label className="sr-only" htmlFor="deals-search">
              Search deals
            </label>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              id="deals-search"
              type="search"
              value={filters.q}
              onChange={(e) => setFilters((p) => ({ ...p, q: e.target.value }))}
              placeholder="Search deals (tuesday, happy hour, 10OFF...)"
              className={cx(
                'w-full rounded-xl border border-neutral-300 bg-white px-10 py-2.5 text-sm text-neutral-900',
                'outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20',
              )}
              autoComplete="off"
            />
            {filters.q.trim() ? (
              <button
                type="button"
                onClick={clearSearch}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="sr-only" htmlFor="deals-type">
                Deal type
              </label>
              <select
                id="deals-type"
                value={filters.type}
                onChange={(e) =>
                  setFilters((p) => ({ ...p, type: e.target.value as DealsFilterState['type'] }))
                }
                className={cx(
                  'w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900',
                  'outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20',
                )}
              >
                <option value="any">Any type</option>
                <option value="percent">Percent off</option>
                <option value="fixed">Dollar off</option>
              </select>
            </div>

            <div>
              <label className="sr-only" htmlFor="deals-minorder">
                Minimum order
              </label>
              <select
                id="deals-minorder"
                value={filters.minOrder}
                onChange={(e) =>
                  setFilters((p) => ({
                    ...p,
                    minOrder: e.target.value as DealsFilterState['minOrder'],
                  }))
                }
                className={cx(
                  'w-full rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900',
                  'outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20',
                )}
              >
                <option value="any">Any min</option>
                <option value="under25">Under $25</option>
                <option value="under50">Under $50</option>
                <option value="50plus">$50+</option>
              </select>
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 text-sm text-neutral-700">
            <input
              type="checkbox"
              checked={filters.showExpired}
              onChange={(e) => setFilters((p) => ({ ...p, showExpired: e.target.checked }))}
              className="h-4 w-4 rounded border-neutral-300 text-amber-500 focus:ring-amber-500"
            />
            Show expired
          </label>

          {hasActiveFilters ? (
            <button
              type="button"
              onClick={clearAll}
              className="text-sm font-semibold text-neutral-700 underline decoration-neutral-300 underline-offset-4 hover:text-neutral-900"
            >
              Clear filters
            </button>
          ) : null}

          <div className="ml-auto text-xs text-neutral-500">
            {loading ? 'Loading…' : `${filtered.length} deal${filtered.length === 1 ? '' : 's'}`}
          </div>
        </div>
      </header>

      {error ? (
        <div className="mb-4">
          <ErrorBanner message={error} />
        </div>
      ) : null}

      {loading ? (
        <section aria-label="Loading deals" className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-neutral-600">
            <Spinner size="sm" />
            Loading deals…
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-32 animate-pulse rounded-2xl border border-neutral-200 bg-white"
              />
            ))}
          </div>
        </section>
      ) : filtered.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-neutral-300 bg-white p-10 text-center">
          <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50">
            <BadgeDollarSign className="h-6 w-6 text-amber-600" aria-hidden="true" />
          </div>
          <h2 className="text-lg font-semibold text-neutral-900">No deals found</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Try adjusting your filters, or check back later.
          </p>
          <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button variant="secondary" onClick={clearAll}>
              Reset filters
            </Button>
            <Link
              to="/menu"
              className="rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800"
            >
              Browse menu
            </Link>
          </div>
        </section>
      ) : (
        <section aria-label="Deals list" className="grid gap-3 sm:grid-cols-2">
          {filtered.map((d) => {
            const exp = isExpired(nowMs, d.endsAt, d.expiresAt)
            const starts = formatDateTime(d.startsAt)
            const ends = formatDateTime(d.expiresAt ?? d.endsAt)
            const minOrder = minOrderLabel(d.minOrderCents)
            const usage = usageLabel(d)

            return (
              <article
                key={d.id}
                className={cx(
                  'relative overflow-hidden rounded-2xl border bg-white p-5 shadow-sm',
                  exp ? 'border-neutral-200 opacity-80' : 'border-amber-200',
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cx(
                          'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold',
                          exp ? 'bg-neutral-100 text-neutral-700' : 'bg-amber-100 text-amber-900',
                        )}
                      >
                        <Tag className="h-3 w-3" aria-hidden="true" />
                        {typeLabel(d)}
                      </span>

                      {d.bannerText ? (
                        <span className="inline-flex items-center rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-semibold text-neutral-700">
                          {d.bannerText}
                        </span>
                      ) : null}

                      {exp ? (
                        <span className="inline-flex items-center rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-semibold text-neutral-700">
                          Expired
                        </span>
                      ) : null}
                    </div>

                    <h3 className="mt-2 truncate text-base font-bold text-neutral-900">{d.title}</h3>
                    {d.description ? (
                      <p className="mt-1 line-clamp-2 text-sm text-neutral-600">{d.description}</p>
                    ) : null}
                  </div>

                  {d.code ? (
                    <div className="shrink-0 text-right">
                      <p className="text-[11px] font-semibold text-neutral-500">Code</p>
                      <button
                        type="button"
                        onClick={() => void copyCode(d)}
                        className={cx(
                          'mt-1 inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold',
                          'border-neutral-200 bg-white text-neutral-900 hover:bg-neutral-50',
                          'focus:outline-none focus:ring-2 focus:ring-amber-500/20',
                        )}
                        aria-label={`Copy promo code ${d.code}`}
                      >
                        <span className="font-mono tracking-wide">{d.code}</span>
                        <Copy className="h-4 w-4 text-neutral-500" aria-hidden="true" />
                      </button>
                      {copiedId === d.id ? (
                        <p className="mt-1 text-[11px] font-semibold text-emerald-600">Copied</p>
                      ) : (
                        <p className="mt-1 text-[11px] text-neutral-500">Tap to copy</p>
                      )}
                    </div>
                  ) : null}
                </div>

                <div className="mt-4 grid gap-2 text-xs text-neutral-600 sm:grid-cols-2">
                  <div className="rounded-xl bg-neutral-50 p-3">
                    <p className="text-[11px] font-semibold text-neutral-700">Eligibility</p>
                    <p className="mt-1">
                      {minOrder ?? 'No minimum order'}
                      {usage ? ` • ${usage}` : ''}
                    </p>
                    <p className="mt-1 text-[11px] text-neutral-500">
                      Discounts are verified server-side at checkout.
                    </p>
                  </div>

                  <div className="rounded-xl bg-neutral-50 p-3">
                    <p className="text-[11px] font-semibold text-neutral-700">Timing</p>
                    <p className="mt-1">
                      {starts ? `Starts ${starts}` : 'Starts anytime'}
                      {ends ? ` • Ends ${ends}` : ''}
                    </p>
                    <p className="mt-1 text-[11px] text-neutral-500">
                      If a deal doesn’t apply, Stripe shows the final total.
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <Link
                    to="/checkout"
                    className={cx(
                      'inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold',
                      exp ? 'bg-neutral-200 text-neutral-700' : 'bg-neutral-900 text-white hover:bg-neutral-800',
                    )}
                    aria-disabled={exp ? 'true' : 'false'}
                    onClick={(e) => {
                      // If expired, don’t send them to checkout from this card.
                      if (exp) e.preventDefault()
                    }}
                  >
                    {exp ? 'Expired' : 'Use at checkout'}
                  </Link>

                  <Link
                    to="/menu"
                    className="text-center text-sm font-semibold text-neutral-700 underline decoration-neutral-300 underline-offset-4 hover:text-neutral-900"
                  >
                    Browse menu
                  </Link>
                </div>

                <span
                  aria-hidden="true"
                  className={cx(
                    'pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full blur-2xl',
                    exp ? 'bg-neutral-200/40' : 'bg-amber-200/60',
                  )}
                />
              </article>
            )
          })}
        </section>
      )}

      <footer className="mt-10 rounded-2xl border border-neutral-200 bg-white p-5">
        <p className="text-xs text-neutral-600">
          Tip: If your promo code doesn’t apply, it usually means the deal conditions weren’t met
          (minimum order, timing, or item restrictions). Your final total is always confirmed on the
          Stripe checkout screen.
        </p>
      </footer>
    </main>
  )
}