// =============================================================================
// src/pages/Admin/Marketing/CampaignManager.tsx
// =============================================================================

import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { fetchCampaigns, toggleCampaign } from '@/features/admin/growth/growth.service';
import type { Campaign } from '@/features/admin/growth/growth.types';
import {
  Panel,
  KPICard,
  SectionHeader,
  ActionButton,
  TableWrapper,
  Th,
  Td,
  Badge,
  Skeleton,
  EmptyState,
} from '@/features/admin/ui';

// ─────────────────────────────────────────────────────────────────────────────
// Formatting
// ─────────────────────────────────────────────────────────────────────────────

const fmt$ = (cents: number) =>
  (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });

const fmtDate = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const pct = (num: number, den: number) => (den > 0 ? `${((num / den) * 100).toFixed(1)}%` : '—');

// ─────────────────────────────────────────────────────────────────────────────
// Safe readers (avoid any)
// ─────────────────────────────────────────────────────────────────────────────

type UnknownRecord = Record<string, unknown>;

function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === 'object' && v !== null;
}

function readString(obj: unknown, keys: string[]): string | undefined {
  if (!isRecord(obj)) return undefined;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string') return v;
  }
  return undefined;
}

function readNumber(obj: unknown, keys: string[]): number | undefined {
  if (!isRecord(obj)) return undefined;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return undefined;
}

// ─────────────────────────────────────────────────────────────────────────────
// Badge styling (NO variant prop in your BadgeProps)
// ─────────────────────────────────────────────────────────────────────────────

type BadgeTone = 'success' | 'warn' | 'info' | 'danger' | 'default';

function badgeClass(tone: BadgeTone): string {
  switch (tone) {
    case 'success':
      return 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25';
    case 'warn':
      return 'bg-amber-500/15 text-amber-300 border border-amber-500/25';
    case 'info':
      return 'bg-sky-500/15 text-sky-300 border border-sky-500/25';
    case 'danger':
      return 'bg-red-500/15 text-red-300 border border-red-500/25';
    default:
      return 'bg-zinc-700/30 text-zinc-200 border border-zinc-700/40';
  }
}

function StatusBadge({ status }: { status: string }) {
  const tone: BadgeTone =
    status === 'active'
      ? 'success'
      : status === 'paused'
        ? 'warn'
        : status === 'completed'
          ? 'info'
          : 'default';

  return <Badge className={badgeClass(tone)}>{status}</Badge>;
}

function ChannelBadge({ channel }: { channel: string }) {
  return <Badge className={badgeClass('default')}>{channel}</Badge>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalizers for inconsistent Campaign shapes
// ─────────────────────────────────────────────────────────────────────────────

type CampaignStatus = 'active' | 'paused' | 'completed' | 'draft' | 'unknown';

function getCampaignStatus(c: Campaign): CampaignStatus {
  const s = readString(c, ['status']) ?? 'draft';
  if (s === 'active' || s === 'paused' || s === 'completed' || s === 'draft') return s;
  return 'unknown';
}

function getStartedAt(c: Campaign): string | null {
  const s = readString(c, ['startedAt', 'started_at']);
  return s ?? null;
}

function getSentCount(c: Campaign): number {
  return readNumber(c, ['sentCount', 'sent_count']) ?? 0;
}

function getOpenCount(c: Campaign): number {
  return readNumber(c, ['openCount', 'open_count']) ?? 0;
}

function getConversionCount(c: Campaign): number {
  return readNumber(c, ['conversionCount', 'conversion_count']) ?? 0;
}

function getRevenueCents(c: Campaign): number {
  return readNumber(c, ['revenueCents', 'revenue_cents']) ?? 0;
}

function getChannel(c: Campaign): string {
  const raw = (c as unknown as { channel?: unknown }).channel;
  return typeof raw === 'string' && raw.length ? raw : 'other';
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

const CampaignManager = memo(function CampaignManager() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchCampaigns();
      setCampaigns(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load campaigns');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleToggle = useCallback(async (c: Campaign) => {
    const currentStatus = getCampaignStatus(c);
    const nextActive = currentStatus !== 'active';

    setBusyId(c.id);
    setError(null);

    // optimistic update
    setCampaigns((prev) =>
      prev.map((x) =>
        x.id === c.id ? ({ ...x, status: nextActive ? 'active' : 'paused' } as Campaign) : x,
      ),
    );

    try {
      await toggleCampaign(c.id, nextActive);
    } catch (e) {
      // revert
      setCampaigns((prev) =>
        prev.map((x) => (x.id === c.id ? ({ ...x, status: currentStatus } as Campaign) : x)),
      );
      setError(e instanceof Error ? e.message : 'Failed to update campaign');
    } finally {
      setBusyId(null);
    }
  }, []);

  const totals = useMemo(() => {
    const totalRevenue = campaigns.reduce((s, c) => s + getRevenueCents(c), 0);
    const totalSent = campaigns.reduce((s, c) => s + getSentCount(c), 0);
    const totalOpens = campaigns.reduce((s, c) => s + getOpenCount(c), 0);
    const totalConversions = campaigns.reduce((s, c) => s + getConversionCount(c), 0);
    const activeCampaigns = campaigns.filter((c) => getCampaignStatus(c) === 'active').length;

    return { totalRevenue, totalSent, totalOpens, totalConversions, activeCampaigns };
  }, [campaigns]);

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Campaigns"
        subtitle="Campaign ROI, open rates, and conversion tracking"
        right={
          <ActionButton size="sm" onClick={load} disabled={loading}>
            Refresh
          </ActionButton>
        }
      />

      {error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-4 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Active Campaigns" value={String(totals.activeCampaigns)} accent="emerald" />
        <KPICard label="Total Sent" value={totals.totalSent.toLocaleString()} accent="sky" />
        <KPICard
          label="Open Rate"
          value={pct(totals.totalOpens, totals.totalSent)}
          accent="slate"
        />
        <KPICard label="Campaign Revenue" value={fmt$(totals.totalRevenue)} accent="amber" />
      </div>

      <Panel noPad>
        <div className="px-5 py-4 border-b border-zinc-800">
          <p className="text-sm font-bold text-zinc-200">All Campaigns</p>
          <p className="text-xs text-zinc-600 mt-0.5">{campaigns.length} records</p>
        </div>

        {loading ? (
          <div className="p-5">
            <Skeleton className="h-28 w-full" />
          </div>
        ) : campaigns.length === 0 ? (
          <div className="p-8 text-center">
            <EmptyState title="No campaigns" />
            <p className="mt-2 text-xs text-zinc-600">Create your first campaign to get started.</p>
          </div>
        ) : (
          <TableWrapper>
            <thead>
              <tr>
                <Th>Campaign</Th>
                <Th>Channel</Th>
                <Th>Status</Th>
                <Th>Sent</Th>
                <Th>Open Rate</Th>
                <Th>Conversion</Th>
                <Th>Revenue</Th>
                <Th>Started</Th>
                <Th>Action</Th>
              </tr>
            </thead>

            <tbody>
              {campaigns.map((c) => {
                const sent = getSentCount(c);
                const opens = getOpenCount(c);
                const conversions = getConversionCount(c);
                const status = getCampaignStatus(c);
                const startedAt = getStartedAt(c);
                const revenue = getRevenueCents(c);
                const channel = getChannel(c);

                const isCompleted = status === 'completed';
                const isBusy = busyId === c.id;

                return (
                  <tr key={c.id} className="hover:bg-zinc-800/30 transition-colors">
                    <Td>
                      <span className="font-medium text-zinc-200">{c.name}</span>
                    </Td>

                    <Td>
                      <ChannelBadge channel={channel} />
                    </Td>

                    <Td>
                      <StatusBadge status={status} />
                    </Td>

                    <Td className="font-mono text-xs text-zinc-400">{sent.toLocaleString()}</Td>
                    <Td className="font-mono text-xs text-zinc-400">{pct(opens, sent)}</Td>
                    <Td className="font-mono text-xs text-zinc-400">{pct(conversions, sent)}</Td>

                    <Td className="font-bold text-amber-400">{fmt$(revenue)}</Td>

                    <Td className="font-mono text-xs text-zinc-400">{fmtDate(startedAt)}</Td>

                    <Td>
                      {!isCompleted && (
                        <ActionButton size="sm" disabled={isBusy} onClick={() => handleToggle(c)}>
                          {isBusy ? 'Saving…' : status === 'active' ? 'Pause' : 'Activate'}
                        </ActionButton>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrapper>
        )}
      </Panel>
    </div>
  );
});

export default CampaignManager;
