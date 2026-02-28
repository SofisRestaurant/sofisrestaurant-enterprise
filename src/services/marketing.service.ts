// ============================================================================
// src/services/marketing.service.ts
// ============================================================================

import { supabase } from '@/lib/supabase/supabaseClient';
import type {
  Campaign,
  AbandonedCart,
  PromoCode,
  AIOptimizerRule,
} from '@/types/marketing';

export const marketingService = {
  // ===========================================================================
  // Campaigns
  // ===========================================================================
  async getCampaigns(): Promise<Campaign[]> {
  const { data, error } = await supabase
    .from('growth_campaigns')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (
    data?.map((row) => ({
      id: row.id,
      name: row.name ?? '',
      type: 'email', // fallback because DB doesn't store it
      status: 'active', // fallback
      channel: (row.channel ?? 'email') as Campaign['channel'],

      budget: (row.budget_cents ?? 0) / 100,
      spent: (row.spent_cents ?? 0) / 100,
      revenue: (row.revenue_cents ?? 0) / 100,

      conversions: 0, // fallback
      created_at: row.created_at ?? '',
    })) ?? []
  );
},
  async updateCampaign(
  id: string,
  updates: Partial<Pick<Campaign, 'budget' | 'status'>>
  ): Promise<void> {
    const { error } = await supabase
      .from('growth_campaigns')
      .update({
  budget_cents:
    updates.budget !== undefined
      ? Math.round(updates.budget * 100)
      : undefined,
  status: updates.status,
      })
      .eq('id', id);

    if (error) throw error;
  },

  // ===========================================================================
  // Promo Codes
  // ===========================================================================
  async getPromoCodes(): Promise<PromoCode[]> {
    const { data, error } = await supabase
      .from('promotions')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return (
      data?.map((row) => ({
        id: row.id,
        code: row.code,
        discount_percent:
          row.type === 'percent' ? row.value ?? 0 : null,
        discount_amount:
          row.type === 'fixed' ? row.value ?? 0 : null,
        active: row.active ?? false,
        starts_at: row.starts_at ?? null,
        ends_at: row.ends_at ?? null,
      })) ?? []
    );
  },

  // ===========================================================================
  // Abandoned Carts
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
  // AI Optimizer Rules
  // ===========================================================================
  async getOptimizerRules(): Promise<AIOptimizerRule[]> {
  const { data, error } = await supabase
    .from('discount_optimizer_rules')
    .select('*');

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
}}