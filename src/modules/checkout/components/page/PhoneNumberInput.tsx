// src/modules/checkout/components/page/PhoneNumberInput.tsx

import { CheckCircle2, X } from 'lucide-react';

type PhoneNumberInputProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  label?: string;
  helperText?: string;
  disabled?: boolean;
};

type PhoneInputState = {
  localDigits: string;
  storedValue: string;
  display: string;
  isEmpty: boolean;
  isComplete: boolean;
  hasPartialValue: boolean;
};

function extractUsLocalDigits(value: string): string {
  const digits = value.replace(/\D/g, '');

  if (digits.length === 0) {
    return '';
  }

  /*
    Professional behavior:
    - If value is already complete E.164, like +16235551234, remove the country code.
    - If user pastes 16235551234, remove the leading country code.
    - If user is actively typing "1", "11", "111", do NOT strip the first 1.
      This prevents the annoying bug where typing a number turns into:
      (111) 148-0453.
  */
  if (digits.length >= 11 && digits.startsWith('1')) {
    return digits.slice(1, 11);
  }

  return digits.slice(0, 10);
}

function formatUsLocalPhone(localDigits: string): string {
  if (localDigits.length === 0) {
    return '';
  }

  if (localDigits.length <= 3) {
    return localDigits;
  }

  if (localDigits.length <= 6) {
    return `(${localDigits.slice(0, 3)}) ${localDigits.slice(3)}`;
  }

  return `(${localDigits.slice(0, 3)}) ${localDigits.slice(3, 6)}-${localDigits.slice(6, 10)}`;
}

function toStoredPhoneValue(localDigits: string): string {
  if (localDigits.length === 0) {
    return '';
  }

  /*
    While typing, store local digits only.
    This avoids re-reading our own +1 prefix as part of the visible phone number.
  */
  if (localDigits.length < 10) {
    return localDigits;
  }

  /*
    Once complete, store backend-ready E.164.
    Example:
    visible: (623) 555-1234
    stored:  +16235551234
  */
  return `+1${localDigits}`;
}

function getPhoneInputState(value: string): PhoneInputState {
  const localDigits = extractUsLocalDigits(value);
  const isEmpty = localDigits.length === 0;
  const isComplete = localDigits.length === 10;

  return {
    localDigits,
    storedValue: toStoredPhoneValue(localDigits),
    display: formatUsLocalPhone(localDigits),
    isEmpty,
    isComplete,
    hasPartialValue: !isEmpty && !isComplete,
  };
}

export function PhoneNumberInput({
  id = 'phone-number',
  value,
  onChange,
  label = 'Mobile number',
  helperText = 'Used only for order-ready text updates.',
  disabled = false,
}: PhoneNumberInputProps) {
  const state = getPhoneInputState(value);

  const helpId = `${id}-help`;
  const statusId = `${id}-status`;

  function handleChange(nextValue: string): void {
    const nextState = getPhoneInputState(nextValue);
    onChange(nextState.storedValue);
  }

  function handleClear(): void {
    onChange('');
  }

  const wrapperClassName = state.hasPartialValue
    ? 'flex overflow-hidden rounded-[var(--radius-input)] border border-(--color-gold-300) bg-white transition-colors focus-within:border-(--color-gold-400) focus-within:shadow-[var(--focus-ring)]'
    : state.isComplete
      ? 'flex overflow-hidden rounded-[var(--radius-input)] border border-(--color-success) bg-white transition-colors focus-within:border-(--color-gold-400) focus-within:shadow-[var(--focus-ring)]'
      : 'flex overflow-hidden rounded-[var(--radius-input)] border border-(--color-cream-400) bg-white transition-colors hover:border-(--color-ink-300) focus-within:border-(--color-gold-400) focus-within:shadow-[var(--focus-ring)]';

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <label
          htmlFor={id}
          className="block text-xs font-semibold uppercase tracking-wide text-(--color-ink-400)"
        >
          {label}
        </label>

        {!state.isEmpty && (
          <span
            id={statusId}
            className={
              state.isComplete
                ? 'inline-flex items-center gap-1 text-[11px] font-semibold text-(--color-success)'
                : 'text-[11px] font-medium tabular-nums text-(--color-ink-400)'
            }
          >
            {state.isComplete ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                Ready
              </>
            ) : (
              `${state.localDigits.length}/10`
            )}
          </span>
        )}
      </div>

      <div className={wrapperClassName}>
        <span className="flex shrink-0 items-center border-r border-(--color-cream-300) bg-(--color-cream-50) px-3 text-sm font-semibold text-(--color-ink-500)">
          +1
        </span>

        <input
          id={id}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          value={state.display}
          disabled={disabled}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="623 555 1234"
          aria-invalid={state.hasPartialValue}
          aria-describedby={`${helpId} ${statusId}`}
          className="min-w-0 flex-1 bg-transparent px-4 py-[0.8125rem] text-sm text-(--color-ink-900) outline-none placeholder:text-(--color-ink-300) disabled:cursor-not-allowed disabled:opacity-60"
        />

        {!state.isEmpty && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            aria-label="Clear phone number"
            className="flex shrink-0 items-center justify-center px-3 text-(--color-ink-300) transition-colors hover:text-(--color-ink-700) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-(--color-gold-400)"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      <div id={helpId} className="mt-1 flex items-start justify-between gap-3">
        <p className="text-[11px] leading-snug text-(--color-ink-300)">{helperText}</p>

        {state.hasPartialValue && (
          <p className="shrink-0 text-[11px] font-medium text-(--color-gold-600)">
            Enter 10 digits
          </p>
        )}

        {state.isComplete && (
          <p className="shrink-0 text-[11px] font-medium text-(--color-success)">Text-ready</p>
        )}
      </div>
    </div>
  );
}