import type { AdminPromo } from '@/modules/admin/types/admin-common.types';

export const STATUS_FILTER_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'live', label: '🟢 Live' },
  { value: 'scheduled', label: '🕐 Scheduled' },
  { value: 'expired', label: '⏰ Expired' },
  { value: 'inactive', label: '⚫ Inactive' },
  { value: 'draft', label: '📝 Draft' },
] as const;

export const TYPE_FILTER_OPTIONS = [
  { value: '', label: 'All types' },
  { value: 'percent', label: 'Percent (%)' },
  { value: 'fixed', label: 'Fixed ($)' },
  { value: 'amount', label: 'Amount ($)' },
  { value: 'bogo', label: 'BOGO' },
  { value: 'free_item', label: 'Free Item' },
] as const;

export const SORT_OPTIONS = [
  { value: 'recent', label: 'Newest first' },
  { value: 'code', label: 'Code A–Z' },
  { value: 'uses', label: 'Most used' },
  { value: 'revenue', label: 'Highest revenue' },
  { value: 'ending', label: 'Ending soon' },
] as const;

export const QUICK_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'live', label: 'Live' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'capped', label: 'Capped' },
  { value: 'expiring', label: 'Expiring soon' },
] as const;

export const EXPIRING_SOON_MS = 1000 * 60 * 60 * 24 * 7;

export type PromoLifecycle = 'live' | 'scheduled' | 'expired' | 'inactive' | 'draft';
export type StatusFilter = '' | PromoLifecycle;
export type QuickFilter = (typeof QUICK_FILTERS)[number]['value'];
export type SortKey = (typeof SORT_OPTIONS)[number]['value'];

export type Filters = {
  q: string;
  type: string;
  status: StatusFilter;
  sort: SortKey;
  quick: QuickFilter;
};

export type BadgeTone = 'success' | 'warning' | 'info' | 'neutral' | 'danger';

export type EnrichedPromo = AdminPromo & {
  lifecycle: PromoLifecycle;
  isActive: boolean;
  currentUses: number;
  maxUses: number | null;
  usagePercent: number | null;
  isCapped: boolean;
  revenueCents: number;
  minOrderCents: number | null;
  perUserLimit: number | null;
  startsAtSafe: Date | null;
  endsAtSafe: Date | null;
  nameSafe: string | null;
  codeSafe: string;
  discountTypeSafe: string | null;
  discountValueSafe: number | null;
  expiresSoon: boolean;
};

export const DEFAULT_PROMO_FILTERS: Filters = {
  q: '',
  type: '',
  status: '',
  sort: 'recent',
  quick: 'all',
};