import { ClipboardCheck } from 'lucide-react';

import { checkoutInsetCard } from './checkoutStyles';
import { cx } from './cx';

export function CheckoutTrustNote() {
  return (
    <div className={cx(checkoutInsetCard, 'flex items-center gap-2.5 px-3 py-2')}>
      <ClipboardCheck className="h-4 w-4 shrink-0 text-ember-600" strokeWidth={2.25} aria-hidden />

      <p className="min-w-0 text-xs font-semibold leading-5 text-ink-700">
        Review your order details before placing your pickup order.
      </p>
    </div>
  );
}
