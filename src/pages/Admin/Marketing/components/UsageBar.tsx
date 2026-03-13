import type { ReactElement } from 'react';

export function UsageBar({ percent }: { percent: number }): ReactElement {
  const normalized = Math.min(100, Math.max(0, percent));
  const color =
    normalized >= 95 ? 'bg-red-500' : normalized >= 75 ? 'bg-amber-500' : 'bg-emerald-500';

  return (
    <div className="flex items-center gap-2">
      <div
        role="progressbar"
        aria-valuenow={Math.round(normalized)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Usage ${Math.round(normalized)} percent`}
        className="h-1.5 w-20 overflow-hidden rounded-full bg-zinc-800"
      >
        <div
          className={`h-full rounded-full transition-all duration-300 ${color}`}
          style={{ width: `${normalized}%` }}
        />
      </div>
      <span className="font-mono text-xs text-zinc-500">{Math.round(normalized)}%</span>
    </div>
  );
}