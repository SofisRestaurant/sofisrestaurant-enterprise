// =============================================================================
// src/features/admin/growth/CampaignTable.tsx
// =============================================================================
// Sortable table of growth_campaigns rows.
// ROI badge: green ≥100%, amber ≥0%, red negative.
// =============================================================================

import { useCallback, useState } from 'react';
import { Badge, EmptyState, SkeletonBlock } from '@/features/admin/ui/AdminPrimitives';
import { formatDollars } from '@/lib/dashboard/formatters';
import type { Tables } from '@/types/supabase';

type Campaign = Tables<'growth_campaigns'>;
type SortKey = 'name' | 'revenue' | 'roi' | 'spent';
type SortDir = 'asc' | 'desc';

// ── Helpers ───────────────────────────────────────────────────────────────────

function roiPct(c: Campaign): number | null {
  if (!c.budget_cents || c.budget_cents === 0) return null;
  return Math.round((((c.revenue_cents ?? 0) - (c.spent_cents ?? 0)) / c.budget_cents) * 100);
}

function compareCampaigns(a: Campaign, b: Campaign, sortKey: SortKey, sortDir: SortDir): number {
  if (sortKey === 'name') {
    const cmp = (a.name ?? '').localeCompare(b.name ?? '');
    return sortDir === 'asc' ? cmp : -cmp;
  }

  let av = 0;
  let bv = 0;

  if (sortKey === 'revenue') {
    av = a.revenue_cents ?? 0;
    bv = b.revenue_cents ?? 0;
  }
  if (sortKey === 'spent') {
    av = a.spent_cents ?? 0;
    bv = b.spent_cents ?? 0;
  }
  if (sortKey === 'roi') {
    av = roiPct(a) ?? -999;
    bv = roiPct(b) ?? -999;
  }

  return sortDir === 'asc' ? av - bv : bv - av;
}

// ── Stable keys ───────────────────────────────────────────────────────────────

/** Fixed-length skeleton rows — avoids react/no-array-index-key. */
const SKELETON_KEYS = ['sk-0', 'sk-1', 'sk-2', 'sk-3'] as const;

// ── Sort icon — module-level so it is never re-created on each render ─────────

function SortIcon({ k, sortKey, sortDir }: { k: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (k !== sortKey) return <span className="text-zinc-800 ml-1">↕</span>;
  return <span className="text-amber-400 ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>;
}

// ── Header definitions — module-level constant, no index key needed ────────────

type HeaderDef = { key: SortKey; label: string } | { key: null; label: string };

const HEADERS: HeaderDef[] = [
  { key: 'name', label: 'Campaign' },
  { key: null, label: 'Channel' },
  { key: 'spent', label: 'Spent' },
  { key: 'revenue', label: 'Revenue' },
  { key: 'roi', label: 'ROI' },
  { key: null, label: 'Started' }, // <-- New column
  { key: null, label: '' }, // actions column
];

// ── Props ─────────────────────────────────────────────────────────────────────

export interface CampaignTableProps {
  campaigns: Campaign[];
  loading?: boolean;
  onEdit?: (c: Campaign) => void;
  onDelete?: (id: string) => void;
  /** Called when the user wants to create a new campaign (no existing record). */
  onNew?: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CampaignTable({ campaigns, loading, onEdit, onDelete, onNew }: CampaignTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('revenue');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const toggleSort = useCallback(
    (key: SortKey) => {
      if (key === sortKey) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortKey(key);
        setSortDir('desc');
      }
    },
    [sortKey],
  );

  // ── Early returns (hooks are all above this point) ─────────────────────────

  if (loading) {
    return (
      <div className="animate-pulse space-y-2">
        {SKELETON_KEYS.map((key) => (
          <SkeletonBlock key={key} className="h-12 rounded-lg" />
        ))}
      </div>
    );
  }

  if (campaigns.length === 0) {
    // onNew is the typed way to signal "create new"; falls back to onEdit if absent.
    const handleNew = onNew ?? (onEdit ? () => onEdit({} as Campaign) : undefined);
    return (
      <EmptyState
        title="No campaigns yet"
        description="Create a campaign to start tracking ROI"
        icon="📣"
        action={handleNew ? { label: '+ New Campaign', onClick: handleNew } : undefined}
      />
    );
  }

  const sorted = [...campaigns].sort((a, b) => compareCampaigns(a, b, sortKey, sortDir));

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-800">
            {HEADERS.map((h) => {
              // Use the label as the key; the empty-label actions column uses its index position
              // as a tiebreaker via a suffix — there are only two null-key headers.
              const thKey = h.label.length > 0 ? h.label : `actions-col`;
              const isSortable = h.key !== null;
              return (
                <th
                  key={thKey}
                  onClick={() => isSortable && toggleSort(h.key)}
                  className={[
                    'pb-2.5 pr-4 text-left font-mono text-[9px] uppercase tracking-[0.16em] text-zinc-600 last:pr-0',
                    isSortable ? 'cursor-pointer hover:text-zinc-400 select-none' : '',
                  ].join(' ')}
                >
                  {h.label}
                  {isSortable && <SortIcon k={h.key} sortKey={sortKey} sortDir={sortDir} />}
                </th>
              );
            })}
          </tr>
        </thead>

        <tbody className="divide-y divide-zinc-800/50">
          {sorted.map((c) => {
            const roi = roiPct(c);
            const roiBadge =
              roi === null ? null : roi >= 100 ? (
                <Badge tone="success">+{roi}%</Badge>
              ) : roi >= 0 ? (
                <Badge tone="warning">+{roi}%</Badge>
              ) : (
                <Badge tone="danger">{roi}%</Badge>
              );

            return (
              <tr key={c.id} className="group transition-colors hover:bg-zinc-900/30">
                <td className="py-3 pr-4 font-semibold text-zinc-200">{c.name ?? '—'}</td>
                <td className="py-3 pr-4">
                  {c.channel ? <Badge tone="neutral">{c.channel}</Badge> : '—'}
                </td>
                <td className="py-3 pr-4 font-mono text-zinc-500 tabular-nums">
                  {c.spent_cents ? formatDollars(c.spent_cents) : '—'}
                </td>
                <td className="py-3 pr-4 font-mono font-bold text-emerald-400 tabular-nums">
                  {c.revenue_cents ? formatDollars(c.revenue_cents) : '—'}
                </td>
                <td className="py-3 pr-4">{roiBadge}</td>
                <td className="py-3">
                  <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    {onEdit && (
                      <button
                        type="button"
                        onClick={() => onEdit(c)}
                        className="rounded-lg p-1.5 text-zinc-600 hover:bg-zinc-800 hover:text-amber-400 transition-colors"
                        aria-label={`Edit ${c.name ?? 'campaign'}`}
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
                            d="M9 1.5l2.5 2.5-7 7H2v-2.5l7-7z"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    )}
                    {onDelete && (
                      <button
                        type="button"
                        onClick={() => onDelete(c.id)}
                        className="rounded-lg p-1.5 text-zinc-600 hover:bg-zinc-800 hover:text-red-400 transition-colors"
                        aria-label={`Delete ${c.name ?? 'campaign'}`}
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
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>

        <tfoot>
          <tr className="border-t border-zinc-800">
            <td colSpan={2} className="pt-3 font-mono text-[9px] text-zinc-700">
              {campaigns.length} campaign{campaigns.length !== 1 ? 's' : ''}
            </td>
            <td className="pt-3 font-mono text-[10px] font-bold text-zinc-500 tabular-nums">
              {formatDollars(campaigns.reduce((s, c) => s + (c.spent_cents ?? 0), 0))}
            </td>
            <td className="pt-3 font-mono text-[10px] font-bold text-emerald-400 tabular-nums">
              {formatDollars(campaigns.reduce((s, c) => s + (c.revenue_cents ?? 0), 0))}
            </td>
            <td colSpan={2} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}