import {
  KITCHEN_STATUSES,
  type Order,
  type OrderCartItem,
  type OrderRow,
  type OrdersFilterTab,
} from '../types';

export const DEFAULT_ORDERS_PAGE = 0;
export const DEFAULT_ORDERS_PAGE_SIZE = 20;
export const MAX_ORDERS_PAGE_SIZE = 100;
export const DEFAULT_ORDER_CURRENCY = 'USD';
export const DEFAULT_ORDER_OVERDUE_MINUTES = 20;

export type OrderStatusTone = 'neutral' | 'info' | 'warning' | 'success' | 'danger';
export type PaymentStatusTone = 'neutral' | 'info' | 'warning' | 'success' | 'danger';

export interface OrdersPaginationInput {
  page?: number;
  pageSize?: number;
}

export interface OrdersPagination {
  page: number;
  pageSize: number;
  from: number;
  to: number;
}

export interface OrderSearchableShape {
  order_number: number | string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
}

export interface OrderDateShape {
  created_at: string;
}

export interface OrderPriorityShape extends OrderDateShape {
  status: string;
}

export type OrderPriority = 'normal' | 'high' | 'urgent';

const ORDER_STATUS_LABELS: Record<string, string> = {
  new: 'New',
  confirmed: 'Confirmed',
  preparing: 'Preparing',
  ready: 'Ready',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
  completed: 'Completed',
  canceled: 'Canceled',
  cancelled: 'Canceled',
};

const ORDER_STATUS_TONES: Record<string, OrderStatusTone> = {
  new: 'info',
  confirmed: 'info',
  preparing: 'warning',
  ready: 'success',
  out_for_delivery: 'info',
  delivered: 'success',
  completed: 'success',
  canceled: 'danger',
  cancelled: 'danger',
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  unpaid: 'Unpaid',
  paid: 'Paid',
  processing: 'Processing',
  requires_payment_method: 'Requires payment method',
  requires_confirmation: 'Requires confirmation',
  requires_action: 'Requires action',
  succeeded: 'Succeeded',
  failed: 'Failed',
  refunded: 'Refunded',
  partially_refunded: 'Partially refunded',
  canceled: 'Canceled',
  no_payment_required: 'No payment required',
};

const PAYMENT_STATUS_TONES: Record<string, PaymentStatusTone> = {
  pending: 'warning',
  unpaid: 'warning',
  paid: 'success',
  processing: 'info',
  requires_payment_method: 'warning',
  requires_confirmation: 'warning',
  requires_action: 'warning',
  succeeded: 'success',
  failed: 'danger',
  refunded: 'neutral',
  partially_refunded: 'neutral',
  canceled: 'danger',
  no_payment_required: 'neutral',
};

const TERMINAL_ORDER_STATUSES = new Set<string>([
  'delivered',
  'completed',
  'canceled',
  'cancelled',
]);

const ACTIVE_KITCHEN_ORDER_STATUSES = new Set<string>(
  KITCHEN_STATUSES.map((status) => normalizeToken(status)),
);

const PAID_PAYMENT_STATUSES = new Set<string>(['paid', 'succeeded']);

function normalizeToken(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function titleCaseToken(value: string): string {
  return value
    .split(/[_\s-]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function normalizeOrderNumberValue(value: number | string | null | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : Number.MIN_SAFE_INTEGER;
  }

  return Number.MIN_SAFE_INTEGER;
}

function normalizeOrderStatusValue(value: string): string {
  const normalized = normalizeToken(value);

  if (normalized === 'cancelled') {
    return 'canceled';
  }

  if (normalized === 'delivered') {
    return 'completed';
  }

  return normalized;
}

function isPaidPaymentStatusValue(value: string): boolean {
  return PAID_PAYMENT_STATUSES.has(normalizeToken(value));
}

export function clampOrdersPageSize(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_ORDERS_PAGE_SIZE;
  }

  return Math.max(1, Math.min(MAX_ORDERS_PAGE_SIZE, Math.floor(value)));
}

export function sanitizeOrdersPage(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_ORDERS_PAGE;
  }

  return Math.max(0, Math.floor(value));
}

export function getOrdersPagination(input: OrdersPaginationInput = {}): OrdersPagination {
  const page = sanitizeOrdersPage(input.page);
  const pageSize = clampOrdersPageSize(input.pageSize);
  const from = page * pageSize;
  const to = from + pageSize - 1;

  return {
    page,
    pageSize,
    from,
    to,
  };
}

export function normalizeOrderSearch(value: string | null | undefined): string {
  return normalizeToken(value);
}

export function formatOrderNumber(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }

  return `#${String(value)}`;
}

export function getOrderStatusLabel(status: string): string {
  const normalized = normalizeOrderStatusValue(status);
  return ORDER_STATUS_LABELS[normalized] ?? titleCaseToken(normalized || status);
}

export function getPaymentStatusLabel(status: string): string {
  const normalized = normalizeToken(status);
  return PAYMENT_STATUS_LABELS[normalized] ?? titleCaseToken(normalized || status);
}

export function getOrderStatusTone(status: string): OrderStatusTone {
  const normalized = normalizeOrderStatusValue(status);
  return ORDER_STATUS_TONES[normalized] ?? 'neutral';
}

export function getPaymentStatusTone(status: string): PaymentStatusTone {
  const normalized = normalizeToken(status);
  return PAYMENT_STATUS_TONES[normalized] ?? 'neutral';
}

export function isTerminalOrderStatus(status: string): boolean {
  return TERMINAL_ORDER_STATUSES.has(normalizeOrderStatusValue(status));
}

export function isActiveOrderStatus(status: string): boolean {
  const normalized = normalizeOrderStatusValue(status);

  if (normalized.length === 0) {
    return false;
  }

  return !isTerminalOrderStatus(normalized);
}

export function isKitchenOrderStatus(status: string): boolean {
  const normalized = normalizeOrderStatusValue(status);
  return ACTIVE_KITCHEN_ORDER_STATUSES.has(normalized);
}

export function getOrderTypeLabel(value: string): string {
  const normalized = normalizeToken(value);

  if (normalized === 'food') {
    return 'Food';
  }

  if (normalized === 'merch') {
    return 'Merch';
  }

  return titleCaseToken(normalized || value);
}

export function buildOrderDisplayName(
  order:
    | Pick<Order, 'customer_name' | 'customer_email'>
    | Pick<OrderRow, 'customer_name' | 'customer_email'>,
): string {
  return order.customer_name ?? order.customer_email ?? 'Guest';
}

export function getOrderAgeMinutes(createdAt: string): number {
  const timestamp = new Date(createdAt).getTime();

  if (Number.isNaN(timestamp)) {
    return 0;
  }

  return Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
}

export function isOrderOverdue(
  createdAt: string,
  thresholdMinutes = DEFAULT_ORDER_OVERDUE_MINUTES,
): boolean {
  return getOrderAgeMinutes(createdAt) >= Math.max(1, Math.floor(thresholdMinutes));
}

export function getOrderPriority(
  order: OrderPriorityShape,
  highMinutes = 12,
  urgentMinutes = DEFAULT_ORDER_OVERDUE_MINUTES,
): OrderPriority {
  if (isTerminalOrderStatus(order.status)) {
    return 'normal';
  }

  const ageMinutes = getOrderAgeMinutes(order.created_at);
  const normalizedHigh = Math.max(1, Math.floor(highMinutes));
  const normalizedUrgent = Math.max(normalizedHigh, Math.floor(urgentMinutes));

  if (ageMinutes >= normalizedUrgent) {
    return 'urgent';
  }

  if (ageMinutes >= normalizedHigh) {
    return 'high';
  }

  return 'normal';
}

export function matchesOrderSearchQuery(
  order: OrderSearchableShape,
  rawSearch: string,
): boolean {
  const query = normalizeOrderSearch(rawSearch);

  if (query.length === 0) {
    return true;
  }

  const orderNumber = order.order_number !== null ? String(order.order_number).toLowerCase() : '';
  const customerName = order.customer_name?.toLowerCase() ?? '';
  const customerEmail = order.customer_email?.toLowerCase() ?? '';
  const customerPhone = order.customer_phone?.toLowerCase() ?? '';

  return (
    orderNumber.includes(query) ||
    customerName.includes(query) ||
    customerEmail.includes(query) ||
    customerPhone.includes(query)
  );
}

export function matchesOrderFilterTab(
  order: Pick<Order, 'status'> | Pick<OrderRow, 'status'>,
  filter: OrdersFilterTab,
): boolean {
  const status = normalizeOrderStatusValue(order.status);
  const filterKey = String(filter);

  if (filterKey === 'all') {
    return true;
  }

  if (filterKey === 'new') {
    return status === 'new';
  }

  if (filterKey === 'confirmed') {
    return status === 'confirmed';
  }

  if (filterKey === 'preparing') {
    return status === 'preparing';
  }

  if (filterKey === 'ready') {
    return status === 'ready';
  }

  if (filterKey === 'out_for_delivery') {
    return status === 'out_for_delivery';
  }

  if (filterKey === 'completed') {
    return status === 'completed';
  }

  if (filterKey === 'canceled') {
    return status === 'canceled';
  }

  return false;
}

export function normalizeMoneyToCents(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }

  const absolute = Math.abs(value);

  if (absolute >= 1000 || (Number.isInteger(value) && absolute > 80)) {
    return Math.round(value);
  }

  return Math.round(value * 100);
}

export function getCartItemUnitPriceCents(item: OrderCartItem): number {
  return normalizeMoneyToCents(item.price);
}

export function getCartItemTotalCents(item: OrderCartItem): number {
  const quantity = Math.max(0, Math.floor(item.quantity));
  return getCartItemUnitPriceCents(item) * quantity;
}

export function calculateCartSubtotalCents(
  items: readonly OrderCartItem[] | null | undefined,
): number {
  if (!items || items.length === 0) {
    return 0;
  }

  return items.reduce((total, item) => total + getCartItemTotalCents(item), 0);
}

export function getCartItemCount(items: readonly OrderCartItem[] | null | undefined): number {
  if (!items || items.length === 0) {
    return 0;
  }

  return items.reduce((total, item) => total + Math.max(0, Math.floor(item.quantity)), 0);
}

export function getOrderTotalCents(
  order: Pick<Order, 'amount_total'> | Pick<OrderRow, 'amount_total'>,
): number {
  return Math.max(0, Math.round(order.amount_total));
}

export function coerceCurrencyCode(value: string | null | undefined): string {
  const normalized = value?.trim().toUpperCase() ?? '';

  if (!/^[A-Z]{3}$/.test(normalized)) {
    return DEFAULT_ORDER_CURRENCY;
  }

  return normalized;
}

export function sortOrdersByNewest<T extends OrderDateShape>(left: T, right: T): number {
  return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
}

export function sortOrdersByOldest<T extends OrderDateShape>(left: T, right: T): number {
  return new Date(left.created_at).getTime() - new Date(right.created_at).getTime();
}

export function compareOrderNumbers(
  left: Pick<Order, 'order_number'> | Pick<OrderRow, 'order_number'>,
  right: Pick<Order, 'order_number'> | Pick<OrderRow, 'order_number'>,
): number {
  return normalizeOrderNumberValue(left.order_number) - normalizeOrderNumberValue(right.order_number);
}

export function buildOrderSummaryLine(
  order: Pick<Order, 'order_number' | 'status' | 'payment_status'>,
): string {
  return `${formatOrderNumber(order.order_number)} · ${getOrderStatusLabel(order.status)} · ${getPaymentStatusLabel(order.payment_status)}`;
}

export function getOpenOrdersCount<T extends Pick<Order, 'status'>>(orders: readonly T[]): number {
  return orders.filter((order) => isActiveOrderStatus(order.status)).length;
}

export function getPaidOrdersCount<T extends Pick<Order, 'payment_status'>>(
  orders: readonly T[],
): number {
  return orders.filter((order) => isPaidPaymentStatusValue(order.payment_status)).length;
}

export function getPaidRevenueCents<T extends Pick<Order, 'payment_status' | 'amount_total'>>(
  orders: readonly T[],
): number {
  return orders.reduce((total, order) => {
    if (!isPaidPaymentStatusValue(order.payment_status)) {
      return total;
    }

    return total + Math.max(0, Math.round(order.amount_total));
  }, 0);
}