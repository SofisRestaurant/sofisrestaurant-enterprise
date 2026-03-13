import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import clsx from 'clsx';

export interface AdminSectionCardProps
  extends Omit<ComponentPropsWithoutRef<'section'>, 'title'> {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
  loading?: boolean;
  noPadding?: boolean;
  tone?: 'default' | 'warning' | 'danger' | 'success';
}

function toneToClassName(tone: NonNullable<AdminSectionCardProps['tone']>): string {
  switch (tone) {
    case 'warning':
      return 'border-amber-500/20 bg-amber-500/5';
    case 'danger':
      return 'border-red-500/20 bg-red-500/5';
    case 'success':
      return 'border-emerald-500/20 bg-emerald-500/5';
    case 'default':
    default:
      return 'border-zinc-800 bg-[#050509]';
  }
}

export function AdminSectionCard({
  title,
  subtitle,
  actions,
  footer,
  loading = false,
  noPadding = false,
  tone = 'default',
  className,
  children,
  ...rest
}: AdminSectionCardProps) {
  return (
    <section
      className={clsx(
        'overflow-hidden rounded-2xl border shadow-[0_0_0_1px_rgba(15,23,42,0.9)]',
        toneToClassName(tone),
        className,
      )}
      aria-busy={loading || undefined}
      {...rest}
    >
      {(title || subtitle || actions) && (
        <header className="flex flex-col gap-3 border-b border-zinc-800/80 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            {title ? (
              <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-zinc-300">
                {title}
              </h2>
            ) : null}
            {subtitle ? <p className="mt-1 text-xs text-zinc-500">{subtitle}</p> : null}
          </div>

          {actions ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
          ) : null}
        </header>
      )}

      <div className={clsx(noPadding ? '' : 'px-4 py-4')}>
        {loading ? (
          <div className="space-y-3">
            <div className="h-4 w-40 animate-pulse rounded bg-zinc-800/70" />
            <div className="h-20 animate-pulse rounded-2xl bg-zinc-800/60" />
            <div className="h-20 animate-pulse rounded-2xl bg-zinc-800/60" />
          </div>
        ) : (
          children
        )}
      </div>

      {footer ? <footer className="border-t border-zinc-800/80 px-4 py-3">{footer}</footer> : null}
    </section>
  );
}

export default AdminSectionCard;