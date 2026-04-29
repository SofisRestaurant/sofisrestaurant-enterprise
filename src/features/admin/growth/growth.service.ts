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
// ABANDONED CART FIXES (all 5 bugs):
//
//   BUG 1 — fetchAbandonedCarts() threshold filter:
//     Previous version had no last_activity threshold, so it returned ALL rows
//     including carts that are actively being used right now. Added
//     ABANDONED_THRESHOLD_MINUTES = 30 filter via .lt('last_activity', threshold).
//
//   BUG 2 — KPI summary mismatch:
//     fetchAbandonedCartSummary() now uses the SAME threshold as fetchAbandonedCarts().
//     Both functions filter .lt('last_activity', threshold) so KPI counts and
//     table row counts are always in sync. Neither uses admin_realtime_snapshot.
//
//   BUG 3 — email never written / missing:
//     cart.store.ts now writes email to the upsert (see cart.store.ts).
//     Here in the service layer, rows where email is still null are enriched
//     from pending_carts.guest_email in a single batch query (no N+1).
//
//   BUG 4 — item_count not a DB column:
//     item_count does NOT exist in abandoned_cart_sessions. It is derived
//     here by reading pending_carts.items (a jsonb array) for the matching
//     session id and computing JSON array length. Single batch query.
//
//   BUG 5 — recovered never updated:
//     This service layer detects recovery by checking pending_carts.consumed_at
//     for the same session id. When consumed_at IS NOT NULL the order completed
//     and the cart was recovered. The recovered flag in abandoned_cart_sessions
//     is updated by cart.store.ts.clearSupabaseCart() (see cart.store.ts).
//     Here we surface recoveredAt from pending_carts.consumed_at for display.
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
import { invokeEdge } from '@/lib/supabase/invoke';
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
// Abandoned cart threshold
//
// A cart is considered "abandoned" when last_activity is older than this many
// minutes. Carts more recent than this are still being actively used and must
// NOT appear in the analytics table or summary KPIs.
//
// MUST match ABANDONED_THRESHOLD_MINUTES in AbandonedCartAnalytics.tsx.
// Change in both places if the business rule changes.
// ─────────────────────────────────────────────────────────────────────────────

const ABANDONED_THRESHOLD_MINUTES = 30;
const MAX_CART_ROWS = 500;

function abandonedThresholdIso(): string {
  return new Date(Date.now() - ABANDONED_THRESHOLD_MINUTES * 60 * 1000).toISOString();
}

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
// Domain mappers — Campaign / Promo (unchanged from previous version)
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

  const adminFields: Partial<AdminCampaign> = {
    campaign_name:         readNullableStringField(row, 'campaign_name'),
    placement:             readNullableStringField(row, 'placement'),
    menu_item_id:          readNullableStringField(row, 'menu_item_id'),
    badge:                 readNullableStringField(row, 'badge'),
    hero_title:            readNullableStringField(row, 'hero_title'),
    hero_subtitle:         readNullableStringField(row, 'hero_subtitle'),
    cta_label:             readNullableStringField(row, 'cta_label'),
    deep_link:             readNullableStringField(row, 'deep_link'),
    starts_at:             readNullableStringField(row, 'starts_at'),
    ends_at:               readNullableStringField(row, 'ends_at'),
    priority:              readNullableNumberField(row, 'priority'),
    weight:                readNullableNumberField(row, 'weight'),
    is_featured:           readNullableBoolField(row, 'is_featured'),
    eligible_for_rotation: readNullableBoolField(row, 'eligible_for_rotation') ?? undefined,
    status:                readNullableStringField(row, 'status'),
    updated_at:            readNullableStringField(row, 'updated_at'),
    featured_for_date:     readNullableStringField(row, 'featured_for_date'),
    promo_id:              readNullableStringField(row, 'promo_id'),
  };

  return { id, name, channel, budgetCents, spentCents, revenueCents, active, createdAt, ...adminFields };
}

function mapPromoFromGatewayRow(row: unknown): AdminPromoCode | null {
  if (!isRecord(row)) return null;

  const id = readString(row.id);
  const code = readString(row.code);
  if (!id || !code) return null;

  const type = normalizePromoType(row.type);
  const value = readNumber(row.value) ?? 0;
  const active = readBool(row.active) ?? false;
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

  return {
    id, code, type, value, active, currentUses, maxUses, minOrderCents, perUserLimit,
    startsAt, endsAt, expiresAt, campaignId, channel,
    revenueCents: 0,
    redemptionCount: 0,
    created_at: createdAt ?? undefined,
    updated_at: updatedAt ?? undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Abandoned cart mapper
//
// Maps a raw DB row + enrichment data into the AbandonedCartSession domain type.
// All snake_case→camelCase conversion happens here, at the service boundary.
//
// Parameters:
//   row        — raw abandoned_cart_sessions row
//   itemCount  — derived from pending_carts.items array length (null if not found)
//   emailFallback — pending_carts.guest_email when row.email is null
//   recoveredAt   — pending_carts.consumed_at when consumed (null otherwise)
// ─────────────────────────────────────────────────────────────────────────────

function mapAbandonedSession(
  row: AbandonedSessionSelect,
  itemCount: number | null,
  emailFallback: string | null,
  recoveredAt: string | null,
): AbandonedCartSession {
  return {
    id:            row.id,
    userId:        row.user_id ?? null,
    // Use stored email first; fall back to guest_email from pending_carts
    email:         (row.email ?? emailFallback) || null,
    cartValueCents: row.cart_value_cents ?? 0,
    lastActivity:  row.last_activity ?? null,
    recovered:     row.recovered ?? false,
    createdAt:     row.created_at ?? '',
    // Derived fields — not DB columns
    itemCount,
    recoveredAt,
  };
}

function mapAIInsight(row: AIInsightSelect): AIInsight {
  return {
    id:         row.id,
    category:   row.category,
    title:      row.title,
    body:       row.body,
    confidence: row.confidence ?? 0,
    impactPct:  row.impact_pct ?? 0,
    applied:    row.applied ?? false,
    createdAt:  row.created_at ?? '',
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

export async function deleteCampaign(id: string): Promise<void> {
  try {
    await callAdminGateway('campaigns:delete', { id });
  } catch (e) {
    throw normalizeError(e, 'Failed to delete campaign');
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

export async function createPromoCode(
  payload: import('@/features/admin/api/adminGateway.types').PromoCreatePayload,
): Promise<PromoCode> {
  try {
    const row = await callAdminGateway('promos:create', payload);
    const mapped = mapPromoFromGatewayRow(row);
    if (!mapped) throw new Error('Invalid response from gateway after promo create');
    return mapped;
  } catch (e) {
    throw normalizeError(e, 'Failed to create promo code');
  }
}

export async function deletePromoCode(id: string): Promise<void> {
  try {
    await invokeEdge('admin-gateway', { action: 'promos:delete', payload: { id } });
  } catch (e) {
    throw normalizeError(e, 'Failed to delete promo code');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Abandoned carts — read-only analytics
//
// NOT routed through the admin-gateway (read-only, no service-role required).
//
// ARCHITECTURE:
//   1. Fetch abandoned session rows with threshold filter (BUG 1 fix).
//   2. Batch-fetch matching pending_carts rows by session id (no N+1).
//   3. Enrich each session with: itemCount, emailFallback, recoveredAt.
//   4. Map to AbandonedCartSession at the service boundary (BUG 4, 5 fix).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Safely derives item count from a pending_carts.items JSONB value.
 * Returns null if items is null, not an array, or unreadable.
 */
function deriveItemCount(items: unknown): number | null {
  if (!Array.isArray(items)) return null;
  return items.length;
}

/**
 * Fetch all abandoned cart sessions for the analytics table.
 *
 * "Abandoned" = last_activity older than ABANDONED_THRESHOLD_MINUTES AND
 * still in the table (not deleted). Both recovered and unrecovered rows
 * are returned; the UI distinguishes them with a StatusPill.
 *
 * Enrichment strategy (single batch per enrichment type, no N+1):
 *   - pending_carts:  item count + guest_email fallback + consumed_at (recoveredAt)
 *   All enrichment is fail-safe: network errors or missing rows produce nulls,
 *   never a thrown exception.
 */
export async function fetchAbandonedCarts(): Promise<AbandonedCartSession[]> {
  // ── Step 1: fetch abandoned sessions with threshold filter ──────────────
  const threshold = abandonedThresholdIso();

  const { data: sessions, error } = await supabase
    .from('abandoned_cart_sessions')
    .select('id,user_id,email,cart_value_cents,last_activity,recovered,created_at')
    .lt('last_activity', threshold)           // BUG 1 FIX: only truly idle carts
    .order('last_activity', { ascending: false })
    .limit(MAX_CART_ROWS)
    .returns<AbandonedSessionSelect[]>();

  if (error) throw new Error(`fetchAbandonedCarts: ${error.message}`);
  if (!sessions || sessions.length === 0) return [];

  // ── Step 2: batch-enrich from pending_carts (single query, no N+1) ──────
  // pending_carts.id === abandoned_cart_sessions.id (same session uuid)
  // We read:
  //   items       → derive itemCount (BUG 4 fix: item_count is not a DB column)
  //   guest_email → email fallback for guest sessions (BUG 3 fix)
  //   consumed_at → non-null means the cart was checked out → recoveredAt (BUG 5)

  const sessionIds = sessions.map((s) => s.id);

  // Narrow pending_carts columns — only what we need for enrichment
  type PendingCartEnrichRow = {
    id: string;
    items: unknown;               // jsonb
    guest_email: string | null;
    consumed_at: string | null;
  };

  let pendingRows: PendingCartEnrichRow[] = [];
  try {
    const { data: pc, error: pcErr } = await supabase
      .from('pending_carts')
      .select('id,items,guest_email,consumed_at')
      .in('id', sessionIds)
      .returns<PendingCartEnrichRow[]>();

    if (!pcErr && pc) {
      pendingRows = pc;
    }
    // Silently ignore errors — enrichment is best-effort
  } catch {
    // Non-fatal: enrichment failure produces null fields, not a crash
  }

  // Build lookup maps keyed on session id
  const itemCountMap = new Map<string, number | null>();
  const guestEmailMap = new Map<string, string | null>();
  const recoveredAtMap = new Map<string, string | null>();

  for (const pc of pendingRows) {
    itemCountMap.set(pc.id, deriveItemCount(pc.items));
    guestEmailMap.set(pc.id, pc.guest_email ?? null);
    // consumed_at non-null = the order completed = cart was recovered
    recoveredAtMap.set(pc.id, pc.consumed_at ?? null);
  }

  // ── Step 3: map to domain type ───────────────────────────────────────────
  return sessions.map((row) =>
    mapAbandonedSession(
      row,
      itemCountMap.get(row.id) ?? null,
      guestEmailMap.get(row.id) ?? null,
      recoveredAtMap.get(row.id) ?? null,
    ),
  );
}

/**
 * Compute abandoned cart summary KPIs.
 *
 * Uses the EXACT SAME threshold as fetchAbandonedCarts() so that
 * KPI numbers always match the row count visible in the table. (BUG 2 fix)
 *
 * DOES NOT use admin_realtime_snapshot — that view has a different
 * time window (24h) and causes dashboard KPIs to diverge from table counts.
 */
export async function fetchAbandonedCartSummary(): Promise<AbandonedCartSummary> {
  const threshold = abandonedThresholdIso(); // same threshold as fetchAbandonedCarts

  const { data, error } = await supabase
    .from('abandoned_cart_sessions')
    .select('cart_value_cents,recovered')
    .lt('last_activity', threshold)          // BUG 2 FIX: same filter as fetchAbandonedCarts
    .returns<Array<Pick<AbandonedSessionRow, 'cart_value_cents' | 'recovered'>>>();

  if (error) throw new Error(`fetchAbandonedCartSummary: ${error.message}`);

  const rows = data ?? [];
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
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchPromoRedemptions(): Promise<PromoRedemptionSelect[]> {
  const res = await supabase
    .from('promo_redemptions')
    .select('promotion_id,order_total_cents,discount_cents')
    .returns<PromoRedemptionSelect[]>();

  if (res.error) throw new Error(res.error.message);
  return res.data ?? [];
}