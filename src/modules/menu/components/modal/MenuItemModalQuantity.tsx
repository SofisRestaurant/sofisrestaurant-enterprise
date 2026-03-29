// =============================================================================
// PATH: src/modules/menu/components/modal/MenuItemModalQuantity.tsx
// =============================================================================
// Qty stepper: decrement / count display / increment.
// Pure renderer — no state, no logic.
// =============================================================================

import { Minus, Plus } from 'lucide-react';
import type { ModalQuantityProps } from '@/domain/menu/menu-modal.types';

export function MenuItemModalQuantity({
  safeQty,
  maxQty,
  preflightLoading,
  invalidItem,
  onDecrement,
  onIncrement,
}: ModalQuantityProps) {
  return (
    <div className="flex items-center rounded-2xl border border-white/10 bg-white/5 p-1">
      <button
        type="button"
        className="btn btn-ghost-dark btn-icon"
        onClick={onDecrement}
        disabled={safeQty <= 1 || preflightLoading || invalidItem}
        aria-label="Decrease quantity"
      >
        <Minus className="h-5 w-5" aria-hidden="true" />
      </button>

      <div className="min-w-3rem text-center font-semibold tabular-nums">{safeQty}</div>

      <button
        type="button"
        className="btn btn-ghost-dark btn-icon"
        onClick={onIncrement}
        disabled={safeQty >= maxQty || preflightLoading || invalidItem}
        aria-label="Increase quantity"
      >
        <Plus className="h-5 w-5" aria-hidden="true" />
      </button>
    </div>
  );
}