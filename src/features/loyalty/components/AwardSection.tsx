// =============================================================================
// src/features/loyalty/components/AwardSection.tsx
// =============================================================================

interface Props {
  amountDollars: string;
  errorMsg:      string | null;
  onChange:      (val: string) => void;
  onAward:       () => void;
  onCancel:      () => void;
}

export function AwardSection({ amountDollars, errorMsg, onChange, onAward, onCancel }: Props) {
  const parsed      = parseFloat(amountDollars);
  const hasValidAmt = !isNaN(parsed) && parsed > 0;
  const basePoints  = hasValidAmt ? Math.floor(parsed) : null;

  return (
    <div className="rounded-2xl border border-white/8 bg-gray-900 p-5">
      <label className="block text-xs font-bold uppercase tracking-[0.15em] text-gray-500">
        Purchase Amount
      </label>

      <div className="mt-2 flex items-center overflow-hidden rounded-xl border border-white/10 bg-white/4 focus-within:border-amber-500/50 focus-within:ring-1 focus-within:ring-amber-500/30">
        <span className="pl-4 font-mono text-lg text-gray-400">$</span>
        <input
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0.01"
          max="99999"
          placeholder="0.00"
          value={amountDollars}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 bg-transparent px-2 py-3.5 font-mono text-xl text-white placeholder-gray-700 outline-none"
          autoFocus
        />
      </div>

      {basePoints !== null && (
        <p className="mt-2 text-center text-xs text-gray-500">
          ≈ <span className="font-semibold text-amber-400">{basePoints} base pts</span>
          {' '}before tier &amp; streak multipliers
        </p>
      )}

      {errorMsg && (
        <p className="mt-2 text-center text-xs font-medium text-red-400">{errorMsg}</p>
      )}

      <div className="mt-4 flex gap-2">
        <button
          onClick={onCancel}
          className="rounded-xl border border-white/8 px-4 py-3 text-sm font-medium text-gray-400 transition hover:bg-white/4"
        >
          Cancel
        </button>
        <button
          onClick={onAward}
          disabled={!hasValidAmt}
          className="flex-1 rounded-xl bg-amber-500 py-3 text-sm font-bold text-white shadow-lg shadow-amber-500/20 transition hover:bg-amber-400 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Award Points
        </button>
      </div>
    </div>
  );
}