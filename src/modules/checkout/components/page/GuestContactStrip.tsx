// src/modules/checkout/components/page/GuestContactStrip.tsx

import { AnimatePresence, motion } from 'framer-motion';

import { PhoneNumberInput } from './PhoneNumberInput';
import { SmsToggleSwitch } from './SmsToggleSwitch';

type GuestContactStripProps = {
  email: string;
  onEmailChange: (v: string) => void;
  phone: string;
  onPhoneChange: (v: string) => void;
  smsOptIn: boolean;
  onSmsToggle: () => void;
  embedded?: boolean;
};

export function GuestContactStrip({
  email,
  onEmailChange,
  phone,
  onPhoneChange,
  smsOptIn,
  onSmsToggle,
  embedded = false,
}: GuestContactStripProps) {
  return (
    <div className={embedded ? 'space-y-4' : 'space-y-4 px-5 py-5'}>
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
            Optional, no spam, just your order status.
          </p>
        </div>

        <SmsToggleSwitch checked={smsOptIn} onChange={onSmsToggle} label="SMS order updates" />
      </div>

      <AnimatePresence initial={false}>
        {smsOptIn && (
          <motion.div
            key="guest-phone-input"
            initial={{ opacity: 0, height: 0, y: -4 }}
            animate={{ opacity: 1, height: 'auto', y: 0 }}
            exit={{ opacity: 0, height: 0, y: -4 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <PhoneNumberInput
              id="guest-phone"
              value={phone}
              onChange={onPhoneChange}
              label="Mobile number"
              helperText="Used only for order-ready text updates."
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}