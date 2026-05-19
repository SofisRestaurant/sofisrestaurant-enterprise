// Floating Cart Pill — mobile-only cart CTA (reads lightweight cartUi.store).

import { useCallback, useContext, useMemo } from 'react';
import { ChevronRight, ShoppingBag } from 'lucide-react';
import { useLocation } from 'react-router-dom';

import { ModalContext } from '@/components/ui/ModalContext';
import { useCartUiStore } from '@/modules/cart/store/cartUi.store';
import { formatCents } from '@/modules/cart/utils/cart.utils';

const HIDDEN_ON = ['/checkout', '/admin', '/kitchen', '/expo', '/auth', '/update-password'];

const CART_PILL_GAP_PX = 10;
const DEFAULT_BOTTOM_NAV_OFFSET = '92px';

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

function isHiddenRoute(pathname: string): boolean {
  return HIDDEN_ON.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

function readCount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

export function FloatingCartPill() {
  const { pathname } = useLocation();

  const itemCount = useCartUiStore((s) => s.itemCount);
  const subtotalCents = useCartUiStore((s) => s.subtotalCents);
  const openCart = useCartUiStore((state) => state.open);

  const modalContext = useContext(ModalContext);

  const hiddenRoute = isHiddenRoute(pathname);
  const count = readCount(itemCount);
  const modalIsOpen = Boolean(modalContext?.activeModal);

  const formattedSubtotal = useMemo(
    () => formatCents(Number.isFinite(subtotalCents) ? Math.max(0, Math.round(subtotalCents)) : 0),
    [subtotalCents],
  );

  const itemLabel = useMemo(() => `${count} item${count === 1 ? '' : 's'}`, [count]);

  const handleOpenCart = useCallback(() => {
    openCart();
  }, [openCart]);

  if (hiddenRoute || count === 0 || modalIsOpen) {
    return null;
  }

  return (
    <div
      className={cx(
        'fixed inset-x-3 z-40 md:hidden min-[390px]:inset-x-4',
        'transform-gpu motion-safe:transition-[bottom,opacity,transform] motion-safe:duration-500 motion-safe:ease-[cubic-bezier(0.16,1,0.3,1)]',
        'motion-reduce:transition-none',
      )}
      style={{
        bottom: `calc(var(--bottom-nav-offset, ${DEFAULT_BOTTOM_NAV_OFFSET}) + env(safe-area-inset-bottom, 0px) + ${CART_PILL_GAP_PX}px)`,
        transform: 'translate3d(0, 0, 0)',
        WebkitTransform: 'translate3d(0, 0, 0)',
        backfaceVisibility: 'hidden',
        WebkitBackfaceVisibility: 'hidden',
        contain: 'layout paint style',
      }}
      role="region"
      aria-label="Cart summary"
    >
      <button
        type="button"
        onClick={handleOpenCart}
        aria-label={`View cart — ${itemLabel}, ${formattedSubtotal}`}
        className={cx(
          'group relative flex w-full touch-manipulation select-none items-center justify-between gap-3',
          'overflow-hidden rounded-2xl border border-gold-300/35 px-4 py-3.5 text-left',
          'bg-ink-900 shadow-[0_12px_36px_rgba(28,25,21,0.32)] ring-1 ring-white/10',
          'motion-safe:transition-[transform,box-shadow] motion-safe:duration-200',
          'hover:shadow-[0_16px_40px_rgba(28,25,21,0.38)]',
          'active:scale-[0.985] motion-reduce:active:scale-100',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--app-bg)]',
        )}
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-gold-400/50 to-transparent"
        />

        <span className="flex min-w-0 items-center gap-3">
          <span
            className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gold-400 text-ink-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]"
            aria-hidden="true"
          >
            <ShoppingBag className="h-[18px] w-[18px]" strokeWidth={2.25} />
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 text-[10px] font-black text-ink-900 shadow-sm">
              {count > 99 ? '99+' : count}
            </span>
          </span>

          <span className="min-w-0">
            <span className="block truncate text-sm font-bold leading-tight text-white">
              View your bag
            </span>
            <span className="block truncate text-[11px] font-medium text-white/55">
              {itemLabel} · tap to review
            </span>
          </span>
        </span>

        <span className="flex shrink-0 items-center gap-2">
          <span className="text-base font-black tabular-nums text-white">{formattedSubtotal}</span>
          <span
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/80 motion-safe:transition-transform motion-safe:group-hover:translate-x-0.5"
            aria-hidden="true"
          >
            <ChevronRight className="h-4 w-4" strokeWidth={2.5} />
          </span>
        </span>
      </button>
    </div>
  );
}

export default FloatingCartPill;
