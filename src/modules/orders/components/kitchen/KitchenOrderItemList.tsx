// =============================================================================
// PATH: src/modules/orders/components/kitchen/KitchenOrderItemList.tsx
// =============================================================================

import { AlertTriangle, ClipboardList, Package } from 'lucide-react';

import {
  getAllergens,
  getCartItemKey,
  getKitchenNotes,
  getSpecialInstructions,
  parseDisplayModifiers,
} from './kitchen-item-parser';
import { getSelectionPriceLabel } from './kitchen.formatters';
import type { KitchenOrderItemListProps } from './kitchen.types';

export function KitchenOrderItemList({ items, orderId }: KitchenOrderItemListProps) {
  return (
    <div className="space-y-3">
      {items.map((item) => {
        const itemKey = getCartItemKey(orderId, item);
        const specialInstructions = getSpecialInstructions(item);
        const kitchenNotes = getKitchenNotes(item);
        const allergens = getAllergens(item);
        const modifiers = parseDisplayModifiers(item);

        return (
          <div
            key={itemKey}
            className="rounded-lg border border-neutral-800 bg-neutral-950/70 p-3"
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-md bg-orange-500/15 px-2 py-1 text-xs font-bold text-orange-300">
                {item.quantity}×
              </div>

              <div className="min-w-0 flex-1">
                <div className="font-medium text-white">{item.name}</div>

                {modifiers.length > 0 ? (
                  <div className="mt-2 space-y-2">
                    {modifiers.map((modifier) => (
                      <div
                        key={`${itemKey}:${modifier.key}`}
                        className="rounded-md bg-neutral-900 px-2.5 py-2"
                      >
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
                          {modifier.label}
                        </div>

                        <div className="mt-1 flex flex-wrap gap-2">
                          {modifier.selections.map((selection) => {
                            const priceLabel = getSelectionPriceLabel(selection);

                            return (
                              <span
                                key={`${itemKey}:${modifier.key}:${selection.id}:${selection.count}`}
                                className="inline-flex items-center rounded-full border border-neutral-700 bg-neutral-800 px-2.5 py-1 text-xs text-neutral-200"
                              >
                                {selection.count > 1 ? `${selection.count}× ` : ''}
                                {selection.name}
                                {priceLabel ? (
                                  <span className="ml-1 text-neutral-400">{priceLabel}</span>
                                ) : null}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}

                {specialInstructions ? (
                  <div className="mt-2 rounded-md border border-amber-500/20 bg-amber-500/10 px-2.5 py-2 text-xs text-amber-100">
                    <div className="mb-1 flex items-center gap-1 font-semibold uppercase tracking-wide text-amber-300">
                      <ClipboardList className="h-3.5 w-3.5" />
                      Special instructions
                    </div>
                    <div>{specialInstructions}</div>
                  </div>
                ) : null}

                {kitchenNotes ? (
                  <div className="mt-2 rounded-md border border-sky-500/20 bg-sky-500/10 px-2.5 py-2 text-xs text-sky-100">
                    <div className="mb-1 flex items-center gap-1 font-semibold uppercase tracking-wide text-sky-300">
                      <Package className="h-3.5 w-3.5" />
                      Kitchen notes
                    </div>
                    <div>{kitchenNotes}</div>
                  </div>
                ) : null}

                {allergens.length > 0 ? (
                  <div className="mt-2 rounded-md border border-rose-500/20 bg-rose-500/10 px-2.5 py-2 text-xs text-rose-100">
                    <div className="mb-1 flex items-center gap-1 font-semibold uppercase tracking-wide text-rose-300">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Allergens / dietary flags
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {allergens.map((allergen) => (
                        <span
                          key={`${itemKey}:allergen:${allergen}`}
                          className="rounded-full border border-rose-500/20 bg-rose-500/10 px-2 py-1 text-[11px] font-medium text-rose-100"
                        >
                          {allergen}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}