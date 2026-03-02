// =============================================================================
// src/features/admin/growth/CampaignTable.tsx
// =============================================================================
// Sortable table of growth_campaigns rows.
// ROI badge: green ≥100%, amber ≥0%, red negative.
// =============================================================================

import { useState } from 'react';
import { Badge, EmptyState, SkeletonBlock } from '@/features/admin/ui/AdminPrimitives';
import { formatDollars } from '@/lib/dashboard/formatters';
import type { Tables } from '@/types/supabase';

type Campaign  = Tables<'growth_campaigns'>;
type SortKey   = 'name' | 'revenue' | 'roi' | 'spent';
type SortDir   = 'asc' | 'desc';

// ── Helpers ───────────────────────────────────────────────────────────────────

function roiPct(c: Campaign): number | null {
  if (!c.budget_cents || c.budget_cents === 0) return null;
  return Math.round((((c.revenue_cents ?? 0) - (c.spent_cents ?? 0)) / c.budget_cents) * 100);
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface CampaignTableProps {
  campaigns: Campaign[];
  loading?: boolean;
  onEdit?: (c: Campaign) => void;
  onDelete?: (id: string) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CampaignTable({ campaigns, loading, onEdit, onDelete }: CampaignTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('revenue');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  if (loading) {
    return (
      <div className="animate-pulse space-y-2">
        {[...Array(4)].map((_, i) => <SkeletonBlock key={i} className="h-12 rounded-lg" />)}
      </div>
    );
  }

  if (campaigns.length === 0) {
    return (
      <EmptyState
        title="No campaigns yet"
        description="Create a campaign to start tracking ROI"
        icon="📣"
        action={onEdit ? { label: '+ New Campaign', onClick: () => onEdit({} as Campaign) } : undefined}
      />
    );
  }

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  const sorted = [...campaigns].sort((a, b) => {
    let av = 0, bv = 0;
    if (sortKey === 'name') {
      return sortDir === 'asc'
        ? (a.name ?? '').localeCompare(b.name ?? '')
        : (b.name ?? '').localeCompare(a.name ?? '');
    }
    if (sortKey === 'revenue') { av = a.revenue_cents ?? 0; bv = b.revenue_cents ?? 0; }
    if (sortKey === 'spent')   { av = a.spent_cents ?? 0;   bv = b.spent_cents ?? 0; }
    if (sortKey === 'roi')     { av = roiPct(a) ?? -999;    bv = roiPct(b) ?? -999; }
    return sortDir === 'asc' ? av - bv : bv - av;
  });

  function SortIcon({ k }: { k: SortKey }) {
    if (k !== sortKey) return <span className="text-zinc-800 ml-1">↕</span>;
    return <span className="text-amber-400 ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  }

  const headers: { key: SortKey | null; label: string; sortable: boolean }[] = [
    { key: 'name',    label: 'Campaign', sortable: true },
    { key: null,      label: 'Channel',  sortable: false },
    { key: 'spent',   label: 'Spent',    sortable: true },
    { key: 'revenue', label: 'Revenue',  sortable: true },
    { key: 'roi',     label: 'ROI',      sortable: true },
    { key: null,      label: '',         sortable: false },
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-800">
            {headers.map((h, i) => (
              <th
                key={i}
                onClick={() => h.sortable && h.key && toggleSort(h.key)}
                className={`pb-2.5 pr-4 text-left font-mono text-[9px] uppercase tracking-[0.16em] text-zinc-600 last:pr-0 ${h.sortable ? 'cursor-pointer hover:text-zinc-400 select-none' : ''}`}
              >
                {h.label}
                {h.sortable && h.key && <SortIcon k={h.key} />}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800/50">
          {sorted.map((c) => {
            const roi    = roiPct(c);
            const roiBadge =
              roi === null      ? null :
              roi >= 100
  ? <Badge tone="success">+{roi}%</Badge>
  : roi >= 0
    ? <Badge tone="warning">+{roi}%</Badge>
    : <Badge tone="danger">{roi}%</Badge>;
            return (
              <tr key={c.id} className="group transition-colors hover:bg-zinc-900/30">
                <td className="py-3 pr-4 font-semibold text-zinc-200">{c.name ?? '—'}</td>
                <td className="py-3 pr-4">
                  {c.channel ? <Badge tone="neutral">{c.channel}</Badge> : '—'}
                </td>
                <td className="py-3 pr-4 font-mono text-zinc-500 tabular-nums">
                  {c.spent_cents  ? formatDollars(c.spent_cents)  : '—'}
                </td>
                <td className="py-3 pr-4 font-mono font-bold text-emerald-400 tabular-nums">
                  {c.revenue_cents ? formatDollars(c.revenue_cents) : '—'}
                </td>
                <td className="py-3 pr-4">{roiBadge}</td>
                <td className="py-3">
                  <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    {onEdit && (
                      <button
                        onClick={() => onEdit(c)}
                        className="rounded-lg p-1.5 text-zinc-600 hover:bg-zinc-800 hover:text-amber-400 transition-colors"
                      >
                        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6">
                          <path d="M9 1.5l2.5 2.5-7 7H2v-2.5l7-7z" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                    )}
                    {onDelete && (
                      <button
                        onClick={() => onDelete(c.id!)}
                        className="rounded-lg p-1.5 text-zinc-600 hover:bg-zinc-800 hover:text-red-400 transition-colors"
                      >
                        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.6">
                          <path d="M2 3.5h9M5 1.5h3M4.5 3.5v7a.5.5 0 00.5.5h3a.5.5 0 00.5-.5v-7" strokeLinecap="round" />
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