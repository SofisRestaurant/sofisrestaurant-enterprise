// =============================================================================
// src/features/admin/dashboard/RecoveryRateCard.tsx
// =============================================================================
// Abandoned cart recovery rate display.
// Data comes from the abandoned_cart_sessions table via a parent query.
// =============================================================================

import { Panel } from '@/features/admin/ui/AdminPrimitives';
import { formatDollars, formatPct } from '@/lib/dashboard/formatters';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface RecoveryRateCardProps {
  /** Total abandoned cart sessions in the period */
  totalAbandoned: number;
  /** How many were recovered (recovered = true) */
  recovered: number;
  /** Revenue from recovered carts, in cents */
  recoveredRevenueCents: number;
  /** Comparison period rate, for trend (0–1). Optional. */
  prevRate?: number;
}

// ── Thresholds ────────────────────────────────────────────────────────────────

const TARGET_RATE = 0.25; // 25% industry benchmark

// ── Component ─────────────────────────────────────────────────────────────────

export function RecoveryRateCard({
  totalAbandoned,
  recovered,
  recoveredRevenueCents,
  prevRate,
}: RecoveryRateCardProps) {
  const rate = totalAbandoned > 0 ? recovered / totalAbandoned : 0;
  const delta = prevRate !== undefined ? rate - prevRate : null;

  const rateColor =
    rate >= TARGET_RATE    ? 'text-emerald-400' :
    rate >= TARGET_RATE / 2 ? 'text-amber-400'  :
    'text-red-400';

  const trackColor =
    rate >= TARGET_RATE    ? 'bg-emerald-500' :
    rate >= TARGET_RATE / 2 ? 'bg-amber-500'  :
    'bg-red-500';

  return (
    <Panel title="Cart Recovery Rate">

      {/* Main metric row */}
      <div className="mt-4 flex items-center justify-between">
        <div>
          <p className={`text-4xl font-black tabular-nums tracking-tight ${rateColor}`}>
            {formatPct(rate)}
          </p>
          <p className="mt-1 font-mono text-[10px] text-zinc-600">
            {recovered.toLocaleString()} of {totalAbandoned.toLocaleString()} carts recovered
          </p>
          {delta !== null && (
            <p className={`mt-0.5 font-mono text-[10px] ${delta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {delta >= 0 ? '▲' : '▼'} {formatPct(Math.abs(delta))} vs prev period
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">Revenue saved</p>
          <p className="text-xl font-black text-white">{formatDollars(recoveredRevenueCents)}</p>
          <p className="mt-0.5 font-mono text-[9px] text-zinc-700">
            avg {recovered > 0 ? formatDollars(recoveredRevenueCents / recovered) : '$0'} / cart
          </p>
        </div>
      </div>

      {/* Progress track */}
      <div className="mt-4 space-y-1.5">
        <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
          <div
            className={`h-full rounded-full transition-all duration-700 ${trackColor}`}
            style={{ width: `${Math.min(100, (rate / TARGET_RATE) * 100)}%` }}
          />
        </div>
        <div className="flex justify-between font-mono text-[9px] text-zinc-700">
          <span>0%</span>
          <span className={rate >= TARGET_RATE ? 'text-emerald-500' : ''}>
            Target {formatPct(TARGET_RATE)}
          </span>
          <span>50%+</span>
        </div>
      </div>

      {/* Insight hint */}
      <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-900/50 px-3 py-2">
        <p className="font-mono text-[9px] text-zinc-600">
          {rate < TARGET_RATE
            ? `↑ ${formatPct(TARGET_RATE - rate)} to reach industry benchmark — consider discount nudge email`
            : '✓ Recovery rate above industry benchmark'}
        </p>
      </div>

    </Panel>
  );
}