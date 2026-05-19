import { useRef } from 'react';

import { useCartDrawerDrag } from '@/modules/cart/gestures/useCartDrawerDrag';

type CartDrawerDragHandleProps = {
  onClose: () => void;
};

export function CartDrawerDragHandle({ onClose }: CartDrawerDragHandleProps) {
  const ref = useRef<HTMLDivElement>(null);
  const handlers = useCartDrawerDrag({ onClose, handleRef: ref });

  return (
    <div
      ref={ref}
      {...handlers}
      className="flex cursor-grab touch-none select-none flex-col items-center justify-center gap-1 pb-1.5 pt-3 active:cursor-grabbing motion-reduce:cursor-default"
      aria-hidden="true"
    >
      <div className="h-1 w-11 rounded-full bg-ink-900/15" />
      <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-ink-400/80">
        Swipe down to close
      </span>
    </div>
  );
}
