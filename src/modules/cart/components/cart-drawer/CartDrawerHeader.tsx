import { X } from 'lucide-react';

import { cartAccentBar, cartEyebrow, cartIconButton, cartTitle } from '../cartStyles';

type CartDrawerHeaderProps = {
  itemCount: number;
  subtotalLabel?: string;
  variant: 'mobile' | 'desktop';
  onClose: () => void;
};

export function CartDrawerHeader({
  itemCount,
  subtotalLabel,
  variant,
  onClose,
}: CartDrawerHeaderProps) {
  const badge =
    itemCount > 0 ? (
      <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-gold-400 px-2 text-[11px] font-black tabular-nums text-ink-900">
        {itemCount > 99 ? '99+' : itemCount}
      </span>
    ) : null;

  if (variant === 'desktop') {
    return (
      <header className="relative shrink-0 border-b border-cream-200 bg-white/95 px-5 py-4 backdrop-blur-md">
        <div className={cartAccentBar} aria-hidden="true" />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className={cartEyebrow}>Sofi&apos;s</p>
            <h2 id="cart-drawer-title" className={`${cartTitle} mt-0.5 flex items-center gap-2 text-lg`}>
              Your bag {badge}
            </h2>
            {subtotalLabel ? (
              <p className="mt-1 text-xs text-ink-500">
                {itemCount} item{itemCount === 1 ? '' : 's'} · {subtotalLabel} subtotal
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className={cartIconButton}
            aria-label="Close cart"
          >
            <X className="h-4 w-4" strokeWidth={2.25} />
          </button>
        </div>
      </header>
    );
  }

  return (
    <header className="relative shrink-0 px-5 pb-3 pt-1">
      <div className={cartAccentBar} aria-hidden="true" />
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className={cartEyebrow}>Your order</p>
          <h2 id="cart-drawer-title" className={`${cartTitle} mt-0.5 flex items-center gap-2`}>
            Your bag {badge}
          </h2>
        </div>
        <button type="button" onClick={onClose} className={cartIconButton} aria-label="Close cart">
          <X className="h-4 w-4" strokeWidth={2.25} />
        </button>
      </div>
    </header>
  );
}
