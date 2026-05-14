// src/modules/checkout/components/page/GuestContactStrip.tsx

import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';

import { SmsToggleSwitch } from './SmsToggleSwitch';

type GuestContactStripProps = {
  email: string;
  onEmailChange: (v: string) => void;
  phone: string;
  onPhoneChange: (v: string) => void;
  smsOptIn: boolean;
  onSmsToggle: () => void;
};

function phoneDigits(value: string): string {
  const digits = value.replace(/\D/g, '');

  // If user pastes +1XXXXXXXXXX or 1XXXXXXXXXX, keep only the 10 local digits.
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

export function GuestContactStrip({
  email,
  onEmailChange,
  phone,
  onPhoneChange,
  smsOptIn,
  onSmsToggle,
}: GuestContactStripProps) {
  const phoneLocalDigits = phoneDigits(phone);
  const displayPhone = formatUsPhoneInput(phone);
  const phoneIsComplete = phoneLocalDigits.length === 10;
  const phoneHasValue = phoneLocalDigits.length > 0;

  return (
    <div className="space-y-4 px-5 py-5">
      <div>
        <label
          htmlFor="guest-email"
          className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-(--color-ink-400)"
        >
          Email <span className="text-(--color-ember-500)">*</span>
        </label>

        <input
          id="guest-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => onEmailChange(e.target.value)}
          placeholder="your@email.com"
          className="input w-full"
        />

        <p className="mt-1 text-[11px] text-(--color-ink-300)">Receipt sent here after payment.</p>
      </div>

      <div className="flex items-center justify-between gap-4 rounded-xl border border-(--color-cream-300) bg-(--color-cream-50) px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-(--color-ink-800)">Text me when ready</p>
          <p className="text-xs text-(--color-ink-400)">
            Optional, no spam, just your order status
          </p>
        </div>

        <SmsToggleSwitch checked={smsOptIn} onChange={onSmsToggle} label="SMS order updates" />
      </div>

      <AnimatePresence initial={false}>
        {smsOptIn && (
          <motion.div
            key="guest-phone-input"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
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
                value={displayPhone}
                onChange={(e) => onPhoneChange(toE164UsPhone(e.target.value))}
                placeholder="(555) 555-5555"
                aria-invalid={phoneHasValue && !phoneIsComplete}
                aria-describedby="guest-phone-help"
                className="min-w-0 flex-1 bg-transparent px-4 py-[0.8125rem] text-sm text-(--color-ink-900) outline-none placeholder:text-(--color-ink-300)"
              />

              {phoneHasValue && (
                <button
                  type="button"
                  onClick={() => onPhoneChange('')}
                  aria-label="Clear phone number"
                  className="flex shrink-0 items-center justify-center px-3 text-(--color-ink-300) transition-colors hover:text-(--color-ink-700) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-gold-400)"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div id="guest-phone-help" className="mt-1 flex items-center justify-between gap-3">
              <p className="text-[11px] text-(--color-ink-300)">
                Used only for order-ready text updates.
              </p>

              {phoneHasValue && (
                <p
                  className={
                    phoneIsComplete
                      ? 'text-[11px] font-medium text-(--color-success)'
                      : 'text-[11px] font-medium text-(--color-ink-400)'
                  }
                >
                  {phoneIsComplete ? 'Ready' : `${phoneLocalDigits.length}/10`}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}