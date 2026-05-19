const BENEFITS = [
  'Get a treat with your next order',
  'Earn more favorites free',
  'Check out faster next time',
  'Order ahead with saved details',
] as const;

export function OptionalSignupValueCard() {
  return (
    <div className="overflow-hidden rounded-2xl border border-gold-200 bg-gold-50/80 ring-1 ring-black/[0.02]">
      <div className="flex items-start justify-between gap-4 p-4">
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-ember-600">
            Optional rewards
          </p>
          <h3 className="mt-1 text-lg font-black tracking-tight text-ink-900">
            Make your next order easier
          </h3>
          <p className="mt-1 text-sm leading-6 text-ink-500">
            Add your email for your receipt, optional rewards setup, and faster checkout next time.
          </p>
        </div>
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ember-600 text-base font-black text-white"
          aria-hidden
        >
          ✨
        </span>
      </div>

      <ul className="grid gap-2 border-t border-gold-100 bg-white/60 p-4 sm:grid-cols-2">
        {BENEFITS.map((benefit) => (
          <li
            key={benefit}
            className="flex items-center gap-2 rounded-xl border border-cream-200/80 bg-white px-3 py-2.5"
          >
            <span
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gold-100 text-[10px] font-black text-ember-700"
              aria-hidden
            >
              ✓
            </span>
            <span className="text-sm font-semibold text-ink-700">{benefit}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
