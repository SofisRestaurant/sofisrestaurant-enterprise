// src/modules/orders/components/MobileOrderIntentSheet.tsx
// =============================================================================
// Mobile Order Intent Sheet — iOS / Android friendly order setup
// =============================================================================
// Purpose:
// - Gives mobile customers a proper bottom-sheet experience.
// - Avoids tiny dropdowns on touch screens.
// - Owns pickup timing + delivery coming-soon UI.
// - Uses existing orderIntent.store.ts so checkout/header can share intent.
// =============================================================================

import { useEffect, useId, useRef } from 'react';
import { Check, Clock3, MapPin, Truck, X } from 'lucide-react';

import {
  getPickupTimingLabel,
  useOrderIntentStore,
  type PickupTimingOption,
} from '@/modules/orders/store/orderIntent.store';

type MobileOrderIntentSheetProps = {
  open: boolean;
  onClose: () => void;
};

type PickupOption = {
  value: PickupTimingOption;
  label: string;
  helper: string;
};

const PICKUP_OPTIONS: PickupOption[] = [
  { value: 'asap', label: 'ASAP', helper: 'Fastest available pickup' },
  { value: '15_min', label: '15 min', helper: 'Pickup in about 15 minutes' },
  { value: '30_min', label: '30 min', helper: 'Pickup in about 30 minutes' },
  { value: '45_min', label: '45 min', helper: 'Pickup in about 45 minutes' },
  { value: 'scheduled', label: 'Schedule later', helper: 'Coming soon' },
];

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

export default function MobileOrderIntentSheet({ open, onClose }: MobileOrderIntentSheetProps) {
  const titleId = useId();
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  const fulfillmentType = useOrderIntentStore((state) => state.fulfillmentType);
  const pickupTiming = useOrderIntentStore((state) => state.pickupTiming);
  const deliveryAvailability = useOrderIntentStore((state) => state.deliveryAvailability);
  const setFulfillmentType = useOrderIntentStore((state) => state.setFulfillmentType);
  const setPickupTiming = useOrderIntentStore((state) => state.setPickupTiming);

  const deliveryComingSoon = deliveryAvailability !== 'available';

  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    queueMicrotask(() => closeButtonRef.current?.focus());

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;

      event.preventDefault();
      onClose();
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node | null;
      if (!target) return;

      if (sheetRef.current?.contains(target)) return;

      onClose();
    }

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('pointerdown', handlePointerDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 md:hidden"
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
            'border border-[var(--app-border)] bg-[var(--app-card)] text-[var(--app-text)]',
            'shadow-[0_-18px_60px_rgba(0,0,0,0.24)]',
          )}
        >
          <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-[var(--app-divider)]" />

          <div className="flex items-start justify-between gap-3 border-b border-[var(--app-border)] px-5 pb-4 pt-4">
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--app-muted)]">
                Start your order
              </p>
              <h2 id={titleId} className="mt-1 text-xl font-black tracking-tight">
                Pickup details
              </h2>
              <p className="mt-1 text-sm leading-5 text-[var(--app-muted)]">
                Choose how you want to receive your order before checkout.
              </p>
            </div>

            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              aria-label="Close order setup"
              className={cx(
                'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                'border border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--app-text)]',
                'transition-colors hover:bg-[var(--app-surface-hover)]',
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
                className={cx(
                  'flex w-full touch-manipulation items-center gap-3 rounded-2xl border px-4 py-4 text-left',
                  'transition-colors active:scale-[0.99]',
                  fulfillmentType === 'pickup'
                    ? 'border-(--color-gold-400) bg-(--color-ember-50)'
                    : 'border-[var(--app-border)] bg-[var(--app-surface)] hover:bg-[var(--app-surface-hover)]',
                )}
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm">
                  <MapPin className="h-5 w-5 text-(--color-ember-600)" aria-hidden="true" />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block text-base font-black">Pickup</span>
                  <span className="mt-0.5 block text-sm text-[var(--app-muted)]">
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
                onClick={() => {
                  if (!deliveryComingSoon) setFulfillmentType('delivery');
                }}
                className={cx(
                  'flex w-full touch-manipulation items-center gap-3 rounded-2xl border px-4 py-4 text-left',
                  'transition-colors active:scale-[0.99]',
                  deliveryComingSoon
                    ? 'cursor-not-allowed border-[var(--app-border)] bg-[var(--app-surface)] opacity-60'
                    : fulfillmentType === 'delivery'
                      ? 'border-(--color-gold-400) bg-(--color-ember-50)'
                      : 'border-[var(--app-border)] bg-[var(--app-surface)] hover:bg-[var(--app-surface-hover)]',
                )}
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white shadow-sm">
                  <Truck className="h-5 w-5 text-[var(--app-muted)]" aria-hidden="true" />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block text-base font-black">Delivery</span>
                  <span className="mt-0.5 block text-sm text-[var(--app-muted)]">
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

            <div className="mt-5 rounded-3xl border border-[var(--app-border)] bg-[var(--app-surface)] p-3">
              <div className="mb-3 flex items-center gap-2 px-1">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-(--color-ember-50)">
                  <Clock3 className="h-4 w-4 text-(--color-ember-600)" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-sm font-black">Pickup time</p>
                  <p className="text-xs text-[var(--app-muted)]">
                    Current: {getPickupTimingLabel(pickupTiming)}
                  </p>
                </div>
              </div>

              <div className="grid gap-1.5">
                {PICKUP_OPTIONS.map((option) => {
                  const selected = pickupTiming === option.value;
                  const disabled = option.value === 'scheduled';

                  return (
                    <button
                      key={option.value}
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        if (disabled) return;
                        setPickupTiming(option.value);
                        setFulfillmentType('pickup');
                        onClose();
                      }}
                      className={cx(
                        'flex w-full touch-manipulation items-center justify-between gap-3 rounded-2xl px-3 py-3 text-left',
                        'transition-colors active:scale-[0.99]',
                        disabled && 'cursor-not-allowed opacity-55',
                        selected
                          ? 'bg-(--color-ember-50) text-(--color-ember-700)'
                          : 'hover:bg-[var(--app-surface-hover)]',
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-black">{option.label}</span>
                        <span className="mt-0.5 block text-xs text-[var(--app-muted)]">
                          {option.helper}
                        </span>
                      </span>

                      {selected && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
                    </button>
                  );
                })}
              </div>
            </div>

            <p className="px-2 pb-[max(env(safe-area-inset-bottom,0px),16px)] pt-4 text-center text-xs leading-5 text-[var(--app-muted)]">
              Final availability is confirmed at checkout.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}