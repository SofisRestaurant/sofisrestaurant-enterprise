// =============================================================================
// src/features/admin/growth/growth.service.ts
// Production-ready Growth / Marketing service (2026 hardened)
//
// GOALS
// - Admin Campaigns/Promos pages must NEVER hit PostgREST directly
//   (no browser .from('growth_campaigns') / .from('promotions'))
// - All privileged reads/writes route through the Admin Gateway typed client.
// - Deterministic, actionable errors (include requestId when available).
// - Safe runtime guards: tolerate partial/older gateway payloads without crashing.
// - No "double wrap" payloads: client guarantees canonical { action, payload? }.
//
// NOTE
// - Non-campaign/promo read-only analytics (abandoned carts, ai insights) remain
//   direct queries unless/until you add gateway actions for them.
// =============================================================================

import { supabase } from '@/lib/supabase/supabaseClient';
import {
  callAdminGateway,
  formatAdminGatewayError,
} from '@/features/admin/api/adminGateway.client';
import type {
  CampaignCreatePayload,
  CampaignUpdatePayload,
  CampaignPinFeaturedPayload,
} from '@/features/admin/api/adminGateway.types';

import type { Database } from '@/types/supabase';
import type {
  Campaign,
  PromoCode,
  AbandonedCartSession,
  AbandonedCartSummary,
  AIInsight,
} from './growth.types';

// ─────────────────────────────────────────────────────────────────────────────
// DB Row aliases (from generated types)
// ─────────────────────────────────────────────────────────────────────────────

type GrowthCampaignRow = Database['public']['Tables']['growth_campaigns']['Row'];
type PromotionRow = Database['public']['Tables']['promotions']['Row'];
type PromoRedemptionRow = Database['public']['Tables']['promo_redemptions']['Row'];
type AbandonedSessionRow = Database['public']['Tables']['abandoned_cart_sessions']['Row'];
type AIInsightRow = Database['public']['Tables']['ai_insights']['Row'];

// ─────────────────────────────────────────────────────────────────────────────
// Narrow SELECT types (for read-only non-gateway queries)
// ─────────────────────────────────────────────────────────────────────────────

type AbandonedSessionSelect = Pick<
  AbandonedSessionRow,
  'id' | 'user_id' | 'email' | 'cart_value_cents' | 'last_activity' | 'recovered' | 'created_at'
>;

type AIInsightSelect = Pick<
  AIInsightRow,
  'id' | 'category' | 'title' | 'body' | 'confidence' | 'impact_pct' | 'applied' | 'created_at'
>;

type PromoRedemptionSelect = Pick<
  PromoRedemptionRow,
  'promotion_id' | 'order_total_cents' | 'discount_cents'
>;

// ─────────────────────────────────────────────────────────────────────────────
// Small runtime guards (no any, no unsafe casts)
// ─────────────────────────────────────────────────────────────────────────────

type UnknownRecord = Record<string, unknown>;

function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function readString(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function readNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function readBool(v: unknown): boolean | null {
  return typeof v === 'boolean' ? v : null;
}

function readNullableStringField(obj: unknown, key: string): string | null {
  if (!isRecord(obj)) return null;
  const v = obj[key];
  return v === null ? null : readString(v);
}

function readNullableNumberField(obj: unknown, key: string): number | null {
  if (!isRecord(obj)) return null;
  const v = obj[key];
  return v === null ? null : readNumber(v);
}

function readNullableBoolField(obj: unknown, key: string): boolean | null {
  if (!isRecord(obj)) return null;
  const v = obj[key];
  return v === null ? null : readBool(v);
}


function normalizeError(e: unknown, fallback: string): Error {
  const msg = formatAdminGatewayError(e);
  return new Error(msg && msg.trim().length > 0 ? msg : fallback);
}

// ─────────────────────────────────────────────────────────────────────────────
// Domain mappers
// We return Campaign/PromoCode but include optional "admin fields" as extra keys
// via intersection types (no unsafe casts; still assignable to Campaign/PromoCode).
// ─────────────────────────────────────────────────────────────────────────────

type AdminCampaign = Campaign &
  Partial<
    Pick<
      GrowthCampaignRow,
      | 'campaign_name'
      | 'placement'
      | 'menu_item_id'
      | 'badge'
      | 'hero_title'
      | 'hero_subtitle'
      | 'cta_label'
      | 'deep_link'
      | 'starts_at'
      | 'ends_at'
      | 'priority'
      | 'weight'
      | 'is_featured'
      | 'eligible_for_rotation'
      | 'status'
      | 'updated_at'
      | 'featured_for_date'
      | 'promo_id'
    >
  >;

type AdminPromoCode = PromoCode &
  Partial<
    Pick<
      PromotionRow,
      | 'created_at'
      | 'updated_at'
      | 'starts_at'
      | 'ends_at'
      | 'expires_at'
      | 'campaign_id'
      | 'channel'
      | 'cost_center'
      | 'geo_target'
    >
  >;

type PromoType = 'percent' | 'fixed';

function normalizePromoType(dbType: unknown): PromoType {
  return dbType === 'percent' ? 'percent' : 'fixed';
}

function mapCampaignFromGatewayRow(row: unknown): AdminCampaign | null {
  if (!isRecord(row)) return null;

  const id = readString(row.id);
  if (!id || !id.trim()) return null;

  const name =
    readNullableStringField(row, 'name') ?? readNullableStringField(row, 'campaign_name') ?? '';

  const channel =
    readNullableStringField(row, 'channel') ?? readNullableStringField(row, 'placement') ?? null;

  const budgetCents = readNullableNumberField(row, 'budget_cents') ?? 0;
  const spentCents = readNullableNumberField(row, 'spent_cents') ?? 0;
  const revenueCents = readNullableNumberField(row, 'revenue_cents') ?? 0;

  const active = readNullableBoolField(row, 'active') ?? true;
  const createdAt =
    readNullableStringField(row, 'created_at') ?? readNullableStringField(row, 'updated_at') ?? '';

  // Optional admin fields (do not assume presence; read safely)
  const adminFields: Partial<AdminCampaign> = {
    campaign_name: readNullableStringField(row, 'campaign_name'),
    placement: readNullableStringField(row, 'placement'),
    menu_item_id: readNullableStringField(row, 'menu_item_id'),
    badge: readNullableStringField(row, 'badge'),
    hero_title: readNullableStringField(row, 'hero_title'),
    hero_subtitle: readNullableStringField(row, 'hero_subtitle'),
    cta_label: readNullableStringField(row, 'cta_label'),
    deep_link: readNullableStringField(row, 'deep_link'),
    starts_at: readNullableStringField(row, 'starts_at'),
    ends_at: readNullableStringField(row, 'ends_at'),
    priority: readNullableNumberField(row, 'priority'),
    weight: readNullableNumberField(row, 'weight'),
    is_featured: readNullableBoolField(row, 'is_featured'),
    eligible_for_rotation: readNullableBoolField(row, 'eligible_for_rotation') ?? undefined,
    status: readNullableStringField(row, 'status'),
    updated_at: readNullableStringField(row, 'updated_at'),
    featured_for_date: readNullableStringField(row, 'featured_for_date'),
    promo_id: readNullableStringField(row, 'promo_id'),
  };

  // Base Campaign fields (keep existing UX expectations)
  // If Campaign type evolves, these are still safe primitives.
  const base: AdminCampaign = {
    id,
    name,
    channel,
    budgetCents,
    spentCents,
    revenueCents,
    active,
    createdAt,
    ...adminFields,
  };

  return base;
}

function mapPromoFromGatewayRow(row: unknown): AdminPromoCode | null {
  if (!isRecord(row)) return null;

  const id = readString(row.id);
  const code = readString(row.code);
  if (!id || !code) return null;

  const type = normalizePromoType(row.type);
  const value = readNumber(row.value) ?? 0;
  const active = readBool(row.active) ?? false;

  // If gateway returns more fields, we pass them through for UI
  const currentUses = readNumber(row.current_uses) ?? 0;
  const maxUses = (row.max_uses === null ? null : readNumber(row.max_uses)) ?? null;
  const minOrderCents = readNumber(row.min_order_cents) ?? 0;
  const perUserLimit = readNumber(row.per_user_limit) ?? 0;

  const startsAt = readNullableStringField(row, 'starts_at');
  const endsAt = readNullableStringField(row, 'ends_at');
  const expiresAt = readNullableStringField(row, 'expires_at');

  const campaignId = readNullableStringField(row, 'campaign_id');
  const channel = readNullableStringField(row, 'channel');

  const createdAt = readNullableStringField(row, 'created_at') ?? null;
  const updatedAt = readNullableStringField(row, 'updated_at') ?? null;

  // Revenue attribution requires promo_redemptions; if you later add a
  // gateway endpoint for that, wire it here. For now, keep stable zeros.
  const revenueCents = 0;
  const redemptionCount = 0;

  const base: AdminPromoCode = {
    id,
    code,
    type,
    value,
    active,
    currentUses,
    maxUses,
    minOrderCents,
    perUserLimit,
    startsAt,
    endsAt,
    expiresAt,
    campaignId,
    channel,
    revenueCents,
    redemptionCount,
    created_at: createdAt ?? undefined,
    updated_at: updatedAt ?? undefined,
  };

  return base;
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
  };
}

function mapAIInsight(row: AIInsightSelect): AIInsight {
  return {
    id: row.id,
    category: row.category,
    title: row.title,
    body: row.body,
    confidence: row.confidence ?? 0,
    impactPct: row.impact_pct ?? 0,
    applied: row.applied ?? false,
    createdAt: row.created_at ?? '',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Campaigns (ADMIN GATEWAY) — privileged reads/writes
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchCampaigns(): Promise<Campaign[]> {
  try {
    const rows = await callAdminGateway('campaigns:list');
    if (!Array.isArray(rows)) return [];

    const out: Campaign[] = [];
    for (const r of rows) {
      const mapped = mapCampaignFromGatewayRow(r);
      if (mapped) out.push(mapped);
    }
    return out;
  } catch (e) {
    throw normalizeError(e, 'Failed to load campaigns');
  }
}

export async function toggleCampaign(id: string, active: boolean): Promise<void> {
  try {
    await callAdminGateway('campaigns:toggle', { id, active });
  } catch (e) {
    throw normalizeError(e, 'Failed to update campaign');
  }
}

export async function runCampaignRotation(): Promise<void> {
  try {
    await callAdminGateway('campaigns:run-rotation');
  } catch (e) {
    throw normalizeError(e, 'Failed to rotate campaigns');
  }
}

export async function createCampaign(payload: CampaignCreatePayload): Promise<unknown> {
  try {
    return await callAdminGateway('campaigns:create', payload);
  } catch (e) {
    throw normalizeError(e, 'Failed to create campaign');
  }
}

export async function updateCampaign(payload: CampaignUpdatePayload): Promise<unknown> {
  try {
    return await callAdminGateway('campaigns:update', payload);
  } catch (e) {
    throw normalizeError(e, 'Failed to update campaign');
  }
}

export async function pinFeaturedCampaign(payload: CampaignPinFeaturedPayload): Promise<unknown> {
  try {
    return await callAdminGateway('campaigns:pin-featured', payload);
  } catch (e) {
    throw normalizeError(e, 'Failed to pin featured campaign');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Promos (ADMIN GATEWAY) — privileged reads/writes
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchPromoCodes(): Promise<PromoCode[]> {
  try {
    const rows = await callAdminGateway('promos:list');
    if (!Array.isArray(rows)) return [];

    const out: PromoCode[] = [];
    for (const r of rows) {
      const mapped = mapPromoFromGatewayRow(r);
      if (mapped) out.push(mapped);
    }
    return out;
  } catch (e) {
    throw normalizeError(e, 'Failed to load promo codes');
  }
}

export async function togglePromoCode(id: string, active: boolean): Promise<void> {
  try {
    await callAdminGateway('promos:toggle', { id, active });
  } catch (e) {
    throw normalizeError(e, 'Failed to update promo code');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Abandoned carts (read-only; not routed through gateway yet)
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchAbandonedCarts(): Promise<AbandonedCartSession[]> {
  const res = await supabase
    .from('abandoned_cart_sessions')
    .select('id,user_id,email,cart_value_cents,last_activity,recovered,created_at')
    .order('created_at', { ascending: false })
    .limit(200)
    .returns<AbandonedSessionSelect[]>();

  if (res.error) throw new Error(res.error.message);
  return (res.data ?? []).map(mapAbandonedSession);
}

export async function fetchAbandonedCartSummary(): Promise<AbandonedCartSummary> {
  const res = await supabase
    .from('abandoned_cart_sessions')
    .select('cart_value_cents,recovered')
    .returns<Array<Pick<AbandonedSessionRow, 'cart_value_cents' | 'recovered'>>>();

  if (res.error) throw new Error(res.error.message);

  const rows = res.data ?? [];
  const totalAbandoned = rows.length;
  const recoveredRows = rows.filter((r) => r.recovered === true);
  const totalRecovered = recoveredRows.length;
  const recoveryRate = totalAbandoned > 0 ? totalRecovered / totalAbandoned : 0;

  const lostRevenueCents = rows
    .filter((r) => r.recovered !== true)
    .reduce((sum, r) => sum + (r.cart_value_cents ?? 0), 0);

  const recoveredRevenueCents = recoveredRows.reduce(
    (sum, r) => sum + (r.cart_value_cents ?? 0),
    0,
  );

  return {
    totalAbandoned,
    totalRecovered,
    recoveryRate,
    lostRevenueCents,
    recoveredRevenueCents,
  };
}

export async function markCartRecovered(id: string): Promise<void> {
  const res = await supabase
    .from('abandoned_cart_sessions')
    .update({ recovered: true })
    .eq('id', id);
  if (res.error) throw new Error(res.error.message);
}

// ─────────────────────────────────────────────────────────────────────────────
// AI Insights (read-only + apply; not routed through gateway yet)
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchAIInsights(): Promise<AIInsight[]> {
  const res = await supabase
    .from('ai_insights')
    .select('id,category,title,body,confidence,impact_pct,applied,created_at')
    .order('confidence', { ascending: false })
    .limit(20)
    .returns<AIInsightSelect[]>();

  if (res.error) throw new Error(res.error.message);
  return (res.data ?? []).map(mapAIInsight);
}

export async function applyAIInsight(id: string): Promise<void> {
  const res = await supabase.from('ai_insights').update({ applied: true }).eq('id', id);
  if (res.error) throw new Error(res.error.message);
}

// ─────────────────────────────────────────────────────────────────────────────
// Optional: Promo revenue attribution (still direct, non-campaign/promo tables)
// If you later add a gateway action to return redemptions summary,
// replace this with a gateway call.
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchPromoRedemptions(): Promise<PromoRedemptionSelect[]> {
  const res = await supabase
    .from('promo_redemptions')
    .select('promotion_id,order_total_cents,discount_cents')
    .returns<PromoRedemptionSelect[]>();

  if (res.error) throw new Error(res.error.message);
  return res.data ?? [];
}
