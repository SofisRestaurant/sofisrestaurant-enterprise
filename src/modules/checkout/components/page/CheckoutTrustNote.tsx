import { ShieldCheck } from 'lucide-react';
import { checkoutInsetCard } from './checkoutStyles';
import { cx } from './cx';

export function CheckoutTrustNote() {
  return (
    <div className={cx(checkoutInsetCard, 'flex items-start gap-3 px-4 py-3')}>
      <ShieldCheck
        className="mt-0.5 h-5 w-5 shrink-0 text-ember-600"
        strokeWidth={2}
        aria-hidden
      />
      <div className="min-w-0 text-left">
        <p className="text-sm font-semibold text-ink-800">Secure payment via Stripe</p>
        <p className="mt-0.5 text-xs leading-5 text-ink-500">
          Card details are never stored on Sofi&apos;s servers. Stripe confirms your final total
          before you pay.
        </p>
      </div>
    </div>
  );
}
