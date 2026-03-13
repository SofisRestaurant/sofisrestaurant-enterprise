// ============================================================================
// src/modules/checkout/components/PaymentStatus.tsx
// PAYMENT STATUS — Enterprise UI (2026) • Sofi's Restaurant V2
// ============================================================================
// Purpose:
// - Display checkout/payment status to the user with excellent UX + a11y.
// - UX-only. Never logs tokens, session ids, or sensitive data.
// - Works with your existing paymentStatus helpers.
// ============================================================================

import React, { memo, useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  PaymentStatus as Status,
  getPaymentStatusMessage,
  getPaymentStatusColor,
} from '@/features/payments/paymentStatus';
import Spinner from '@/components/ui/Spinner';

type Severity = 'neutral' | 'success' | 'warning' | 'danger';

type DebugValue = string | number | boolean | null | undefined;

type PaymentStatusProps = {
  status: Status;

  /**
   * Optional: a short subtext line under the primary message.
   * Keep it non-sensitive.
   */
  subtitle?: string | null;

  /**
   * Optional: show a retry button (e.g. if a network call failed).
   * This component doesn't know HOW to retry — you pass the handler.
   */
  onRetry?: (() => void) | null;
  retryLabel?: string;

  /**
   * Optional: show a "dismiss" button for non-idle states.
   * Useful if you want to allow users to hide the banner.
   */
  dismissible?: boolean;
  onDismiss?: (() => void) | null;

  /**
   * Auto-hide after success/cancelled (ms). Set 0 to disable.
   * Good for “success” micro banners.
   */
  autoHideMs?: number;

  /**
   * If true, renders a compact, single-line version.
   */
  compact?: boolean;

  /**
   * Optional: safe debug info to show in a collapsible panel.
   * IMPORTANT: do NOT put tokens, session ids, or any secrets here.
   */
  debug?: Record<string, DebugValue> | null;

  className?: string;
};

const DEFAULTS = {
  retryLabel: 'Try again',
  autoHideMs: 3500,
} as const;

type UnknownRecord = Record<string, unknown>;

function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function safeString(v: unknown, max = 280): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

function severityFromStatus(status: Status): Severity {
  switch (status) {
    case Status.SUCCESS:
      return 'success';
    case Status.FAILED:
      return 'danger';
    case Status.CANCELLED:
      return 'warning';
    case Status.PROCESSING:
      return 'neutral';
    default:
      return 'neutral';
  }
}

function iconFor(status: Status): 'spinner' | 'success' | 'failed' | 'cancelled' | 'info' {
  if (status === Status.PROCESSING) return 'spinner';
  if (status === Status.SUCCESS) return 'success';
  if (status === Status.FAILED) return 'failed';
  if (status === Status.CANCELLED) return 'cancelled';
  return 'info';
}

function containerClasses(sev: Severity): string {
  switch (sev) {
    case 'success':
      return 'border border-green-200 bg-green-50';
    case 'danger':
      return 'border border-red-200 bg-red-50';
    case 'warning':
      return 'border border-amber-200 bg-amber-50';
    default:
      return 'border border-gray-200 bg-gray-50';
  }
}

function iconColorClasses(sev: Severity): string {
  switch (sev) {
    case 'success':
      return 'text-green-700';
    case 'danger':
      return 'text-red-700';
    case 'warning':
      return 'text-amber-700';
    default:
      return 'text-gray-700';
  }
}

function srStatusPrefix(status: Status): string {
  switch (status) {
    case Status.PROCESSING:
      return 'Processing.';
    case Status.SUCCESS:
      return 'Success.';
    case Status.FAILED:
      return 'Failed.';
    case Status.CANCELLED:
      return 'Cancelled.';
    default:
      return 'Status.';
  }
}

function buildWrapperClassName(sev: Severity, className?: string): string {
  return [
    'w-full rounded-xl p-4',
    'transition-all duration-200',
    containerClasses(sev),
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');
}

function hasDebugEntries(debug: PaymentStatusProps['debug']): debug is Record<string, DebugValue> {
  return Boolean(debug && isRecord(debug) && Object.keys(debug).length > 0);
}

function getDebugEntries(debug: PaymentStatusProps['debug']): Array<[string, DebugValue]> {
  return hasDebugEntries(debug) ? Object.entries(debug) : [];
}

function safeDisplayValue(value: DebugValue): string {
  return value === null || value === undefined ? '—' : String(value).slice(0, 160);
}

// Simple inline icons (avoid dependencies)
function SuccessIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}

function FailedIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function CancelledIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v4m0 4h.01" />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
      />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M13 16h-1v-4h-1m1-4h.01"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function StatusIcon({ status }: { status: Status }) {
  const icon = iconFor(status);

  if (icon === 'spinner') return <Spinner size="sm" />;
  if (icon === 'success') return <SuccessIcon />;
  if (icon === 'failed') return <FailedIcon />;
  if (icon === 'cancelled') return <CancelledIcon />;
  return <InfoIcon />;
}

function PaymentStatusComponent({
  status,
  subtitle = null,
  onRetry = null,
  retryLabel = DEFAULTS.retryLabel,
  dismissible = false,
  onDismiss = null,
  autoHideMs = DEFAULTS.autoHideMs,
  compact = false,
  debug = null,
  className,
}: PaymentStatusProps) {
  const [hidden, setHidden] = useState(false);
  const [showDebug, setShowDebug] = useState(false);

  const prevStatusRef = useRef<Status>(status);
  const timeoutRef = useRef<number | null>(null);

  const titleId = useId();
  const subtitleId = useId();
  const debugId = useId();

  const sev = severityFromStatus(status);
  const message = safeString(getPaymentStatusMessage(status)) ?? 'Payment status updated.';
  const subtitleSafe = safeString(subtitle);
  const colorClass = getPaymentStatusColor(status);
  const canRetry = Boolean(onRetry) && status === Status.FAILED;
  const canDismiss = Boolean(dismissible || onDismiss) && status !== Status.PROCESSING;
  const hasDebug = hasDebugEntries(debug);
  const debugEntries = getDebugEntries(debug);
  const wrapperCls = buildWrapperClassName(sev, className);
  const iconColorClass = iconColorClasses(sev);

  const handleDismiss = useCallback(() => {
    setHidden(true);
    setShowDebug(false);
    onDismiss?.();
  }, [onDismiss]);

  const handleRetryClick = useCallback(() => {
    onRetry?.();
  }, [onRetry]);

  const handleToggleDebug = useCallback(() => {
    setShowDebug((prev) => !prev);
  }, []);

  useEffect(() => {
    if (prevStatusRef.current !== status) {
      prevStatusRef.current = status;
      setHidden(false);
      setShowDebug(false);
    }
  }, [status]);

  useEffect(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (autoHideMs <= 0) return;
    if (status !== Status.SUCCESS && status !== Status.CANCELLED) return;

    timeoutRef.current = window.setTimeout(() => {
      setHidden(true);
      setShowDebug(false);
      onDismiss?.();
    }, autoHideMs);

    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [status, autoHideMs, onDismiss]);

  if (status === Status.IDLE || hidden) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-labelledby={titleId}
      aria-describedby={!compact && subtitleSafe ? subtitleId : undefined}
      className={wrapperCls}
      data-status={status}
    >
      <span className="sr-only">{srStatusPrefix(status)} </span>

      <div className="flex items-start gap-3">
        <div
          className={[
            'mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
            iconColorClass,
          ].join(' ')}
        >
          <StatusIcon status={status} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p id={titleId} className={['text-sm font-semibold', colorClass].join(' ')}>
                {message}
              </p>

              {!compact && subtitleSafe ? (
                <p id={subtitleId} className="mt-1 text-xs text-gray-600">
                  {subtitleSafe}
                </p>
              ) : null}
            </div>

            {canDismiss ? (
              <button
                type="button"
                onClick={handleDismiss}
                className="inline-flex items-center justify-center rounded-lg p-2 text-gray-500 transition-colors hover:bg-black/5 hover:text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-300"
                aria-label="Dismiss"
              >
                <CloseIcon />
              </button>
            ) : null}
          </div>

          {!compact && (canRetry || hasDebug) ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {canRetry ? (
                <button
                  type="button"
                  onClick={handleRetryClick}
                  className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-gray-900 shadow-sm ring-1 ring-gray-200 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300"
                >
                  {retryLabel}
                </button>
              ) : null}

              {hasDebug ? (
                <button
                  type="button"
                  onClick={handleToggleDebug}
                  aria-expanded={showDebug}
                  aria-controls={debugId}
                  className="rounded-lg px-3 py-2 text-xs font-semibold text-gray-700 ring-1 ring-gray-200 transition-colors hover:bg-black/5 focus:outline-none focus:ring-2 focus:ring-gray-300"
                >
                  {showDebug ? 'Hide details' : 'Details'}
                </button>
              ) : null}
            </div>
          ) : null}

          {hasDebug && showDebug ? (
            <div
              id={debugId}
              className="mt-3 rounded-lg bg-white/70 p-3 text-[11px] text-gray-700 ring-1 ring-gray-200"
            >
              <div className="grid grid-cols-1 gap-1">
                {debugEntries.map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between gap-3">
                    <span className="font-mono text-gray-500">{k}</span>
                    <span className="font-mono text-gray-900">{safeDisplayValue(v)}</span>
                  </div>
                ))}
              </div>

              <p className="mt-2 text-[10px] text-gray-500">
                Note: This panel must never include tokens, session IDs, or sensitive payment data.
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

PaymentStatusComponent.displayName = 'PaymentStatus';

export default memo(PaymentStatusComponent);