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
        className="relative overflow-hidden rounded-2xl border border-gold-200 bg-gold-50/90 p-5 ring-1 ring-black/[0.02]"
      >
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="absolute right-3 top-3 rounded-lg p-1 text-ink-400 transition hover:bg-white/80 hover:text-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-600/40"
          aria-label="Dismiss"
        >
          ×
        </button>
        <p className="text-sm font-black text-ink-900">Want faster checkout next time?</p>
        <p className="mt-1 text-xs leading-5 text-ink-500">
          Save your info and earn loyalty rewards on every order.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            to={`/auth/signup?email=${encodeURIComponent(email)}&source=checkout`}
            className="rounded-full bg-ember-600 px-4 py-2 text-xs font-black text-white shadow-sm transition hover:bg-ember-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-600/50"
          >
            Create account
          </Link>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="rounded-full border border-cream-300 bg-white px-4 py-2 text-xs font-semibold text-ink-600 transition hover:bg-cream-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember-600/40"
          >
            Maybe later
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
