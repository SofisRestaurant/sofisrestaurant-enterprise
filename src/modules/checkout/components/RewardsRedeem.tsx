// src/modules/checkout/components/RewardsRedeem.tsx
// =============================================================================
// REWARDS REDEEM — Loyalty points redemption toggle
// =============================================================================
// Pure presentational. CheckoutPage fetches the live balance + accountId and
// passes them as props. Server re-validates and caps everything — the values
// here are untrusted intent signals only.
// =============================================================================

import { memo, useCallback, useState } from 'react';

// ─── Config ───────────────────────────────────────────────────────────────────

const POINTS_PER_DOLLAR = 100;

function pointsToDisplayString(pts: number): string {
  const dollars = Math.floor(pts / POINTS_PER_DOLLAR);
  return dollars.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

const PRESETS = [100, 500, 1_000, 2_500] as const;

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type LoyaltyRedeemValue = {
  applyPoints: boolean;
  pointsToRedeem: number;
  loyaltyAccountId: string;
};

type Props = {
  balance: number;
  accountId: string;
  subtotalCents?: number;
  onChange: (value: LoyaltyRedeemValue) => void;
  isBusy?: boolean;
};

// ─── Component ────────────────────────────────────────────────────────────────

export const RewardsRedeem = memo(function RewardsRedeem({
  balance,
  accountId,
  subtotalCents,
  onChange,
  isBusy = false,
}: Props) {
  const [enabled, setEnabled] = useState(false);
  const [selected, setSelected] = useState(0);
  const [customVal, setCustomVal] = useState('');
  const [useCustom, setUseCustom] = useState(false);

  const maxPoints =
    subtotalCents != null
      ? Math.min(balance, Math.ceil((subtotalCents / 100) * POINTS_PER_DOLLAR))
      : balance;

  const emit = useCallback(
    (apply: boolean, pts: number) => {
      onChange({
        applyPoints: apply && pts > 0,
        pointsToRedeem: Math.max(0, Math.floor(pts)),
        loyaltyAccountId: accountId,
      });
    },
    [accountId, onChange],
  );

  const handleToggle = () => {
    if (isBusy || balance <= 0 || maxPoints <= 0) return;
    const next = !enabled;
    setEnabled(next);
    if (!next) {
      setSelected(0);
      setUseCustom(false);
      setCustomVal('');
      emit(false, 0);
    } else {
      const def =
        [...PRESETS].reverse().find((p) => p <= maxPoints) ?? Math.min(maxPoints, PRESETS[0]);
      setSelected(def);
      emit(true, def);
    }
  };

  const handlePreset = (pts: number) => {
    if (isBusy || pts > maxPoints) return;
    setUseCustom(false);
    setCustomVal('');
    setSelected(pts);
    emit(true, pts);
  };

  const handleMax = () => {
    if (isBusy || maxPoints <= 0) return;
    setUseCustom(false);
    setCustomVal('');
    setSelected(maxPoints);
    emit(true, maxPoints);
  };

  const handleCustomChange = (raw: string) => {
    setCustomVal(raw);
    const parsed = parseInt(raw.replace(/\D/g, ''), 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setSelected(0);
      emit(true, 0);
      return;
    }
    const capped = Math.min(parsed, maxPoints);
    setSelected(capped);
    emit(true, capped);
  };

  if (balance <= 0) return null;

  return (
    <div
      className={cx(
        'rounded-xl border p-4 transition-colors',
        enabled ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-gray-50',
      )}
    >
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-900">Use Loyalty Points</p>
          <p className="mt-0.5 text-xs text-gray-500">
            {balance.toLocaleString()} pts available
            {maxPoints > 0 && (
              <>
                {' '}
                · up to{' '}
                <span className="font-medium text-amber-600">
                  {pointsToDisplayString(maxPoints)}
                </span>{' '}
                off
              </>
            )}
          </p>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={enabled ? 'Remove loyalty discount' : 'Apply loyalty points'}
          disabled={isBusy || maxPoints <= 0}
          onClick={handleToggle}
          className={cx(
            'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
            'focus-visible:outline focus-visible:outline-amber-500',
            'disabled:cursor-not-allowed disabled:opacity-40',
            enabled ? 'bg-amber-500' : 'bg-gray-300',
          )}
        >
          <span
            className={cx(
              'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform',
              enabled ? 'translate-x-5' : 'translate-x-0',
            )}
          />
        </button>
      </div>

      {/* Selector — only when toggled on */}
      {enabled && maxPoints > 0 && (
        <div className="mt-4 space-y-3">
          {/* Use Max */}
          <button
            type="button"
            disabled={isBusy}
            onClick={handleMax}
            className={cx(
              'w-full rounded-lg py-2.5 text-sm font-semibold transition',
              'disabled:cursor-not-allowed disabled:opacity-40',
              selected === maxPoints && !useCustom
                ? 'bg-amber-500 text-white'
                : 'border border-amber-200 bg-white text-amber-700 hover:bg-amber-50',
            )}
          >
            Use Max — {maxPoints.toLocaleString()} pts
            <span className="ml-1.5 opacity-75">({pointsToDisplayString(maxPoints)} off)</span>
          </button>

          {/* Presets */}
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((pts) => {
              if (pts >= maxPoints) return null;
              const active = !useCustom && selected === pts;
              return (
                <button
                  key={pts}
                  type="button"
                  disabled={isBusy}
                  onClick={() => handlePreset(pts)}
                  className={cx(
                    'rounded-full px-3 py-1.5 text-xs font-semibold transition',
                    'disabled:opacity-40',
                    active
                      ? 'bg-amber-500 text-white'
                      : 'border border-gray-200 bg-white text-gray-700 hover:border-amber-300 hover:text-amber-700',
                  )}
                >
                  {pts.toLocaleString()} pts
                  <span className="ml-1 opacity-60">{pointsToDisplayString(pts)}</span>
                </button>
              );
            })}

            <button
              type="button"
              disabled={isBusy}
              onClick={() => {
                setUseCustom(true);
                setSelected(0);
                setCustomVal('');
                emit(true, 0);
              }}
              className={cx(
                'rounded-full px-3 py-1.5 text-xs font-semibold transition disabled:opacity-40',
                useCustom
                  ? 'bg-amber-500 text-white'
                  : 'border border-gray-200 bg-white text-gray-700 hover:border-amber-300 hover:text-amber-700',
              )}
            >
              Custom
            </button>
          </div>

          {/* Custom input */}
          {useCustom && (
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={1}
                max={maxPoints}
                value={customVal}
                onChange={(e) => handleCustomChange(e.target.value)}
                disabled={isBusy}
                placeholder={`1 – ${maxPoints.toLocaleString()}`}
                className="w-36 rounded-xl border border-gray-300 px-3 py-1.5 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 disabled:opacity-40"
                aria-label="Custom points to redeem"
              />
              {selected > 0 && (
                <span className="text-sm font-semibold text-amber-700">
                  = {pointsToDisplayString(selected)} off
                </span>
              )}
            </div>
          )}

          {/* Confirmation */}
          {selected > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
              <span className="text-amber-600">✦</span>
              <p className="text-sm text-amber-900">
                <span className="font-semibold">{selected.toLocaleString()} pts</span> will be
                deducted — saving{' '}
                <span className="font-semibold">{pointsToDisplayString(selected)}</span>
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
});
