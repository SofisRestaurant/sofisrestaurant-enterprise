import { motion } from 'framer-motion';
import { formatCents } from '@/modules/cart/utils/cart.utils';

const STEP_LABELS = ['Contact', 'Pickup', 'Savings', 'Pay'] as const;

type CheckoutHeaderProps = {
  isGuest: boolean;
  userName?: string | null;
  hasItems: boolean;
  estimatedTotalCents: number;
  activeStep: number;
  totalSteps: number;
};

export function CheckoutHeader({
  isGuest,
  userName,
  hasItems,
  estimatedTotalCents,
  activeStep,
  totalSteps,
}: CheckoutHeaderProps) {
  const firstName = userName?.split(' ')[0];

  return (
    <motion.header
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32 }}
      className="mb-6 lg:mb-8"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-ember-600">
            Almost there
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-ink-900 sm:text-4xl">
            {isGuest ? 'Finish your order' : 'Review & pay'}
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-ink-500">
            {isGuest
              ? 'Confirm pickup details, then pay securely with Stripe.'
              : `Welcome back${firstName ? `, ${firstName}` : ''}. Your saved details and rewards are ready.`}
          </p>
        </div>

        {hasItems ? (
          <div className="shrink-0 rounded-2xl border border-cream-200 bg-white/90 px-4 py-3 text-right ring-1 ring-black/[0.02] backdrop-blur-sm">
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-ink-400">
              Estimated total
            </p>
            <p className="mt-0.5 text-2xl font-black tracking-tight text-ember-700 tabular-nums">
              {formatCents(estimatedTotalCents)}
            </p>
            <p className="mt-0.5 text-[11px] text-ink-400">Final total confirmed by Stripe</p>
          </div>
        ) : null}
      </div>

      {hasItems ? (
        <CheckoutProgress activeStep={activeStep} totalSteps={totalSteps} />
      ) : null}
    </motion.header>
  );
}

function CheckoutProgress({
  activeStep,
  totalSteps,
}: {
  activeStep: number;
  totalSteps: number;
}) {
  return (
    <div className="mt-5 rounded-2xl border border-cream-200 bg-white/80 px-4 py-3 ring-1 ring-black/[0.02] backdrop-blur-sm">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold text-ink-400">
          Step {activeStep} of {totalSteps}
        </p>
        <p className="text-[11px] font-semibold text-ink-400">Secure checkout</p>
      </div>

      <ol className="mt-3 grid grid-cols-4 gap-1.5" aria-label="Checkout progress">
        {STEP_LABELS.map((label, index) => {
          const stepNumber = index + 1;
          const isComplete = stepNumber < activeStep;
          const isCurrent = stepNumber === activeStep;

          return (
            <li key={label} className="min-w-0">
              <div
                className={[
                  'h-1 rounded-full transition-colors',
                  isComplete || isCurrent ? 'bg-ember-600' : 'bg-cream-200',
                ].join(' ')}
                aria-hidden
              />
              <p
                className={[
                  'mt-1.5 truncate text-center text-[10px] font-bold uppercase tracking-wide',
                  isCurrent ? 'text-ember-700' : isComplete ? 'text-ink-600' : 'text-ink-400',
                ].join(' ')}
              >
                {label}
              </p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

