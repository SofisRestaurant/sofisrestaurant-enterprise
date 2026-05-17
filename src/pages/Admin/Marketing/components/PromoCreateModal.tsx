import type { ChangeEvent, FormEvent, ReactElement } from 'react';


import { HeaderButton } from '../promo-manager/promoManager.ui';
import {
  PROMO_TYPE_OPTIONS,
  type PromoCreateFormState,
} from '../promo-manager/promoManager.form';
import { normalizePromoCodeInput } from '../promo-manager/promoManager.form';

export type { PromoCreateFormState };

export function PromoCreateModal({
  open,
  form,
  saving,
  submitError,
  onClose,
  onChange,
  onSubmit,
}: {
  open: boolean;
  form: PromoCreateFormState;
  saving: boolean;
  submitError: string | null;
  onClose: () => void;
  onChange: (next: PromoCreateFormState) => void;
  onSubmit: () => void;
}): ReactElement | null {
  if (!open) {
    return null;
  }

  const onTextChange =
    (key: keyof PromoCreateFormState) =>
    (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>): void => {
      const nextValue = event.target.value;

      if (key === 'code') {
        onChange({
          ...form,
          code: normalizePromoCodeInput(nextValue),
        });
        return;
      }

      onChange({
        ...form,
        [key]: nextValue,
      });
    };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-promo-title"
      onClick={saving ? undefined : onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-t-2xl border border-zinc-800 bg-#09090b shadow-2xl sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-zinc-800 bg-#09090b px-5 py-4">
          <div>
            <h2 id="create-promo-title" className="text-lg font-black tracking-tight text-white">
              Create Promo
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              Add a promo securely through the admin gateway. Values are server-validated before
              insert.
            </p>
          </div>

          <HeaderButton onClick={onClose} disabled={saving}>
            Close
          </HeaderButton>
        </div>

        <form
          className="space-y-6 px-5 py-5"
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          {submitError ? (
            <div
              role="alert"
              aria-live="assertive"
              className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400"
            >
              {submitError}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                Promo code
              </span>
              <input
                value={form.code}
                onChange={onTextChange('code')}
                placeholder="WELCOME10"
                autoComplete="off"
                spellCheck={false}
                maxLength={50}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 font-mono text-base md:text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus-visible:border-amber-500/60"
              />
            </label>

            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                Type
              </span>
              <select
                value={form.type}
                onChange={onTextChange('type')}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-base md:text-sm text-zinc-100 outline-none focus-visible:border-amber-500/60"
              >
                {PROMO_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-zinc-600">
                {PROMO_TYPE_OPTIONS.find((option) => option.value === form.type)?.hint ?? ''}
              </p>
            </label>

            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                Value
              </span>
              <input
                value={form.value}
                onChange={onTextChange('value')}
                inputMode="decimal"
                placeholder={form.type === 'percent' ? '10' : '500'}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-base md:text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus-visible:border-amber-500/60"
              />
            </label>

            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                Channel
              </span>
              <input
                value={form.channel}
                onChange={onTextChange('channel')}
                placeholder="all"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-base md:text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus-visible:border-amber-500/60"
              />
            </label>

            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                Starts at
              </span>
              <input
                type="datetime-local"
                value={form.startsAt}
                onChange={onTextChange('startsAt')}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-base md:text-sm text-zinc-100 outline-none focus-visible:border-amber-500/60"
              />
            </label>

            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                Ends at
              </span>
              <input
                type="datetime-local"
                value={form.endsAt}
                onChange={onTextChange('endsAt')}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-base md:text-sm text-zinc-100 outline-none focus-visible:border-amber-500/60"
              />
            </label>

            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                Expires at
              </span>
              <input
                type="datetime-local"
                value={form.expiresAt}
                onChange={onTextChange('expiresAt')}
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-base md:text-sm text-zinc-100 outline-none focus-visible:border-amber-500/60"
              />
            </label>

            <div className="flex items-end">
              <label className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-3">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(event) =>
                    onChange({
                      ...form,
                      active: event.target.checked,
                    })
                  }
                  className="h-4 w-4 rounded border-zinc-700 bg-zinc-900 text-amber-500 focus:ring-amber-500/40"
                />
                <span className="text-sm text-zinc-200">Start active</span>
              </label>
            </div>

            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                Minimum order (cents)
              </span>
              <input
                value={form.minOrderCents}
                onChange={onTextChange('minOrderCents')}
                inputMode="numeric"
                placeholder="0"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-base md:text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus-visible:border-amber-500/60"
              />
            </label>

            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                Max uses
              </span>
              <input
                value={form.maxUses}
                onChange={onTextChange('maxUses')}
                inputMode="numeric"
                placeholder="Leave blank for unlimited"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-base md:text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus-visible:border-amber-500/60"
              />
            </label>

            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">
                Per-user limit
              </span>
              <input
                value={form.perUserLimit}
                onChange={onTextChange('perUserLimit')}
                inputMode="numeric"
                placeholder="0"
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-base md:text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus-visible:border-amber-500/60"
              />
            </label>
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-zinc-800 pt-4 sm:flex-row sm:justify-end">
            <HeaderButton onClick={onClose} disabled={saving}>
              Cancel
            </HeaderButton>
            <HeaderButton type="submit" disabled={saving}>
              {saving ? 'Creating…' : 'Create Promo'}
            </HeaderButton>
          </div>
        </form>
      </div>
    </div>
  );
}