import type { ReactNode } from 'react';
import clsx from 'clsx';

export interface AdminErrorStateAction {
  label: string;
  onAction: () => void;
  disabled?: boolean;
}

export interface AdminErrorStateProps {
  title?: string;
  description?: string;
  error?: unknown;
  action?: ReactNode | AdminErrorStateAction;
  compact?: boolean;
  className?: string;
}

function isActionObject(
  action: ReactNode | AdminErrorStateAction | undefined,
): action is AdminErrorStateAction {
  return (
    typeof action === 'object' &&
    action !== null &&
    'label' in action &&
    typeof action.label === 'string' &&
    'onAction' in action &&
    typeof action.onAction === 'function'
  );
}

function getErrorMessage(error: unknown): string | null {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  if (typeof error === 'string' && error.trim().length > 0) {
    return error.trim();
  }

  if (typeof error === 'object' && error !== null && 'message' in error) {
    const value = error.message;
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

export function AdminErrorState({
  title = 'Something went wrong',
  description,
  error,
  action,
  compact = false,
  className,
}: AdminErrorStateProps) {
  const errorMessage = getErrorMessage(error);

  return (
    <div
      className={clsx(
        'rounded-2xl border border-red-500/20 bg-red-500/5 text-center',
        compact ? 'px-5 py-8' : 'px-6 py-12',
        className,
      )}
      role="alert"
      aria-live="assertive"
    >
      <div className="mx-auto flex max-w-xl flex-col items-center">
        <div
          className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/10 text-xl text-red-300"
          aria-hidden="true"
        >
          !
        </div>

        <h3 className="text-sm font-semibold text-red-100">{title}</h3>

        <p className="mt-2 text-sm leading-6 text-red-200/80">
          {description ?? 'We could not complete this admin request. Please retry.'}
        </p>

        {errorMessage ? (
          <details className="mt-4 w-full rounded-xl border border-red-500/15 bg-black/10 px-4 py-3 text-left">
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.16em] text-red-200/80">
              Error details
            </summary>
            <pre className="mt-3 whitespace-pre-wrap break-words text-xs leading-6 text-red-100">
              {errorMessage}
            </pre>
          </details>
        ) : null}

        {action ? (
          <div className="mt-5">
            {isActionObject(action) ? (
              <button
                type="button"
                className="inline-flex min-h-10 items-center justify-center rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-200 transition hover:bg-red-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#050509] disabled:cursor-not-allowed disabled:opacity-60"
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
    </div>
  );
}

export default AdminErrorState;