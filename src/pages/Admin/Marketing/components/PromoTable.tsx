import type { ReactElement } from 'react';

import { Badge } from '@/features/admin/ui/AdminPrimitives';

import type { EnrichedPromo, BadgeTone } from '../promo-manager/promoManager.types';
import {
  discountLabel,
  formatDate,
  formatMoney,
} from '../promo-manager/promoManager.formatters';
import {
  HeaderButton,
  TableWrapper,
  Td,
  Th,
} from '../promo-manager/promoManager.ui';
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

export function PromoTable({
  promos,
  busyId,
  onView,
  onCopy,
  onToggle,
}: {
  promos: EnrichedPromo[];
  busyId: string | null;
  onView: (promo: EnrichedPromo) => void;
  onCopy: (code: string) => void;
  onToggle: (promo: EnrichedPromo) => void;
}): ReactElement {
  return (
    <div className="hidden sm:block">
      <TableWrapper>
        <>
          <thead>
            <tr>
              <Th>Code</Th>
              <Th>Type</Th>
              <Th>Discount</Th>
              <Th>Uses</Th>
              <Th>Usage</Th>
              <Th>Revenue</Th>
              <Th>Starts</Th>
              <Th>Ends</Th>
              <Th>Status</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>

          <tbody>
            {promos.map((promo) => {
              const isBusy = busyId === promo.id;
              const isExpired = promo.lifecycle === 'expired';

              return (
                <tr
                  key={promo.id}
                  className="border-b border-zinc-800/60 transition-colors hover:bg-zinc-800/20"
                >
                  <Td>
                    <div className="flex flex-col gap-0.5">
                      <span className="font-mono font-bold tracking-wide text-amber-400">
                        {promo.codeSafe}
                      </span>
                      {promo.nameSafe && promo.nameSafe !== promo.codeSafe ? (
                        <span className="max-w-180px truncate text-xs text-zinc-500">
                          {promo.nameSafe}
                        </span>
                      ) : null}
                    </div>
                  </Td>

                  <Td>
                    <Badge tone={discountTypeTone(promo.discountTypeSafe)}>
                      {promo.discountTypeSafe ?? '—'}
                    </Badge>
                  </Td>

                  <Td>
                    <span className="font-mono text-xs text-zinc-300">
                      {discountLabel(promo)}
                    </span>
                  </Td>

                  <Td>
                    <span className="font-mono text-xs text-zinc-400">
                      {promo.currentUses.toLocaleString()}
                      {promo.maxUses !== null ? (
                        <span className="text-zinc-600"> / {promo.maxUses.toLocaleString()}</span>
                      ) : null}
                    </span>
                  </Td>

                  <Td>
                    {promo.usagePercent !== null ? (
                      <UsageBar percent={promo.usagePercent} />
                    ) : (
                      <span className="text-xs text-zinc-600">Unlimited</span>
                    )}
                  </Td>

                  <Td>
                    <span className="font-mono text-xs text-zinc-300">
                      {formatMoney(promo.revenueCents)}
                    </span>
                  </Td>

                  <Td>
                    <span className="font-mono text-xs text-zinc-500">
                      {formatDate(promo.startsAtSafe)}
                    </span>
                  </Td>

                  <Td>
                    <span
                      className={`font-mono text-xs ${
                        promo.lifecycle === 'expired' ? 'text-red-400/70' : 'text-zinc-500'
                      }`}
                    >
                      {formatDate(promo.endsAtSafe)}
                    </span>
                  </Td>

                  <Td>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge tone={lifecycleTone(promo.lifecycle)}>
                        {lifecycleLabel(promo.lifecycle)}
                      </Badge>
                      {promo.expiresSoon && promo.lifecycle === 'live' ? (
                        <Badge tone="warning">Soon</Badge>
                      ) : null}
                      {promo.isCapped ? <Badge tone="warning">Capped</Badge> : null}
                    </div>
                  </Td>

                  <Td className="text-right">
                    <div className="flex justify-end gap-2">
                      <HeaderButton onClick={() => onView(promo)}>View</HeaderButton>
                      <HeaderButton onClick={() => onCopy(promo.codeSafe)}>Copy</HeaderButton>
                      <HeaderButton
                        onClick={() => onToggle(promo)}
                        disabled={isBusy || isExpired}
                        variant={promo.isActive ? 'danger' : 'success'}
                      >
                        {isBusy ? 'Saving…' : promo.isActive ? 'Deactivate' : 'Activate'}
                      </HeaderButton>
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </>
      </TableWrapper>
    </div>
  );
}