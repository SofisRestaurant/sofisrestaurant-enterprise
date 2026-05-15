// src/modules/checkout/components/page/AuthContactStrip.tsx
// =============================================================================
// CHANGES FROM PRIOR VERSION:
//
//   [1] Converted from a display-only component to a controlled component.
//       Added SMS opt-in toggle + animated phone input — identical UX to
//       GuestContactStrip so logged-in users see the same offer.
//
//   [2] AuthContactStripProps exported so CheckoutPage can type its state
//       without a separate import of the handler signatures.
// =============================================================================

import { AnimatePresence, motion } from 'framer-motion';

import { PhoneNumberInput } from './PhoneNumberInput';
import { SmsToggleSwitch }  from './SmsToggleSwitch';

export type AuthContactStripProps = {
  email:         string;
  name:          string | null;
  phone:         string;
  onPhoneChange: (v: string) => void;
  smsOptIn:      boolean;
  onSmsToggle:   () => void;
};

export function AuthContactStrip({
  email,
  name,
  phone,
  onPhoneChange,
  smsOptIn,
  onSmsToggle,
}: AuthContactStripProps) {
  return (
    <div className="space-y-4 px-5 py-5">
      {/* ── Identity row ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-(--color-ember-50)">
          <span className="text-base font-bold text-(--color-ember-600)">
            {(name ?? email).charAt(0).toUpperCase()}
          </span>
        </div>

        <div className="min-w-0">
          {name && <p className="text-sm font-semibold text-(--color-ink-900) truncate">{name}</p>}
          <p className="text-xs text-(--color-ink-400) truncate">{email}</p>
        </div>

        <span className="ml-auto shrink-0 flex items-center gap-1 rounded-full bg-(--color-success-bg) px-2.5 py-1 text-[11px] font-semibold text-(--color-success)">
          ✓ Saved
        </span>
      </div>

      {/* ── SMS opt-in row ────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 rounded-xl border border-(--color-cream-300) bg-(--color-cream-50) px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-(--color-ink-800)">Text me when ready</p>
          <p className="text-xs text-(--color-ink-400)">
            Optional, no spam, just your order status.
          </p>
        </div>

        <SmsToggleSwitch checked={smsOptIn} onChange={onSmsToggle} label="SMS order updates" />
      </div>

      {/* ── Animated phone input ──────────────────────────────────────────── */}
      <AnimatePresence initial={false}>
        {smsOptIn && (
          <motion.div
            key="auth-phone-input"
            initial={{ opacity: 0, height: 0, y: -4 }}
            animate={{ opacity: 1, height: 'auto', y: 0 }}
            exit={{ opacity: 0, height: 0, y: -4 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <PhoneNumberInput
              id="auth-phone"
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