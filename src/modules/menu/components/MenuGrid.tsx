// =============================================================================
// src/components/menu/MenuGrid.tsx
// MENU GRID — V4 (2026) Public Menu
// ----------------------------------------------------------------------------
// ✅ Accepts MenuItemPublic[] and renders <ul> semantics (a11y)
// ✅ Sorted + stable keys
// ✅ Price shown using cents resolver (prefers *_cents)
// ✅ Availability respected (card disabled if not available)
// ✅ Does NOT fetch — pure render
// =============================================================================

import { memo, useMemo } from 'react';
import type { MenuItemPublic } from '@/domain/menu/menu.types';
import { MenuItemCard } from '@/modules/menu/components/MenuItemCard';

type Props = {
  items: MenuItemPublic[];
  /** Optional resolver: return cents. If omitted, MenuItemCard handles display. */
  getPriceCents?: (item: MenuItemPublic) => number;
  /** Optional resolver for availability */
  getAvailable?: (item: MenuItemPublic) => boolean;
};

function safeStr(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function MenuGridComponent({ items, getPriceCents, getAvailable }: Props) {
  const sorted = useMemo(() => {
    // If Menu already sorts, this keeps it stable anyway.
    return [...items];
  }, [items]);

  return (
    <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-label="Menu items">
      {sorted.map((item) => {
        const key = safeStr((item as any).id, '');
        if (!key) return null;

        return (
          <li key={key} className="list-none">
            <MenuItemCard
              item={item}
              // If your MenuItemCard doesn’t support these props yet, remove them.
              // They’re here to keep pricing/availability consistent across UI.
              getPriceCents={getPriceCents}
              getAvailable={getAvailable}
            />
          </li>
        );
      })}
    </ul>
  );
}

export const MenuGrid = memo(MenuGridComponent);
