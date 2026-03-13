// =============================================================================
// PATH: src/modules/orders/components/kitchen/KitchenEvidenceStrengthBar.tsx
// =============================================================================

import type { EvidenceStrengthBarProps } from './kitchen.types';

export function KitchenEvidenceStrengthBar({
  orderType,
  hasRecipient,
  hasPinVerified,
  hasNotes,
}: EvidenceStrengthBarProps) {
  let score = 0;
  const signals: string[] = [];

  score += 1;
  signals.push('Staff authenticated');

  if (hasRecipient) {
    score += 3;
    signals.push('Recipient name captured');
  }

  if (hasPinVerified && orderType === 'pickup') {
    score += 3;
    signals.push('PIN verified');
  }

  if (hasNotes) {
    score += 1;
    signals.push('Handoff notes recorded');
  }

  if (orderType === 'dine_in') {
    score = Math.max(score, 5);
    signals.push('Dine-in (table service)');
  }

  const max = orderType === 'pickup' ? 8 : 5;
  const pct = Math.min(100, Math.round((score / max) * 100));

  const label = pct >= 80 ? 'Strong' : pct >= 50 ? 'Moderate' : 'Weak';
  const barColor = pct >= 80 ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-500' : 'bg-red-500';
  const textColor =
    pct >= 80 ? 'text-green-400' : pct >= 50 ? 'text-yellow-400' : 'text-red-400';

  return (
    <div className="mt-4 rounded-lg border border-neutral-700 bg-neutral-950 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-neutral-400">Dispute defense strength</span>
        <span className={`text-xs font-bold ${textColor}`}>
          {label} ({pct}%)
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-neutral-800">
        <div
          className={`h-full rounded-full transition-all duration-300 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {signals.map((signal) => (
          <span
            key={signal}
            className="rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400"
          >
            ✓ {signal}
          </span>
        ))}
      </div>
    </div>
  );
}