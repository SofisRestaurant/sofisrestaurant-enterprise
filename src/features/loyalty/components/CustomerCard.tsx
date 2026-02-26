// =============================================================================
// src/features/loyalty/components/CustomerCard.tsx
// =============================================================================
import { useState } from 'react';
import { LOYALTY_TIERS, asTier } from '@/domain/loyalty/tiers';
import type { CustomerProfile } from '@/domain/loyalty/loyalty.types';

interface Props {
  customer:  CustomerProfile;
  loyaltyId: string;
}

export function CustomerCard({ customer, loyaltyId }: Props) {
  const [copied, setCopied] = useState(false);
  const tierCfg = LOYALTY_TIERS[asTier(customer.tier)];

  const stats = [
    { label: 'Balance',  value: Number(customer?.balance          ?? 0).toLocaleString() },
    { label: 'Lifetime', value: Number(customer?.lifetime_earned  ?? 0).toLocaleString() },
    { label: 'Streak',   value: `${Number(customer?.streak        ?? 0)}d`               },
  ];

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(loyaltyId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  }

  return (
    <div className="rounded-2xl border border-white/8 bg-gray-900 p-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-500">
            Customer Found
          </p>
          <p className="mt-1 text-lg font-bold text-white">
            {customer.full_name ?? 'Anonymous Member'}
          </p>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-xs font-bold
          ${tierCfg.colors.text} ${tierCfg.colors.bg} ${tierCfg.colors.border}`}>
          {tierCfg.icon} {tierCfg.label}
        </span>
      </div>

      {/* Stats grid */}
      <div className="mt-4 grid grid-cols-3 gap-2">
        {stats.map(({ label, value }) => (
          <div key={label} className="rounded-lg bg-white/4 px-3 py-2.5 text-center">
            <p className="text-[10px] uppercase tracking-wider text-gray-500">{label}</p>
            <p className="mt-0.5 font-mono text-base font-bold text-white">{value}</p>
          </div>
        ))}
      </div>

      {/* Copy ID */}
      <button
        onClick={handleCopy}
        className="mt-4 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-mono text-xs text-gray-400 transition hover:bg-white/10"
      >
        {copied ? '✓ Copied Loyalty ID' : 'Copy Loyalty ID'}
      </button>

      {/* Last activity */}
      {customer.last_activity && (
        <p className="mt-3 text-[11px] text-gray-600">
          Last activity:{' '}
          {new Date(customer.last_activity).toLocaleDateString('en-US', {
            month: 'short',
            day:   'numeric',
            year:  'numeric',
          })}
        </p>
      )}
    </div>
  );
}