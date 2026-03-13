import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import clsx from 'clsx';

type HeadingTag = 'h1' | 'h2' | 'h3' | 'h4';

export interface SectionHeaderProps extends Omit<ComponentPropsWithoutRef<'div'>, 'title'> {
  title: ReactNode;
  subtitle?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  as?: HeadingTag;
  align?: 'start' | 'center';
  divider?: boolean;
}

export function SectionHeader({
  title,
  subtitle,
  eyebrow,
  actions,
  as = 'h2',
  align = 'start',
  divider = false,
  className,
  children,
  ...rest
}: SectionHeaderProps) {
  const Heading = as;

  return (
    <div
      className={clsx(
        'flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between',
        divider && 'border-b border-zinc-800 pb-4',
        className,
      )}
      {...rest}
    >
      <div className={clsx('min-w-0', align === 'center' ? 'text-center' : 'text-left')}>
        {eyebrow ? (
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-400">
            {eyebrow}
          </p>
        ) : null}

        <Heading className="mt-1 text-xl font-semibold tracking-tight text-zinc-100 sm:text-2xl">
          {title}
        </Heading>

        {subtitle ? (
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">{subtitle}</p>
        ) : null}

        {children ? <div className="mt-3">{children}</div> : null}
      </div>

      {actions ? (
        <div
          className={clsx(
            'flex shrink-0 flex-wrap items-center gap-2',
            align === 'center' ? 'justify-center sm:justify-center' : 'justify-start sm:justify-end',
          )}
        >
          {actions}
        </div>
      ) : null}
    </div>
  );
}