import type { ReactElement } from 'react';

import { Panel, Badge } from '@/features/admin/ui/AdminPrimitives';

import type { EnrichedPromo, BadgeTone } from '../promo-manager/promoManager.types';
import {
  discountLabel,
  formatDateTime,
  formatMoney,
} from '../promo-manager/promoManager.formatters';
import { HeaderButton } from '../promo-manager/promoManager.ui';
import { UsageBar } from './UsageBar';

function lifecycleTone(lifecycle: EnrichedPromo['lifecycle']): BadgeTone {
  switch (lifecycle) {
    case 'live':
      return 'success';
    case 'scheduled':
      return 'info';
    case 'expired':
      return 'neutral';
    case 'inactive':
      return 'neutral';
    case 'draft':
      return 'warning';
  }
}

function lifecycleLabel(lifecycle: EnrichedPromo['lifecycle']): string {
  switch (lifecycle) {
    case 'live':
      return 'Live';
    case 'scheduled':
      return 'Scheduled';
    case 'expired':
      return 'Expired';
    case 'inactive':
      return 'Inactive';
    case 'draft':
      return 'Draft';
  }
}

function discountTypeTone(type: string | null): BadgeTone {
  switch (type) {
    case 'percent':
      return 'info';
    case 'fixed':
    case 'amount':
      return 'success';
    case 'bogo':
    case 'free_item':
      return 'warning';
    default:
      return 'neutral';
  }
}

export function PromoDetailPanel({
  promo,
  onClose,
  onCopy,
}: {
  promo: EnrichedPromo | null;
  onClose: () => void;
  onCopy: (code: string) => void;
}): ReactElement | null {
  if (promo === null) return null;

  return (
    <Panel
      title="Promo details"
      subtitle="Read-only operational view"
      className="border-zinc-800/90"
    >
      <div className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xl font-black tracking-wide text-amber-400">
                {promo.codeSafe}
              </span>
              <Badge tone={lifecycleTone(promo.lifecycle)}>{lifecycleLabel(promo.lifecycle)}</Badge>
              {promo.isCapped ? <Badge tone="warning">Usage capped</Badge> : null}
              {promo.expiresSoon && promo.lifecycle === 'live' ? (
                <Badge tone="warning">Expiring soon</Badge>
              ) : null}
            </div>

            {promo.nameSafe && promo.nameSafe !== promo.codeSafe ? (
              <p className="mt-1 text-sm text-zinc-500">{promo.nameSafe}</p>
            ) : null}
          </div>

          <div className="flex gap-2">
            <HeaderButton onClick={() => onCopy(promo.codeSafe)}>Copy code</HeaderButton>
            <HeaderButton onClick={onClose}>Close</HeaderButton>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
            <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-600">Type</p>
            <div className="mt-2">
              <Badge tone={discountTypeTone(promo.discountTypeSafe)}>
                {promo.discountTypeSafe ?? 'Unknown'}
              </Badge>
            </div>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
            <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-600">Discount</p>
            <p className="mt-2 font-mono text-lg font-bold text-zinc-100">
              {discountLabel(promo)}
            </p>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
            <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-600">Uses</p>
            <p className="mt-2 font-mono text-lg font-bold text-zinc-100">
              {promo.currentUses.toLocaleString()}
            </p>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
            <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-600">Revenue</p>
            <p className="mt-2 font-mono text-lg font-bold text-zinc-100">
              {formatMoney(promo.revenueCents)}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
              Schedule
            </p>

            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500">Starts</dt>
                <dd className="font-mono text-zinc-200">{formatDateTime(promo.startsAtSafe)}</dd>
              </div>

              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500">Ends</dt>
                <dd className="font-mono text-zinc-200">{formatDateTime(promo.endsAtSafe)}</dd>
              </div>

              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500">State</dt>
                <dd className="text-zinc-200">{lifecycleLabel(promo.lifecycle)}</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-zinc-500">
              Constraints
            </p>

            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500">Max uses</dt>
                <dd className="font-mono text-zinc-200">
                  {promo.maxUses !== null ? promo.maxUses.toLocaleString() : 'Unlimited'}
                </dd>
              </div>

              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500">Per user</dt>
                <dd className="font-mono text-zinc-200">
                  {promo.perUserLimit !== null ? promo.perUserLimit.toLocaleString() : '—'}
                </dd>
              </div>

              <div className="flex justify-between gap-3">
                <dt className="text-zinc-500">Min order</dt>
                <dd className="font-mono text-zinc-200">
                  {promo.minOrderCents !== null ? formatMoney(promo.minOrderCents) : '—'}
                </dd>
              </div>
            </dl>

            {promo.usagePercent !== null ? (
              <div className="mt-4">
                <UsageBar percent={promo.usagePercent} />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </Panel>
  );
}