import type { ReactNode } from 'react';

import type { SortDirection, UnknownRecord } from '@/shared/types';

export type AdminModuleKey =
  | 'dashboard'
  | 'orders'
  | 'menu'
  | 'marketing'
  | 'customers'
  | 'settings';

export type AdminLoadState = 'idle' | 'loading' | 'ready' | 'error';
export type AdminHealthState = 'healthy' | 'degraded' | 'down' | 'unknown';
export type AdminTrendDirection = 'up' | 'down' | 'flat';
export type AdminDatePreset = 'today' | '7d' | '30d' | '90d' | 'custom';
export type AdminStatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export interface AdminGatewayMeta {
  requestedBy: string;
  requestId: string;
  ts: number;
}

export interface AdminDateRange {
  preset: AdminDatePreset;
  from: string | null;
  to: string | null;
}

export interface AdminTableSortState<TColumnKey extends string = string> {
  columnKey: TColumnKey;
  direction: SortDirection;
}

export interface AdminMetric {
  key: string;
  label: string;
  value: string | number;
  description?: string;
  trend?: AdminTrendDirection;
  deltaValue?: number | null;
  deltaPercent?: number | null;
  tone?: AdminStatusTone;
  icon?: ReactNode;
}

export interface AdminRealtimeHealth {
  channelName: string | null;
  status: string;
  health: AdminHealthState;
  isSubscribed: boolean;
  lastEventAt: string | null;
  lastStatusAt: string | null;
  inserts: number;
  updates: number;
  deletes: number;
  reconnects: number;
  consecutiveFailures: number;
  staleAfterMs: number;
}

export interface AdminAccessSnapshot {
  checkedAt: string;
  isAuthenticated: boolean;
  isAdmin: boolean;
  role: string | null;
  userId: string | null;
  email: string | null;
  error: string | null;
}

export interface AdminListResult<TRow> {
  rows: TRow[];
  total: number;
  filteredTotal: number;
  page: number;
  pageSize: number;
  requestId: string;
  asOf: string;
}

export type AdminOrderStatus =
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'delivered'
  | 'cancelled'
  | (string & {});

export type AdminPaymentStatus =
  | 'paid'
  | 'unpaid'
  | 'refunded'
  | 'failed'
  | 'disputed'
  | (string & {});

export type AdminOrderType = 'pickup' | 'delivery' | 'dine_in' | (string & {});
export type AdminOrderPriority = 'normal' | 'high' | 'urgent';

export interface AdminOrderCartItem {
  name: string;
  quantity: number;
  price: number;
  note: string | null;
}

export interface AdminOrderSummary {
  id: string;
  orderNumber: number | null;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  customerUid: string | null;
  assignedTo: string | null;
  status: AdminOrderStatus;
  paymentStatus: AdminPaymentStatus;
  orderType: AdminOrderType;
  currency: string;
  amountSubtotal: number;
  amountTax: number;
  amountShipping: number;
  amountTotal: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  stripeSessionId: string;
  stripePaymentIntentId: string | null;
  shippingName: string | null;
  shippingPhone: string | null;
  waitMinutes: number;
  priority: AdminOrderPriority;
  isDeleted: boolean;
  cartItems: AdminOrderCartItem[];
  metadata: UnknownRecord;
}

export interface AdminOrderCounts {
  all: number;
  pending: number;
  preparing: number;
  ready: number;
  delivered: number;
  cancelled: number;
  paid: number;
  unpaid: number;
}

export interface AdminOrdersListResult extends AdminListResult<AdminOrderSummary> {
  counts: AdminOrderCounts;
}

export interface AdminMenuCategory {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
  sortOrder: number;
  isActive: boolean;
  itemCount: number;
  metadata: UnknownRecord;
}

export interface AdminMenuItem {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  shortDescription: string | null;
  categoryId: string | null;
  categorySlug: string | null;
  categoryName: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
  price: number;
  compareAtPrice: number | null;
  currency: string;
  isActive: boolean;
  isFeatured: boolean;
  isAvailable: boolean;
  sortOrder: number;
  prepTimeMinutes: number | null;
  spiceLevel: number | null;
  badges: string[];
  tags: string[];
  dietaryFlags: string[];
  metadata: UnknownRecord;
}

export interface AdminMenuModifierOption {
  id: string;
  groupId: string;
  name: string;
  description: string | null;
  priceDelta: number;
  isDefault: boolean;
  isActive: boolean;
  sortOrder: number;
  maxQuantity: number | null;
  metadata: UnknownRecord;
}

export interface AdminMenuModifierGroup {
  id: string;
  itemId: string | null;
  name: string;
  description: string | null;
  minSelections: number;
  maxSelections: number;
  isRequired: boolean;
  isActive: boolean;
  sortOrder: number;
  metadata: UnknownRecord;
  options: AdminMenuModifierOption[];
}

export interface AdminMenuSnapshot {
  categories: AdminMenuCategory[];
  items: AdminMenuItem[];
  modifierGroupsByItemId: Record<string, AdminMenuModifierGroup[]>;
  asOf: string;
  requestId: string;
}

export type AdminCampaignStatus =
  | 'draft'
  | 'scheduled'
  | 'active'
  | 'paused'
  | 'ended'
  | (string & {});

export type AdminPromoStatus =
  | 'draft'
  | 'scheduled'
  | 'active'
  | 'paused'
  | 'ended'
  | 'expired'
  | (string & {});

export interface AdminCampaign {
  id: string;
  name: string;
  placement: string | null;
  status: AdminCampaignStatus;
  priority: number;
  isActive: boolean;
  startAt: string | null;
  endAt: string | null;
  impressions: number;
  clicks: number;
  conversions: number;
  metadata: UnknownRecord;
}

export interface AdminPromo {
  id: string;
  code: string;
  name: string;
  status: AdminPromoStatus;
  discountType: string | null;
  discountValue: number | null;
  startsAt: string | null;
  endsAt: string | null;
  redemptions: number;
  metadata: UnknownRecord;
}

export interface AdminMarketingSnapshot {
  campaigns: AdminCampaign[];
  promos: AdminPromo[];
  asOf: string;
  requestId: string;
}

export interface AdminDashboardLayoutSection {
  id: string;
  title: string;
  description: string | null;
  module: AdminModuleKey;
  order: number;
  enabled: boolean;
  metadata: UnknownRecord;
}

export interface AdminDashboardLayout {
  sections: AdminDashboardLayoutSection[];
  asOf: string;
  requestId: string;
}

export interface AdminDashboardSnapshot {
  metrics: AdminMetric[];
  layout: AdminDashboardLayout;
  orders: {
    total: number;
    pending: number;
    preparing: number;
    ready: number;
  };
  menu: {
    categoryCount: number;
    itemCount: number;
    activeItemCount: number;
  };
  marketing: {
    campaignCount: number;
    activeCampaignCount: number;
    promoCount: number;
  };
  asOf: string;
  requestId: string;
}