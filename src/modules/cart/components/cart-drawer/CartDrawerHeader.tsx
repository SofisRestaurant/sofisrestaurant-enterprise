import { ShoppingBag, X } from 'lucide-react';

import { cartAccentBar, cartIconButton } from '../cartStyles';

type CartDrawerHeaderProps = {
  itemCount: number;
  subtotalLabel?: string;
  variant: 'mobile' | 'desktop';
  onClose: () => void;
};

function CartItemBadge({ itemCount }: { itemCount: number }) {
  if (itemCount <= 0) return null;

  return (
    <span
      className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-gold-400 px-2 text-[11px] font-black tabular-nums text-ink-950 shadow-sm ring-1 ring-gold-500/20"
      aria-label={`${itemCount} item${itemCount === 1 ? '' : 's'} in cart`}
    >
      {itemCount > 99 ? '99+' : itemCount}
    </span>
  );
}

function HeaderTitle({
  itemCount,
  subtotalLabel,
  variant,
}: {
  itemCount: number;
  subtotalLabel?: string;
  variant: 'mobile' | 'desktop';
}) {
  const hasItems = itemCount > 0;

  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-center gap-2">
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl bg-ember-50 text-ember-700 ring-1 ring-ember-100 dark:bg-ember-500/10 dark:text-ember-300 dark:ring-ember-400/15">
          <ShoppingBag className="h-4 w-4" strokeWidth={2.35} aria-hidden="true" />
        </span>

        <p className="truncate text-[10px] font-black uppercase tracking-[0.16em] text-ink-400 dark:text-white/45">
          {variant === 'desktop' ? 'Sofi’s checkout' : 'Your order'}
        </p>
      </div>

      <div className="flex min-w-0 items-center gap-2">
        <h2
          id="cart-drawer-title"
          className="truncate text-xl font-black tracking-tight text-ink-950 dark:text-white"
        >
          Your bag
        </h2>

        <CartItemBadge itemCount={itemCount} />
      </div>

      <p className="mt-1 truncate text-xs font-medium text-ink-500 dark:text-white/55">
        {hasItems
          ? subtotalLabel
            ? `${itemCount} item${itemCount === 1 ? '' : 's'} · ${subtotalLabel} subtotal`
            : `${itemCount} item${itemCount === 1 ? '' : 's'} ready for checkout`
          : 'Start building your Sofi’s order'}
      </p>
    </div>
  );
}

export function CartDrawerHeader({
  itemCount,
  subtotalLabel,
  variant,
  onClose,
}: CartDrawerHeaderProps) {
  if (variant === 'desktop') {
    return (
      <header className="relative shrink-0 overflow-hidden border-b border-cream-200 bg-white/95 px-5 py-4 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-ink-950/95">
        <div className={cartAccentBar} aria-hidden="true" />

        <div
          className="pointer-events-none absolute -right-10 -top-14 h-28 w-28 rounded-full bg-gold-200/40 blur-3xl dark:bg-ember-500/10"
          aria-hidden="true"
        />

        <div className="relative flex items-start justify-between gap-4">
          <HeaderTitle itemCount={itemCount} subtotalLabel={subtotalLabel} variant="desktop" />

          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onClose();
            }}
            className={cartIconButton}
            aria-label="Close cart"
          >
            <X className="h-4 w-4" strokeWidth={2.35} aria-hidden="true" />
          </button>
        </div>
      </header>
    );
  }

  return (
    <header className="relative shrink-0 overflow-hidden border-b border-cream-200/80 bg-white/95 px-5 pb-3 pt-2 shadow-sm backdrop-blur-xl dark:border-white/10 dark:bg-ink-950/95">
      <div className={cartAccentBar} aria-hidden="true" />

      <div
        className="pointer-events-none absolute -right-12 -top-16 h-32 w-32 rounded-full bg-gold-200/45 blur-3xl dark:bg-ember-500/10"
        aria-hidden="true"
      />

      <div className="relative flex items-start justify-between gap-4">
        <HeaderTitle itemCount={itemCount} subtotalLabel={subtotalLabel} variant="mobile" />

        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onClose();
          }}
          className={`${cartIconButton} mt-1`}
          aria-label="Close cart"
        >
          <X className="h-4 w-4" strokeWidth={2.35} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
