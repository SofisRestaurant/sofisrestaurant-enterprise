import type { ReactNode } from 'react';
import {
  checkoutEyebrow,
  checkoutSectionDivider,
  checkoutSectionSubtitle,
  checkoutSectionTitle,
} from './checkoutStyles';
import { cx } from './cx';

export function CheckoutFlowSection({
  step,
  eyebrow,
  title,
  subtitle,
  children,
  action,
  isLast = false,
}: {
  step: number;
  eyebrow: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
  action?: ReactNode;
  isLast?: boolean;
}) {
  return (
    <section className={cx(!isLast && checkoutSectionDivider)}>
      <div className="px-5 py-6 sm:px-6">
        <div className="flex items-start gap-4">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink-900 text-xs font-black text-white shadow-sm"
            aria-hidden
          >
            {step}
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className={checkoutEyebrow}>{eyebrow}</p>
                <h2 className={checkoutSectionTitle}>{title}</h2>
                {subtitle ? <p className={checkoutSectionSubtitle}>{subtitle}</p> : null}
              </div>
              {action ? <div className="shrink-0">{action}</div> : null}
            </div>
            <div className="mt-5 space-y-4">{children}</div>
          </div>
        </div>
      </div>
    </section>
  );
}
