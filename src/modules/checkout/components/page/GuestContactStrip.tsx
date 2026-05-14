// src/modules/checkout/components/page/GuestContactStrip.tsx

import { AnimatePresence, motion } from 'framer-motion';
import { cx } from './cx';

export function GuestContactStrip({
  email,
  onEmailChange,
  phone,
  onPhoneChange,
  smsOptIn,
  onSmsToggle,
}: {
  email: string;
  onEmailChange: (v: string) => void;
  phone: string;
  onPhoneChange: (v: string) => void;
  smsOptIn: boolean;
  onSmsToggle: () => void;
}) {
  return (
    <div className="space-y-4 px-5 py-5">
      <div>
        <label
          htmlFor="guest-email"
          className="block text-xs font-semibold uppercase tracking-wide text-(--color-ink-400) mb-1.5"
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
      <div className="flex items-center justify-between rounded-xl border border-(--color-cream-300) bg-(--color-cream-50) px-4 py-3">
        <div>
          <p className="text-sm font-medium text-(--color-ink-800)">Text me when ready</p>
          <p className="text-xs text-(--color-ink-400)">
            Optional — no spam, just your order status
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={smsOptIn}
          onClick={onSmsToggle}
          className={cx(
            'relative h-6 w-11 rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-gold-400)',
            smsOptIn ? 'bg-(--color-ember-500)' : 'bg-(--color-ink-200)',
          )}
        >
          <span
            className={cx(
              'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200',
              smsOptIn ? 'translate-x-5' : 'translate-x-0.5',
            )}
          />
        </button>
      </div>
      <AnimatePresence>
        {smsOptIn && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
          >
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => onPhoneChange(e.target.value)}
              placeholder="+1 (555) 555-5555"
              className="input w-full"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}