import type { ReactElement } from 'react';

import type { AdminPromo } from '@/modules/admin/types/admin-common.types';

import { HeaderButton } from '../promo-manager/promoManager.ui';

export function PromoDeleteDialog({
  open,
  promo,
  deleting,
  deleteError,
  onClose,
  onConfirm,
}: {
  open: boolean;
  promo: AdminPromo | null;
  deleting: boolean;
  deleteError: string | null;
  onClose: () => void;
  onConfirm: () => void;
}): ReactElement | null {
  if (!open || promo === null) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-promo-title"
      onClick={deleting ? undefined : onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl border border-zinc-800 bg-[#09090b] shadow-2xl sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-zinc-800 px-5 py-4">
          <div>
            <h2 id="delete-promo-title" className="text-lg font-black tracking-tight text-white">
              Delete Promo
            </h2>
            <p className="mt-1 text-sm text-zinc-500">This action cannot be undone.</p>
          </div>

          <HeaderButton onClick={onClose} disabled={deleting}>
            Close
          </HeaderButton>
        </div>

        <div className="space-y-4 px-5 py-5">
          {deleteError ? (
            <div
              role="alert"
              aria-live="assertive"
              className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400"
            >
              {deleteError}
            </div>
          ) : null}

          <p className="text-sm text-zinc-300">
            Are you sure you want to permanently delete promo code{' '}
            <span className="font-mono font-semibold text-white">{promo.code}</span>? This will
            remove it from the system immediately.
          </p>

          <div className="flex flex-col-reverse gap-2 border-t border-zinc-800 pt-4 sm:flex-row sm:justify-end">
            <HeaderButton onClick={onClose} disabled={deleting}>
              Cancel
            </HeaderButton>
            <button
              type="button"
              onClick={onConfirm}
              disabled={deleting}
              className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-400 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {deleting ? 'Deleting…' : 'Delete Promo'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}