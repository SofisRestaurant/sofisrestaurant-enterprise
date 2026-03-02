// =============================================================================
// src/features/admin/growth/growth.service.ts
// Production-ready Growth / Marketing service (2026 hardened)
// - Eliminates GenericStringError / unsafe-any by using a typed Supabase client
// - Uses precise SELECT result types (Pick<...>) instead of casting full rows
// - No unnecessary type assertions
// - Maps DB rows → domain models from ./growth.types
// =============================================================================
import type { Database } from '@/types/supabase'
import { supabase } from '@/lib/supabase/supabaseClient'
import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Campaign,
  PromoCode,
  AbandonedCartSession,
  AbandonedCartSummary,
  AIInsight,
} from './growth.types'

// ─────────────────────────────────────────────────────────────────────────────
// Typed Supabase client (prevents GenericStringError + unsafe assignment)
// ─────────────────────────────────────────────────────────────────────────────

const sb = supabase as unknown as SupabaseClient<Database>

// ─────────────────────────────────────────────────────────────────────────────
// Raw row aliases
// ─────────────────────────────────────────────────────────────────────────────

type GrowthCampaignRow = Database['public']['Tables']['growth_campaigns']['Row']
type PromotionRow = Database['public']['Tables']['promotions']['Row']
type PromoRedemptionRow = Database['public']['Tables']['promo_redemptions']['Row']
type AbandonedSessionRow = Database['public']['Tables']['abandoned_cart_sessions']['Row']
type AIInsightRow = Database['public']['Tables']['ai_insights']['Row']

// ─────────────────────────────────────────────────────────────────────────────
// Narrow SELECT types (match exactly what we select)
// This avoids unsafe casts like (row as PromotionRow).
// ─────────────────────────────────────────────────────────────────────────────

type GrowthCampaignSelect = Pick<
  GrowthCampaignRow,
  'id' | 'name' | 'channel' | 'budget_cents' | 'spent_cents' | 'revenue_cents' | 'active' | 'created_at'
>

type PromotionSelect = Pick<
  PromotionRow,
  | 'id'
  | 'code'
  | 'type'
  | 'value'
  | 'active'
  | 'current_uses'
  | 'max_uses'
  | 'min_order_cents'
  | 'per_user_limit'
  | 'starts_at'
  | 'ends_at'
  | 'expires_at'
  | 'campaign_id'
  | 'channel'
  | 'cost_center'
  | 'geo_target'
  | 'created_at'
  | 'updated_at'
>

type PromoRedemptionSelect = Pick<
  PromoRedemptionRow,
  'promotion_id' | 'order_total_cents' | 'discount_cents'
>

type AbandonedSessionSelect = Pick<
  AbandonedSessionRow,
  'id' | 'user_id' | 'email' | 'cart_value_cents' | 'last_activity' | 'recovered' | 'created_at'
>

type AIInsightSelect = Pick<
  AIInsightRow,
  'id' | 'category' | 'title' | 'body' | 'confidence' | 'impact_pct' | 'applied' | 'created_at'
>
type PromoType = 'percent' | 'fixed'

function normalizePromoType(dbType: string): PromoType {
  return dbType === 'percent' ? 'percent' : 'fixed'
}

// ─────────────────────────────────────────────────────────────────────────────
// Mappers — DB row → domain model
// ─────────────────────────────────────────────────────────────────────────────

function mapCampaign(row: GrowthCampaignSelect): Campaign {
  return {
    id: row.id,
    name: row.name ?? '',
    channel: row.channel ?? null,
    budgetCents: row.budget_cents ?? 0,
    spentCents: row.spent_cents ?? 0,
    revenueCents: row.revenue_cents ?? 0,
    active: row.active ?? true,          // 👈 add this to Campaign type too
    createdAt: row.created_at ?? '',
  }
}
export async function toggleCampaign(id: string, active: boolean): Promise<void> {
  const res = await sb.from('growth_campaigns').update({ active }).eq('id', id)
  if (res.error) throw new Error(res.error.message)
}
function mapPromotion(row: PromotionSelect, redemptions: PromoRedemptionSelect[]): PromoCode {
  const promoRedemptions = redemptions.filter((r) => r.promotion_id === row.id)

  const revenueCents = promoRedemptions.reduce((sum, r) => sum + (r.order_total_cents ?? 0), 0)

  return {
    id: row.id,
    code: row.code,
    
    // Your growth.types.ts should define PromoCode['type'] as 'fixed' | 'percent'
    // DB has string; we normalize safely:
    type: normalizePromoType(row.type),
    value: row.value,
    active: row.active,
    currentUses: row.current_uses,
    maxUses: row.max_uses,
    minOrderCents: row.min_order_cents,
    perUserLimit: row.per_user_limit,
    startsAt: row.starts_at ?? null,
    endsAt: row.ends_at ?? null,
    expiresAt: row.expires_at ?? null,
    campaignId: row.campaign_id ?? null,
    channel: row.channel ?? null,

    // analytics / rollups
    revenueCents,
    redemptionCount: promoRedemptions.length,
  }
}

function mapAbandonedSession(row: AbandonedSessionSelect): AbandonedCartSession {
  return {
    id: row.id,
    userId: row.user_id ?? null,
    email: row.email ?? null,
    cartValueCents: row.cart_value_cents ?? 0,
    lastActivity: row.last_activity ?? null,
    recovered: row.recovered ?? false,
    createdAt: row.created_at ?? '',
  }
}

function mapAIInsight(row: AIInsightSelect): AIInsight {
  return {
    id: row.id,
    // DB stores category as string; keep as-is (no unnecessary cast)
    category: row.category,
    title: row.title,
    body: row.body,
    confidence: row.confidence ?? 0,
    impactPct: row.impact_pct ?? 0,
    applied: row.applied ?? false,
    createdAt: row.created_at ?? '',
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Campaign queries
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchCampaigns(): Promise<Campaign[]> {
  const res = await sb
    .from('growth_campaigns')
    .select('id, name, channel, budget_cents, spent_cents, revenue_cents, active, created_at')
    .order('created_at', { ascending: false })
    .returns<GrowthCampaignSelect[]>()

  if (res.error) throw new Error(res.error.message)
  return (res.data ?? []).map(mapCampaign)
}

export async function updateCampaignRevenue(id: string, revenueCents: number): Promise<void> {
  const res = await sb.from('growth_campaigns').update({ revenue_cents: revenueCents }).eq('id', id)
  if (res.error) throw new Error(res.error.message)
}

// ─────────────────────────────────────────────────────────────────────────────
// Promotions (Promo codes) queries
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchPromoCodes(): Promise<PromoCode[]> {
  const [promoRes, redemptionRes] = await Promise.all([
    sb
      .from('promotions')
      .select(
        [
          'id',
          'code',
          'type',
          'value',
          'active',
          'current_uses',
          'max_uses',
          'min_order_cents',
          'per_user_limit',
          'starts_at',
          'ends_at',
          'expires_at',
          'campaign_id',
          'channel',
          'cost_center',
          'geo_target',
          'created_at',
          'updated_at',
        ].join(','),
      )
      .order('created_at', { ascending: false })
      .returns<PromotionSelect[]>(),

    sb
      .from('promo_redemptions')
      .select('promotion_id, order_total_cents, discount_cents')
      .returns<PromoRedemptionSelect[]>(),
  ])

  if (promoRes.error) throw new Error(promoRes.error.message)
  if (redemptionRes.error) throw new Error(redemptionRes.error.message)

  const promos = promoRes.data ?? []
  const redemptions = redemptionRes.data ?? []

  return promos.map((p) => mapPromotion(p, redemptions))
}

export async function togglePromoCode(id: string, active: boolean): Promise<void> {
  const res = await sb.from('promotions').update({ active }).eq('id', id)
  if (res.error) throw new Error(res.error.message)
}

// ─────────────────────────────────────────────────────────────────────────────
// Abandoned carts
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchAbandonedCarts(): Promise<AbandonedCartSession[]> {
  const res = await sb
    .from('abandoned_cart_sessions')
    .select('id, user_id, email, cart_value_cents, last_activity, recovered, created_at')
    .order('created_at', { ascending: false })
    .limit(200)
    .returns<AbandonedSessionSelect[]>()

  if (res.error) throw new Error(res.error.message)
  return (res.data ?? []).map(mapAbandonedSession)
}

export async function fetchAbandonedCartSummary(): Promise<AbandonedCartSummary> {
  // Minimal select for summary
  const res = await sb
    .from('abandoned_cart_sessions')
    .select('cart_value_cents, recovered')
    .returns<Array<Pick<AbandonedSessionRow, 'cart_value_cents' | 'recovered'>>>()

  if (res.error) throw new Error(res.error.message)

  const rows = res.data ?? []
  const totalAbandoned = rows.length

  const recoveredRows = rows.filter((r) => r.recovered === true)
  const totalRecovered = recoveredRows.length

  const recoveryRate = totalAbandoned > 0 ? totalRecovered / totalAbandoned : 0

  const lostRevenueCents = rows
    .filter((r) => r.recovered !== true)
    .reduce((sum, r) => sum + (r.cart_value_cents ?? 0), 0)

  const recoveredRevenueCents = recoveredRows.reduce(
    (sum, r) => sum + (r.cart_value_cents ?? 0),
    0,
  )

  return {
    totalAbandoned,
    totalRecovered,
    recoveryRate,
    lostRevenueCents,
    recoveredRevenueCents,
  }
}

export async function markCartRecovered(id: string): Promise<void> {
  const res = await sb.from('abandoned_cart_sessions').update({ recovered: true }).eq('id', id)
  if (res.error) throw new Error(res.error.message)
}

// ─────────────────────────────────────────────────────────────────────────────
// AI Insights
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchAIInsights(): Promise<AIInsight[]> {
  const res = await sb
    .from('ai_insights')
    .select('id, category, title, body, confidence, impact_pct, applied, created_at')
    .order('confidence', { ascending: false })
    .limit(20)
    .returns<AIInsightSelect[]>()

  if (res.error) throw new Error(res.error.message)
  return (res.data ?? []).map(mapAIInsight)
}

export async function applyAIInsight(id: string): Promise<void> {
  const res = await sb.from('ai_insights').update({ applied: true }).eq('id', id)
  if (res.error) throw new Error(res.error.message)
}
