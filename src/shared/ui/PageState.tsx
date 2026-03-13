import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import clsx from 'clsx';

import { isRecord } from '../lib/guards';
import type { PageStateAction, PageStateVariant } from '../types/ui';

export interface PageStateProps extends Omit<ComponentPropsWithoutRef<'section'>, 'title'> {
  variant: PageStateVariant;
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode | PageStateAction;
  icon?: ReactNode;
  minHeight?: number | string;
}

function isPageStateAction(value: ReactNode | PageStateAction | undefined): value is PageStateAction {
  return (
    isRecord(value) &&
    typeof value.label === 'string' &&
    typeof value.onAction === 'function'
  );
}

function getDefaultTitle(variant: PageStateVariant): string {
  switch (variant) {
    case 'loading':
      return 'Loading';
    case 'empty':
      return 'Nothing to show';
    case 'error':
      return 'Something went wrong';
  }
}

function getDefaultDescription(variant: PageStateVariant): string {
  switch (variant) {
    case 'loading':
      return 'Please wait while we load your content.';
    case 'empty':
      return 'There is no content available for this view yet.';
    case 'error':
      return 'We could not complete this request. Please try again.';
  }
}

function getDefaultIcon(variant: PageStateVariant): ReactNode {
  switch (variant) {
    case 'loading':
      return null;
    case 'empty':
      return '◻';
    case 'error':
      return '!';
  }
}

function LoadingGlyph() {
  return (
    <span
      className="inline-block h-7 w-7 animate-spin rounded-full border-[3px] border-zinc-700 border-t-transparent"
      aria-hidden="true"
    />
  );
}

export function PageState({
  variant,
  title,
  description,
  action,
  icon,
  minHeight = 280,
  className,
  children,
  style,
  ...rest
}: PageStateProps) {
  const resolvedTitle = title ?? getDefaultTitle(variant);
  const resolvedDescription = description ?? getDefaultDescription(variant);
  const liveMode = variant === 'error' ? 'assertive' : 'polite';

  return (
    <section
      className={clsx(
        'rounded-2xl border border-zinc-800 bg-[#050509] px-6 py-10 shadow-[0_0_0_1px_rgba(15,23,42,0.9)]',
        className,
      )}
      role={variant === 'error' ? 'alert' : 'status'}
      aria-live={liveMode}
      aria-busy={variant === 'loading' || undefined}
      style={{ minHeight, ...style }}
      {...rest}
    >
      <div className="mx-auto flex h-full w-full max-w-xl flex-col items-center justify-center text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900/60 text-2xl font-semibold text-zinc-100">
          {variant === 'loading' ? <LoadingGlyph /> : icon ?? getDefaultIcon(variant)}
        </div>

        <h2 className="text-lg font-semibold tracking-tight text-zinc-100">{resolvedTitle}</h2>

        {resolvedDescription ? (
          <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">{resolvedDescription}</p>
        ) : null}

        {children ? <div className="mt-5 w-full">{children}</div> : null}

        {action ? (
          <div className="mt-6">
            {isPageStateAction(action) ? (
              <button
                type="button"
                className="inline-flex min-h-10 items-center justify-center rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-300 transition hover:bg-amber-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#050509] disabled:cursor-not-allowed disabled:opacity-60"
                onClick={action.onAction}
                disabled={action.disabled}
              >
                {action.label}
              </button>
            ) : (
              action
            )}
          </div>
        ) : null}
      </div>
    </section>
  );
}