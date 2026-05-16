// src/modules/orders/components/OrderIntentSelector.tsx
// =============================================================================
// Order Intent Selector — DESKTOP / TABLET selector for the top nav.
//
// Behavior change vs. previous version:
//   - This component is now desktop-first. It hides itself on mobile via
//     `hidden md:block`. The mobile UX is owned by MobileOrderIntentSheet,
//     which is rendered ONCE by TopBar and is controlled by the store's
//     `mobileSheetOpen` flag. Local `mobileOpen` state is gone.
//   - If something goes wrong with the breakpoint (e.g. the component is
//     rendered somewhere it wasn't expected, or the user shrinks the viewport
//     with the dropdown about to open), the trigger redirects into the
//     mobile sheet via the store. Defensive double-lock.
//
// Accessibility:
//   - Trigger uses aria-expanded / aria-haspopup="dialog" / aria-controls.
//   - Panel uses role="dialog" with aria-label.
//   - Pickup options use radiogroup / radio semantics with aria-checked.
//   - Escape closes the panel and returns focus to the trigger.
//   - Outside pointerdown closes the panel.
// =============================================================================

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Clock3, MapPin, Truck } from 'lucide-react';

import {
  getPickupTimingHelper,
  getPickupTimingLabel,
  useOrderIntentStore,
  type PickupTimingOption,
} from '@/modules/orders/store/orderIntent.store';

type OrderIntentSelectorProps = {
  className?: string;
};

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

const MOBILE_MEDIA_QUERY = '(max-width: 767px)';

export default function OrderIntentSelector({ className }: OrderIntentSelectorProps) {
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const [open, setOpen] = useState(false);

  const fulfillmentType = useOrderIntentStore((s) => s.fulfillmentType);
  const pickupTiming = useOrderIntentStore((s) => s.pickupTiming);
  const deliveryAvailability = useOrderIntentStore((s) => s.deliveryAvailability);
  const setFulfillmentType = useOrderIntentStore((s) => s.setFulfillmentType);
  const setPickupTiming = useOrderIntentStore((s) => s.setPickupTiming);
  const openMobileSheet = useOrderIntentStore((s) => s.openMobileSheet);

  const deliveryComingSoon = deliveryAvailability !== 'available';
  const deliveryActive = fulfillmentType === 'delivery' && !deliveryComingSoon;

  const summary = useMemo(() => {
    if (deliveryActive) return 'Delivery';
    return getPickupTimingLabel(pickupTiming);
  }, [deliveryActive, pickupTiming]);

  const fulfillmentLabel = deliveryActive ? 'Delivery' : 'Pickup';

  const close = useCallback(() => {
    setOpen(false);
    queueMicrotask(() => buttonRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!open) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      close();
    };

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('pointerdown', handlePointerDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [open, close]);

  const handleTriggerClick = useCallback(() => {
    // Defensive: if this somehow renders or is interacted with at a mobile
    // viewport, redirect into the bottom sheet rather than showing a tiny
    // top-anchored dropdown.
    if (typeof window !== 'undefined' && window.matchMedia(MOBILE_MEDIA_QUERY).matches) {
      openMobileSheet();
      return;
    }
    setOpen((prev) => !prev);
  }, [openMobileSheet]);

  const handlePickupSelect = useCallback(
    (option: PickupOption) => {
      if (option.disabled) return;
      setFulfillmentType('pickup');
      setPickupTiming(option.value);
      close();
    },
    [setFulfillmentType, setPickupTiming, close],
  );

  return (
    <div className={cx('relative hidden md:block', className)}>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleTriggerClick}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? panelId : undefined}
        className={cx(
          'group inline-flex h-10 max-w-full touch-manipulation items-center gap-2 rounded-full',
          'border border-(--color-cream-300) bg-white px-3 text-left text-(--color-ink-800)',
          'shadow-(--shadow-xs) transition-colors hover:bg-(--color-ink-50)',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-gold-400)/40',
        )}
      >
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-(--color-ember-50)"
          aria-hidden="true"
        >
          <Clock3 className="h-4 w-4 text-(--color-ember-600)" />
        </span>

        <span className="min-w-0 flex-1">
          <span className="block text-[9px] font-black uppercase leading-none tracking-[0.14em] text-(--color-ink-400)">
            {fulfillmentLabel}
          </span>
          <span className="mt-0.5 block max-w-32 truncate text-xs font-black leading-none">
            {summary}
          </span>
        </span>

        <ChevronDown
          className={cx(
            'h-4 w-4 shrink-0 text-(--color-ink-400) transition-transform duration-200',
            open && 'rotate-180',
          )}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label="Order setup"
          className={cx(
            'absolute right-0 top-[calc(100%+0.75rem)] z-50 w-82 overflow-hidden rounded-3xl',
            'border border-(--color-cream-300) bg-white text-(--color-ink-800)',
          )}
          style={{
            boxShadow: '0 18px 56px rgba(0,0,0,0.16), 0 4px 16px rgba(0,0,0,0.08)',
          }}
        >
          <div className="border-b border-(--color-cream-200) px-4 py-3">
            <p className="text-sm font-black">Start your order</p>
            <p className="mt-0.5 text-xs text-(--color-ink-400)">
              Choose pickup timing before checkout.
            </p>
          </div>

          <div className="space-y-2 p-3">
            <button
              type="button"
              onClick={() => setFulfillmentType('pickup')}
              aria-pressed={fulfillmentType === 'pickup'}
              className={cx(
                'flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition-colors',
                fulfillmentType === 'pickup'
                  ? 'border-(--color-gold-400) bg-(--color-ember-50)'
                  : 'border-(--color-cream-300) bg-white hover:bg-(--color-ink-50)',
              )}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm">
                <MapPin className="h-4 w-4 text-(--color-ember-600)" aria-hidden="true" />
              </span>

              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold">Pickup</span>
                <span className="block text-xs text-(--color-ink-400)">Available today</span>
              </span>

              {fulfillmentType === 'pickup' && (
                <Check className="h-4 w-4 text-(--color-ember-600)" aria-hidden="true" />
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
                'flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition-colors',
                deliveryComingSoon
                  ? 'cursor-not-allowed border-(--color-cream-300) bg-white opacity-65'
                  : fulfillmentType === 'delivery'
                    ? 'border-(--color-gold-400) bg-(--color-ember-50)'
                    : 'border-(--color-cream-300) bg-white hover:bg-(--color-ink-50)',
              )}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm">
                <Truck className="h-4 w-4 text-(--color-ink-400)" aria-hidden="true" />
              </span>

              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold">Delivery</span>
                <span className="block text-xs text-(--color-ink-400)">
                  {deliveryComingSoon ? 'Coming soon' : 'Available'}
                </span>
              </span>

              {deliveryComingSoon && (
                <span className="rounded-full bg-(--color-gold-400) px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-(--color-stone-900)">
                  Soon
                </span>
              )}
            </button>
          </div>

          <div className="border-t border-(--color-cream-200) p-3">
            <p className="mb-2 px-1 text-[10px] font-black uppercase tracking-[0.14em] text-(--color-ink-400)">
              Pickup time
            </p>

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
                      'flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition-colors',
                      disabled && 'cursor-not-allowed opacity-60',
                      selected
                        ? 'bg-(--color-ember-50) text-(--color-ember-700)'
                        : 'hover:bg-(--color-ink-50)',
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-bold">{option.label}</span>
                      <span className="block text-xs text-(--color-ink-400)">{option.helper}</span>
                    </span>

                    {selected && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}