// =============================================================================
// PATH: src/modules/admin/orders/AdminOrdersPage.tsx
// =============================================================================
// Orchestrator only. Calls hooks, wires state, composes layout.
// Contains zero business logic, zero inline filtering, zero data transforms.
// =============================================================================

import { useCallback, useRef, useState } from 'react';

import { Alert, Panel } from '@/features/admin/ui/AdminPrimitives';

// ── Hooks ──────────────────────────────────────────────────────────────
import { useAdminOrders } from '../orders/hooks/useAdminOrders';
import { useAdminOrdersRealtime } from '../orders/hooks/useAdminOrdersRealtime';
import { useAdminOrdersFilters } from '../orders/hooks/useAdminOrdersFilters';
import { useAdminOrdersMetrics } from '../orders/hooks/useAdminOrdersMetrics';
import { useAdminOrderSelection } from '../orders/hooks/useAdminOrderSelection';

// ── UI Components ──────────────────────────────────────────────────────
import { AdminOrdersSound } from '../orders/components/filters/AdminOrdersSound';
import { AdminOrdersLiveRegion } from '../orders/components/filters/AdminOrdersLiveRegion';
import { AdminOrdersHeader } from '../orders/components/filters/AdminOrdersHeader';
import { AdminOrdersMetrics } from '../orders/components/filters/AdminOrdersMetrics';
import { AdminOrdersFilters } from '../orders/components/filters/AdminOrdersFilters';
import { AdminOrdersSearch } from '../orders/components/filters/AdminOrdersSearch';
import { AdminOrdersSkeleton } from '../orders/components/list/AdminOrdersSkeleton';
import { AdminOrdersEmptyState } from '../orders/components/list/AdminOrdersEmptyState';
import { AdminOrdersMobileList } from '../orders/components/list/AdminOrdersMobileList';
import { AdminOrdersTable } from '../orders/components/list/AdminOrdersTable';
import { AdminOrderDrawer } from '../orders/components/detail/AdminOrderDrawer';

export default function AdminOrdersPage() {
  // ── Sound toggle (local — not shared with any hook) ────────────────────────
  const [soundEnabled, setSoundEnabled] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // ── Mutation error (separate from fetch error so they dismiss independently) ─
  const [mutationError, setMutationError] = useState<string | null>(null);
  const dismissMutationError = useCallback(() => setMutationError(null), []);

  // ── Data: fetch + polling ──────────────────────────────────────────────────
  const {
    orders,
    loading,
    error,
    lastUpdated,
    loadOrders,
    setOrders,
    setLastUpdated,
    dismissError,
  } = useAdminOrders();

  // ── Data: realtime live updates ────────────────────────────────────────────
  const { liveAnnouncement } = useAdminOrdersRealtime({
    soundEnabled,
    audioRef,
    setOrders,
    setLastUpdated,
  });

  // ── UI: filter + search ────────────────────────────────────────────────────
  const { activeTab, setActiveTab, search, setSearch, filteredOrders, counts, tabOptions } =
    useAdminOrdersFilters(orders);

  // ── UI: KPI metrics ────────────────────────────────────────────────────────
  const { queueCount, readyCount, overdueCount, paidRevenueCents, lastUpdatedLabel } =
    useAdminOrdersMetrics(orders, lastUpdated);

  // ── UI: order selection + mutation ─────────────────────────────────────────
  const { selectedOrder, updatingOrderId, closeButtonRef, selectOrder, closeOrder, mutateStatus } =
    useAdminOrderSelection(orders, setOrders, setLastUpdated, setMutationError);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      <AdminOrdersSound ref={audioRef} />

      <AdminOrdersLiveRegion announcement={liveAnnouncement} lastUpdatedLabel={lastUpdatedLabel} />

      <AdminOrdersHeader
        soundEnabled={soundEnabled}
        onToggleSound={() => setSoundEnabled((v) => !v)}
        onRefresh={() => void loadOrders()}
      />

      {error ? (
        <Alert
          tone="danger"
          title="Orders error"
          message={error}
          action={
            <button
              type="button"
              onClick={dismissError}
              className="rounded-lg border border-red-500/30 px-2.5 py-1 text-[11px] font-semibold text-red-100 transition hover:bg-red-500/10"
            >
              Dismiss
            </button>
          }
        />
      ) : null}

      {mutationError ? (
        <Alert
          tone="danger"
          title="Status update failed"
          message={mutationError}
          action={
            <button
              type="button"
              onClick={dismissMutationError}
              className="rounded-lg border border-red-500/30 px-2.5 py-1 text-[11px] font-semibold text-red-100 transition hover:bg-red-500/10"
            >
              Dismiss
            </button>
          }
        />
      ) : null}

      <AdminOrdersMetrics
        queueCount={queueCount}
        newCount={counts.new}
        preparingCount={counts.preparing}
        readyCount={readyCount}
        overdueCount={overdueCount}
        paidRevenueCents={paidRevenueCents}
        lastUpdatedLabel={lastUpdatedLabel}
      />

      <AdminOrdersFilters
        tabOptions={tabOptions}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
      />

      <AdminOrdersSearch value={search} onChange={setSearch} />

      <Panel
        title="Orders"
        subtitle={`Showing ${filteredOrders.length} of ${orders.length} total orders.`}
        noPad
      >
        {loading && orders.length === 0 ? (
          <AdminOrdersSkeleton />
        ) : filteredOrders.length === 0 ? (
          <AdminOrdersEmptyState />
        ) : (
          <>
            <AdminOrdersMobileList orders={filteredOrders} onSelect={selectOrder} />
            <AdminOrdersTable orders={filteredOrders} onSelect={selectOrder} />
          </>
        )}
      </Panel>

      {selectedOrder ? (
        <AdminOrderDrawer
          order={selectedOrder}
          isUpdating={updatingOrderId === selectedOrder.id}
          closeButtonRef={closeButtonRef}
          onClose={closeOrder}
          onMutateStatus={mutateStatus}
        />
      ) : null}
    </div>
  );
}
