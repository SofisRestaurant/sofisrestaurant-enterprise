// ============================================================================
// src/services/marketing.service.ts
// ============================================================================
// 2026 SECURITY HARDENING:
// - Browser must NEVER query admin-only tables (growth_campaigns/promotions).
// - Use admin-gateway via callAdminGateway for campaigns/promos.
// - Keep exported API shape stable so existing UI keeps working.
// ============================================================================

import { supabase } from '@/lib/supabase/supabaseClient';
import type { Campaign, AbandonedCart, PromoCode, AIOptimizerRule } from '@/types/marketing';
import { callAdminGateway } from '@/features/admin/api/adminGateway.client';

// ─────────────────────────────────────────────────────────────────────────────
// Safe helpers (no any)
// ─────────────────────────────────────────────────────────────────────────────

type UnknownRecord = Record<string, unknown>;

function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function readString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function readNullableString(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function readNumber(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function readBool(v: unknown, fallback = false): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function centsToDollars(v: unknown): number {
  const cents = readNumber(v, 0);
  return Math.round(cents) / 100;
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin-gateway row mappers (defensive)
// ─────────────────────────────────────────────────────────────────────────────

function mapGatewayCampaignRow(row: unknown): Campaign | null {
  if (!isRecord(row)) return null;

  const id = readString(row.id);
  if (!id) return null;

  // Your app uses both "campaign_name" (new) and "name" (legacy)
  const name =
    readString(row.campaign_name) ||
    readString(row.name) ||
    readString(row.hero_title) ||
    'Campaign';

  // legacy Campaign expects a channel; fallback keeps UI stable
  const channel = (readString(row.channel) ||
    readString(row.placement) ||
    'email') as Campaign['channel'];

  // growth_campaigns metrics (if present). If not, default 0.
  const budget = centsToDollars(row.budget_cents ?? row.budgetCents);
  const spent = centsToDollars(row.spent_cents ?? row.spentCents);
  const revenue = centsToDollars(row.revenue_cents ?? row.revenueCents);

  const active = readBool(row.active, true);
  const status: Campaign['status'] = active ? 'active' : 'paused';

  const created_at = readString(row.created_at) || readString(row.createdAt) || '';

  return {
    id,
    name,
    type: 'email', // legacy fallback (DB doesn’t store this on growth_campaigns)
    status,
    channel,
    budget,
    spent,
    revenue,
    conversions: 0, // legacy fallback
    created_at,
  };
}

function mapGatewayPromoRow(row: unknown): PromoCode | null {
  if (!isRecord(row)) return null;

  const id = readString(row.id);
  if (!id) return null;

  const code = readString(row.code) || readString(row.promo_code) || '';
  const active = readBool(row.active, false);

  // Try to interpret both common shapes:
  // (A) type + value
  // (B) explicit discount_percent/discount_amount
  const type = readString(row.type);
  const value = readNumber(row.value, 0);

  const discount_percent =
    type === 'percent'
      ? value
      : typeof row.discount_percent === 'number'
        ? row.discount_percent
        : null;

  const discount_amount =
    type === 'fixed' ? value : typeof row.discount_amount === 'number' ? row.discount_amount : null;

  const starts_at = readNullableString(row.starts_at) ?? readNullableString(row.startsAt);
  const ends_at = readNullableString(row.ends_at) ?? readNullableString(row.endsAt);

  return {
    id,
    code,
    discount_percent:
      typeof discount_percent === 'number' && Number.isFinite(discount_percent)
        ? discount_percent
        : null,
    discount_amount:
      typeof discount_amount === 'number' && Number.isFinite(discount_amount)
        ? discount_amount
        : null,
    active,
    starts_at: starts_at ?? null,
    ends_at: ends_at ?? null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────────────────

export const marketingService = {
  // ===========================================================================
  // Campaigns (ADMIN) — always via admin-gateway
  // ===========================================================================
  async getCampaigns(): Promise<Campaign[]> {
    const rows = await callAdminGateway('campaigns:list');
    const list: Campaign[] = [];

    if (Array.isArray(rows)) {
      for (const r of rows) {
        const mapped = mapGatewayCampaignRow(r);
        if (mapped) list.push(mapped);
      }
    }

    return list;
  },

  async updateCampaign(
    id: string,
    updates: Partial<Pick<Campaign, 'budget' | 'status'>>,
  ): Promise<void> {
    // ✅ status updates are safe + supported by gateway
    if (updates.status) {
      const active = updates.status === 'active';
      await callAdminGateway('campaigns:toggle', { id, active });
    }

    // ❌ Budget updates are NOT safe here because:
    // - This file uses the legacy UI Campaign type (not the admin campaign payload type)
    // - admin-gateway campaigns:update requires CampaignUpdatePayload (full shape)
    // - guessing missing required fields is how admin systems break in prod
    if (typeof updates.budget === 'number') {
      throw new Error(
        'Campaign budget must be edited in Campaign Manager (full campaign payload required).',
      );
    }
  },

  // ===========================================================================
  // Promo Codes (ADMIN) — always via admin-gateway
  // ===========================================================================
  async getPromoCodes(): Promise<PromoCode[]> {
    const rows = await callAdminGateway('promos:list');
    const list: PromoCode[] = [];

    if (Array.isArray(rows)) {
      for (const r of rows) {
        const mapped = mapGatewayPromoRow(r);
        if (mapped) list.push(mapped);
      }
    }

    return list;
  },

  // ===========================================================================
  // Abandoned Carts (currently direct; move behind gateway only if you lock it)
  // ===========================================================================
  async getAbandonedCarts(): Promise<AbandonedCart[]> {
    const { data, error } = await supabase
      .from('abandoned_cart_sessions')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (
      data?.map((row) => ({
        id: row.id,
        user_id: row.user_id,
        email: row.email,
        cart_value: row.cart_value_cents ?? 0,
        recovered: row.recovered ?? false,
        created_at: row.created_at ?? '',
      })) ?? []
    );
  },

  // ===========================================================================
  // AI Optimizer Rules (currently direct; move behind gateway only if you lock it)
  // ===========================================================================
  async getOptimizerRules(): Promise<AIOptimizerRule[]> {
    const { data, error } = await supabase.from('discount_optimizer_rules').select('*');

    if (error) throw error;

    return (
      data?.map((row) => ({
        id: row.id,
        name: 'Optimizer Rule',
        min_cart_value: 0,
        suggested_discount_percent: row.suggested_discount ?? 0,
        confidence_score: row.min_conversion_rate ?? 0,
        active: row.active ?? false,
      })) ?? []
    );
  },
};
