// =============================================================================
// src/features/admin/growth/SmartDiscountCard.tsx
// =============================================================================
// Display card for a single smart_discounts row.
// Shows day, time window, discount type/value with toggle + edit + delete.
// =============================================================================

import { Badge } from '@/features/admin/ui/AdminPrimitives';
import { formatDollars } from '@/lib/dashboard/formatters';
import type { Tables } from '@/types/supabase';

type SmartDiscount = Tables<'smart_discounts'>;

// ── Constants ─────────────────────────────────────────────────────────────────

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

function fmtHour(h: number): string {
  if (h === 0) return '12am';
  if (h === 12) return '12pm';
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface SmartDiscountCardProps {
  discount: SmartDiscount;
  onEdit: (d: SmartDiscount) => void;
  onToggle: (id: string, currentActive: boolean | null) => void;
  onDelete: (id: string) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SmartDiscountCard({
  discount: d,
  onEdit,
  onToggle,
  onDelete,
}: SmartDiscountCardProps) {
  const dayLabel = d.day_of_week !== null ? DAYS[d.day_of_week] : 'Every day';
  const timeLabel =
    d.start_hour !== null && d.end_hour !== null
      ? `${fmtHour(d.start_hour)} – ${fmtHour(d.end_hour)}`
      : 'All hours';

  const valueLabel =
    d.type === 'percent'
      ? `${d.value}% off`
      : d.value !== null
        ? `${formatDollars((d.value ?? 0) * 100)} off`
        : '—';

  const isActive = d.active ?? false;

  return (
    <div
      className={`flex items-center gap-4 rounded-xl border px-4 py-3 transition-all ${
        isActive ? 'border-zinc-800 bg-zinc-900/40' : 'border-zinc-800/50 bg-zinc-900/20 opacity-60'
      }`}
    >
      {/* Value badge */}
      <div
        className={`min-w-60px rounded-xl border px-3 py-2 text-center ${
          isActive ? 'border-amber-500/20 bg-amber-500/10' : 'border-zinc-700 bg-zinc-800'
        }`}
      >
        <p
          className={`font-black text-sm tabular-nums ${
            isActive ? 'text-amber-400' : 'text-zinc-600'
          }`}
        >
          {valueLabel}
        </p>
      </div>

      {/* Details */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-zinc-200">{dayLabel}</span>
          <span className="font-mono text-[10px] text-zinc-600">·</span>
          <span className="font-mono text-[10px] text-zinc-500">{timeLabel}</span>
          {d.type && <Badge tone="neutral">{d.type}</Badge>}
        </div>
        <p className="mt-0.5 font-mono text-[9px] text-zinc-700">
          {isActive ? 'Currently active' : 'Disabled'}
          {d.day_of_week !== null && d.start_hour !== null
            ? ` · applies ${dayLabel} ${timeLabel}`
            : ' · applies all week'}
        </p>
      </div>

      {/* Controls */}
      <div className="flex shrink-0 items-center gap-1.5">
        {/* Active toggle */}
        <button
          onClick={() => onToggle(d.id, d.active)}
          className={`rounded-lg border px-2.5 py-1 font-mono text-[9px] font-bold transition-colors ${
            isActive
              ? 'border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/10'
              : 'border-zinc-700 text-zinc-600 hover:bg-zinc-800 hover:text-zinc-400'
          }`}
        >
          {isActive ? '● On' : '○ Off'}
        </button>

        {/* Edit */}
        <button
          onClick={() => onEdit(d)}
          className="rounded-lg p-1.5 text-zinc-600 transition-colors hover:bg-zinc-800 hover:text-amber-400"
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 13 13"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          >
            <path d="M9 1.5l2.5 2.5-7 7H2v-2.5l7-7z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {/* Delete */}
        <button
          onClick={() => onDelete(d.id)}
          className="rounded-lg p-1.5 text-zinc-600 transition-colors hover:bg-zinc-800 hover:text-red-400"
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 13 13"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          >
            <path
              d="M2 3.5h9M5 1.5h3M4.5 3.5v7a.5.5 0 00.5.5h3a.5.5 0 00.5-.5v-7"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ── SmartDiscountList ─────────────────────────────────────────────────────────
// Convenience wrapper that renders a list with a "New Discount" CTA.

export interface SmartDiscountListProps {
  discounts: SmartDiscount[];
  onEdit: (d: SmartDiscount) => void;
  onToggle: (id: string, currentActive: boolean | null) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
}

export function SmartDiscountList({
  discounts,
  onEdit,
  onToggle,
  onDelete,
  onAdd,
}: SmartDiscountListProps) {
  const active = discounts.filter((d) => d.active).length;
  const inactive = discounts.length - active;

  return (
    <div className="space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-zinc-600">
          {discounts.length} rule{discounts.length !== 1 ? 's' : ''}
          {active > 0 && ` · ${active} active`}
          {inactive > 0 && ` · ${inactive} off`}
        </p>
        <button
          onClick={onAdd}
          className="rounded-lg bg-amber-500 px-4 py-2 text-xs font-bold text-black transition-colors hover:bg-amber-400"
        >
          + New Rule
        </button>
      </div>

      {/* List */}
      {discounts.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-zinc-800 py-12">
          <span className="text-3xl">🏷️</span>
          <div className="text-center">
            <p className="font-semibold text-zinc-400">No discount rules</p>
            <p className="mt-1 font-mono text-[10px] text-zinc-700">
              Create time-based discounts to boost slow hours
            </p>
          </div>
          <button
            onClick={onAdd}
            className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-5 py-2 text-sm font-bold text-amber-400 hover:bg-amber-500/20 transition-colors"
          >
            Create First Rule
          </button>
        </div>
      ) : (
        discounts
          .slice()
          .sort((a, b) => {
            // Active first, then by day, then by start hour
            if ((a.active ? 0 : 1) !== (b.active ? 0 : 1))
              return (a.active ? 0 : 1) - (b.active ? 0 : 1);
            if ((a.day_of_week ?? 7) !== (b.day_of_week ?? 7))
              return (a.day_of_week ?? 7) - (b.day_of_week ?? 7);
            return (a.start_hour ?? 0) - (b.start_hour ?? 0);
          })
          .map((d) => (
            <SmartDiscountCard
              key={d.id}
              discount={d}
              onEdit={onEdit}
              onToggle={onToggle}
              onDelete={onDelete}
            />
          ))
      )}
    </div>
  );
}
