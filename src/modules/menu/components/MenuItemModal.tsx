// =============================================================================
// src/modules/menu/components/MenuItemModal.tsx
// MENU ITEM MODAL — Production (2026)
// =============================================================================
// - Server-authoritative preflight (price/availability/max qty)
// - Abort + stale-response protection
// - Debounced preflight (spam-safe)
// - Strict runtime guards (no unsafe member access)
// - Add-to-cart is fail-closed unless preflight ok
// - Tailwind-safe classes (no invalid tokens)
// =============================================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase/supabaseClient'
import type { MenuItemPublic } from '@/domain/menu/menu.types'
import { useCart } from '@/modules/cart/hooks/useCart'

type CartPhase = 'idle' | 'adding' | 'success'

interface Props {
  item: MenuItemPublic
  onClose: () => void
}

type PreflightOk = {
  ok: true
  item_id: string
  available: boolean
  unit_price_cents: number
  stock_count: number | null
  low_stock_threshold: number | null
  max_qty: number
}

type PreflightErr = { ok: false; error: string }

type PreflightResponse = PreflightOk | PreflightErr
type UnknownRecord = Record<string, unknown>

function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function clampInt(n: unknown, min: number, max: number): number {
  const v = typeof n === 'number' ? n : typeof n === 'string' ? Number(n) : NaN
  if (!Number.isFinite(v)) return min
  return Math.max(min, Math.min(max, Math.trunc(v)))
}

function safeStr(v: unknown, fallback = '', max = 500): string {
  if (typeof v !== 'string') return fallback
  const s = v.trim()
  if (!s) return fallback
  return s.length > max ? s.slice(0, max) : s
}

function safeCents(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  if (!Number.isFinite(n)) return fallback
  return clampInt(Math.round(n), 0, 50_000_000)
}

function fmtUsdFromCents(cents: number): string {
  const c = safeCents(cents, 0)
  return (c / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function errMsg(e: unknown): string {
  if (e instanceof DOMException && e.name === 'AbortError') return 'aborted'
  if (e instanceof Error) return e.message
  return typeof e === 'string' ? e : 'Request failed'
}

/** Tight runtime guard for MenuItemPublic-ish objects. */
function isMenuItemPublic(v: unknown): v is MenuItemPublic {
  if (!isRecord(v)) return false
  return typeof v.id === 'string' && v.id.length > 0 && typeof v.name === 'string' && v.name.length > 0
}

export default function MenuItemModal({ item, onClose }: Props) {
  const { addItem } = useCart()

  // Fail-safe if a bad object was passed in.
  if (!isMenuItemPublic(item)) {
    return (
      <div className="p-6 text-white">
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-200">
          This item can’t be opened right now.
        </div>
      </div>
    )
  }

  // Treat props as untrusted at runtime (shape drift safe)
  const rec: UnknownRecord = isRecord(item) ? item : {}
  const id = safeStr(rec.id, '', 128)
  const name = safeStr(rec.name, 'Menu item', 120)

  const categoryLabel = safeStr(rec.category, 'menu', 40)
  const description = safeStr(rec.description, '', 1200)
  const imageUrl = typeof rec.image_url === 'string' ? rec.image_url : null

  const isPopular =
    rec.is_popular === true ||
    rec.isPopular === true ||
    (typeof rec.popularity_score === 'number' && Number.isFinite(rec.popularity_score) && rec.popularity_score >= 80)

  // UI state
  const [qty, setQty] = useState<number>(1)
  const [phase, setPhase] = useState<CartPhase>('idle')

  const [preflight, setPreflight] = useState<PreflightResponse | null>(null)
  const [preflightLoading, setPreflightLoading] = useState(false)
  const [preflightError, setPreflightError] = useState<string | null>(null)

  // timers + cancellation
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const addTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requestSeq = useRef(0)
  const abortRef = useRef<AbortController | null>(null)

  // Cleanup
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
      if (addTimer.current) clearTimeout(addTimer.current)
      if (successTimer.current) clearTimeout(successTimer.current)
    }
  }, [])

  // Server preflight (authoritative)
  const runPreflight = useCallback(
    async (requestedQty: number) => {
      if (!id) {
        setPreflight({ ok: false, error: 'Invalid item.' })
        setPreflightError('Invalid item.')
        return
      }

      // Abort previous
      abortRef.current?.abort()
      const ac = new AbortController()
      abortRef.current = ac

      // Stale response guard
      const seq = ++requestSeq.current

      setPreflightLoading(true)
      setPreflightError(null)

      try {
        const { data, error } = await supabase.functions.invoke('menu-preflight', {
          method: 'POST',
          body: { item_id: id, qty: clampInt(requestedQty, 1, 20) },
          signal: ac.signal,
        })

        // ignore stale
        if (seq !== requestSeq.current) return

        if (error) throw new Error(error.message || 'Preflight failed')

        const payload = data as unknown
        if (!isRecord(payload) || typeof payload.ok !== 'boolean') {
          throw new Error('Invalid preflight response')
        }

        if (payload.ok !== true) {
          const msg = typeof payload.error === 'string' ? payload.error : 'Item unavailable'
          setPreflight({ ok: false, error: msg })
          setPreflightError(msg)
          return
        }

        const normalized: PreflightOk = {
          ok: true,
          item_id: safeStr(payload.item_id, id, 128),
          available: Boolean(payload.available),
          unit_price_cents: safeCents(payload.unit_price_cents, 0),
          stock_count:
            payload.stock_count == null ? null : clampInt(payload.stock_count, 0, 1_000_000),
          low_stock_threshold:
            payload.low_stock_threshold == null ? null : clampInt(payload.low_stock_threshold, 1, 1_000_000),
          max_qty: clampInt(payload.max_qty ?? 1, 1, 20),
        }

        setPreflight(normalized)

        // Clamp UI to server max
        setQty((q) => clampInt(q, 1, normalized.max_qty))
      } catch (e) {
        const msg = errMsg(e)
        // Abort is expected; don’t surface
        if (msg === 'aborted') return

        setPreflight({ ok: false, error: msg })
        setPreflightError(msg)
      } finally {
        if (seq === requestSeq.current) setPreflightLoading(false)
      }
    },
    [id],
  )

  // Derived
  const maxQty = useMemo(() => {
    const hardCap = 20
    if (preflight?.ok !== true) return hardCap
    return clampInt(preflight.max_qty, 1, hardCap)
  }, [preflight])

  const safeQty = useMemo(() => clampInt(qty, 1, maxQty), [qty, maxQty])

  const unitPriceCents = useMemo(() => {
    if (preflight?.ok === true) return safeCents(preflight.unit_price_cents, 0)
    return 0
  }, [preflight])

  const totalCents = useMemo(() => unitPriceCents * safeQty, [unitPriceCents, safeQty])

  const canAdd =
    phase === 'idle' &&
    preflight?.ok === true &&
    preflight.available === true &&
    unitPriceCents > 0 &&
    !preflightLoading

  const isLowStock = useMemo(() => {
    if (preflight?.ok !== true) return false
    if (preflight.stock_count == null) return false
    const thr = preflight.low_stock_threshold ?? 5
    return preflight.stock_count > 0 && preflight.stock_count <= thr
  }, [preflight])

  // Debounced preflight on open + qty changes
  useEffect(() => {
    if (!id) return

    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => {
      void runPreflight(safeQty)
    }, 200)

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
    }
  }, [id, safeQty, runPreflight])

  // Add to cart (fail-closed unless preflight ok)
  const handleAddToCart = useCallback(() => {
    if (!canAdd) return
    if (preflight?.ok !== true) return
    if (phase !== 'idle') return

    setPhase('adding')

    if (addTimer.current) clearTimeout(addTimer.current)
    addTimer.current = setTimeout(() => {
      addItem({
        menuItemId: id,
        name,
        unitPriceCents: preflight.unit_price_cents, // server confirmed
        imageUrl: imageUrl ?? null,
        category: item.category,
        modifiers: [],
        quantity: safeQty,
        notes: null,
        pricingHash: `v1:preflight:${id}:${preflight.unit_price_cents}:${safeQty}`,
      })

      setPhase('success')

      if (successTimer.current) clearTimeout(successTimer.current)
      successTimer.current = setTimeout(() => onClose(), 1200)
    }, 250)
  }, [canAdd, preflight, phase, addItem, id, name, imageUrl, item.category, safeQty, onClose])

  return (
    <div className="p-6 text-white">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-widest text-zinc-400">{categoryLabel}</p>
          <h2 className="mt-1 truncate text-2xl font-semibold">{name}</h2>
          {description ? <p className="mt-2 text-sm text-zinc-400">{description}</p> : null}
          {isPopular ? <p className="mt-2 text-xs text-amber-300">⭐ Most Popular</p> : null}
        </div>

        <div className="shrink-0 text-right">
          <div className="text-2xl font-bold text-amber-400">{fmtUsdFromCents(unitPriceCents)}</div>
          <div className="text-[11px] text-zinc-500">
            {preflightLoading ? 'checking…' : preflight?.ok === true ? 'server-confirmed' : '—'}
          </div>
        </div>
      </div>

      {preflightError ? (
        <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">
          {preflightError}
        </div>
      ) : null}

      {isLowStock && preflight?.ok === true && preflight.stock_count != null ? (
        <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">
          Only {preflight.stock_count} left — order soon
        </div>
      ) : null}

      <div className="mt-6 flex items-center justify-between">
        <div className="text-sm text-zinc-400">Quantity</div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="h-10 w-10 rounded-xl bg-zinc-800 disabled:opacity-40"
            onClick={() => setQty((q) => clampInt(q - 1, 1, maxQty))}
            disabled={safeQty <= 1 || preflightLoading}
            aria-label="Decrease quantity"
          >
            −
          </button>

          {/* Tailwind-safe */}
          <div className="min-w-2.5rem text-center font-semibold tabular-nums">{safeQty}</div>

          <button
            type="button"
            className="h-10 w-10 rounded-xl bg-zinc-800 disabled:opacity-40"
            onClick={() => setQty((q) => clampInt(q + 1, 1, maxQty))}
            disabled={safeQty >= maxQty || preflightLoading}
            aria-label="Increase quantity"
          >
            +
          </button>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="text-sm text-zinc-400">Total</div>
        <div className="text-xl font-bold">{fmtUsdFromCents(totalCents)}</div>
      </div>

      <button
        type="button"
        className="mt-6 w-full rounded-2xl bg-amber-500 py-4 font-semibold text-black disabled:opacity-40"
        onClick={handleAddToCart}
        disabled={!canAdd || phase !== 'idle'}
      >
        {preflightLoading
          ? 'Checking availability…'
          : phase === 'success'
            ? 'Added!'
            : preflight?.ok === true && preflight.available === false
              ? 'Unavailable'
              : 'Add to Order'}
      </button>

      <p className="mt-3 text-center text-[11px] text-zinc-500">
        Final totals (tax, promos, credits) enforced again at checkout by server + Stripe.
      </p>
    </div>
  )
}