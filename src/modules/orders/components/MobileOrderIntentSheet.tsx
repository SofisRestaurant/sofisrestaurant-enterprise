// src/modules/orders/components/MobileOrderIntentSheet.tsx
// =============================================================================
// Mobile Order Intent Sheet — iOS / Android bottom-sheet for order setup.
//
// Behavior change vs. previous version:
//   - This component is no longer prop-controlled. It reads its open state
//     directly from useOrderIntentStore (`mobileSheetOpen`) and closes itself
//     via `closeMobileSheet`. This lets TopBar render it ONCE and lets any
//     other surface (e.g. the checkout "Change" button) open it without
//     prop-drilling.
//   - z-index is `z-[60]` so the sheet sits above TopBar (z-30), the TopBar
//     mobile search dialog (z-40), BottomNav, and FloatingCartPill.
//
// Mobile-friendly details:
//   - Locks body scroll while open.
//   - Safe-area bottom padding inside the scroll region.
//   - touch-manipulation + active:scale on tappable cards.
//   - md:hidden — desktop uses OrderIntentSelector's dropdown instead.
// =============================================================================

import { useCallback, useEffect, useId, useMemo, useRef } from 'react';
import { Check, Clock3, MapPin, Truck, X } from 'lucide-react';

import {
  getPickupTimingHelper,
  getPickupTimingLabel,
  useOrderIntentStore,
  type PickupTimingOption,
} from '@/modules/orders/store/orderIntent.store';

type PickupOption = {
  value: PickupTimingOption;
  label: string;
  helper: string;
  disabled?: boolean;
};

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

const PICKUP_OPTIONS: PickupOption[] = [
  { value: 'asap', label: getPickupTimingLabel('asap'), helper: getPickupTimingHelper('asap') },
  {
    value: '15_min',
    label: getPickupTimingLabel('15_min'),
    helper: getPickupTimingHelper('15_min'),
  },
  {
    value: '30_min',
    label: getPickupTimingLabel('30_min'),
    helper: getPickupTimingHelper('30_min'),
  },
  {
    value: '45_min',
    label: getPickupTimingLabel('45_min'),
    helper: getPickupTimingHelper('45_min'),
  },
  {
    value: 'scheduled',
    label: getPickupTimingLabel('scheduled'),
    helper: getPickupTimingHelper('scheduled'),
    disabled: true,
  },
];

export default function MobileOrderIntentSheet() {
  const titleId = useId();
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  const open = useOrderIntentStore((s) => s.mobileSheetOpen);
  const close = useOrderIntentStore((s) => s.closeMobileSheet);
  const fulfillmentType = useOrderIntentStore((s) => s.fulfillmentType);
  const pickupTiming = useOrderIntentStore((s) => s.pickupTiming);
  const deliveryAvailability = useOrderIntentStore((s) => s.deliveryAvailability);
  const setFulfillmentType = useOrderIntentStore((s) => s.setFulfillmentType);
  const setPickupTiming = useOrderIntentStore((s) => s.setPickupTiming);

  const deliveryComingSoon = deliveryAvailability !== 'available';

  const currentTimingLabel = useMemo(() => getPickupTimingLabel(pickupTiming), [pickupTiming]);

  const handlePickupSelect = useCallback(
    (option: PickupOption) => {
      if (option.disabled) return;
      setFulfillmentType('pickup');
      setPickupTiming(option.value);
      // Close immediately on a valid selection — simpler/cleaner than a Done button.
      close();
    },
    [setFulfillmentType, setPickupTiming, close],
  );

  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    queueMicrotask(() => closeButtonRef.current?.focus());

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      close();
    };

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (sheetRef.current?.contains(target)) return;
      close();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('pointerdown', handlePointerDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [open, close]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] md:hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="absolute inset-0 bg-black/45" aria-hidden="true" />

      <div className="absolute inset-x-0 bottom-0">
        <div
          ref={sheetRef}
          className={cx(
            'mx-auto max-h-[88svh] max-w-lg overflow-hidden rounded-t-[2rem]',
            'border border-(--color-cream-200) bg-white text-(--color-ink-800)',
            'shadow-[0_-18px_60px_rgba(0,0,0,0.24)]',
          )}
        >
          <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-(--color-cream-200)" />

          <div className="flex items-start justify-between gap-3 border-b border-(--color-cream-200) px-5 pb-4 pt-4">
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-(--color-ink-400)">
                Start your order
              </p>
              <h2 id={titleId} className="mt-1 text-xl font-black tracking-tight">
                Pickup details
              </h2>
              <p className="mt-1 text-sm leading-5 text-(--color-ink-400)">
                Choose how you want to receive your order before checkout.
              </p>
            </div>

            <button
              ref={closeButtonRef}
              type="button"
              onClick={close}
              aria-label="Close order setup"
              className={cx(
                'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                'border border-(--color-cream-300) bg-white text-(--color-ink-700)',
                'transition-colors hover:bg-(--color-ink-50)',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-gold-400)/40',
              )}
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          <div className="max-h-[calc(88svh-96px)] overflow-y-auto px-5 py-4 [-webkit-overflow-scrolling:touch]">
            <div className="grid gap-3">
              <button
                type="button"
                onClick={() => setFulfillmentType('pickup')}
                aria-pressed={fulfillmentType === 'pickup'}
                className={cx(
                  'flex w-full touch-manipulation items-center gap-3 rounded-2xl border px-4 py-4 text-left',
                  'transition-colors active:scale-[0.99]',
                  fulfillmentType === 'pickup'
                    ? 'border-(--color-gold-400) bg-(--color-ember-50)'
                    : 'border-(--color-cream-300) bg-white hover:bg-(--color-ink-50)',
                )}
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm">
                  <MapPin className="h-5 w-5 text-(--color-ember-600)" aria-hidden="true" />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block text-base font-black">Pickup</span>
                  <span className="mt-0.5 block text-sm text-(--color-ink-400)">
                    Available today
                  </span>
                </span>

                {fulfillmentType === 'pickup' && (
                  <Check className="h-5 w-5 text-(--color-ember-600)" aria-hidden="true" />
                )}
              </button>

              <button
                type="button"
                disabled={deliveryComingSoon}
                aria-disabled={deliveryComingSoon}
                onClick={() => {
                  if (!deliveryComingSoon) setFulfillmentType('delivery');
                }}
                className={cx(
                  'flex w-full touch-manipulation items-center gap-3 rounded-2xl border px-4 py-4 text-left',
                  'transition-colors active:scale-[0.99]',
                  deliveryComingSoon
                    ? 'cursor-not-allowed border-(--color-cream-300) bg-white opacity-60'
                    : fulfillmentType === 'delivery'
                      ? 'border-(--color-gold-400) bg-(--color-ember-50)'
                      : 'border-(--color-cream-300) bg-white hover:bg-(--color-ink-50)',
                )}
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm">
                  <Truck className="h-5 w-5 text-(--color-ink-400)" aria-hidden="true" />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block text-base font-black">Delivery</span>
                  <span className="mt-0.5 block text-sm text-(--color-ink-400)">
                    {deliveryComingSoon ? 'Coming soon' : 'Available'}
                  </span>
                </span>

                {deliveryComingSoon && (
                  <span className="rounded-full bg-(--color-gold-400) px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-(--color-stone-900)">
                    Soon
                  </span>
                )}
              </button>
            </div>

            <div className="mt-5 rounded-3xl border border-(--color-cream-200) bg-(--color-cream-50) p-3">
              <div className="mb-3 flex items-center gap-2 px-1">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-(--color-ember-50)">
                  <Clock3 className="h-4 w-4 text-(--color-ember-600)" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-sm font-black">Pickup time</p>
                  <p className="text-xs text-(--color-ink-400)">Current: {currentTimingLabel}</p>
                </div>
              </div>

              <div role="radiogroup" aria-label="Pickup time" className="grid gap-1.5">
                {PICKUP_OPTIONS.map((option) => {
                  const selected = pickupTiming === option.value;
                  const disabled = option.disabled === true;

                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      disabled={disabled}
                      onClick={() => handlePickupSelect(option)}
                      className={cx(
                        'flex w-full touch-manipulation items-center justify-between gap-3 rounded-2xl px-3 py-3 text-left',
                        'transition-colors active:scale-[0.99]',
                        disabled && 'cursor-not-allowed opacity-55',
                        selected
                          ? 'bg-(--color-ember-50) text-(--color-ember-700)'
                          : 'hover:bg-(--color-ink-50)',
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-black">{option.label}</span>
                        <span className="mt-0.5 block text-xs text-(--color-ink-400)">
                          {option.helper}
                        </span>
                      </span>

                      {selected && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>
            </div>

            <p className="px-2 pb-[max(env(safe-area-inset-bottom,0px),16px)] pt-4 text-center text-xs leading-5 text-(--color-ink-400)">
              Final availability is confirmed at checkout.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}