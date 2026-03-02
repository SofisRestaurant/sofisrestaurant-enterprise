// =============================================================================
// src/features/cart/cart.store.ts
// Cart store — Zustand + persist middleware (production-ready, type-safe)
// =============================================================================

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { SupabaseClient } from '@supabase/supabase-js'

import { supabase } from '@/lib/supabase/supabaseClient'
import type { Database, Json } from '@/types/supabase'

import {
  type CartItem,
  type CartPromotion,
  type CartCredit,
  type CartState,
  type CartTotals,
  type PromoValidationResult,
  type PromotionRow,
  cartItemKey,
  computeLineTotalCents,
  computeCartTotals,
} from './cart.types'

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const TAX_RATE = 0.0825
const PERSIST_KEY = 'sofis-cart-v1'
const SYNC_DEBOUNCE = 600 // ms — debounce Supabase writes to avoid hammering on rapid qty changes

// ─────────────────────────────────────────────────────────────────────────────
// Typed Supabase client (fixes "error typed value"/GenericStringError cascades)
// ─────────────────────────────────────────────────────────────────────────────

const sb = supabase as unknown as SupabaseClient<Database>

// ─────────────────────────────────────────────────────────────────────────────
// Runtime helpers (no `any`, no unsafe member access)
// ─────────────────────────────────────────────────────────────────────────────

type UnknownRecord = Record<string, unknown>

function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === 'object' && v !== null
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

function nullableStr(v: unknown): string | null {
  return typeof v === 'string' ? v : null
}

function num(v: unknown, fallback = 0): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = Number(v)
    return Number.isFinite(n) ? n : fallback
  }
  return fallback
}

function dateMs(v: unknown): number | null {
  if (typeof v !== 'string') return null
  const t = new Date(v).getTime()
  return Number.isFinite(t) ? t : null
}

function normalizePromoType(v: unknown): CartPromotion['type'] | null {
  return v === 'percent' || v === 'fixed' ? v : null
}

function buildCartPromotionFromRow(
  row: PromotionRow,
  subtotalCents: number,
  expiry: string | null,
): CartPromotion {
  const id = str(row.id).trim()
  const code = str(row.code).trim()
  const type = normalizePromoType(row.type)
  if (!id || !code || !type) throw new Error('Invalid promo configuration')

  const value = num(row.value, 0)
  const minOrderCents = num(row.min_order_cents, 0)

  const discountCents =
    type === 'percent'
      ? Math.min(subtotalCents, Math.round(subtotalCents * (value / 100)))
      : Math.min(subtotalCents, value)

  return {
    id,
    code,
    type,
    value,
    minOrderCents,
    expiresAt: expiry,
    discountCents,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Pending carts JSON parsing (avoid unsafe casts from Json)
// ─────────────────────────────────────────────────────────────────────────────

function isCartModifierLike(v: unknown): v is CartItem['modifiers'][number] {
  if (!isRecord(v)) return false
  return (
    typeof v.id === 'string' &&
    typeof v.groupId === 'string' &&
    typeof v.name === 'string' &&
    typeof v.priceAdjustment === 'number'
  )
}

function isCartItemLike(v: unknown): v is CartItem {
  if (!isRecord(v)) return false

  const mods = v.modifiers
  return (
    typeof v.menuItemId === 'string' &&
    typeof v.name === 'string' &&
    typeof v.unitPriceCents === 'number' &&
    typeof v.quantity === 'number' &&
    (v.imageUrl === null || typeof v.imageUrl === 'string') &&
    typeof v.category === 'string' &&
    (v.notes === null || typeof v.notes === 'string') &&
    typeof v.lineTotalCents === 'number' &&
    Array.isArray(mods) &&
    mods.every(isCartModifierLike)
  )
}

function parseCartItemsFromJson(raw: unknown): CartItem[] {
  if (!Array.isArray(raw)) return []
  const out: CartItem[] = []
  for (const it of raw) {
    if (isCartItemLike(it)) out.push(it)
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// Store interface
// ─────────────────────────────────────────────────────────────────────────────

export interface CartStore extends CartState {
  // ── Derived helpers
  itemCount: number
  isEmpty: boolean

  // ── Item mutations
  addItem: (item: Omit<CartItem, 'lineTotalCents'>) => void
  removeItem: (menuItemId: string, modifierKey: string) => void
  updateQuantity: (menuItemId: string, modifierKey: string, quantity: number) => void
  updateNotes: (menuItemId: string, modifierKey: string, notes: string) => void
  clearCart: () => void

  // ── Promo mutations
  applyPromoCode: (code: string, userId: string) => Promise<PromoValidationResult>
  removePromo: () => void

  // ── Credit mutations
  applyCredit: (userId: string) => Promise<boolean>
  removeCredit: () => void

  // ── Supabase sync
  syncToSupabase: (userId: string, sessionId: string) => void
  hydrateFromSupabase: (userId: string) => Promise<void>
  clearSupabaseCart: (sessionId: string) => Promise<void>
}

// ─────────────────────────────────────────────────────────────────────────────
// Zero state
// ─────────────────────────────────────────────────────────────────────────────

const EMPTY_TOTALS: CartTotals = {
  subtotalCents: 0,
  discountCents: 0,
  creditCents: 0,
  taxCents: 0,
  totalCents: 0,
}

const INITIAL_STATE: CartState = {
  items: [],
  promotion: null,
  credit: null,
  totals: EMPTY_TOTALS,
}

// ─────────────────────────────────────────────────────────────────────────────
// Sync debounce handle (module-level)
// ─────────────────────────────────────────────────────────────────────────────

let syncTimer: ReturnType<typeof setTimeout> | null = null

function scheduleSyncToSupabase(userId: string, sessionId: string, getState: () => CartStore) {
  if (syncTimer) clearTimeout(syncTimer)
  syncTimer = setTimeout(() => {
    void flushSyncToSupabase(userId, sessionId, getState())
  }, SYNC_DEBOUNCE)
}

async function flushSyncToSupabase(userId: string, sessionId: string, state: CartStore) {
  const { items, promotion, credit, totals } = state

  if (items.length === 0) {
    await sb.from('pending_carts').delete().eq('id', sessionId)
    return
  }

  const { error } = await sb
    .from('pending_carts')
    .upsert(
      {
        id: sessionId,
        user_id: userId,
        items: items as unknown as Json,
        subtotal_cents: totals.subtotalCents,
        discount_cents: totals.discountCents,
        tax_cents: totals.taxCents,
        total_cents: totals.totalCents,
        promo_id: promotion?.id ?? null,
        credit_id: credit?.id ?? null,
        expires_at: new Date(Date.now() + 1000 * 60 * 60 * 2).toISOString(), // 2hr TTL
      },
      { onConflict: 'id' },
    )

  if (error) {
    console.error('[cart.store] pending_carts upsert failed:', error.message)
  }

  // Fire-and-forget abandoned cart tracking
  void sb.from('abandoned_cart_sessions').upsert(
    {
      id: sessionId,
      user_id: userId,
      cart_value_cents: totals.subtotalCents,
      last_activity: new Date().toISOString(),
      recovered: false,
    },
    { onConflict: 'id' },
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Totals helper
// ─────────────────────────────────────────────────────────────────────────────

function recompute(items: CartItem[], promotion: CartPromotion | null, credit: CartCredit | null): CartTotals {
  return computeCartTotals(items, promotion, credit, TAX_RATE)
}

// ─────────────────────────────────────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────────────────────────────────────

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      ...INITIAL_STATE,
      itemCount: 0,
      isEmpty: true,

      // ── Item mutations ──────────────────────────────────────────────────────

      addItem: (item) => {
        const key = cartItemKey(item.menuItemId, item.modifiers)

        set((s) => {
          const existing = s.items.find((i) => cartItemKey(i.menuItemId, i.modifiers) === key)

          let nextItems: CartItem[]

          if (existing) {
            nextItems = s.items.map((i) => {
              if (cartItemKey(i.menuItemId, i.modifiers) !== key) return i
              const quantity = i.quantity + item.quantity
              const lineTotalCents = computeLineTotalCents({ ...i, quantity })
              return { ...i, quantity, lineTotalCents }
            })
          } else {
            const lineTotalCents = computeLineTotalCents(item)
            nextItems = [...s.items, { ...item, lineTotalCents }]
          }

          const totals = recompute(nextItems, s.promotion, s.credit)
          return {
            items: nextItems,
            totals,
            itemCount: nextItems.reduce((n, i) => n + i.quantity, 0),
            isEmpty: nextItems.length === 0,
          }
        })
      },

      removeItem: (menuItemId, modifierKey) => {
        set((s) => {
          // remove only the exact line (menuItemId + modifierKey)
          const nextItems = s.items.filter(
            (i) => !(i.menuItemId === menuItemId && cartItemKey(i.menuItemId, i.modifiers) === modifierKey),
          )

          const promotion = nextItems.length > 0 ? s.promotion : null
          const credit = nextItems.length > 0 ? s.credit : null
          const totals = recompute(nextItems, promotion, credit)

          return {
            items: nextItems,
            promotion,
            credit,
            totals,
            itemCount: nextItems.reduce((n, i) => n + i.quantity, 0),
            isEmpty: nextItems.length === 0,
          }
        })
      },

      updateQuantity: (menuItemId, modifierKey, quantity) => {
        if (quantity <= 0) {
          get().removeItem(menuItemId, modifierKey)
          return
        }

        set((s) => {
          const nextItems = s.items.map((i) => {
            const k = cartItemKey(i.menuItemId, i.modifiers)
            if (!(i.menuItemId === menuItemId && k === modifierKey)) return i
            const lineTotalCents = computeLineTotalCents({ ...i, quantity })
            return { ...i, quantity, lineTotalCents }
          })

          const totals = recompute(nextItems, s.promotion, s.credit)

          return {
            items: nextItems,
            totals,
            itemCount: nextItems.reduce((n, i) => n + i.quantity, 0),
            isEmpty: nextItems.length === 0,
          }
        })
      },

      updateNotes: (menuItemId, modifierKey, notes) => {
        set((s) => ({
          items: s.items.map((i) => {
            const k = cartItemKey(i.menuItemId, i.modifiers)
            if (!(i.menuItemId === menuItemId && k === modifierKey)) return i
            return { ...i, notes }
          }),
        }))
      },

      clearCart: () => {
        set({
          ...INITIAL_STATE,
          itemCount: 0,
          isEmpty: true,
        })
      },

      // ── Promo mutations ─────────────────────────────────────────────────────

      applyPromoCode: async (code, userId) => {
        const { items, promotion: existingPromo } = get()

        const normalized = code.trim()
        if (!normalized) return { valid: false, error: 'NOT_FOUND' }

        if (existingPromo?.code.toLowerCase() === normalized.toLowerCase()) {
          return { valid: false, error: 'ALREADY_APPLIED' }
        }

        const promoRes = await sb
          .from('promotions')
          .select(
            'id, code, type, value, active, min_order_cents, max_uses, current_uses, per_user_limit, starts_at, ends_at, expires_at',
          )
          .eq('code', normalized)
          .limit(1)
          .returns<PromotionRow[]>()

        if (promoRes.error) return { valid: false, error: 'NOT_FOUND' }

        const promo = promoRes.data?.[0]
        if (!promo) return { valid: false, error: 'NOT_FOUND' }

        if (promo.active !== true) return { valid: false, error: 'INACTIVE' }

        const now = Date.now()
        const startsAtMs = dateMs(promo.starts_at)
        if (startsAtMs !== null && startsAtMs > now) return { valid: false, error: 'INACTIVE' }

        const expiry = nullableStr(promo.expires_at) ?? nullableStr(promo.ends_at)
        const expiryMs = dateMs(expiry)
        if (expiryMs !== null && expiryMs < now) return { valid: false, error: 'EXPIRED' }

        const maxUses = promo.max_uses == null ? null : num(promo.max_uses)
        const currentUses = num(promo.current_uses)
        if (maxUses !== null && currentUses >= maxUses) {
          return { valid: false, error: 'LIMIT_REACHED' }
        }

        const subtotalCents = items.reduce((s, i) => s + i.lineTotalCents, 0)
        const minOrderCents = num(promo.min_order_cents, 0)
        if (subtotalCents < minOrderCents) {
          return { valid: false, error: 'MIN_ORDER_NOT_MET' }
        }

        const perUserLimit = num(promo.per_user_limit, 0)
        if (perUserLimit > 0) {
          const redemptionRes = await sb
            .from('promo_redemptions')
            .select('id', { count: 'exact', head: true })
            .eq('promotion_id', promo.id)
            .eq('user_id', userId)

          if (redemptionRes.error) return { valid: false, error: 'NOT_FOUND' }
          if ((redemptionRes.count ?? 0) >= perUserLimit) {
            return { valid: false, error: 'USER_LIMIT_REACHED' }
          }
        }

        let cartPromotion: CartPromotion
        try {
          cartPromotion = buildCartPromotionFromRow(promo, subtotalCents, expiry ?? null)
        } catch {
          return { valid: false, error: 'NOT_FOUND' }
        }

        set((s) => {
          const totals = recompute(s.items, cartPromotion, s.credit)
          return { promotion: cartPromotion, totals }
        })

        return { valid: true, promo: cartPromotion }
      },

      removePromo: () => {
        set((s) => {
          const totals = recompute(s.items, null, s.credit)
          return { promotion: null, totals }
        })
      },

      // ── Credit mutations ────────────────────────────────────────────────────

      applyCredit: async (userId) => {
        const { data, error } = await sb
          .from('user_credits')
          .select('id, amount_cents, source, expires_at')
          .eq('user_id', userId)
          .eq('used', false)
          .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
          .order('created_at', { ascending: true })
          .limit(1)

        if (error || !data?.length) return false

        const row = data[0]

        const credit: CartCredit = {
          id: row.id,
          amountCents: row.amount_cents ?? 0,
          source: row.source ?? '',
          expiresAt: row.expires_at ?? null,
        }

        set((s) => {
          const totals = recompute(s.items, s.promotion, credit)
          return { credit, totals }
        })

        return true
      },

      removeCredit: () => {
        set((s) => {
          const totals = recompute(s.items, s.promotion, null)
          return { credit: null, totals }
        })
      },

      // ── Supabase sync ───────────────────────────────────────────────────────

      syncToSupabase: (userId, sessionId) => {
        scheduleSyncToSupabase(userId, sessionId, get)
      },

      hydrateFromSupabase: async (userId) => {
        const res = await sb
          .from('pending_carts')
          .select('id, items, promo_id, credit_id, expires_at')
          .eq('user_id', userId)
          .gt('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false })
          .limit(1)

        if (res.error || !res.data?.length) return

        const row = res.data[0]
        const rawItems = row.items as unknown
        const parsedItems = parseCartItemsFromJson(rawItems)
        if (!parsedItems.length) return

        // Recompute line totals defensively (never trust stored totals)
        const hydratedItems: CartItem[] = parsedItems.map((i) => ({
          ...i,
          lineTotalCents: computeLineTotalCents(i),
        }))

        // Restore promo if possible
        let promotion: CartPromotion | null = null
        if (row.promo_id) {
          const promoRes = await sb
            .from('promotions')
            .select('id, code, type, value, min_order_cents, expires_at, ends_at, active')
            .eq('id', row.promo_id)
            .limit(1)
            .returns<PromotionRow[]>()

          const p = promoRes.data?.[0]
          if (p && p.active === true) {
            const subtotalCents = hydratedItems.reduce((s, i) => s + i.lineTotalCents, 0)
            const expiry = nullableStr(p.expires_at) ?? nullableStr(p.ends_at)
            try {
              promotion = buildCartPromotionFromRow(p, subtotalCents, expiry ?? null)
            } catch {
              promotion = null
            }
          }
        }

        // Restore credit if possible
        let credit: CartCredit | null = null
        if (row.credit_id) {
          const creditRes = await sb
            .from('user_credits')
            .select('id, amount_cents, source, expires_at')
            .eq('id', row.credit_id)
            .eq('used', false)
            .limit(1)

          const c = creditRes.data?.[0]
          if (c) {
            credit = {
              id: c.id,
              amountCents: c.amount_cents ?? 0,
              source: c.source ?? '',
              expiresAt: c.expires_at ?? null,
            }
          }
        }

        const totals = recompute(hydratedItems, promotion, credit)

        set({
          items: hydratedItems,
          promotion,
          credit,
          totals,
          itemCount: hydratedItems.reduce((n, i) => n + i.quantity, 0),
          isEmpty: hydratedItems.length === 0,
        })
      },

      clearSupabaseCart: async (sessionId) => {
        await sb.from('pending_carts').delete().eq('id', sessionId)
      },
    }),
    {
      name: PERSIST_KEY,
      storage: createJSONStorage(() => localStorage),

      // Only persist data fields — not action fns
      partialize: (s) => ({
        items: s.items,
        promotion: s.promotion,
        credit: s.credit,
        totals: s.totals,
      }),

      onRehydrateStorage: () => (state) => {
        if (!state) return

        const hydratedItems = (state.items ?? []).map((i) => ({
          ...i,
          lineTotalCents: computeLineTotalCents(i),
        }))

        const totals = recompute(hydratedItems, state.promotion ?? null, state.credit ?? null)

        state.items = hydratedItems
        state.totals = totals
        state.itemCount = hydratedItems.reduce((n, i) => n + i.quantity, 0)
        state.isEmpty = hydratedItems.length === 0
      },
    },
  ),
)

// ─────────────────────────────────────────────────────────────────────────────
// Selectors — use these in components to avoid full-store subscriptions
// ─────────────────────────────────────────────────────────────────────────────

export const selectItems = (s: CartStore) => s.items
export const selectTotals = (s: CartStore) => s.totals
export const selectPromotion = (s: CartStore) => s.promotion
export const selectCredit = (s: CartStore) => s.credit
export const selectItemCount = (s: CartStore) => s.itemCount
export const selectIsEmpty = (s: CartStore) => s.isEmpty

export const selectItemByKey = (key: string) => (s: CartStore) =>
  s.items.find((i) => cartItemKey(i.menuItemId, i.modifiers) === key) ?? null

export const selectItemsByCategory = (category: string) => (s: CartStore) =>
  s.items.filter((i) => i.category === category)