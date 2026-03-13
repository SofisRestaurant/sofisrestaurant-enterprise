import type { PricingSnapshot } from './pricing.ts';
import type { StoredOrderCartItems } from './order-cart-items.ts';

export function buildStoredOrderCartItemsFromSnapshot(
  snapshot: PricingSnapshot,
  pricingHash: string,
): StoredOrderCartItems {
  return snapshot.lines.map((line) => ({
    menuItemId: line.menuItemId,
    name: line.name,
    quantity: line.quantity,
    notes: line.notes,
    modifiers: line.modifiers.map((modifier) => ({
      id: modifier.id,
      groupId: modifier.groupId,
      name: modifier.name,
      priceAdjustmentCents: modifier.priceAdjustmentCents,
    })),
    unitPriceCents: line.baseUnitPriceCents + line.modifierUnitPriceCents,
    lineTotalCents: line.finalPretaxLineTotalCents,
    category: line.category,
    imageUrl: line.imageUrl,
    pricingHash,
  }));
}