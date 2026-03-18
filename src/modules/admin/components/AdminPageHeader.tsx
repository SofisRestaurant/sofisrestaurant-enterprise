import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import clsx from 'clsx';

import type { AdminStatusTone } from '../types/admin-common.types';

// ======================================================
// METRIC TYPE
// ======================================================

export interface AdminPageHeaderMetric {
  id: string; // ✅ required now
  label: ReactNode;
  value: ReactNode;
  tone?: AdminStatusTone;
}

// ======================================================
// PROPS
// ======================================================

export interface AdminPageHeaderProps
  extends Omit<ComponentPropsWithoutRef<'header'>, 'title'> {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  badge?: ReactNode;
  actions?: ReactNode;
  metrics?: readonly AdminPageHeaderMetric[];
  divider?: boolean;
}

// ======================================================
// TONE CLASS HELPER
// ======================================================

function toneToClassName(tone: AdminStatusTone | undefined): string {
  switch (tone) {
    case 'success':
      return 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300';
    case 'warning':
      return 'border-amber-500/25 bg-amber-500/10 text-amber-300';
    case 'danger':
      return 'border-red-500/25 bg-red-500/10 text-red-300';
    case 'info':
      return 'border-sky-500/25 bg-sky-500/10 text-sky-300';
    case 'neutral':
    default:
      return 'border-zinc-800 bg-zinc-900/60 text-zinc-300';
  }
}

// ======================================================
// COMPONENT
// ======================================================

export function AdminPageHeader({
  eyebrow,
  title,
  subtitle,
  badge,
  actions,
  metrics,
  divider = false,
  className,
  children,
  ...rest
}: AdminPageHeaderProps) {
  return (
    <header
      className={clsx(
        'flex flex-col gap-4',
        divider && 'border-b border-zinc-800/80 pb-4',
        className,
      )}
      {...rest}
    >
      {/* Header top */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          {eyebrow && (
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-400">
              {eyebrow}
            </p>
          )}

          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">{title}</h1>
            {badge && <div className="shrink-0">{badge}</div>}
          </div>

          {subtitle && <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">{subtitle}</p>}

          {children && <div className="mt-3">{children}</div>}
        </div>

        {actions && (
          <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">{actions}</div>
        )}
      </div>

      {/* Metrics */}
      {metrics && metrics.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map((metric) => (
            <div
              key={metric.id} // ✅ safe, required
              className={clsx(
                'rounded-2xl border px-4 py-3 shadow-sm',
                toneToClassName(metric.tone),
              )}
            >
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] opacity-80">
                {metric.label}
              </div>
              <div className="mt-1 text-lg font-black tabular-nums">{metric.value}</div>
            </div>
          ))}
        </div>
      )}
    </header>
  );
}

export default AdminPageHeader;