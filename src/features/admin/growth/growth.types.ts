// =============================================================================
// src/features/admin/growth/growth.types.ts
// Growth domain types — aligned 1:1 with database.types.ts
//
// IMPORTANT SCHEMA NOTES:
//   growth_campaigns  → has budget_cents, spent_cents, revenue_cents, channel
//                        NO status, active, sent_count, open_count, conversion_count
//   promotions        → is the promo codes table (NOT a separate promo_codes table)
//   abandoned_cart_sessions → separate from pending_carts; tracks incomplete sessions
// =============================================================================

// ─────────────────────────────────────────────────────────────────────────────
// Campaign
// Maps to: growth_campaigns table
// ─────────────────────────────────────────────────────────────────────────────

export interface Campaign {
  /** growth_campaigns.id */
  id:           string
  /** growth_campaigns.name */
  name:         string
  /** growth_campaigns.channel — e.g. "email" | "sms" | "in_app" | null */
  channel:      string | null
  /** growth_campaigns.budget_cents */
  budgetCents:  number
  /** growth_campaigns.spent_cents */
  spentCents:   number
  /** growth_campaigns.revenue_cents */
  revenueCents: number
  /** growth_campaigns.created_at */
  active: boolean         // 👈 add

  createdAt:    string
}

/** Computed ROI for a campaign — derived, never stored */
export interface CampaignROI {
  campaignId: string
  roi:        number   // (revenueCents - spentCents) / spentCents, 0 if spentCents = 0
  roas:       number   // revenueCents / spentCents, 0 if spentCents = 0
  margin:     number   // revenueCents - spentCents
}

// ─────────────────────────────────────────────────────────────────────────────
// Promo Code
// Maps to: promotions table (+ aggregated from promo_redemptions)
// ─────────────────────────────────────────────────────────────────────────────

export interface PromoCode {
  /** promotions.id */
  id:              string
  /** promotions.code */
  code:            string
  /** promotions.type — "percent" | "fixed" */
  type:            'percent' | 'fixed'
  /** promotions.value — percent: 0–100 | fixed: cents */
  value:           number
  /** promotions.active */
  active:          boolean
  /** promotions.current_uses */
  currentUses:     number
  /** promotions.max_uses */
  maxUses:         number | null
  /** promotions.min_order_cents */
  minOrderCents:   number
  /** promotions.per_user_limit */
  perUserLimit:    number
  /** promotions.starts_at */
  startsAt:        string | null
  /** promotions.ends_at */
  endsAt:          string | null
  /** promotions.expires_at */
  expiresAt:       string | null
  /** promotions.campaign_id */
  campaignId:      string | null
  /** promotions.channel */
  channel:         string | null
  /** Aggregated from promo_redemptions.order_total_cents */
  revenueCents:    number
  /** Count of rows in promo_redemptions for this promo */
  redemptionCount: number
}
export interface AIInsight {
  id: string
  category: AIInsightCategory
  title: string
  body: string
  confidence: number
  impactPct: number
  applied: boolean
  createdAt: string
}
export const AI_INSIGHT_CATEGORIES = [
  'pricing',
  'promotion',
  'retention',
  'operations',
  'fraud',
  'inventory',
  'growth',
] as const


export interface AIInsight {
  id: string
  category: AIInsightCategory
  title: string
  body: string
  confidence: number
  impactPct: number
  applied: boolean
  createdAt: string
}
// ─────────────────────────────────────────────────────────────────────────────
// Abandoned Cart Session
// Maps to: abandoned_cart_sessions table
// NOTE: This is NOT pending_carts. These are sessions that were started
//       but never completed checkout.
// ─────────────────────────────────────────────────────────────────────────────

export interface AbandonedCartSession {
  /** abandoned_cart_sessions.id */
  id:             string
  /** abandoned_cart_sessions.user_id */
  userId:         string | null
  /** abandoned_cart_sessions.email */
  email:          string | null
  /** abandoned_cart_sessions.cart_value_cents */
  cartValueCents: number
  /** abandoned_cart_sessions.last_activity */
  lastActivity:   string | null
  /** abandoned_cart_sessions.recovered */
  recovered:      boolean
  /** abandoned_cart_sessions.created_at */
  createdAt:      string
}

export interface AbandonedCartSummary {
  totalAbandoned:        number
  totalRecovered:        number
  /** 0–1 ratio */
  recoveryRate:          number
  lostRevenueCents:      number
  recoveredRevenueCents: number
}

// ─────────────────────────────────────────────────────────────────────────────
// AI Insight
// Maps to: ai_insights table
// ─────────────────────────────────────────────────────────────────────────────


export type AIInsightCategory =
  (typeof AI_INSIGHT_CATEGORIES)[number] | (string & {})
  

  export type PromoType = 'percent' | 'fixed' | 'amount' | 'bogo' | 'free_item'