import { ShoppingBag } from 'lucide-react';

import { cartPrimaryCta, cartTitle } from '../cartStyles';

type CartDrawerEmptyStateProps = {
  onBrowseMenu: () => void;
};

export function CartDrawerEmptyState({ onBrowseMenu }: CartDrawerEmptyStateProps) {
  return (
    <div className="flex min-h-[44vh] flex-col items-center justify-center px-6 py-12 text-center">
      <div
        className="mb-6 flex h-24 w-24 items-center justify-center rounded-3xl border border-dashed border-gold-300/50 bg-linear-to-br from-gold-100/50 to-cream-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]"
        aria-hidden="true"
      >
        <ShoppingBag className="h-10 w-10 text-gold-500/90" strokeWidth={1.5} />
      </div>

      <h3 className={`${cartTitle} mb-2 text-2xl`}>Your bag is empty</h3>
      <p className="mb-8 max-w-[16rem] text-sm leading-relaxed text-ink-500">
        Fresh plates, made to order. Add something from the menu to get started.
      </p>

      <button type="button" onClick={onBrowseMenu} className={cartPrimaryCta + ' max-w-xs px-10'}>
        Browse menu
      </button>
    </div>
  );
}
