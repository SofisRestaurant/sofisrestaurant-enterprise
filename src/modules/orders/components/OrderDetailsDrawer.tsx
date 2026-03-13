import React, { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  AlertTriangle,
  Check,
  Copy,
  CreditCard,
  GitBranch,
  Loader2,
  Package,
  RefreshCw,
  ShieldAlert,
  X,
} from 'lucide-react';

import { formatCurrency } from '@/utils/currency';
import { useOrderDetails, type DrawerTab } from '../hooks/useOrderDetails';
import { OrderDisputePanel } from './OrderDisputePanel';
import { OrderEvidencePanel } from './OrderEvidencePanel';
import { OrderPaymentPanel } from './OrderPaymentPanel';
import { OrderTimeline } from './OrderTimeline';
import type { OrderAdminFlags } from '../types';

type AppSupabaseClient = Parameters<typeof useOrderDetails>[0];
type OrderDetailsValue = ReturnType<typeof useOrderDetails>;
type DetailOrder = OrderDetailsValue['order'];

type UnknownRecord = Record<string, unknown>;

const FLAG_BADGES: Array<{
  key: keyof OrderAdminFlags;
  label: string;
  cls: string;
  icon: ReactNode;
}> = [
  {
    key: 'hasOpenDispute',
    label: 'Dispute',
    cls: 'bg-rose-500/20 text-rose-300 border-rose-500/35',
    icon: <ShieldAlert size={11} />,
  },
  {
    key: 'isHighRisk',
    label: 'High Risk',
    cls: 'bg-rose-500/20 text-rose-300 border-rose-500/35',
    icon: <AlertTriangle size={11} />,
  },
  {
    key: 'isRefunded',
    label: 'Refunded',
    cls: 'bg-blue-500/20 text-blue-300 border-blue-500/35',
    icon: <RefreshCw size={11} />,
  },
  {
    key: 'isPartialRefund',
    label: 'Part. Refund',
    cls: 'bg-amber-500/20 text-amber-300 border-amber-500/35',
    icon: <RefreshCw size={11} />,
  },
  {
    key: 'isProofMissing',
    label: 'Proof Missing',
    cls: 'bg-amber-500/20 text-amber-300 border-amber-500/35',
    icon: <AlertTriangle size={11} />,
  },
  {
    key: 'isPaymentFailed',
    label: 'Pay Failed',
    cls: 'bg-rose-500/20 text-rose-300 border-rose-500/35',
    icon: <AlertTriangle size={11} />,
  },
];

const TAB_META: Record<DrawerTab, { label: string; icon: ReactNode }> = {
  payment: { label: 'Payment', icon: <CreditCard size={14} /> },
  evidence: { label: 'Evidence', icon: <Package size={14} /> },
  dispute: { label: 'Dispute', icon: <ShieldAlert size={14} /> },
  timeline: { label: 'Timeline', icon: <GitBranch size={14} /> },
};

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(record: UnknownRecord, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  }

  return null;
}

function readNumber(record: UnknownRecord, keys: readonly string[]): number | null {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.length === 0) {
        continue;
      }

      const parsed = Number(trimmed);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function readDateLike(record: UnknownRecord, keys: readonly string[]): Date | string | null {
  for (const key of keys) {
    const value = record[key];

    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value;
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  }

  return null;
}

function getOrderId(order: DetailOrder): string {
  const unknownOrder: unknown = order;

  if (isRecord(unknownOrder)) {
    return readString(unknownOrder, ['id']) ?? 'UNKNOWN';
  }

  return 'UNKNOWN';
}

function getOrderType(order: DetailOrder): string | null {
  const unknownOrder: unknown = order;

  if (!isRecord(unknownOrder)) {
    return null;
  }

  return readString(unknownOrder, ['orderType', 'order_type', 'fulfillmentType', 'fulfillment_type']);
}

function getOrderCreatedAt(order: DetailOrder): Date | string | null {
  const unknownOrder: unknown = order;

  if (!isRecord(unknownOrder)) {
    return null;
  }

  return readDateLike(unknownOrder, ['createdAt', 'created_at']);
}

function getOrderCurrency(order: DetailOrder): string {
  const unknownOrder: unknown = order;

  if (!isRecord(unknownOrder)) {
    return 'USD';
  }

  return readString(unknownOrder, ['currency']) ?? 'USD';
}

function getOrderAmountTotalCents(order: DetailOrder): number {
  const unknownOrder: unknown = order;

  if (!isRecord(unknownOrder)) {
    return 0;
  }

  return (
    readNumber(unknownOrder, ['amountTotal', 'amount_total', 'totalCents', 'total_cents']) ?? 0
  );
}

function formatOrderTypeLabel(value: string | null | undefined): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return 'Unknown';
  }

  return value.replace(/_/g, ' ');
}

function formatOrderCreatedAt(value: Date | string | null | undefined): string {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return 'Unknown date';
    }

    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(value);
  }

  if (typeof value !== 'string' || value.trim().length === 0) {
    return 'Unknown date';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Unknown date';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parsed);
}

function formatOrderTotal(amountTotalCents: number, currency: string): string {
  const normalizedCurrency = currency.trim().toUpperCase();

  if (normalizedCurrency === 'USD') {
    return formatCurrency(amountTotalCents / 100);
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: normalizedCurrency,
  }).format(amountTotalCents / 100);
}

function useCopy(ms = 1600): {
  copied: string | null;
  copy: (value: string, key: string) => void;
} {
  const [copied, setCopied] = useState<string | null>(null);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const copy = (value: string, key: string): void => {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(key);

      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = window.setTimeout(() => {
        setCopied(null);
        timeoutRef.current = null;
      }, ms);
    });
  };

  return { copied, copy };
}

interface OrderDetailsDrawerProps {
  orderId: string | null;
  isOpen: boolean;
  onClose: () => void;
  supabase: SupabaseClient;
}

export function OrderDetailsDrawer({
  orderId,
  isOpen,
  onClose,
  supabase,
}: OrderDetailsDrawerProps) {
  const detail = useOrderDetails(supabase as AppSupabaseClient, isOpen ? orderId : null);
  const { copied, copy } = useCopy();

  useEffect(() => {
    const handler = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handler);
    }

    return () => {
      document.removeEventListener('keydown', handler);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';

    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const { order, flags } = detail;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Order details"
        className={[
          'fixed top-0 right-0 bottom-0 z-50 flex w-full max-w-540px flex-col',
          'border-l border-white/10 bg-slate-950 shadow-2xl shadow-black/60',
          'transition-transform duration-300 ease-out',
          isOpen ? 'translate-x-0' : 'translate-x-full',
        ].join(' ')}
      >
        <div className="shrink-0 border-b border-white/8 px-5 pt-5 pb-4">
          <div className="flex items-start justify-between">
            <div className="min-w-0 flex-1">
              {detail.isLoading ? (
                <div className="animate-pulse space-y-2">
                  <div className="h-4 w-32 rounded bg-white/8" />
                  <div className="h-3 w-24 rounded bg-white/6" />
                </div>
              ) : order ? (
                <>
                  <div className="flex items-center gap-2">
                    <h2 className="truncate text-base font-bold tracking-tight text-white">
                      Order #{getOrderId(order).slice(0, 8).toUpperCase()}
                    </h2>
                    <button
                      type="button"
                      onClick={() => {
                        copy(getOrderId(order), 'orderId');
                      }}
                      className="text-slate-600 transition-colors hover:text-slate-300"
                      title="Copy order ID"
                      aria-label="Copy order ID"
                    >
                      {copied === 'orderId' ? (
                        <Check size={13} className="text-emerald-400" />
                      ) : (
                        <Copy size={13} />
                      )}
                    </button>
                  </div>

                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <span className="text-xs capitalize text-slate-500">
                      {formatOrderTypeLabel(getOrderType(order))}
                    </span>
                    <span className="text-slate-700">·</span>
                    <span className="text-xs text-slate-500">
                      {formatOrderCreatedAt(getOrderCreatedAt(order))}
                    </span>
                    <span className="text-slate-700">·</span>
                    <span className="text-sm font-semibold tabular-nums text-white">
                      {formatOrderTotal(
                        getOrderAmountTotalCents(order),
                        getOrderCurrency(order),
                      )}
                    </span>
                  </div>

                  {flags ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {FLAG_BADGES.map(({ key, label, cls, icon }) =>
                        flags[key] ? (
                          <span
                            key={key}
                            className={[
                              'inline-flex items-center gap-1 rounded-full border px-2 py-0.5',
                              'text-[10px] font-semibold',
                              cls,
                            ].join(' ')}
                          >
                            {icon}
                            {label}
                          </span>
                        ) : null,
                      )}
                    </div>
                  ) : null}
                </>
              ) : detail.error ? (
                <p className="text-sm text-rose-400">{detail.error}</p>
              ) : (
                <p className="text-sm text-slate-500">No order selected</p>
              )}
            </div>

            <div className="ml-3 flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  void detail.refresh();
                }}
                disabled={detail.isLoading}
                className="rounded-xl border border-transparent p-2 text-slate-400 transition-all duration-150 hover:border-white/10 hover:bg-white/8 hover:text-white disabled:opacity-50"
                title="Refresh"
                aria-label="Refresh order details"
              >
                {detail.isLoading ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <RefreshCw size={16} />
                )}
              </button>

              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-transparent p-2 text-slate-400 transition-all duration-150 hover:border-white/10 hover:bg-white/8 hover:text-white"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        </div>

        {!detail.isLoading && order ? (
          <div className="shrink-0 border-b border-white/8 px-5 pt-3 pb-0">
            <div className="flex items-center gap-0.5">
              {detail.availableTabs.map((tab) => {
                const { label, icon } = TAB_META[tab];
                const isActive = detail.activeTab === tab;
                const hasBadge =
                  (tab === 'dispute' && flags?.hasOpenDispute) ||
                  (tab === 'evidence' && flags?.isProofMissing);

                return (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => {
                      detail.setActiveTab(tab);
                    }}
                    className={[
                      'relative -mb-px flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-all duration-150',
                      'focus:outline-none',
                      isActive
                        ? 'border-violet-400 text-violet-300'
                        : 'border-transparent text-slate-500 hover:border-white/20 hover:text-slate-300',
                    ].join(' ')}
                  >
                    {icon}
                    {label}
                    {hasBadge ? (
                      <span className="absolute top-2 right-1 h-1.5 w-1.5 rounded-full bg-rose-400" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="flex-1 overflow-y-auto overscroll-contain">
          <div className="px-5 py-5">
            {detail.isLoading ? (
              <div className="flex justify-center py-16">
                <Loader2 size={24} className="animate-spin text-slate-500" />
              </div>
            ) : detail.error ? (
              <div className="flex items-center gap-2 py-6 text-sm text-rose-400">
                <AlertTriangle size={15} />
                {detail.error}
              </div>
            ) : !order ? null : (
              <>
                {detail.activeTab === 'payment' ? (
                  <OrderPaymentPanel
                    summary={detail.paymentSummary}
                    detail={detail.paymentDetail}
                    riskSignals={detail.riskSignals}
                    isLoading={false}
                  />
                ) : null}

                {detail.activeTab === 'evidence' ? (
                  <OrderEvidencePanel evidence={detail.evidence} isLoading={false} />
                ) : null}

                {detail.activeTab === 'dispute' ? (
                  <OrderDisputePanel dispute={detail.disputeSummary} isLoading={false} />
                ) : null}

                {detail.activeTab === 'timeline' ? (
                  <OrderTimeline events={detail.timeline} isLoading={false} />
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default OrderDetailsDrawer;