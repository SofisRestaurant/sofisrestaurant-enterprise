// =============================================================================
// src/pages/Admin/FraudLog.tsx
// Route entry point — delegates to feature layer
// =============================================================================

import { memo, useCallback, useMemo } from 'react';
import { useFraud } from '@/features/admin/fraud/useFraud';
import type { FraudEvent } from '@/features/admin/fraud/fraud.types';
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
  HealthBar,
} from '@/features/admin/ui';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

const EVENT_TYPE_LABELS: Record<string, string> = {
  suspicious_login: 'Suspicious Login',
  rate_limit_triggered: 'Rate Limit',
  device_trust_mismatch: 'Device Mismatch',
  payment_declined: 'Payment Declined',
  velocity_check_failed: 'Velocity Check',
  ip_blocked: 'IP Blocked',
};

type BadgeTone = 'danger' | 'warn' | 'info' | 'success' | 'default';

function badgeClass(tone: BadgeTone): string {
  // Tailwind-only, no dependency on Badge "variant" prop
  switch (tone) {
    case 'danger':
      return 'bg-red-500/15 text-red-300 border border-red-500/25';
    case 'warn':
      return 'bg-amber-500/15 text-amber-300 border border-amber-500/25';
    case 'info':
      return 'bg-sky-500/15 text-sky-300 border border-sky-500/25';
    case 'success':
      return 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25';
    default:
      return 'bg-zinc-700/30 text-zinc-200 border border-zinc-700/40';
  }
}

function RiskBadge({ score }: { score: number }) {
  const tone: BadgeTone = score >= 80 ? 'danger' : score >= 50 ? 'warn' : 'info';
  return <Badge className={`font-mono tabular-nums ${badgeClass(tone)}`}>{score}</Badge>;
}

function EventBadge({ type }: { type: string }) {
  const label = EVENT_TYPE_LABELS[type] ?? type;
  const isHigh = ['suspicious_login', 'velocity_check_failed', 'device_trust_mismatch'].includes(
    type,
  );
  const tone: BadgeTone = isHigh ? 'danger' : 'warn';

  return <Badge className={badgeClass(tone)}>{label}</Badge>;
}

function StatusBadge({ resolved }: { resolved: boolean }) {
  return resolved ? (
    <Badge className={badgeClass('success')}>Resolved</Badge>
  ) : (
    <Badge className={badgeClass('danger')}>Open</Badge>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Risk Score Histogram
// ─────────────────────────────────────────────────────────────────────────────

function RiskBreakdown({ events }: { events: FraudEvent[] }) {
  const high = events.filter((e) => e.riskScore >= 80).length;
  const medium = events.filter((e) => e.riskScore >= 50 && e.riskScore < 80).length;
  const low = events.filter((e) => e.riskScore < 50).length;
  const total = events.length || 1;

  return (
    <Panel>
      <p className="text-xs font-bold text-zinc-400 mb-4 uppercase tracking-widest">
        Risk Distribution
      </p>

      <div className="space-y-3">
        {/* HealthBar in your repo does NOT accept accent — keep it to supported props only */}
        <HealthBar label={`High Risk (${high})`} value={(high / total) * 100} />
        <HealthBar label={`Medium Risk (${medium})`} value={(medium / total) * 100} />
        <HealthBar label={`Low Risk (${low})`} value={(low / total) * 100} />
      </div>

      {/* Optional: tiny legend to preserve “color meaning” without HealthBar accent */}
      <div className="mt-4 flex items-center gap-3 text-[11px] text-zinc-500">
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-red-400/80" />
          High
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-amber-400/80" />
          Medium
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-emerald-400/80" />
          Low
        </span>
      </div>
    </Panel>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FraudLog Page
// ─────────────────────────────────────────────────────────────────────────────

const FraudLog = memo(function FraudLog() {
  const { events, loading, error, filters, setFilters, resolve, refresh } = useFraud();

  const { highCount, avgScore, unresolvedCount } = useMemo(() => {
    const high = events.filter((e) => e.riskScore >= 80).length;
    const unresolved = events.filter((e) => !e.resolved).length;
    const avg = events.length
      ? Math.round(events.reduce((sum, e) => sum + e.riskScore, 0) / events.length)
      : 0;
    return { highCount: high, avgScore: avg, unresolvedCount: unresolved };
  }, [events]);

  const handleResolve = useCallback(
    async (id: string) => {
      await resolve(id);
    },
    [resolve],
  );

  const showResolved = filters.resolved === undefined;

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Fraud Log"
        subtitle="Risk events, device mismatches, and security signals"
        right={
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showResolved}
                onChange={(e) => setFilters({ resolved: e.target.checked ? undefined : false })}
                className="accent-amber-500"
              />
              Show resolved
            </label>

            {/* ActionButton in your repo may not have variant — don’t pass it */}
            <ActionButton size="sm" onClick={refresh}>
              Refresh
            </ActionButton>
          </div>
        }
      />

      {error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-4 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Total Events" value={String(events.length)} accent="amber" />
        <KPICard label="High Risk (≥80)" value={String(highCount)} accent="red" />
        <KPICard label="Avg Risk Score" value={loading ? '—' : String(avgScore)} accent="sky" />
        <KPICard label="Unresolved" value={String(unresolvedCount)} accent="slate" />
      </div>

      {/* Risk breakdown + filter */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <RiskBreakdown events={events} />

        <Panel className="lg:col-span-2">
          <p className="text-xs font-bold text-zinc-400 mb-4 uppercase tracking-widest">
            Risk Score Filter
          </p>
          <div className="space-y-2">
            <input
              type="range"
              min={0}
              max={100}
              step={10}
              value={filters.minRiskScore ?? 0}
              onChange={(e) => setFilters({ minRiskScore: Number(e.target.value) || undefined })}
              className="w-full accent-amber-500"
            />
            <div className="flex justify-between text-xs text-zinc-600">
              <span>
                Min score:{' '}
                <span className="text-amber-400 font-bold">{filters.minRiskScore ?? 0}</span>
              </span>
              <span>100</span>
            </div>
          </div>
        </Panel>
      </div>

      {/* Event table */}
      <Panel noPad>
        <div className="px-5 py-4 border-b border-zinc-800">
          <p className="text-sm font-bold text-zinc-200">Security Events</p>
          <p className="text-xs text-zinc-600 mt-0.5">{events.length} records</p>
        </div>

        {loading ? (
          <div className="p-5">
            {/* Skeleton in your repo likely doesn't support rows; pass className only */}
            <Skeleton className="h-32" />
          </div>
        ) : events.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm font-semibold text-zinc-200">No fraud events</p>
            <p className="text-xs text-zinc-600 mt-1">No events match the current filters.</p>
          </div>
        ) : (
          <TableWrapper>
            <thead>
              <tr>
                <Th>Timestamp</Th>
                <Th>Event Type</Th>
                <Th>Risk</Th>
                <Th>IP</Th>
                <Th>User</Th>
                <Th>Status</Th>
                <Th>Action</Th>
              </tr>
            </thead>
            <tbody>
              {events.map((ev) => (
                <tr key={ev.id} className="hover:bg-zinc-800/30 transition-colors">
                  <Td>
                    <span className="font-mono text-xs text-zinc-400">{fmtDate(ev.createdAt)}</span>
                  </Td>
                  <Td>
                    <EventBadge type={ev.eventType} />
                  </Td>
                  <Td>
                    <RiskBadge score={ev.riskScore} />
                  </Td>
                  <Td>
                    <span className="font-mono text-xs text-zinc-500">{ev.ipAddress ?? '—'}</span>
                  </Td>
                  <Td>
                    <span className="font-mono text-xs text-zinc-500">
                      {ev.userId ? `${ev.userId.slice(0, 8)}…` : '—'}
                    </span>
                  </Td>
                  <Td>
                    <StatusBadge resolved={ev.resolved} />
                  </Td>
                  <Td>
                    {!ev.resolved && (
                      <ActionButton size="sm" onClick={() => handleResolve(ev.id)}>
                        Resolve
                      </ActionButton>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrapper>
        )}
      </Panel>
    </div>
  );
});

export default FraudLog;
