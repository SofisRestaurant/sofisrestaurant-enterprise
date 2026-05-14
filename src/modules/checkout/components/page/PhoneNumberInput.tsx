// src/modules/checkout/components/page/PhoneNumberInput.tsx

import { X } from 'lucide-react';

type PhoneNumberInputProps = {
  value: string;
  onChange: (value: string) => void;
};

function phoneDigits(value: string): string {
  const digits = value.replace(/\D/g, '');

  if (digits.length === 11 && digits.startsWith('1')) {
    return digits.slice(1);
  }

  return digits.slice(0, 10);
}

function toE164UsPhone(value: string): string {
  const digits = phoneDigits(value);
  return digits.length > 0 ? `+1${digits}` : '';
}

function formatUsPhoneInput(value: string): string {
  const digits = phoneDigits(value);

  if (digits.length === 0) return '';
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;

  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function PhoneNumberInput({ value, onChange }: PhoneNumberInputProps) {
  const displayValue = formatUsPhoneInput(value);
  const digits = phoneDigits(value);
  const isComplete = digits.length === 10;

  return (
    <div>
      <label
        htmlFor="guest-phone"
        className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-(--color-ink-400)"
      >
        Mobile number
      </label>

      <div className="flex overflow-hidden rounded-[var(--radius-input)] border border-(--color-cream-400) bg-white transition-colors focus-within:border-(--color-gold-400) focus-within:shadow-[var(--focus-ring)] hover:border-(--color-ink-300)">
        <span className="flex shrink-0 items-center border-r border-(--color-cream-300) bg-(--color-cream-50) px-3 text-sm font-semibold text-(--color-ink-500)">
          +1
        </span>

        <input
          id="guest-phone"
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          value={displayValue}
          onChange={(e) => onChange(toE164UsPhone(e.target.value))}
          placeholder="(555) 555-5555"
          aria-invalid={digits.length > 0 && !isComplete}
          className="min-w-0 flex-1 bg-transparent px-4 py-[0.8125rem] text-sm text-(--color-ink-900) outline-none placeholder:text-(--color-ink-300)"
        />

        {digits.length > 0 && (
          <button
            type="button"
            onClick={() => onChange('')}
            aria-label="Clear phone number"
            className="flex shrink-0 items-center justify-center px-3 text-(--color-ink-300) transition-colors hover:text-(--color-ink-700)"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="mt-1 flex items-center justify-between gap-3">
        <p className="text-[11px] text-(--color-ink-300)">
          Used only for order-ready text updates.
        </p>

        {digits.length > 0 && (
          <p
            className={
              isComplete
                ? 'text-[11px] font-medium text-(--color-success)'
                : 'text-[11px] font-medium text-(--color-ink-400)'
            }
          >
            {isComplete ? 'Ready' : `${digits.length}/10`}
          </p>
        )}
      </div>
    </div>
  );
}