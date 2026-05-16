// src/modules/orders/components/OrderIntentSelector.tsx
// =============================================================================
// Order Intent Selector — top-nav customer order setup
// =============================================================================
// Desktop:
// - Compact professional dropdown for top nav.
//
// Mobile:
// - Touch-friendly button that opens MobileOrderIntentSheet.
// - No tiny dropdowns on iOS/Android.
// - Safe-area friendly, keyboard friendly, and screen-reader friendly.
// =============================================================================

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Clock3, MapPin, Truck } from 'lucide-react';

import MobileOrderIntentSheet from '@/modules/orders/components/MobileOrderIntentSheet';
import {
  getPickupTimingLabel,
  useOrderIntentStore,
  type PickupTimingOption,
} from '@/modules/orders/store/orderIntent.store';

type OrderIntentSelectorProps = {
  variant?: 'desktop' | 'mobile' | 'auto';
  className?: string;
};

type PickupOption = {
  value: PickupTimingOption;
  label: string;
  helper: string;
};

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

const PICKUP_OPTIONS: PickupOption[] = [
  { value: 'asap', label: 'ASAP', helper: 'Fastest available pickup' },
  { value: '15_min', label: '15 min', helper: 'Pickup in about 15 minutes' },
  { value: '30_min', label: '30 min', helper: 'Pickup in about 30 minutes' },
  { value: '45_min', label: '45 min', helper: 'Pickup in about 45 minutes' },
  { value: 'scheduled', label: 'Schedule later', helper: 'Coming soon' },
];

export default function OrderIntentSelector({
  variant = 'auto',
  className,
}: OrderIntentSelectorProps) {
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const [desktopOpen, setDesktopOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const fulfillmentType = useOrderIntentStore((state) => state.fulfillmentType);
  const pickupTiming = useOrderIntentStore((state) => state.pickupTiming);
  const deliveryAvailability = useOrderIntentStore((state) => state.deliveryAvailability);
  const setFulfillmentType = useOrderIntentStore((state) => state.setFulfillmentType);
  const setPickupTiming = useOrderIntentStore((state) => state.setPickupTiming);

  const deliveryComingSoon = deliveryAvailability !== 'available';

  const summary = useMemo(() => {
    if (fulfillmentType === 'delivery') return 'Delivery';
    return getPickupTimingLabel(pickupTiming);
  }, [fulfillmentType, pickupTiming]);

  const closeDesktop = useCallback(() => {
    setDesktopOpen(false);
    queueMicrotask(() => buttonRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!desktopOpen) return undefined;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;

      event.preventDefault();
      closeDesktop();
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node | null;
      if (!target) return;

      if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) {
        return;
      }

      setDesktopOpen(false);
    }

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('pointerdown', handlePointerDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [desktopOpen, closeDesktop]);

  const rootClassName =
    variant === 'desktop'
      ? 'hidden md:block'
      : variant === 'mobile'
        ? 'block md:hidden'
        : 'block';

  const openMobileSheet = () => {
    setDesktopOpen(false);
    setMobileOpen(true);
  };

  return (
    <div className={cx('relative', rootClassName, className)}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          if (variant === 'mobile') {
            openMobileSheet();
            return;
          }

          if (typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches) {
            openMobileSheet();
            return;
          }

          setDesktopOpen((current) => !current);
        }}
        aria-expanded={desktopOpen || mobileOpen}
        aria-controls={desktopOpen ? panelId : undefined}
        className={cx(
          'group inline-flex h-10 max-w-full touch-manipulation items-center gap-2 rounded-full',
          'border border-[var(--app-border)] bg-[var(--app-surface)] px-3 text-left text-[var(--app-text)]',
          'shadow-(--shadow-xs) transition-colors hover:bg-[var(--app-surface-hover)]',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-gold-400)/40',
          variant === 'mobile' && 'h-11 w-full justify-between rounded-2xl px-4',
        )}
      >
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-(--color-ember-50)"
          aria-hidden="true"
        >
          <Clock3 className="h-4 w-4 text-(--color-ember-600)" />
        </span>

        <span className="min-w-0 flex-1">
          <span className="block text-[9px] font-black uppercase leading-none tracking-[0.14em] text-[var(--app-muted)]">
            Pickup
          </span>
          <span className="mt-0.5 block max-w-32 truncate text-xs font-black leading-none">
            {summary}
          </span>
        </span>

        <ChevronDown
          className={cx(
            'h-4 w-4 shrink-0 text-[var(--app-muted)] transition-transform duration-200',
            (desktopOpen || mobileOpen) && 'rotate-180',
          )}
          aria-hidden="true"
        />
      </button>

      {desktopOpen && (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label="Order setup"
          className={cx(
            'absolute right-0 top-[calc(100%+0.75rem)] z-50 hidden w-82 overflow-hidden rounded-[1.5rem] md:block',
            'border border-[var(--app-border)] bg-[var(--app-card)] text-[var(--app-text)]',
          )}
          style={{
            boxShadow: '0 18px 56px rgba(0,0,0,0.16), 0 4px 16px rgba(0,0,0,0.08)',
          }}
        >
          <div className="border-b border-[var(--app-border)] px-4 py-3">
            <p className="text-sm font-black">Start your order</p>
            <p className="mt-0.5 text-xs text-[var(--app-muted)]">
              Choose pickup timing before checkout.
            </p>
          </div>

          <div className="space-y-2 p-3">
            <button
              type="button"
              onClick={() => setFulfillmentType('pickup')}
              className={cx(
                'flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition-colors',
                fulfillmentType === 'pickup'
                  ? 'border-(--color-gold-400) bg-(--color-ember-50)'
                  : 'border-[var(--app-border)] bg-[var(--app-surface)] hover:bg-[var(--app-surface-hover)]',
              )}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm">
                <MapPin className="h-4 w-4 text-(--color-ember-600)" aria-hidden="true" />
              </span>

              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold">Pickup</span>
                <span className="block text-xs text-[var(--app-muted)]">Available today</span>
              </span>

              {fulfillmentType === 'pickup' && (
                <Check className="h-4 w-4 text-(--color-ember-600)" aria-hidden="true" />
              )}
            </button>

            <button
              type="button"
              disabled={deliveryComingSoon}
              onClick={() => {
                if (!deliveryComingSoon) setFulfillmentType('delivery');
              }}
              className={cx(
                'flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition-colors',
                deliveryComingSoon
                  ? 'cursor-not-allowed border-[var(--app-border)] bg-[var(--app-surface)] opacity-65'
                  : fulfillmentType === 'delivery'
                    ? 'border-(--color-gold-400) bg-(--color-ember-50)'
                    : 'border-[var(--app-border)] bg-[var(--app-surface)] hover:bg-[var(--app-surface-hover)]',
              )}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm">
                <Truck className="h-4 w-4 text-[var(--app-muted)]" aria-hidden="true" />
              </span>

              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold">Delivery</span>
                <span className="block text-xs text-[var(--app-muted)]">
                  {deliveryComingSoon ? 'Coming soon' : 'Available'}
                </span>
              </span>
            </button>
          </div>

          <div className="border-t border-[var(--app-border)] p-3">
            <p className="mb-2 px-1 text-[10px] font-black uppercase tracking-[0.14em] text-[var(--app-muted)]">
              Pickup time
            </p>

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

                      setFulfillmentType('pickup');
                      setPickupTiming(option.value);
                      closeDesktop();
                    }}
                    className={cx(
                      'flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition-colors',
                      disabled && 'cursor-not-allowed opacity-60',
                      selected
                        ? 'bg-(--color-ember-50) text-(--color-ember-700)'
                        : 'hover:bg-[var(--app-surface-hover)]',
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-bold">{option.label}</span>
                      <span className="block text-xs text-[var(--app-muted)]">
                        {option.helper}
                      </span>
                    </span>

                    {selected && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <MobileOrderIntentSheet open={mobileOpen} onClose={() => setMobileOpen(false)} />
    </div>
  );
}