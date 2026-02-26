// =============================================================================
// src/features/loyalty/components/RedeemSection.tsx
// =============================================================================
import { formatCurrency } from '@/utils/currency';
import { REDEEM_PRESETS } from '@/domain/loyalty/loyalty.types';

interface Props {
  balance:      number;
  redeemPoints: string;
  errorMsg:     string | null;
  onChange:     (val: string) => void;
  onRedeem:     () => void;
  onCancel:     () => void;
}

export function RedeemSection({ balance, redeemPoints, errorMsg, onChange, onRedeem, onCancel }: Props) {
  const pts       = parseInt(redeemPoints, 10) || 0;
  const canRedeem = pts >= 100;

  return (
    <div className="rounded-2xl border border-white/8 bg-gray-900 p-5 space-y-4">
      <p className="text-xs uppercase tracking-wider text-gray-500">Select Redemption Amount</p>

      {/* Presets */}
      <div className="grid grid-cols-3 gap-2">
        {REDEEM_PRESETS.map(({ points, label }) => {
          const isSelected = redeemPoints === String(points);
          const isDisabled = points > balance;
          return (
            <button
              key={points}
              onClick={() => onChange(String(points))}
              disabled={isDisabled}
              className={`rounded-lg border py-2 text-xs font-bold transition
                ${isSelected
                  ? 'border-amber-500 bg-amber-500/20 text-amber-300'
                  : 'border-white/10 bg-white/4 text-gray-400 hover:bg-white/10 disabled:opacity-30'
                }`}
            >
              {label}
              <span className="block text-[10px] font-normal opacity-70">
                {Number(points ?? 0).toLocaleString()} pts
              </span>
            </button>
          );
        })}
      </div>

      {/* Custom input */}
      <input
        type="number"
        inputMode="numeric"
        min="100"
        max="50000"
        placeholder="Or enter custom amount"
        value={redeemPoints}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-amber-500"
      />

      {/* Live discount preview */}
      <div className="text-center">
        <p className="text-xs text-gray-500">Discount Applied</p>
        <p className="mt-1 font-mono text-3xl font-bold text-white">
          {formatCurrency(pts / 100)}
        </p>
      </div>

      {errorMsg && (
        <p className="text-center text-xs font-medium text-red-400">{errorMsg}</p>
      )}

      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="rounded-xl border border-white/8 px-4 py-3 text-sm font-medium text-gray-400 transition hover:bg-white/4"
        >
          Cancel
        </button>
        <button
          onClick={onRedeem}
          disabled={!canRedeem}
          className="flex-1 rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Redeem Points
        </button>
      </div>
    </div>
  );
}