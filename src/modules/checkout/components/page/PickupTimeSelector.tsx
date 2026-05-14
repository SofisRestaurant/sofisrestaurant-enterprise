// src/modules/checkout/components/page/PickupTimeSelector.tsx

import { useMemo } from 'react';
import { cx } from './cx';

// ─── Slot generation ──────────────────────────────────────────────────────────

const PICKUP_MIN_PREP_MS = 10 * 60 * 1000;
const PICKUP_SLOT_INTERVAL_MS = 15 * 60 * 1000;
const PICKUP_SLOT_COUNT = 10;

type PickupSlot = { label: string; value: string };

function generatePickupSlots(): PickupSlot[] {
  const earliest = new Date(Date.now() + PICKUP_MIN_PREP_MS);
  const base = new Date(
    Math.ceil(earliest.getTime() / PICKUP_SLOT_INTERVAL_MS) * PICKUP_SLOT_INTERVAL_MS,
  );
  const slots: PickupSlot[] = [];
  for (let i = 0; i < PICKUP_SLOT_COUNT; i++) {
    const slot = new Date(base.getTime() + i * PICKUP_SLOT_INTERVAL_MS);
    slots.push({
      label: slot.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
      value: slot.toISOString(),
    });
  }
  return slots;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PickupTimeSelector({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const slots = useMemo(() => generatePickupSlots(), []);

  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wide text-(--color-ink-400) mb-2">
        Pickup time
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onChange(null)}
          className={cx(
            'rounded-xl border px-4 py-2 text-sm font-semibold transition-all',
            value === null
              ? 'border-(--color-ember-500) bg-(--color-ember-600) text-white shadow-sm'
              : 'border-(--color-cream-300) bg-white text-(--color-ink-800) hover:border-(--color-ink-300) hover:bg-(--color-cream-50)',
          )}
          aria-pressed={value === null}
        >
          ASAP
        </button>
        {slots.map((slot) => (
          <button
            key={slot.value}
            type="button"
            onClick={() => onChange(slot.value)}
            className={cx(
              'rounded-xl border px-4 py-2 text-sm font-semibold transition-all tabular-nums',
              value === slot.value
                ? 'border-(--color-ember-500) bg-(--color-ember-600) text-white shadow-sm'
                : 'border-(--color-cream-300) bg-white text-(--color-ink-800) hover:border-(--color-ink-300) hover:bg-(--color-cream-50)',
            )}
            aria-pressed={value === slot.value}
          >
            {slot.label}
          </button>
        ))}
      </div>
      {value !== null && (
        <p className="mt-2 text-xs text-(--color-ink-400)">
          Scheduled for{' '}
          <span className="font-semibold text-(--color-ink-700)">
            {new Date(value).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
          </span>{' '}
          —{' '}
          <button
            type="button"
            onClick={() => onChange(null)}
            className="underline hover:text-(--color-ink-900)"
          >
            switch to ASAP
          </button>
        </p>
      )}
    </div>
  );
}