import type {
  AdminCampaignStatus,
  AdminDateRange,
  AdminOrderPriority,
  AdminOrderStatus,
  AdminPaymentStatus,
  AdminPromoStatus,
  AdminTableSortState,
} from './admin-common.types';

export type AdminFilterValue =
  | string
  | number
  | boolean
  | null
  | readonly string[]
  | readonly number[]
  | readonly boolean[]
  | AdminDateRange
  | AdminTableSortState<string>;

export type AdminFilterStateShape = Record<string, AdminFilterValue>;

export interface AdminFilterOption<TValue extends string = string> {
  label: string;
  value: TValue;
  count?: number;
  disabled?: boolean;
}

export interface AdminOrdersFilterState extends AdminFilterStateShape {
  query: string;
  statuses: readonly (AdminOrderStatus | 'all')[];
  paymentStatuses: readonly (AdminPaymentStatus | 'all')[];
  priorities: readonly AdminOrderPriority[];
  orderTypes: readonly string[];
  assignedTo: readonly string[];
  includeDeleted: boolean;
  dateRange: AdminDateRange;
  page: number;
  pageSize: number;
  sort: AdminTableSortState<
    'createdAt' | 'amountTotal' | 'status' | 'customerName' | 'orderNumber' | 'waitMinutes'
  > | null;
}

export interface AdminMenuFilterState extends AdminFilterStateShape {
  query: string;
  categoryIds: readonly string[];
  visibility: 'all' | 'active' | 'inactive';
  availability: 'all' | 'available' | 'unavailable';
  featured: 'all' | 'featured' | 'not_featured';
  page: number;
  pageSize: number;
  sort: AdminTableSortState<'name' | 'price' | 'sortOrder' | 'categoryName' | 'status'> | null;
}

export interface AdminMarketingFilterState extends AdminFilterStateShape {
  query: string;
  campaignStatuses: readonly (AdminCampaignStatus | 'all')[];
  promoStatuses: readonly (AdminPromoStatus | 'all')[];
  placements: readonly string[];
  page: number;
  pageSize: number;
  sort: AdminTableSortState<'name' | 'status' | 'placement' | 'startAt' | 'endAt'> | null;
}

export const DEFAULT_ADMIN_DATE_RANGE: AdminDateRange = {
  preset: '30d',
  from: null,
  to: null,
};

export const DEFAULT_ADMIN_ORDERS_FILTERS: AdminOrdersFilterState = {
  query: '',
  statuses: ['all'],
  paymentStatuses: ['all'],
  priorities: [],
  orderTypes: [],
  assignedTo: [],
  includeDeleted: false,
  dateRange: DEFAULT_ADMIN_DATE_RANGE,
  page: 0,
  pageSize: 25,
  sort: {
    columnKey: 'createdAt',
    direction: 'desc',
  },
};

export const DEFAULT_ADMIN_MENU_FILTERS: AdminMenuFilterState = {
  query: '',
  categoryIds: [],
  visibility: 'all',
  availability: 'all',
  featured: 'all',
  page: 0,
  pageSize: 24,
  sort: {
    columnKey: 'sortOrder',
    direction: 'asc',
  },
};

export const DEFAULT_ADMIN_MARKETING_FILTERS: AdminMarketingFilterState = {
  query: '',
  campaignStatuses: ['all'],
  promoStatuses: ['all'],
  placements: [],
  page: 0,
  pageSize: 24,
  sort: {
    columnKey: 'startAt',
    direction: 'desc',
  },
};