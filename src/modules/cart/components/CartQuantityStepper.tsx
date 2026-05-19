import { Minus, Plus } from 'lucide-react';

import { cartQuantityButton, cartQuantityPill } from './cartStyles';

type CartQuantityStepperProps = {
  quantity: number;
  itemName: string;
  min?: number;
  max?: number;
  onDecrease: (event: React.MouseEvent) => void;
  onIncrease: (event: React.MouseEvent) => void;
};

export function CartQuantityStepper({
  quantity,
  itemName,
  min = 1,
  max = 20,
  onDecrease,
  onIncrease,
}: CartQuantityStepperProps) {
  const canDec = quantity > min;
  const canInc = quantity < max;

  return (
    <div className={cartQuantityPill} role="group" aria-label={`Quantity for ${itemName}`}>
      <button
        type="button"
        onClick={onDecrease}
        disabled={!canDec}
        className={cartQuantityButton}
        aria-label={`Decrease quantity of ${itemName}`}
      >
        <Minus className="h-3.5 w-3.5" strokeWidth={2.5} />
      </button>

      <span
        className="min-w-7 px-1 text-center text-sm font-black tabular-nums text-ink-900"
        aria-live="polite"
        aria-atomic="true"
      >
        {quantity}
      </span>

      <button
        type="button"
        onClick={onIncrease}
        disabled={!canInc}
        className={cartQuantityButton}
        aria-label={`Increase quantity of ${itemName}`}
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
      </button>
    </div>
  );
}
