// =============================================================================
// src/pages/Admin/Marketing/PromoManager.tsx
// =============================================================================

import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { fetchPromoCodes, togglePromoCode } from '@/features/admin/growth/growth.service';
import type { PromoCode, PromoType } from '@/features/admin/growth/growth.types';
import {
  Panel,
  KPICard,
  SectionHeader,
  ActionButton,
  TableWrapper,
  Th,
  Td,
  Badge,
  EmptyState,
  HealthBar,
  SkeletonGrid,
} from '@/features/admin/ui';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
type PromoTypeUI = 'percent' | 'fixed' | 'amount' | 'bogo' | 'free_item';

function promoTone(type: PromoTypeUI): NonNullable<React.ComponentProps<typeof Badge>['tone']> {
  switch (type) {
    case 'percent':
    case 'fixed':
    case 'amount':
      return 'info';
    case 'bogo':
    case 'free_item':
      return 'warning';
    default:
      return 'neutral';
  }
}

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

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

function normalizePromoType(dbType: string): PromoType {
  if (dbType === 'percent') return 'percent';
  if (dbType === 'fixed') return 'fixed';
  if (dbType === 'amount') return 'fixed'; // treat as alias if it appears
  if (dbType === 'bogo') return 'bogo';
  if (dbType === 'free_item') return 'free_item';
  return 'fixed';
}

function statusTone(active: boolean): NonNullable<React.ComponentProps<typeof Badge>['tone']> {
  return active ? 'success' : 'neutral';
}

function usageVariant(pct: number): NonNullable<React.ComponentProps<typeof HealthBar>['variant']> {
  // pct 0–100
  if (pct >= 90) return 'bad';
  if (pct >= 70) return 'warn';
  return 'good';
}

function discountLabel(p: PromoCode): string {
  if (p.type === 'percent') return `${p.value}%`;
  if (p.type === 'fixed') return fmt$(Math.round(p.value * 100));
  return '—';
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export const PromoManager = memo(function PromoManager() {
  const [promos, setPromos] = useState<PromoCode[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      const data = await fetchPromoCodes();
      setPromos(Array.isArray(data) ? data : []);
    } catch (e) {
      setPromos([]);
      setError(e instanceof Error ? e.message : 'Failed to load promo codes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleToggle = useCallback(async (p: PromoCode): Promise<void> => {
    const next = !p.active;

    setBusyId(p.id);
    setError(null);

    // optimistic update
    setPromos((prev) => prev.map((x) => (x.id === p.id ? { ...x, active: next } : x)));

    try {
      await togglePromoCode(p.id, next);
    } catch (e) {
      // revert
      setPromos((prev) => prev.map((x) => (x.id === p.id ? { ...x, active: p.active } : x)));
      setError(e instanceof Error ? e.message : 'Failed to update promo code');
    } finally {
      setBusyId(null);
    }
  }, []);

  const totals = useMemo(() => {
    const totalRevenueCents = 0; // your PromoCode type doesn't include revenueCents (remove or wire later)
    const activeCount = promos.filter((p) => p.active).length;
    const totalUses = promos.reduce((s, p) => s + (p.currentUses ?? 0), 0);
    return { totalRevenueCents, activeCount, totalUses };
  }, [promos]);

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Promo Codes"
        subtitle="Performance and revenue attribution for promotional codes"
        right={
          <ActionButton
            size="sm"
            onClick={() => {
              void load();
            }}
          >
            Refresh
          </ActionButton>
        }
      />

      {error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-4 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <KPICard label="Active Codes" value={String(totals.activeCount)} accent="emerald" />
        <KPICard label="Total Uses" value={String(totals.totalUses)} accent="sky" />
        <KPICard
          label="Revenue (wire later)"
          value={fmt$(totals.totalRevenueCents)}
          accent="amber"
        />
      </div>

      <Panel noPad>
        <div className="px-5 py-4 border-b border-zinc-800">
          <p className="text-sm font-bold text-zinc-200">All Promo Codes</p>
          <p className="text-xs text-zinc-600 mt-0.5">{promos.length} records</p>
        </div>

        {loading ? (
          <div className="p-5">
            <SkeletonGrid rows={5} columns={1} />
          </div>
        ) : promos.length === 0 ? (
          <div className="p-8">
            <EmptyState
              title="No promo codes"
              description="No promo codes have been created yet."
            />
          </div>
        ) : (
          <TableWrapper>
            <thead>
              <tr>
                <Th>Code</Th>
                <Th>Type</Th>
                <Th>Discount</Th>
                <Th>Uses</Th>
                <Th>Usage</Th>
                <Th>Min Order</Th>
                <Th>Starts</Th>
                <Th>Ends</Th>
                <Th>Status</Th>
                <Th>Action</Th>
              </tr>
            </thead>

            <tbody>
              {promos.map((p) => {
                const used = p.currentUses ?? 0;
                const max = p.maxUses;
                const usageRate = max ? clamp((used / Math.max(1, max)) * 100, 0, 100) : null;
                const isBusy = busyId === p.id;

                return (
                  <tr key={p.id} className="hover:bg-zinc-800/30 transition-colors">
                    <Td>
                      <span className="font-mono font-bold text-amber-400">{p.code}</span>
                    </Td>

                    <Td>
                      <Badge tone={promoTone(p.type)}>{p.type}</Badge>
                    </Td>

                    <Td className="font-mono text-xs text-zinc-300">{discountLabel(p)}</Td>

                    <Td className="font-mono text-xs text-zinc-400">
                      {used.toLocaleString()}
                      {max !== null && (
                        <span className="text-zinc-600"> / {max.toLocaleString()}</span>
                      )}
                    </Td>

                    <Td>
                      {usageRate !== null ? (
                        <HealthBar
                          label="Usage"
                          value={usageRate}
                          variant={usageVariant(usageRate)}
                        />
                      ) : (
                        <span className="text-zinc-600 text-xs">Unlimited</span>
                      )}
                    </Td>

                    <Td className="font-mono text-xs text-zinc-400">
                      {fmt$(p.minOrderCents ?? 0)}
                    </Td>
                    <Td className="font-mono text-xs text-zinc-500">{fmtDate(p.startsAt)}</Td>
                    <Td className="font-mono text-xs text-zinc-500">{fmtDate(p.endsAt)}</Td>

                    <Td>
                      <Badge tone={statusTone(p.active)}>{p.active ? 'Active' : 'Inactive'}</Badge>
                    </Td>

                    <Td>
                      <ActionButton
                        size="sm"
                        disabled={isBusy}
                        onClick={() => {
                          void handleToggle(p);
                        }}
                      >
                        {isBusy ? 'Saving…' : p.active ? 'Deactivate' : 'Activate'}
                      </ActionButton>
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
