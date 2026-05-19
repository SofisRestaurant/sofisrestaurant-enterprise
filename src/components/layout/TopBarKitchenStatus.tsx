// src/components/layout/TopBarKitchenStatus.tsx
// =============================================================================
// TOP BAR KITCHEN STATUS — Live compact kitchen status chip
// =============================================================================

import { Clock3, Flame } from 'lucide-react';

import { useKitchenStatus } from '@/features/restaurant/useKitchenStatus';

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

export default function TopBarKitchenStatus() {
  const status = useKitchenStatus();

  return (
    <span
      className={cx(
        'inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-1.5',
        'text-[8.5px] font-black uppercase tracking-[0.1em]',
        'ring-1 backdrop-blur-xl transition',
        status.isOpen
          ? [
              'bg-emerald-50 text-emerald-700 ring-emerald-200/80',
              'shadow-[0_5px_14px_rgba(16,185,129,0.16)]',
              'dark:bg-emerald-400/15 dark:text-emerald-200 dark:ring-emerald-300/20',
            ].join(' ')
          : [
              'bg-ink-50 text-ink-500 ring-ink-100',
              'dark:bg-white/8 dark:text-white/55 dark:ring-white/10',
            ].join(' '),
      )}
      title={status.helper}
      aria-label={`${status.label}. ${status.helper}`}
    >
      <span
        className={cx(
          'relative flex h-1.5 w-1.5 shrink-0 rounded-full',
          status.isOpen ? 'bg-emerald-500' : 'bg-ink-300 dark:bg-white/35',
        )}
        aria-hidden="true"
      >
        {status.isOpen ? (
          <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400 opacity-70" />
        ) : null}
      </span>

      {status.isOpen ? (
        <Flame className="h-3 w-3" strokeWidth={2.5} aria-hidden="true" />
      ) : (
        <Clock3 className="h-3 w-3" strokeWidth={2.5} aria-hidden="true" />
      )}

      <span className="hidden xs:inline">{status.label}</span>
      <span className="xs:hidden">{status.shortLabel}</span>
    </span>
  );
}