// src/components/ui/ErrorBanner.tsx
// ============================================================================
// ERROR BANNER
// ============================================================================
// Dismissible error/warning/info/success banners for admin forms.
// Consistent with the amber/black design system.
// ============================================================================

import { useState, useEffect } from 'react'

type BannerVariant = 'error' | 'warning' | 'success' | 'info'

interface ErrorBannerProps {
  message: string | null | undefined;
  variant?: BannerVariant;
  /** Auto-dismiss after N ms. 0 = never */
  autoDismissMs?: number;
  onDismiss?: () => void;
  /** Compact single-line style */
  compact?: boolean;
}

const VARIANT_STYLES: Record<BannerVariant, {
  wrapper: string
  icon:    string
  text:    string
  dismiss: string
}> = {
  error: {
    wrapper: 'bg-red-50 border-red-200',
    icon:    '✕',
    text:    'text-red-700',
    dismiss: 'text-red-400 hover:text-red-600',
  },
  warning: {
    wrapper: 'bg-amber-50 border-amber-200',
    icon:    '⚠',
    text:    'text-amber-700',
    dismiss: 'text-amber-400 hover:text-amber-600',
  },
  success: {
    wrapper: 'bg-green-50 border-green-200',
    icon:    '✓',
    text:    'text-green-700',
    dismiss: 'text-green-400 hover:text-green-600',
  },
  info: {
    wrapper: 'bg-blue-50 border-blue-200',
    icon:    'ℹ',
    text:    'text-blue-700',
    dismiss: 'text-blue-400 hover:text-blue-600',
  },
}

export function ErrorBanner({
  message,
  variant = 'error',
  autoDismissMs = 0,
  onDismiss,
  compact = false,
}: ErrorBannerProps) {
  // Track the message that was last dismissed so we can show a new one
  // without calling setState inside an effect body.
  const [dismissedMessage, setDismissedMessage] = useState<string | null | undefined>(null);

  // Auto-dismiss
  useEffect(() => {
    if (!message || !autoDismissMs) return;
    const t = setTimeout(() => {
      setDismissedMessage(message);
      onDismiss?.();
    }, autoDismissMs);
    return () => clearTimeout(t);
  }, [message, autoDismissMs, onDismiss]);

  // Treat banner as visible when message exists and hasn't been dismissed
  const visible = !!message && message !== dismissedMessage;

  if (!visible) return null;

  const s = VARIANT_STYLES[variant];

  function handleDismiss() {
    setDismissedMessage(message);
    onDismiss?.();
  }

  return (
    <div
      role="alert"
      className={[
        'flex items-start gap-3 rounded-lg border',
        compact ? 'px-3 py-2' : 'px-4 py-3',
        s.wrapper,
      ].join(' ')}
    >
      <span className={`shrink-0 font-bold text-base leading-none mt-0.5 ${s.text}`}>{s.icon}</span>
      <p className={`flex-1 text-sm leading-relaxed ${s.text}`}>{message}</p>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={handleDismiss}
        className={`shrink-0 text-lg leading-none transition ${s.dismiss}`}
      >
        ×
      </button>
    </div>
  );
}