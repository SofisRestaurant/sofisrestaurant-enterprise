// src/types/marketing.ts
// Marketing Domain Types

export type CampaignType =
  | 'email'
  | 'sms'
  | 'social'
  | 'paid_ads'
  | 'in_store'
  | 'referral';

export type CampaignStatus =
  | 'draft'
  | 'active'
  | 'paused'
  | 'completed'
  | 'archived';

export type MarketingChannel =
  | 'email'
  | 'sms'
  | 'instagram'
  | 'facebook'
  | 'google_ads'
  | 'tiktok'
  | 'direct';

export interface Campaign {
  id: string;
  name: string;
  type: CampaignType;
  status: CampaignStatus;
  channel: MarketingChannel;
  budget: number;
  spent: number;
  revenue: number;
  conversions: number;
  created_at: string;
}

export interface AbandonedCart {
  id: string;
  user_id: string | null;
  email: string | null;
  cart_value: number;
  recovered: boolean;
  created_at: string;
}

export interface CampaignPerformance {
  campaignId: string
  campaignName: string
  revenue: number
  spent: number
  roi: number
  conversions: number
  reach: number
}

export interface PromoCode {
  id: string;
  code: string;
  discount_percent: number | null;
  discount_amount: number | null;
  active: boolean;
  starts_at: string | null;
  ends_at: string | null;
}

export interface MarketingMetrics {
  totalRevenue: number;
  totalSpend: number;
  totalConversions: number;
  roiPercent: number;
  recoveryRate: number;
}

export interface AIOptimizerRule {
  id: string;
  name: string;
  min_cart_value: number;
  suggested_discount_percent: number;
  confidence_score: number;
  active: boolean;
}