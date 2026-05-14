// src/modules/checkout/components/page/GuestPostCheckoutNudge.tsx

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';

export function GuestPostCheckoutNudge({ email }: { email: string }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed || !email) return null;
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        className="relative overflow-hidden rounded-2xl border border-(--color-gold-200) bg-linear-to-br from-(--color-gold-50) to-(--color-cream-50) p-5"
      >
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="absolute right-3 top-3 text-(--color-ink-300) hover:text-(--color-ink-600)"
          aria-label="Dismiss"
        >
          ×
        </button>
        <p className="text-sm font-semibold text-(--color-gold-800)">
          Want faster checkout next time?
        </p>
        <p className="mt-1 text-xs text-(--color-ink-500)">
          Save your info and earn loyalty rewards on every order.
        </p>
        <div className="mt-3 flex gap-2">
          <Link
            to={`/auth/signup?email=${encodeURIComponent(email)}&source=checkout`}
            className="rounded-lg bg-(--color-gold-500) px-4 py-2 text-xs font-semibold text-white hover:bg-(--color-gold-600) transition-colors"
          >
            Create account
          </Link>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="rounded-lg border border-(--color-cream-300) bg-white px-4 py-2 text-xs font-medium text-(--color-ink-500) hover:bg-(--color-cream-50)"
          >
            Maybe later
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}