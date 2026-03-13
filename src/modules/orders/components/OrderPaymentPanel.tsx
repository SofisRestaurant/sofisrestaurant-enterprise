// =============================================================================
// src/modules/orders/components/OrderPaymentPanel.tsx
// =============================================================================

import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  DollarSign,
  ExternalLink,
  Eye,
  EyeOff,
  RefreshCw,
  Shield,
  XCircle,
  Zap,
} from 'lucide-react';

import type {
  OrderPaymentDetail,
  OrderPaymentSummary,
  RiskSignalRow,
} from '../types/order-payment.types';

const PANEL_SKELETON_ROWS = ['summary', 'amount', 'status', 'method', 'footer'] as const;

function formatStatusLabel(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatMoney(cents: number, currency: string): string {
  const normalizedCurrency = currency.trim().toUpperCase() || 'USD';

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: normalizedCurrency,
  }).format(cents / 100);
}

function useCopy(timeout = 1800): {
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
      }, timeout);
    });
  };

  return { copied, copy };
}

function StripeIdRow({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href?: string;
}) {
  const { copied, copy } = useCopy();

  if (value.trim().length === 0) {
    return null;
  }

  return (
    <div className="flex items-center justify-between gap-2 border-t border-white/5 py-2 first:border-0">
      <span className="w-36 shrink-0 text-[11px] uppercase tracking-wider text-slate-500">
        {label}
      </span>

      <div className="flex min-w-0 items-center gap-1.5">
        <span className="truncate font-mono text-xs text-slate-300">{value}</span>

        <button
          type="button"
          onClick={() => {
            copy(value, label);
          }}
          className="shrink-0 text-slate-600 transition-colors hover:text-slate-300"
          title="Copy"
          aria-label={`Copy ${label}`}
        >
          {copied === label ? (
            <Check size={12} className="text-emerald-400" />
          ) : (
            <Copy size={12} />
          )}
        </button>

        {typeof href === 'string' && href.length > 0 ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-slate-600 transition-colors hover:text-slate-300"
            aria-label={`Open ${label} in Stripe`}
          >
            <ExternalLink size={12} />
          </a>
        ) : null}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { cls: string; icon: React.ReactNode }> = {
    succeeded: {
      cls: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300',
      icon: <CheckCircle2 size={11} />,
    },
    refunded: {
      cls: 'border-blue-500/30 bg-blue-500/15 text-blue-300',
      icon: <RefreshCw size={11} />,
    },
    partially_refunded: {
      cls: 'border-amber-500/30 bg-amber-500/15 text-amber-300',
      icon: <RefreshCw size={11} />,
    },
    failed: {
      cls: 'border-rose-500/30 bg-rose-500/15 text-rose-300',
      icon: <XCircle size={11} />,
    },
    requires_action: {
      cls: 'border-amber-500/30 bg-amber-500/15 text-amber-300',
      icon: <AlertTriangle size={11} />,
    },
    processing: {
      cls: 'border-violet-500/30 bg-violet-500/15 text-violet-300',
      icon: <Zap size={11} />,
    },
  };

  const fallback = {
    cls: 'border-slate-500/30 bg-slate-500/15 text-slate-300',
    icon: <DollarSign size={11} />,
  };

  const selected = config[status] ?? fallback;

  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold',
        selected.cls,
      ].join(' ')}
    >
      {selected.icon}
      {formatStatusLabel(status)}
    </span>
  );
}

function CardBrandIcon({ brand }: { brand: string }) {
  const colors: Record<string, string> = {
    visa: 'text-blue-400',
    mastercard: 'text-orange-400',
    amex: 'text-sky-400',
    discover: 'text-amber-400',
  };

  const normalizedBrand = brand.trim().toLowerCase();

  return (
    <span
      className={[
        'text-xs font-bold uppercase tracking-wider',
        colors[normalizedBrand] ?? 'text-slate-300',
      ].join(' ')}
    >
      {brand.trim().length > 0 ? brand : 'Card'}
    </span>
  );
}

function RiskRow({ signal }: { signal: RiskSignalRow }) {
  const statusConfig: Record<string, { dot: string; text: string }> = {
    pass: { dot: 'bg-emerald-400', text: 'text-emerald-300' },
    fail: { dot: 'bg-rose-400', text: 'text-rose-300' },
    warn: { dot: 'bg-amber-400', text: 'text-amber-300' },
    info: { dot: 'bg-blue-400', text: 'text-blue-300' },
    unknown: { dot: 'bg-slate-500', text: 'text-slate-400' },
  };

  const selected = statusConfig[signal.status] ?? statusConfig.unknown;

  return (
    <div
      className="flex items-center justify-between border-t border-white/5 py-1.5 first:border-0"
      title={signal.tooltip}
    >
      <span className="text-xs text-slate-500">{signal.label}</span>
      <div className="flex items-center gap-2">
        <span className={['text-xs font-medium capitalize', selected.text].join(' ')}>
          {signal.value}
        </span>
        <span className={['h-2 w-2 shrink-0 rounded-full', selected.dot].join(' ')} />
      </div>
    </div>
  );
}

function MoneyBreakdown({ summary }: { summary: OrderPaymentSummary }) {
  const rows = [
    { key: 'subtotal', label: 'Subtotal', value: summary.subtotalFormatted },
    {
      key: 'tax',
      label: 'Tax',
      value: summary.taxCents > 0 ? formatMoney(summary.taxCents, summary.currency) : null,
    },
    {
      key: 'tip',
      label: 'Tip',
      value: summary.tipCents > 0 ? formatMoney(summary.tipCents, summary.currency) : null,
    },
    {
      key: 'delivery-fee',
      label: 'Delivery fee',
      value:
        summary.deliveryFeeCents > 0
          ? formatMoney(summary.deliveryFeeCents, summary.currency)
          : null,
    },
    {
      key: 'discount',
      label: 'Discount',
      value:
        summary.discountCents > 0 ? `-${formatMoney(summary.discountCents, summary.currency)}` : null,
    },
  ].filter(
    (row): row is { key: string; label: string; value: string } =>
      typeof row.value === 'string' && row.value.trim().length > 0,
  );

  return (
    <div className="space-y-1.5">
      {rows.map(({ key, label, value }) => (
        <div key={key} className="flex justify-between text-sm">
          <span className="text-slate-500">{label}</span>
          <span className="tabular-nums text-slate-300">{value}</span>
        </div>
      ))}

      <div className="mt-2 flex justify-between border-t border-white/8 pt-2 text-sm font-semibold">
        <span className="text-white">Total</span>
        <span className="tabular-nums text-white">{summary.totalFormatted}</span>
      </div>

      {summary.refundedAmountCents > 0 ? (
        <div className="flex justify-between text-sm">
          <span className="text-rose-400">Refunded</span>
          <span className="tabular-nums text-rose-400">−{summary.refundedAmountFormatted}</span>
        </div>
      ) : null}

      {summary.refundedAmountCents > 0 ? (
        <div className="flex justify-between text-sm font-semibold">
          <span className="text-slate-300">Net</span>
          <span className="tabular-nums text-slate-200">{summary.netAmountFormatted}</span>
        </div>
      ) : null}
    </div>
  );
}

function PanelSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-8 w-32 rounded-xl bg-white/6" />
      <div className="space-y-2">
        {PANEL_SKELETON_ROWS.map((rowKey) => (
          <div key={rowKey} className="flex justify-between">
            <div className="h-3 w-28 rounded bg-white/6" />
            <div className="h-3 w-20 rounded bg-white/4" />
          </div>
        ))}
      </div>
    </div>
  );
}

interface OrderPaymentPanelProps {
  summary: OrderPaymentSummary | null;
  detail: OrderPaymentDetail | null;
  riskSignals: RiskSignalRow[];
  isLoading: boolean;
  className?: string;
}

export function OrderPaymentPanel({
  summary,
  detail,
  riskSignals,
  isLoading,
  className = '',
}: OrderPaymentPanelProps) {
  const [showDevice, setShowDevice] = useState(false);

  if (isLoading) {
    return <PanelSkeleton />;
  }

  if (summary === null) {
    return <div className="py-6 text-center text-sm text-slate-500">No payment data available.</div>;
  }

  const stripeBaseUrl = 'https://dashboard.stripe.com';

  const paymentIntentHref =
    summary.stripePaymentIntentId.trim().length > 0
      ? `${stripeBaseUrl}/payments/${summary.stripePaymentIntentId}`
      : undefined;

  const chargeHref =
    summary.stripeChargeId.trim().length > 0
      ? `${stripeBaseUrl}/charges/${summary.stripeChargeId}`
      : undefined;

  const disputeHref =
    typeof detail?.disputeId === 'string' && detail.disputeId.trim().length > 0
      ? `${stripeBaseUrl}/disputes/${detail.disputeId}`
      : undefined;

  const billingAddress =
    typeof detail?.billingAddressLine1 === 'string' && detail.billingAddressLine1.trim().length > 0
      ? [
          detail.billingAddressLine1,
          typeof detail.billingCity === 'string' && detail.billingCity.trim().length > 0
            ? detail.billingCity
            : null,
          typeof detail.billingPostalCode === 'string' && detail.billingPostalCode.trim().length > 0
            ? detail.billingPostalCode
            : null,
          typeof detail.billingCountry === 'string' && detail.billingCountry.trim().length > 0
            ? detail.billingCountry
            : null,
        ]
          .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
          .join(', ')
      : null;

  const paymentMethodTypeLabel =
    summary.paymentMethodType.trim().length > 0
      ? summary.paymentMethodType.replace(/_/g, ' ')
      : 'unknown';

  const deviceRows = [
    {
      key: 'ip-address',
      label: 'IP address',
      value:
        typeof detail?.ipAddress === 'string' && detail.ipAddress.trim().length > 0
          ? `${detail.ipAddress}${detail.ipCountry ? ` (${detail.ipCountry})` : ''}`
          : null,
    },
    {
      key: 'fingerprint',
      label: 'Fingerprint',
      value:
        typeof detail?.deviceFingerprint === 'string' && detail.deviceFingerprint.trim().length > 0
          ? detail.deviceFingerprint
          : null,
    },
    {
      key: 'session-id',
      label: 'Session ID',
      value:
        typeof detail?.sessionId === 'string' && detail.sessionId.trim().length > 0
          ? detail.sessionId
          : null,
    },
  ].filter(
    (row): row is { key: string; label: string; value: string } =>
      typeof row.value === 'string' && row.value.trim().length > 0,
  );

  return (
    <div className={['space-y-5', className].join(' ')}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-2xl font-bold tracking-tight text-white tabular-nums">
            {summary.totalFormatted}
          </p>
          <p className="mt-0.5 text-xs uppercase tracking-wider text-slate-500">
            {summary.currency.toUpperCase()} · {paymentMethodTypeLabel}
          </p>
        </div>
        <StatusBadge status={summary.paymentStatus} />
      </div>

      <div className="rounded-xl border border-white/8 bg-black/20 p-4">
        <MoneyBreakdown summary={summary} />
      </div>

      {detail !== null ? (
        <div className="space-y-3 rounded-xl border border-white/8 bg-white/3 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">Card</p>

          <div className="flex items-center gap-3">
            <div className="flex h-7 w-10 items-center justify-center rounded-md border border-white/15 bg-black/30">
              <CreditCard size={14} className="text-slate-400" />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <CardBrandIcon brand={detail.cardBrand} />
                <span className="font-mono text-sm text-slate-300">•••• {detail.cardLast4}</span>
                <span className="text-xs text-slate-500">
                  {String(detail.cardExpMonth).padStart(2, '0')}/{detail.cardExpYear}
                </span>
              </div>

              <p className="mt-0.5 text-[11px] text-slate-600">
                {detail.funding} · {detail.walletType || detail.cardNetwork || 'direct'}
                {detail.cardCountry ? ` · ${detail.cardCountry}` : ''}
              </p>
            </div>
          </div>

          {typeof detail.billingName === 'string' && detail.billingName.trim().length > 0 ? (
            <div className="space-y-1 border-t border-white/6 pt-2">
              <p className="text-xs text-slate-300">{detail.billingName}</p>
              {billingAddress ? <p className="text-[11px] text-slate-500">{billingAddress}</p> : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="rounded-xl border border-white/8 bg-white/3 p-4">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-500">
          Stripe References
        </p>

        <StripeIdRow
          label="Payment Intent"
          value={summary.stripePaymentIntentId}
          href={paymentIntentHref}
        />
        <StripeIdRow label="Charge" value={summary.stripeChargeId} href={chargeHref} />
        <StripeIdRow label="Checkout Session" value={summary.stripeCheckoutSessionId} />
        <StripeIdRow label="Customer" value={summary.stripeCustomerId} />

        {typeof detail?.disputeId === 'string' && detail.disputeId.trim().length > 0 ? (
          <StripeIdRow label="Dispute" value={detail.disputeId} href={disputeHref} />
        ) : null}

        {typeof detail?.balanceTransactionId === 'string' &&
        detail.balanceTransactionId.trim().length > 0 ? (
          <StripeIdRow label="Balance Txn" value={detail.balanceTransactionId} />
        ) : null}
      </div>

      {riskSignals.length > 0 ? (
        <div className="rounded-xl border border-white/8 bg-white/3 p-4">
          <div className="mb-3 flex items-center gap-2">
            <Shield size={13} className="text-slate-400" />
            <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">
              Fraud & Risk Signals
            </p>

            {typeof detail?.riskScore === 'number' ? (
              <span
                className={[
                  'ml-auto rounded-full px-2 py-0.5 text-xs font-bold',
                  detail.riskScore >= 75
                    ? 'bg-rose-500/20 text-rose-300'
                    : detail.riskScore >= 40
                      ? 'bg-amber-500/20 text-amber-300'
                      : 'bg-emerald-500/20 text-emerald-300',
                ].join(' ')}
              >
                Score {detail.riskScore}
              </span>
            ) : null}
          </div>

          {riskSignals.map((signal) => (
            <RiskRow key={`${signal.label}:${signal.status}:${signal.value}`} signal={signal} />
          ))}
        </div>
      ) : null}

      {deviceRows.length > 0 ? (
        <div className="rounded-xl border border-white/8 bg-white/3 p-4">
          <button
            type="button"
            onClick={() => {
              setShowDevice((previous) => !previous);
            }}
            className="flex w-full items-center justify-between"
            aria-expanded={showDevice}
          >
            <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">
              Network / Device
            </p>
            {showDevice ? (
              <EyeOff size={13} className="text-slate-500" />
            ) : (
              <Eye size={13} className="text-slate-500" />
            )}
          </button>

          {showDevice ? (
            <div className="mt-3 space-y-1.5">
              {deviceRows.map(({ key, label, value }) => (
                <div key={key} className="flex items-center justify-between gap-2">
                  <span className="w-28 shrink-0 text-xs text-slate-500">{label}</span>
                  <span className="truncate font-mono text-xs text-slate-400">{value}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {summary.hasFailure &&
      typeof summary.lastPaymentError === 'string' &&
      summary.lastPaymentError.trim().length > 0 ? (
        <div className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-xs text-rose-400">
          <XCircle size={13} className="mt-0.5 shrink-0" />
          {summary.lastPaymentError}
        </div>
      ) : null}
    </div>
  );
}

export default OrderPaymentPanel;