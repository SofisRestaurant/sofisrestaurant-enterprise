// src/modules/orders/pages/order-success/OrderSuccessNextSteps.tsx
// Post-confirmation utility panel: receipt actions, loyalty perks, support links.

import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import type { Order } from '@/domain/orders/order.types';
import { LOYALTY_TIERS, asTier } from '@/domain/loyalty/tiers';
import { cents, fmt, nextTierNudge, safeOrderNumber } from './orderSuccess.helpers';
import type { LoyaltyTxV2, LoyaltyAccountSnap } from './orderSuccess.types';

// ---------------------------------------------------------------------------
// StickyNextSteps
// ---------------------------------------------------------------------------

export function StickyNextSteps({
  order,
  loyalty,
  account,
}: {
  order: Order;
  loyalty: LoyaltyTxV2 | null;
  account: LoyaltyAccountSnap | null;
}) {
  const tier = account?.tier ? asTier(account.tier) : loyalty ? asTier(loyalty.tier_at_time) : null;
  const tierCfg = tier ? LOYALTY_TIERS[tier] : null;
  const balancePoints =
    account && typeof account.balance === 'number'
      ? account.balance
      : loyalty
        ? loyalty.balance_after
        : 0;
  const tierSource = account?.tier ?? loyalty?.tier_at_time ?? 'bronze';
  const nudge = nextTierNudge(balancePoints, tierSource);
  const orderNo = safeOrderNumber(order.order_number);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const handleCopy = useCallback(() => {
    const summary = `Sofi's Restaurant • Order ${
      orderNo ? `#${orderNo}` : ''
    } • Total $${cents(order.amount_total)} • Ref ${order.id.slice(0, 8).toUpperCase()}`;
    void navigator.clipboard.writeText(summary).catch(() => {});
  }, [order.id, order.amount_total, orderNo]);

  return (
    <div className="space-y-2">
      <p className="text-10px font-bold uppercase tracking-[0.2em] text-neutral-500">
        Next visit perks
      </p>

      <div className="rounded-xl border border-white/8 bg-white/3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-white">Save your receipt</p>
            <p className="mt-1 text-xs text-neutral-500">
              If anything looks off, we can help faster with your order ID.
            </p>
          </div>
          <span className="text-xl">🧾</span>
        </div>
        <div className="mt-3 flex flex-col gap-2">
          <button
            type="button"
            onClick={handlePrint}
            className="rounded-lg bg-white/8 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/12"
          >
            Print / Save PDF
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="rounded-lg border border-white/10 bg-transparent px-3 py-2 text-xs font-semibold text-neutral-200 transition hover:border-white/20"
          >
            Copy receipt summary
          </button>
        </div>
      </div>

      {loyalty || account ? (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-amber-200">
                {tierCfg ? (
                  <>
                    {tierCfg.icon} {tierCfg.label} member perks
                  </>
                ) : (
                  <>Loyalty perks</>
                )}
              </p>
              <p className="mt-1 text-xs text-amber-200/70">
                Use points in your account anytime. Keep your streak alive to boost rewards.
              </p>
              {nudge ? (
                <p className="mt-2 text-[11px] font-semibold text-amber-300">⚡ {nudge.label}</p>
              ) : null}
            </div>
            <span className="text-xl">🎁</span>
          </div>
          <div className="mt-3 flex gap-2">
            <Link
              to="/account"
              className="flex-1 rounded-lg bg-amber-500/15 px-3 py-2 text-center text-xs font-semibold text-amber-200 transition hover:bg-amber-500/20"
            >
              View rewards
            </Link>
            <Link
              to="/menu"
              className="flex-1 rounded-lg bg-white/8 px-3 py-2 text-center text-xs font-semibold text-white transition hover:bg-white/12"
            >
              Order again
            </Link>
          </div>
        </div>
      ) : null}

      <div className="rounded-xl border border-white/8 bg-white/3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-white">Need help?</p>
            <p className="mt-1 text-xs text-neutral-500">
              We respond fast. Include your order ref for the quickest fix.
            </p>
          </div>
          <span className="text-xl">💬</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <a
            href="mailto:sofisrestaurant2022@gmail.com"
            className="rounded-lg bg-white/8 px-3 py-2 text-center text-xs font-semibold text-white transition hover:bg-white/12"
          >
            Email us
          </a>
          <Link
            to="/contact"
            className="rounded-lg border border-white/10 bg-transparent px-3 py-2 text-center text-xs font-semibold text-neutral-200 transition hover:border-white/20"
          >
            Contact form
          </Link>
        </div>
      </div>
    </div>
  );
}