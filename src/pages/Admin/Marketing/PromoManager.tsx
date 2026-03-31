import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';

import { Panel, KPICard, EmptyState } from '@/features/admin/ui/AdminPrimitives';
import { callAdminGateway } from '@/features/admin/api/adminGateway.client';
import { listAdminPromos, formatAdminMarketingError } from '@/modules/admin/api/adminMarketing.api';
import type { AdminPromo } from '@/features/admin/types/admin-common.types';

import { buildPromoCsv, downloadCsv } from './promo-manager/promoManager.csv';
import {
  buildQuickCounts,
  buildTotals,
  enrichPromo,
  filterAndSortPromos,
} from './promo-manager/promoManager.derived';
import { formatMoney } from './promo-manager/promoManager.formatters';
import {
  DEFAULT_PROMO_FILTERS,
  type EnrichedPromo,
  type Filters,
} from './promo-manager/promoManager.types';
import { HeaderButton, SectionHeader } from './promo-manager/promoManager.ui';
import {
  INITIAL_PROMO_FORM,
  type PromoCreateFormState,
  validatePromoForm,
  buildCreatePromoPayload,
} from './promo-manager/promoManager.form';

import { FilterBar } from './components/FilterBar';
import { PromoCard } from './components/PromoCard';
import { PromoCreateModal } from './components/PromoCreateModal';
import { PromoDetailPanel } from './components/PromoDetailPanel';
import { PromoSkeleton } from './components/PromoSkeleton';
import { PromoTable } from './components/PromoTable';

export const PromoManager = memo(function PromoManager(): ReactElement {
  const [promos, setPromos] = useState<AdminPromo[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedPromoId, setSelectedPromoId] = useState<string | null>(null);
  const [lastCopiedCode, setLastCopiedCode] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(DEFAULT_PROMO_FILTERS);
  const [createOpen, setCreateOpen] = useState<boolean>(false);
  const [createSaving, setCreateSaving] = useState<boolean>(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState<PromoCreateFormState>(INITIAL_PROMO_FORM);

  const errorRef = useRef<HTMLDivElement | null>(null);
  const announceTimerRef = useRef<number | null>(null);

  const focusError = useCallback((): void => {
    window.setTimeout(() => {
      errorRef.current?.focus();
    }, 50);
  }, []);

  const announceCopy = useCallback((code: string): void => {
    setLastCopiedCode(code);

    if (announceTimerRef.current !== null) {
      window.clearTimeout(announceTimerRef.current);
    }

    announceTimerRef.current = window.setTimeout(() => {
      setLastCopiedCode(null);
      announceTimerRef.current = null;
    }, 1800);
  }, []);

  useEffect(() => {
    return () => {
      if (announceTimerRef.current !== null) {
        window.clearTimeout(announceTimerRef.current);
      }
    };
  }, []);

  const handleCopyCode = useCallback(
    async (code: string): Promise<void> => {
      try {
        await navigator.clipboard.writeText(code);
        announceCopy(code);
      } catch {
        setError('Unable to copy promo code to clipboard.');
        focusError();
      }
    },
    [announceCopy, focusError],
  );

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      const data = await listAdminPromos();
      setPromos(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      setPromos([]);
      setError(formatAdminMarketingError(err));
      focusError();
    } finally {
      setLoading(false);
    }
  }, [focusError]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreateModal = useCallback((): void => {
    setCreateError(null);
    setCreateForm(INITIAL_PROMO_FORM);
    setCreateOpen(true);
  }, []);

  const closeCreateModal = useCallback((): void => {
    if (createSaving) {
      return;
    }

    setCreateOpen(false);
    setCreateError(null);
  }, [createSaving]);

  const handleCreateSubmit = useCallback(async (): Promise<void> => {
    const validationError = validatePromoForm(createForm);
    if (validationError !== null) {
      setCreateError(validationError);
      return;
    }

    setCreateSaving(true);
    setCreateError(null);

    try {
      const payload = buildCreatePromoPayload(createForm);
      await callAdminGateway('promos:create', payload);
      setCreateOpen(false);
      setCreateForm(INITIAL_PROMO_FORM);
      await load();
    } catch (err: unknown) {
      setCreateError(formatAdminMarketingError(err));
    } finally {
      setCreateSaving(false);
    }
  }, [createForm, load]);

  const nowMs = Date.now();

  const enriched = useMemo<EnrichedPromo[]>(() => {
    return promos.map((promo) => enrichPromo(promo, nowMs));
  }, [promos, nowMs]);

  const selectedPromo = useMemo<EnrichedPromo | null>(() => {
    if (selectedPromoId === null) {
      return null;
    }

    return enriched.find((promo) => promo.id === selectedPromoId) ?? null;
  }, [enriched, selectedPromoId]);

  const handleToggle = useCallback(
    async (promo: EnrichedPromo): Promise<void> => {
      const nextActive = !promo.isActive;
      const nextStatus = nextActive ? 'active' : 'inactive';

      setBusyId(promo.id);
      setError(null);

      setPromos((prev) =>
        prev.map((entry) => (entry.id === promo.id ? { ...entry, status: nextStatus } : entry)),
      );

      try {
        await callAdminGateway('promos:toggle', {
          id: promo.id,
          active: nextActive,
        });
      } catch (err: unknown) {
        setPromos((prev) =>
          prev.map((entry) => (entry.id === promo.id ? { ...entry, status: promo.status } : entry)),
        );
        setError(formatAdminMarketingError(err));
        focusError();
      } finally {
        setBusyId(null);
      }
    },
    [focusError],
  );

  const totals = useMemo(() => buildTotals(enriched), [enriched]);
  const quickCounts = useMemo(() => buildQuickCounts(enriched), [enriched]);

  const filtered = useMemo<EnrichedPromo[]>(() => {
    return filterAndSortPromos(enriched, filters);
  }, [enriched, filters]);

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Promo Codes"
        subtitle="List, monitor, filter, export, inspect, create, and activate/deactivate promo codes through the admin gateway."
        right={
          <div className="flex flex-wrap gap-2">
            <HeaderButton onClick={openCreateModal} disabled={loading}>
              Create Promo
            </HeaderButton>

            <HeaderButton
              onClick={() => {
                if (filtered.length === 0) {
                  return;
                }

                downloadCsv(
                  `promo-codes-${new Date().toISOString().slice(0, 10)}.csv`,
                  buildPromoCsv(filtered),
                );
              }}
              disabled={loading || filtered.length === 0}
            >
              Export CSV
            </HeaderButton>

            <HeaderButton
              onClick={() => {
                void load();
              }}
              disabled={loading}
            >
              {loading ? 'Refreshing…' : 'Refresh'}
            </HeaderButton>
          </div>
        }
      />

      <PromoCreateModal
        open={createOpen}
        form={createForm}
        saving={createSaving}
        submitError={createError}
        onClose={closeCreateModal}
        onChange={setCreateForm}
        onSubmit={() => {
          void handleCreateSubmit();
        }}
      />

      {error !== null ? (
        <div
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          aria-live="assertive"
          aria-atomic="true"
          className="flex items-start justify-between gap-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400 outline-none focus-visible:ring-2 focus-visible:ring-red-500/30"
        >
          <span className="flex-1">{error}</span>
          <button
            type="button"
            onClick={() => {
              void load();
            }}
            className="shrink-0 rounded font-semibold underline underline-offset-2 hover:text-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40"
          >
            Retry
          </button>
        </div>
      ) : null}

      <div aria-live="polite" className="sr-only">
        {lastCopiedCode !== null ? `Copied promo code ${lastCopiedCode}` : ''}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <KPICard label="Active Codes" value={String(totals.activeCount)} accent="emerald" />
        <KPICard label="Live Now" value={String(totals.liveCount)} accent="sky" />
        <KPICard label="Scheduled" value={String(totals.scheduledCount)} accent="violet" />
        <KPICard label="Usage Capped" value={String(totals.cappedCount)} accent="rose" />
        <KPICard label="Total Uses" value={totals.totalUses.toLocaleString()} accent="amber" />
        <KPICard label="Revenue" value={formatMoney(totals.totalRevenueCents)} accent="amber" />
      </div>

      <PromoDetailPanel
        promo={selectedPromo}
        onClose={() => setSelectedPromoId(null)}
        onCopy={(code) => {
          void handleCopyCode(code);
        }}
      />

      <Panel noPad>
        <FilterBar
          filters={filters}
          onChange={setFilters}
          visibleCount={filtered.length}
          totalCount={enriched.length}
          quickCounts={quickCounts}
        />

        {loading ? <PromoSkeleton /> : null}

        {!loading && filtered.length === 0 ? (
          <div className="px-6 py-14">
            <EmptyState
              title={enriched.length === 0 ? 'No promo codes found' : 'No codes match your filters'}
              description={
                enriched.length === 0
                  ? 'Promo codes available to your admin account will appear here once the backend returns records.'
                  : 'Try clearing the search or changing the lifecycle and type filters.'
              }
              icon="🏷️"
            />
          </div>
        ) : null}

        {!loading && filtered.length > 0 ? (
          <>
            <div className="space-y-3 p-4 sm:hidden">
              {filtered.map((promo) => (
                <PromoCard
                  key={promo.id}
                  promo={promo}
                  isBusy={busyId === promo.id}
                  onToggle={(nextPromo) => {
                    void handleToggle(nextPromo);
                  }}
                  onView={(nextPromo) => setSelectedPromoId(nextPromo.id)}
                  onCopy={(code) => {
                    void handleCopyCode(code);
                  }}
                />
              ))}
            </div>

            <PromoTable
              promos={filtered}
              busyId={busyId}
              onView={(promo) => setSelectedPromoId(promo.id)}
              onCopy={(code) => {
                void handleCopyCode(code);
              }}
              onToggle={(promo) => {
                void handleToggle(promo);
              }}
            />
          </>
        ) : null}
      </Panel>
    </div>
  );
});

export default PromoManager;
