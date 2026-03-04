// =============================================================================
// src/components/menu/MenuItemCard.tsx
// MENU ITEM CARD — V4 (2026) Public Menu + Modal Hook
// ----------------------------------------------------------------------------
// ✅ Uses ModalType: 'menu-item' (matches your union)
// ✅ Passes ModalConfig shape: { data: { item } }
// ✅ Safe price display: prefers cents resolver, fallback to item.price dollars
// ✅ “Customize” opens modal for logged-in users; otherwise opens login
// =============================================================================

import { memo, useCallback, useMemo } from 'react';
import type { MenuItemPublic } from '@/domain/menu/menu.types';
import { useAuth } from '@/modules/auth/hooks/useAuth';
import { useModal } from '@/components/ui/useModal';
import { formatCurrency } from '@/utils/currency';
import { Button } from '@/components/ui/Button';

type Props = {
  item: MenuItemPublic;
  getPriceCents?: (item: MenuItemPublic) => number;
  getAvailable?: (item: MenuItemPublic) => boolean;
};

function formatCents(cents: number): string {
  const safe = Number.isFinite(cents) ? Math.max(0, Math.round(cents)) : 0;
  return (safe / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function MenuItemCardComponent({ item, getPriceCents, getAvailable }: Props) {
  const { user } = useAuth();
  const { openModal } = useModal();

  const isAvailable = useMemo(() => {
    if (typeof getAvailable === 'function') return getAvailable(item);
    return item.available !== false;
  }, [getAvailable, item]);

  const priceLabel = useMemo(() => {
    if (typeof getPriceCents === 'function') {
      return formatCents(getPriceCents(item));
    }
    // fallback: your existing formatter
    return formatCurrency((item as any).price);
  }, [getPriceCents, item]);

  const handleOpenItem = useCallback(() => {
    if (!user) {
      openModal('login');
      return;
    }

    // ✅ Must match ModalType: 'menu-item'
    openModal('menu-item', { data: { item } });
  }, [user, openModal, item]);

  return (
    <article className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200/70 transition hover:shadow-md">
      {item.image_url ? (
        <div className="relative aspect-4/3 overflow-hidden bg-zinc-100">
          <img
            src={item.image_url}
            alt={item.name}
            className="h-full w-full object-cover"
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
          />
        </div>
      ) : (
        <div className="relative aspect-4/3 bg-zinc-100" aria-hidden="true" />
      )}

      <div className="p-4">
        <div className="mb-2 flex items-start justify-between gap-3">
          <h3 className="min-w-0 flex-1 truncate pr-2 text-lg font-semibold text-zinc-900">
            {item.name}
          </h3>
          <span className="shrink-0 whitespace-nowrap text-lg font-bold text-primary">
            {priceLabel}
          </span>
        </div>

        {item.description ? (
          <p className="mb-3 line-clamp-2 text-sm text-zinc-600">{item.description}</p>
        ) : null}

        <Button
          type="button"
          onClick={handleOpenItem}
          className="w-full"
          disabled={!isAvailable}
          aria-label={isAvailable ? `Customize ${item.name}` : `${item.name} is out of stock`}
        >
          {isAvailable ? 'Customize' : 'Out of Stock'}
        </Button>
      </div>
    </article>
  );
}

export const MenuItemCard = memo(MenuItemCardComponent);
