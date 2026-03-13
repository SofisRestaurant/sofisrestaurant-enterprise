import type { ReactNode } from 'react';
import clsx from 'clsx';

export interface AdminEmptyStateAction {
  label: string;
  onAction: () => void;
  disabled?: boolean;
}

export interface AdminEmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode | AdminEmptyStateAction;
  compact?: boolean;
  className?: string;
}

function isActionObject(
  action: ReactNode | AdminEmptyStateAction | undefined,
): action is AdminEmptyStateAction {
  return (
    typeof action === 'object' &&
    action !== null &&
    'label' in action &&
    typeof action.label === 'string' &&
    'onAction' in action &&
    typeof action.onAction === 'function'
  );
}

export function AdminEmptyState({
  title,
  description,
  icon,
  action,
  compact = false,
  className,
}: AdminEmptyStateProps) {
  return (
    <div
      className={clsx(
        'flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/30 text-center',
        compact ? 'px-5 py-8' : 'px-6 py-12',
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <div className="mb-3 text-3xl text-zinc-500" aria-hidden="true">
        {icon ?? '✨'}
      </div>

      <h3 className="text-sm font-semibold text-zinc-100">{title}</h3>

      {description ? (
        <p className="mt-2 max-w-md text-sm leading-6 text-zinc-400">{description}</p>
      ) : null}

      {action ? (
        <div className="mt-4">
          {isActionObject(action) ? (
            <button
              type="button"
              className="inline-flex min-h-10 items-center justify-center rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-300 transition hover:bg-amber-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#050509] disabled:cursor-not-allowed disabled:opacity-60"
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
  );
}

export default AdminEmptyState;