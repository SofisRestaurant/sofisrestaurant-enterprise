import type { useCartSummary } from '@/domain/cart/use-cart-summary';
import { CartLineItem } from '@/modules/cart/components/CartLineItem';
import { cartItemKey } from '@/modules/cart/types/cart.types';
import type { CartItem } from '@/modules/cart/types/cart.types';

import { CartDrawerEmptyState } from './CartDrawerEmptyState';
import { CartDrawerPricing } from './CartDrawerPricing';

type SummaryTotals = ReturnType<typeof useCartSummary>['totals'];
type SummaryFlags = ReturnType<typeof useCartSummary>['flags'];

type CartDrawerContentProps = {
  items: CartItem[];
  hasItems: boolean;
  totals: SummaryTotals;
  flags: SummaryFlags;
  closeCart: () => void;
};

export function CartDrawerContent({
  items,
  hasItems,
  totals,
  flags,
  closeCart,
}: CartDrawerContentProps) {
  if (!hasItems) {
    return <CartDrawerEmptyState onBrowseMenu={closeCart} />;
  }

  return (
    <div className="space-y-4 px-4 pb-4 pt-1">
      <ul className="space-y-3" aria-label="Cart items">
        {items.map((item) => (
          <li key={cartItemKey(item.menuItemId, item.modifiers)}>
            <CartLineItem item={item} />
          </li>
        ))}
      </ul>

      <CartDrawerPricing totals={totals} flags={flags} />
    </div>
  );
}
