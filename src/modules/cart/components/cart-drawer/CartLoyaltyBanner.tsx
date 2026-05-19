import { Sparkles } from 'lucide-react';

type CartLoyaltyBannerProps = {
  pts: number;
};

export function CartLoyaltyBanner({ pts }: CartLoyaltyBannerProps) {
  if (pts <= 0) return null;

  return (
    <div className="relative mx-4 mb-3 flex shrink-0 items-center justify-between overflow-hidden rounded-2xl border border-gold-300/50 bg-linear-to-r from-gold-100/90 via-gold-50 to-cream-50 px-4 py-2.5">
      <span
        aria-hidden="true"
        data-cart-shimmer
        className="pointer-events-none absolute inset-y-0 -left-full w-1/3 bg-linear-to-r from-transparent via-white/40 to-transparent motion-safe:animate-[cart-shimmer_3.5s_ease-in-out_1s_infinite]"
      />
      <p className="relative flex items-center gap-1.5 text-xs font-semibold text-ink-900">
        <Sparkles className="h-3.5 w-3.5 text-ember-600" strokeWidth={2.25} aria-hidden="true" />
        Earn <strong className="font-black">+{pts} pts</strong> on this order
      </p>
      <p className="relative text-[10px] font-semibold uppercase tracking-wide text-ink-500">
        $1 = 1 pt
      </p>
    </div>
  );
}
