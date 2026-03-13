import {
  createElement,
  Fragment,
  type MouseEventHandler,
  type ReactElement,
  type ReactNode,
} from 'react';

import type { Order, OrderCartItem } from '../types';
import {
  buildOrderDisplayName,
  formatOrderNumber,
  getCartItemCount,
  getOrderAgeMinutes,
  getOrderPriority,
  getOrderStatusLabel,
  getOrderStatusTone,
  getOrderTypeLabel,
  getPaymentStatusLabel,
  getPaymentStatusTone,
} from '../utils';

type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

const BADGE_CLASSNAMES: Readonly<Record<Tone, string>> = {
  neutral: 'border-zinc-700 bg-zinc-900 text-zinc-300',
  info: 'border-sky-500/30 bg-sky-500/10 text-sky-200',
  success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  warning: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  danger: 'border-red-500/30 bg-red-500/10 text-red-200',
};

const PRIORITY_TONES: Readonly<Record<'normal' | 'high' | 'urgent', Tone>> = {
  normal: 'neutral',
  high: 'warning',
  urgent: 'danger',
};

function joinClassNames(...values: Array<string | false | null | undefined>): string {
  return values.filter((value): value is string => Boolean(value)).join(' ');
}

function formatMoneyFromCents(amountCents: number, currency: string): string {
  const safeCurrency = typeof currency === 'string' && /^[A-Za-z]{3}$/.test(currency.trim())
    ? currency.trim().toUpperCase()
    : 'USD';

  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: safeCurrency,
    }).format(amountCents / 100);
  } catch {
    return `${safeCurrency} ${(amountCents / 100).toFixed(2)}`;
  }
}

function buildCartItemKey(item: OrderCartItem): string {
  const explicitId =
    'id' in item && typeof item.id === 'string' && item.id.trim().length > 0
      ? item.id.trim()
      : null;

  if (explicitId) {
    return explicitId;
  }

  const name = typeof item.name === 'string' ? item.name.trim() : 'item';
  const notes = typeof item.notes === 'string' ? item.notes.trim() : '';
  const quantity = Number.isFinite(item.quantity) ? String(Math.max(0, Math.floor(item.quantity))) : '0';
  const price = typeof item.price === 'number' && Number.isFinite(item.price) ? String(item.price) : '0';

  return `${name}::${notes}::${quantity}::${price}`;
}

function buildLoadingRowKeys(rows: number): string[] {
  const count = Math.max(1, Math.floor(rows));

  return Array.from({ length: count }, (_, idx) => `loading-row-${idx + 1}`);
}

export interface OrderBadgeProps {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}

export function OrderBadge({
  tone = 'neutral',
  children,
  className,
}: OrderBadgeProps): ReactElement {
  return createElement('span', {
    className: joinClassNames(
      'inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-wide',
      BADGE_CLASSNAMES[tone],
      className,
    ),
    children,
  });
}

export interface OrderStatusBadgeProps {
  status: string;
  className?: string;
}

export function OrderStatusBadge({
  status,
  className,
}: OrderStatusBadgeProps): ReactElement {
  return createElement(OrderBadge, {
    tone: getOrderStatusTone(status),
    className,
    children: getOrderStatusLabel(status),
  });
}

export interface PaymentStatusBadgeProps {
  status: string;
  className?: string;
}

export function PaymentStatusBadge({
  status,
  className,
}: PaymentStatusBadgeProps): ReactElement {
  return createElement(OrderBadge, {
    tone: getPaymentStatusTone(status),
    className,
    children: getPaymentStatusLabel(status),
  });
}

export interface OrderPriorityBadgeProps {
  priority: 'normal' | 'high' | 'urgent';
  className?: string;
}

export function OrderPriorityBadge({
  priority,
  className,
}: OrderPriorityBadgeProps): ReactElement | null {
  if (priority === 'normal') {
    return null;
  }

  return createElement(OrderBadge, {
    tone: PRIORITY_TONES[priority],
    className,
    children: priority === 'urgent' ? 'Urgent' : 'High priority',
  });
}

export interface OrderMetaRowProps {
  label: string;
  value: ReactNode;
  className?: string;
}

export function OrderMetaRow({
  label,
  value,
  className,
}: OrderMetaRowProps): ReactElement {
  return createElement(
    'div',
    {
      className: joinClassNames(
        'flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2.5',
        className,
      ),
    },
    createElement(
      'span',
      { className: 'text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500' },
      label,
    ),
    createElement(
      'span',
      { className: 'text-right text-sm font-semibold text-zinc-100' },
      value,
    ),
  );
}

export interface OrderLineItemsSummaryProps {
  items: readonly OrderCartItem[] | null | undefined;
  emptyLabel?: string;
}

export function OrderLineItemsSummary({
  items,
  emptyLabel = 'No line items',
}: OrderLineItemsSummaryProps): ReactElement {
  if (!items || items.length === 0) {
    return createElement('p', { className: 'text-sm text-zinc-500' }, emptyLabel);
  }

  return createElement(
    'ul',
    { className: 'space-y-2', 'aria-label': 'Order line items' },
    items.map((item) =>
      createElement(
        'li',
        {
          key: buildCartItemKey(item),
          className:
            'flex items-start justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2.5',
        },
        createElement(
          'div',
          null,
          createElement('div', { className: 'text-sm font-semibold text-zinc-100' }, item.name),
          item.notes
            ? createElement('div', { className: 'mt-1 text-xs text-zinc-500' }, item.notes)
            : null,
        ),
        createElement(
          'span',
          { className: 'text-xs font-semibold text-zinc-300' },
          `× ${Math.max(0, Math.floor(item.quantity))}`,
        ),
      ),
    ),
  );
}

export interface OrderEmptyStateAction {
  label: string;
  onClick: MouseEventHandler<HTMLButtonElement>;
}

export interface OrderEmptyStateProps {
  title: string;
  description: string;
  icon?: string;
  action?: OrderEmptyStateAction;
}

export function OrderEmptyState({
  title,
  description,
  icon = '📦',
  action,
}: OrderEmptyStateProps): ReactElement {
  return createElement(
    'div',
    {
      role: 'status',
      className: 'rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/40 p-6 text-center',
    },
    createElement('div', { className: 'text-3xl', 'aria-hidden': true }, icon),
    createElement('h3', { className: 'mt-3 text-lg font-black text-zinc-100' }, title),
    createElement('p', { className: 'mt-2 text-sm leading-6 text-zinc-500' }, description),
    action
      ? createElement(
          'button',
          {
            type: 'button',
            onClick: action.onClick,
            className:
              'mt-4 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:border-zinc-600 hover:bg-zinc-800',
          },
          action.label,
        )
      : null,
  );
}

export interface OrderLoadingStateProps {
  rows?: number;
}

export function OrderLoadingState({
  rows = 3,
}: OrderLoadingStateProps): ReactElement {
  const placeholders = buildLoadingRowKeys(rows);

  return createElement(
    'div',
    { className: 'space-y-3', 'aria-busy': true, 'aria-live': 'polite' },
    placeholders.map((key) =>
      createElement('div', {
        key,
        className: 'h-20 animate-pulse rounded-2xl border border-zinc-800 bg-zinc-950/50',
      }),
    ),
  );
}

export interface OrderSummaryCardProps {
  order: Order;
  onOpen?: MouseEventHandler<HTMLButtonElement>;
  actionLabel?: string;
  className?: string;
}

export function OrderSummaryCard({
  order,
  onOpen,
  actionLabel = 'View order',
  className,
}: OrderSummaryCardProps): ReactElement {
  const priority = getOrderPriority(order);
  const itemCount = getCartItemCount(order.cart_items);
  const customerLabel = buildOrderDisplayName(order);
  const totalLabel = formatMoneyFromCents(order.amount_total, order.currency);

  return createElement(
    'article',
    {
      className: joinClassNames(
        'rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4 shadow-sm',
        className,
      ),
    },
    createElement(
      'div',
      { className: 'flex items-start justify-between gap-3' },
      createElement(
        'div',
        null,
        createElement(
          'div',
          { className: 'text-sm font-black text-zinc-100' },
          formatOrderNumber(order.order_number),
        ),
        createElement('div', { className: 'mt-1 text-xs text-zinc-500' }, customerLabel),
      ),
      createElement(
        'div',
        { className: 'text-right' },
        createElement(
          'div',
          { className: 'text-sm font-black text-zinc-100' },
          totalLabel,
        ),
        createElement(
          'div',
          { className: 'mt-1 text-[11px] text-zinc-500' },
          `${getOrderAgeMinutes(order.created_at)}m ago`,
        ),
      ),
    ),
    createElement(
      'div',
      { className: 'mt-3 flex flex-wrap items-center gap-2' },
      createElement(OrderStatusBadge, { status: order.status }),
      createElement(PaymentStatusBadge, { status: order.payment_status }),
      createElement(OrderPriorityBadge, { priority }),
      createElement(OrderBadge, {
        tone: 'neutral',
        children: getOrderTypeLabel(order.order_type),
      }),
    ),
    createElement(
      'div',
      { className: 'mt-4 grid gap-2 sm:grid-cols-2' },
      createElement(OrderMetaRow, {
        label: 'Items',
        value: `${itemCount}`,
      }),
      createElement(OrderMetaRow, {
        label: 'Assigned',
        value: order.assigned_to ?? 'Unassigned',
      }),
    ),
    onOpen
      ? createElement(
          'button',
          {
            type: 'button',
            onClick: onOpen,
            className:
              'mt-4 inline-flex items-center rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-semibold text-zinc-100 transition hover:border-zinc-600 hover:bg-zinc-800',
          },
          actionLabel,
        )
      : null,
  );
}

export interface OrderSectionHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export function OrderSectionHeader({
  title,
  subtitle,
  actions,
}: OrderSectionHeaderProps): ReactElement {
  return createElement(
    'div',
    { className: 'flex flex-wrap items-start justify-between gap-3' },
    createElement(
      'div',
      null,
      createElement('h2', { className: 'text-xl font-black tracking-tight text-white' }, title),
      subtitle
        ? createElement('p', { className: 'mt-1 text-sm text-zinc-500' }, subtitle)
        : null,
    ),
    actions ? createElement(Fragment, null, actions) : null,
  );
}