import type { ReactElement } from 'react';

import { Badge } from '@/features/admin/ui/AdminPrimitives';

import type { EnrichedPromo, BadgeTone } from '../promo-manager/promoManager.types';
import {
  discountLabel,
  formatDate,
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

export function PromoCard({
  promo,
  isBusy,
  onToggle,
  onView,
  onCopy,
}: {
  promo: EnrichedPromo;
  isBusy: boolean;
  onToggle: (promo: EnrichedPromo) => void;
  onView: (promo: EnrichedPromo) => void;
  onCopy: (code: string) => void;
}): ReactElement {
  const isExpired = promo.lifecycle === 'expired';

  return (
    <article
      className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 transition hover:border-zinc-700"
      aria-label={`Promo ${promo.codeSafe}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-base md:text-sm font-bold tracking-wide text-amber-400">
              {promo.codeSafe}
            </span>
            <Badge tone={lifecycleTone(promo.lifecycle)}>{lifecycleLabel(promo.lifecycle)}</Badge>
            {promo.isCapped ? <Badge tone="warning">Capped</Badge> : null}
          </div>

          {promo.nameSafe && promo.nameSafe !== promo.codeSafe ? (
            <p className="mt-1 truncate text-xs text-zinc-500">{promo.nameSafe}</p>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => onView(promo)}
          className="rounded-lg border border-zinc-800 px-3 py-1.5 text-xs font-semibold text-zinc-300 transition hover:border-zinc-700"
          aria-label={`View promo ${promo.codeSafe}`}
        >
          View
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <p className="mb-1 text-[10px] uppercase tracking-widest text-zinc-600">Type</p>
          <Badge tone={discountTypeTone(promo.discountTypeSafe)}>
            {promo.discountTypeSafe ?? '—'}
          </Badge>
        </div>

        <div>
          <p className="mb-1 text-[10px] uppercase tracking-widest text-zinc-600">Discount</p>
          <p className="font-mono text-zinc-300">{discountLabel(promo)}</p>
        </div>

        <div>
          <p className="mb-1 text-[10px] uppercase tracking-widest text-zinc-600">Revenue</p>
          <p className="font-mono text-zinc-300">{formatMoney(promo.revenueCents)}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500">
        <span>Uses {promo.currentUses.toLocaleString()}</span>
        {promo.maxUses !== null ? <span>Cap {promo.maxUses.toLocaleString()}</span> : null}
        {promo.endsAtSafe ? <span>Ends {formatDate(promo.endsAtSafe)}</span> : null}
      </div>

      {promo.usagePercent !== null ? <UsageBar percent={promo.usagePercent} /> : null}

      <div className="flex gap-2 pt-1">
        <HeaderButton onClick={() => onCopy(promo.codeSafe)}>Copy</HeaderButton>
        <HeaderButton
          onClick={() => onToggle(promo)}
          disabled={isBusy || isExpired}
          variant={promo.isActive ? 'danger' : 'success'}
        >
          {isBusy ? 'Saving…' : promo.isActive ? 'Deactivate' : 'Activate'}
        </HeaderButton>
      </div>
    </article>
  );
}