// ============================================================================
// src/modules/checkout/components/PaymentStatus.tsx
// PAYMENT STATUS — Enterprise UI (2026) • Sofi's Restaurant V2
// ============================================================================
// Purpose:
// - Display checkout/payment status to the user with excellent UX + a11y.
// - UX-only. Never logs tokens, session ids, or sensitive data.
// - Works with your existing paymentStatus helpers.
// ============================================================================

import React, { memo, useEffect, useMemo, useRef, useState } from 'react'
import {
  PaymentStatus as Status,
  getPaymentStatusMessage,
  getPaymentStatusColor,
} from '@/features/payments/paymentStatus'
import Spinner from '@/components/ui/Spinner'

type Severity = 'neutral' | 'success' | 'warning' | 'danger'

type PaymentStatusProps = {
  status: Status

  /**
   * Optional: a short subtext line under the primary message.
   * Keep it non-sensitive.
   */
  subtitle?: string | null

  /**
   * Optional: show a retry button (e.g. if a network call failed).
   * This component doesn't know HOW to retry — you pass the handler.
   */
  onRetry?: (() => void) | null
  retryLabel?: string

  /**
   * Optional: show a "dismiss" button for non-idle states.
   * Useful if you want to allow users to hide the banner.
   */
  dismissible?: boolean
  onDismiss?: (() => void) | null

  /**
   * Auto-hide after success/cancelled (ms). Set 0 to disable.
   * Good for “success” micro banners.
   */
  autoHideMs?: number

  /**
   * If true, renders a compact, single-line version.
   */
  compact?: boolean

  /**
   * Optional: safe debug info to show in a collapsible panel.
   * IMPORTANT: do NOT put tokens, session ids, or any secrets here.
   */
  debug?: Record<string, string | number | boolean | null | undefined> | null

  className?: string
}

const DEFAULTS = {
  retryLabel: 'Try again',
  autoHideMs: 3500,
} as const

type UnknownRecord = Record<string, unknown>
function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function safeString(v: unknown, max = 280): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  if (!s) return null
  return s.length > max ? s.slice(0, max) : s
}

function severityFromStatus(status: Status): Severity {
  switch (status) {
    case Status.SUCCESS:
      return 'success'
    case Status.FAILED:
      return 'danger'
    case Status.CANCELLED:
      return 'warning'
    case Status.PROCESSING:
      return 'neutral'
    default:
      return 'neutral'
  }
}

function iconFor(status: Status) {
  if (status === Status.PROCESSING) return 'spinner'
  if (status === Status.SUCCESS) return 'success'
  if (status === Status.FAILED) return 'failed'
  if (status === Status.CANCELLED) return 'cancelled'
  return 'info'
}

function containerClasses(sev: Severity): string {
  // Keep colors conservative; your getPaymentStatusColor controls text color.
  switch (sev) {
    case 'success':
      return 'border border-green-200 bg-green-50'
    case 'danger':
      return 'border border-red-200 bg-red-50'
    case 'warning':
      return 'border border-amber-200 bg-amber-50'
    default:
      return 'border border-gray-200 bg-gray-50'
  }
}

function srStatusPrefix(status: Status): string {
  switch (status) {
    case Status.PROCESSING:
      return 'Processing.'
    case Status.SUCCESS:
      return 'Success.'
    case Status.FAILED:
      return 'Failed.'
    case Status.CANCELLED:
      return 'Cancelled.'
    default:
      return 'Status.'
  }
}

// Simple inline icons (avoid dependencies)
function SuccessIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  )
}
function FailedIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}
function CancelledIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v4m0 4h.01" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
    </svg>
  )
}
function InfoIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
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
  const [hidden, setHidden] = useState(false)
  const [showDebug, setShowDebug] = useState(false)

  const prevStatusRef = useRef<Status>(status)

  // Reset hide state on status change
  useEffect(() => {
    if (prevStatusRef.current !== status) {
      prevStatusRef.current = status
      setHidden(false)
      setShowDebug(false)
    }
  }, [status])

  // Auto-hide on SUCCESS/CANCELLED (configurable)
  useEffect(() => {
    if (autoHideMs <= 0) return
    if (status !== Status.SUCCESS && status !== Status.CANCELLED) return

    const t = window.setTimeout(() => {
      setHidden(true)
      onDismiss?.()
    }, autoHideMs)

    return () => window.clearTimeout(t)
  }, [status, autoHideMs, onDismiss])

  // Hide if idle or dismissed
  if (status === Status.IDLE || hidden) return null

  const sev = severityFromStatus(status)
  const icon = iconFor(status)

  const message = useMemo(() => {
    // Keep your canonical messaging centralized
    const m = getPaymentStatusMessage(status)
    return safeString(m) ?? 'Payment status updated.'
  }, [status])

  const subtitleSafe = useMemo(() => safeString(subtitle), [subtitle])

  const colorClass = useMemo(() => getPaymentStatusColor(status), [status])

  const canRetry = Boolean(onRetry) && status === Status.FAILED
  const canDismiss = Boolean(dismissible || onDismiss) && status !== Status.PROCESSING

  const hasDebug = useMemo(() => {
    if (!debug) return false
    if (!isRecord(debug)) return false
    return Object.keys(debug).length > 0
  }, [debug])

  const wrapperCls = [
    'w-full rounded-xl p-4',
    'transition-all duration-200',
    containerClasses(sev),
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      role="status"
      aria-live={status === Status.PROCESSING ? 'polite' : 'polite'}
      aria-atomic="true"
      className={wrapperCls}
    >
      {/* Screen reader prefix for better announcements */}
      <span className="sr-only">{srStatusPrefix(status)} </span>

      <div className="flex items-start gap-3">
        <div
          className={[
            'mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
            sev === 'success'
              ? 'text-green-700'
              : sev === 'danger'
                ? 'text-red-700'
                : sev === 'warning'
                  ? 'text-amber-700'
                  : 'text-gray-700',
          ].join(' ')}
        >
          {icon === 'spinner' ? (
            <Spinner size="sm" />
          ) : icon === 'success' ? (
            <SuccessIcon />
          ) : icon === 'failed' ? (
            <FailedIcon />
          ) : icon === 'cancelled' ? (
            <CancelledIcon />
          ) : (
            <InfoIcon />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className={['text-sm font-semibold', colorClass].join(' ')}>
                {message}
              </p>

              {!compact && subtitleSafe ? (
                <p className="mt-1 text-xs text-gray-600">{subtitleSafe}</p>
              ) : null}
            </div>

            {canDismiss ? (
              <button
                type="button"
                onClick={() => {
                  setHidden(true)
                  onDismiss?.()
                }}
                className="inline-flex items-center justify-center rounded-lg p-2 text-gray-500 hover:bg-black/5 hover:text-gray-800"
                aria-label="Dismiss"
              >
                <CloseIcon />
              </button>
            ) : null}
          </div>

          {/* Actions */}
          {(!compact && (canRetry || hasDebug)) ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {canRetry ? (
                <button
                  type="button"
                  onClick={() => onRetry?.()}
                  className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-gray-900 shadow-sm ring-1 ring-gray-200 hover:bg-gray-50"
                >
                  {retryLabel}
                </button>
              ) : null}

              {hasDebug ? (
                <button
                  type="button"
                  onClick={() => setShowDebug((v) => !v)}
                  className="rounded-lg px-3 py-2 text-xs font-semibold text-gray-700 ring-1 ring-gray-200 hover:bg-black/5"
                >
                  {showDebug ? 'Hide details' : 'Details'}
                </button>
              ) : null}
            </div>
          ) : null}

          {/* Debug panel (safe values only) */}
          {hasDebug && showDebug ? (
            <div className="mt-3 rounded-lg bg-white/70 p-3 text-[11px] text-gray-700 ring-1 ring-gray-200">
              <div className="grid grid-cols-1 gap-1">
                {Object.entries(debug ?? {}).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between gap-3">
                    <span className="font-mono text-gray-500">{k}</span>
                    <span className="font-mono text-gray-900">
                      {v === null || v === undefined ? '—' : String(v).slice(0, 160)}
                    </span>
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
  )
}

export default memo(PaymentStatusComponent)