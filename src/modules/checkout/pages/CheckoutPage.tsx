// src/modules/checkout/pages/CheckoutPage.tsx
// =============================================================================
// CHANGES FROM PRIOR VERSION:
//
//   [1] useCheckoutRouter lifted to CheckoutPage. (unchanged)
//
//   [2] CheckoutChallengeModal integrated inline in Section 6. (unchanged)
//
//   [3] handleCheckout is the single checkout trigger. (unchanged)
//
//   [4] Review Order button is unmounted during challenge and blocked. (unchanged)
//
//   [5] Duplicate redirect prevention. (unchanged)
//
//   [FIX] challengeEmail: frozen identity email for OTP binding. (unchanged)
//
//   [FIX] getLoyaltyAccount: supabase.functions.invoke() response narrowed
//         from unknown before property access.
//
//         supabase.functions.invoke() without a generic returns
//         `{ data: any | null, ... }` in older @supabase/supabase-js or
//         `{ data: unknown | null, ... }` in newer versions. Either way,
//         accessing `data?.ok`, `data?.account?.id` etc. without a runtime
//         guard causes @typescript-eslint/no-unsafe-member-access.
//
//         Fix: cast rawData to unknown, then use isRecord() to narrow
//         to Record<string,unknown> before each property access.
//         isRecord is imported from checkout.types (already used by the
//         checkout result narrowing elsewhere in this file).
//
// Security invariants preserved:
//   - No Stripe URL before verification (button is unmounted during challenge)
//   - challenge_token lives only in CheckoutChallengeModal state and router memory
//   - guest_token continuity preserved via sessionStorage (unchanged)
//   - pendingInputRef in useGuestCheckout preserves cart across OTP cycle
// =============================================================================
import {
  useEffect,
  useMemo,
  useState,
  useCallback,
  useRef,
  type ChangeEvent,
  type KeyboardEvent,
} from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

import CheckoutButton from '@/modules/checkout/components/CheckoutButton';
import { CheckoutChallengeModal } from '@/modules/checkout/components/CheckoutChallengeModal';
import { PhoneVerification } from '@/modules/checkout/components/PhoneVerification';
import {
  RewardsRedeem,
  type LoyaltyRedeemValue,
} from '@/modules/checkout/components/RewardsRedeem';
import { useCart } from '@/modules/cart/hooks/useCart';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useCheckoutRouter } from '@/modules/checkout/hooks/useCheckoutRouter';
import {
  getAvailableCredits,
  getLoyaltyProfile,
  calculatePointsPreview,
  type UserCredit,
  type LoyaltyProfile,
  type LoyaltyPreview,
} from '@/modules/checkout/api/checkout.api';
import {
  isCheckoutSuccess,
  isOtpRequired,
  isCheckoutBlocked,
  // [FIX] isRecord added — used to narrow supabase.functions.invoke() responses
  isRecord,
} from '@/modules/checkout/types/checkout.types';
import { supabase } from '@/lib/supabase/supabaseClient';
import { computeLineTotalCents, cartItemKey } from '@/modules/cart/types/cart.types';
import type { CartItem } from '@/modules/cart/types/cart.types';
import { formatCents } from '@/modules/cart/utils/cart.utils';
import { ShieldOff, X } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type PromoState = { code: string; applied: boolean; error: string | null };
type OrderType = 'pickup' | 'delivery' | 'dine_in';
type OrderDetailsState = { orderType: OrderType; notes: string };

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

const STORAGE = {
  ORDER_TYPE: 'sofis.checkout.orderType.v1',
  NOTES: 'sofis.checkout.notes.v1',
  PROMO: 'sofis.checkout.promo.v1',
  CREDIT: 'sofis.checkout.credit.v1',
} as const;

const LIMITS = { NOTES_MAX: 600, PROMO_MAX: 50 } as const;

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers
// ─────────────────────────────────────────────────────────────────────────────

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function normalizePromo(code: string): string {
  return code
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '')
    .slice(0, LIMITS.PROMO_MAX);
}

function safeText(v: unknown, maxLen = 500): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s) return null;
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

function safeMoneyCents(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function stableCartKey(item: CartItem): string {
  return `${item.menuItemId}:${cartItemKey(item.menuItemId, item.modifiers)}`;
}

function computeDisplayLineTotalCents(item: CartItem): number {
  const fromStore = safeMoneyCents(
    (item as unknown as { lineTotalCents?: unknown }).lineTotalCents,
  );
  if (fromStore > 0) return fromStore;
  return computeLineTotalCents({
    unitPriceCents: safeMoneyCents(item.unitPriceCents),
    modifiers: item.modifiers ?? [],
    quantity: clampInt(item.quantity, 1, 100),
  });
}

function formatOrderTypeLabel(t: OrderType): string {
  return t === 'pickup' ? 'Pickup' : t === 'delivery' ? 'Delivery' : 'Dine-in';
}

function safeLocalGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeLocalSet(key: string, val: string): void {
  try {
    localStorage.setItem(key, val);
  } catch {
    /* */
  }
}
function safeLocalRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* */
  }
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

// ─────────────────────────────────────────────────────────────────────────────
// getLoyaltyAccount
// ─────────────────────────────────────────────────────────────────────────────
//
// [FIX] supabase.functions.invoke() without a generic returns data as `any`
// (older @supabase/supabase-js) or `unknown` (newer). Either way, accessing
// data?.ok or data?.account?.id directly is an unsafe member access.
//
// Fix: cast rawData to unknown and narrow with isRecord() before each access.
// The function's return type is explicit and unchanged.

async function getLoyaltyAccount(): Promise<{
  accountId: string;
  balance: number;
  lastRedeemAt: string | null;
} | null> {
  try {
    const { data: rawData, error } = await supabase.functions.invoke('loyalty-account');
    if (error) return null;

    // Treat as unknown — isRecord() narrows before every property access.
    const data: unknown = rawData;
    if (!isRecord(data) || data['ok'] !== true) return null;

    const account: unknown = data['account'];
    if (!isRecord(account) || typeof account['id'] !== 'string') return null;

    return {
      accountId: account['id'],
      balance: typeof account['balance'] === 'number' ? account['balance'] : 0,
      lastRedeemAt:
        typeof account['last_redeem_at'] === 'string' ? account['last_redeem_at'] : null,
    };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Pickup time slots
// ─────────────────────────────────────────────────────────────────────────────

const PICKUP_MIN_PREP_MS = 10 * 60 * 1000;
const PICKUP_SLOT_INTERVAL_MS = 15 * 60 * 1000;
const PICKUP_SLOT_COUNT = 10;

type PickupSlot = { label: string; value: string };

function generatePickupSlots(): PickupSlot[] {
  const earliest = new Date(Date.now() + PICKUP_MIN_PREP_MS);
  const base = new Date(
    Math.ceil(earliest.getTime() / PICKUP_SLOT_INTERVAL_MS) * PICKUP_SLOT_INTERVAL_MS,
  );
  const slots: PickupSlot[] = [];
  for (let i = 0; i < PICKUP_SLOT_COUNT; i++) {
    const slot = new Date(base.getTime() + i * PICKUP_SLOT_INTERVAL_MS);
    slots.push({
      label: slot.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
      value: slot.toISOString(),
    });
  }
  return slots;
}

// ─────────────────────────────────────────────────────────────────────────────
// PickupTimeSelector
// ─────────────────────────────────────────────────────────────────────────────

function PickupTimeSelector({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const slots = useMemo(() => generatePickupSlots(), []);

  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wide text-(--color-ink-400) mb-2">
        Pickup time
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onChange(null)}
          className={cx(
            'rounded-xl border px-4 py-2 text-sm font-semibold transition-all',
            value === null
              ? 'border-(--color-ember-500) bg-(--color-ember-600) text-white shadow-sm'
              : 'border-(--color-cream-300) bg-white text-(--color-ink-800) hover:border-(--color-ink-300) hover:bg-(--color-cream-50)',
          )}
          aria-pressed={value === null}
        >
          ASAP
        </button>
        {slots.map((slot) => (
          <button
            key={slot.value}
            type="button"
            onClick={() => onChange(slot.value)}
            className={cx(
              'rounded-xl border px-4 py-2 text-sm font-semibold transition-all tabular-nums',
              value === slot.value
                ? 'border-(--color-ember-500) bg-(--color-ember-600) text-white shadow-sm'
                : 'border-(--color-cream-300) bg-white text-(--color-ink-800) hover:border-(--color-ink-300) hover:bg-(--color-cream-50)',
            )}
            aria-pressed={value === slot.value}
          >
            {slot.label}
          </button>
        ))}
      </div>
      {value !== null && (
        <p className="mt-2 text-xs text-(--color-ink-400)">
          Scheduled for{' '}
          <span className="font-semibold text-(--color-ink-700)">
            {new Date(value).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
          </span>{' '}
          —{' '}
          <button
            type="button"
            onClick={() => onChange(null)}
            className="underline hover:text-(--color-ink-900)"
          >
            switch to ASAP
          </button>
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Animation variants
// ─────────────────────────────────────────────────────────────────────────────

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: i * 0.06,
      duration: 0.4,
      ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
    },
  }),
};

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function SectionCard({
  children,
  className = '',
  index = 0,
}: {
  children: React.ReactNode;
  className?: string;
  index?: number;
}) {
  return (
    <motion.section
      custom={index}
      variants={fadeUp}
      initial="hidden"
      animate="visible"
      className={cx(
        'overflow-hidden rounded-2xl border border-(--color-cream-300) bg-white shadow-[0_1px_3px_0_rgb(0_0_0/0.04)]',
        className,
      )}
    >
      {children}
    </motion.section>
  );
}

function SectionHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-(--color-cream-200) px-5 py-4">
      <div>
        <h2 className="text-sm font-semibold text-(--color-ink-900)">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-(--color-ink-400)">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BlockedOrderCard — terminal state, no retry
// ─────────────────────────────────────────────────────────────────────────────

function BlockedOrderCard({ onReset }: { onReset: () => void }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-4">
      <div className="flex items-start gap-3">
        <ShieldOff className="h-5 w-5 shrink-0 text-red-500 mt-0.5" strokeWidth={1.75} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-red-800">Order could not be processed</p>
          <p className="mt-1 text-xs text-red-600">
            This order was flagged by our security system. If you believe this is an
            error, please{' '}
            <a
              href="mailto:sofisrestaurante@gmail.com"
              className="underline font-medium hover:text-red-800"
            >
              contact support
            </a>
            .
          </p>
        </div>
        <button
          type="button"
          onClick={onReset}
          className="shrink-0 text-red-400 hover:text-red-700 transition-colors"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GuestContactStrip
// ─────────────────────────────────────────────────────────────────────────────

function GuestContactStrip({
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

// ─────────────────────────────────────────────────────────────────────────────
// AuthContactStrip
// ─────────────────────────────────────────────────────────────────────────────

function AuthContactStrip({ email, name }: { email: string; name: string | null }) {
  return (
    <div className="flex items-center gap-3 px-5 py-4">
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
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LoyaltyEarnBanner
// ─────────────────────────────────────────────────────────────────────────────

function LoyaltyEarnBanner({ preview }: { preview: LoyaltyPreview }) {
  if (preview.pointsToEarn <= 0) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center justify-between border-b border-(--color-gold-200) bg-linear-to-r from-(--color-gold-50) to-(--color-cream-50) px-5 py-3"
    >
      <div className="flex items-center gap-2.5">
        <span className="text-lg">✨</span>
        <div>
          <p className="text-sm font-semibold text-(--color-gold-800)">
            Earn <span className="tabular-nums">+{preview.pointsToEarn} pts</span> on this order
          </p>
          <p className="text-[11px] text-(--color-gold-600)">
            {preview.willLevelUp
              ? '🎉 You\'ll level up after this order!'
              : preview.pointsToNextTier !== null
                ? `${preview.pointsToNextTier} pts to next tier`
                : 'Maximum tier — best rewards active'}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="rounded-full bg-(--color-gold-400) px-2.5 py-0.5 text-xs font-bold text-white tabular-nums">
          +{preview.pointsToEarn}
        </span>
        {preview.tierMultiplier > 1 && (
          <span className="rounded-full bg-(--color-gold-100) px-1.5 py-px text-[10px] font-semibold text-(--color-gold-700)">
            ×{preview.tierMultiplier}
          </span>
        )}
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// OrderItemsList
// ─────────────────────────────────────────────────────────────────────────────

function OrderItemsList({ items }: { items: CartItem[] }) {
  return (
    <div className="divide-y divide-(--color-cream-200)">
      {items.map((item) => {
        const notes = safeText(item.notes, 500);
        const lineTotalCents = computeDisplayLineTotalCents(item);
        return (
          <div key={stableCartKey(item)} className="flex items-start justify-between gap-3 px-5 py-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-(--color-ink-900) truncate">
                {item.name}{' '}
                <span className="text-(--color-ink-400)">× {clampInt(item.quantity, 1, 100)}</span>
              </p>
              {item.modifiers?.length ? (
                <ul className="mt-1 space-y-0.5">
                  {item.modifiers.map((m) => (
                    <li key={`${m.groupId}:${m.id}`} className="text-xs text-(--color-ink-400) truncate">
                      • {m.name}
                    </li>
                  ))}
                </ul>
              ) : null}
              {notes && <p className="mt-1 text-xs text-(--color-ink-400)">{notes}</p>}
            </div>
            <div className="shrink-0 text-right">
              <span className="text-sm font-semibold text-(--color-ink-900) tabular-nums">
                {formatCents(lineTotalCents)}
              </span>
              <div className="mt-0.5 text-[11px] text-(--color-ink-400) tabular-nums">
                {formatCents(safeMoneyCents(item.unitPriceCents))} ea
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// OrderTotals
// ─────────────────────────────────────────────────────────────────────────────

function OrderTotals({
  subtotalCents,
  estimatedTaxCents,
  estimatedTotalCents,
}: {
  subtotalCents: number;
  estimatedTaxCents: number;
  estimatedTotalCents: number;
}) {
  return (
    <div className="space-y-2 border-t border-(--color-cream-200) bg-(--color-cream-50) px-5 py-4 text-sm">
      <div className="flex justify-between text-(--color-ink-600)">
        <span>Subtotal</span>
        <span className="tabular-nums">{formatCents(subtotalCents)}</span>
      </div>
      <div className="flex justify-between text-(--color-ink-400)">
        <span>Est. tax</span>
        <span className="tabular-nums">{formatCents(estimatedTaxCents)}</span>
      </div>
      <div className="flex justify-between border-t border-(--color-cream-300) pt-3 font-bold text-(--color-ink-900)">
        <span>Total</span>
        <span className="tabular-nums text-(--color-ember-600)">
          {formatCents(estimatedTotalCents)}
        </span>
      </div>
      <p className="text-center text-[11px] text-(--color-ink-300)">
        Final total confirmed by Stripe — includes tax, promos, and credits.
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PromoSection
// ─────────────────────────────────────────────────────────────────────────────

function PromoSection({
  promo,
  onPromoChange,
  onPromoApply,
  onPromoClear,
  onPromoKeyDown,
}: {
  promo: PromoState;
  onPromoChange: (e: ChangeEvent<HTMLInputElement>) => void;
  onPromoApply: () => void;
  onPromoClear: () => void;
  onPromoKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="px-5 py-4">
      {promo.applied ? (
        <div className="flex items-center justify-between rounded-xl border border-(--color-success) bg-(--color-success-bg) px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-(--color-success)">✓ {promo.code}</span>
            <span className="text-xs text-(--color-success)">queued</span>
          </div>
          <button
            type="button"
            onClick={onPromoClear}
            className="text-xs text-(--color-ink-400) underline hover:text-(--color-ink-700)"
          >
            Remove
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <input
            type="text"
            value={promo.code}
            onChange={onPromoChange}
            onKeyDown={onPromoKeyDown}
            placeholder="PROMO CODE"
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            maxLength={LIMITS.PROMO_MAX}
            className="input flex-1 font-mono uppercase tracking-wider"
            aria-label="Promo code"
          />
          <button
            type="button"
            onClick={onPromoApply}
            disabled={!promo.code.trim()}
            className="btn btn-ghost px-4 text-sm disabled:opacity-40"
          >
            Apply
          </button>
        </div>
      )}
      {promo.error && (
        <p className="mt-2 text-xs font-medium text-(--color-error)">{promo.error}</p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CreditsSection
// ─────────────────────────────────────────────────────────────────────────────

function CreditsSection({
  credits,
  creditsLoading,
  creditsError,
  creditsAvailableCents,
  selectedCredit,
  onSelectCredit,
  onRemoveCredit,
  onRetry,
}: {
  credits: UserCredit[];
  creditsLoading: boolean;
  creditsError: string | null;
  creditsAvailableCents: number;
  selectedCredit: string | null;
  onSelectCredit: (id: string) => void;
  onRemoveCredit: () => void;
  onRetry: () => void;
}) {
  if (creditsLoading) {
    return (
      <div className="rounded-xl border border-(--color-cream-200) bg-(--color-cream-50) px-4 py-3 text-sm text-(--color-ink-400)">
        Loading credits…
      </div>
    );
  }
  if (creditsError) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
        <p className="text-sm font-semibold text-red-800">{creditsError}</p>
        <button
          type="button"
          onClick={onRetry}
          className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-red-800 ring-1 ring-red-200 hover:bg-red-50"
        >
          Retry
        </button>
      </div>
    );
  }
  if (credits.length === 0) return null;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-(--color-ink-600)">Store Credits</p>
        <span className="text-xs font-semibold text-(--color-gold-600) tabular-nums">
          {formatCents(creditsAvailableCents)} available
        </span>
      </div>
      <div className="divide-y divide-(--color-cream-200) rounded-xl border border-(--color-cream-300) overflow-hidden">
        {credits.map((credit) => {
          const amt = safeMoneyCents(credit.amount_cents);
          const exp = safeText(credit.expires_at, 64);
          return (
            <label
              key={credit.id}
              className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-(--color-cream-50) transition-colors"
            >
              <input
                type="radio"
                name="credit"
                value={credit.id}
                checked={selectedCredit === credit.id}
                onChange={() => onSelectCredit(credit.id)}
                className="h-4 w-4 text-(--color-gold-500) focus:ring-(--color-gold-400)"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-(--color-ink-800) tabular-nums">
                  {formatCents(amt)} credit
                </p>
                <p className="text-xs text-(--color-ink-400)">
                  {String(credit.source ?? '').replace(/_/g, ' ') || 'credit'}
                  {exp
                    ? ` · Expires ${new Date(exp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                    : ''}
                </p>
              </div>
              {selectedCredit === credit.id && (
                <span className="text-xs font-bold text-(--color-gold-600)">Selected</span>
              )}
            </label>
          );
        })}
      </div>
      {selectedCredit && (
        <button
          type="button"
          onClick={onRemoveCredit}
          className="mt-2 text-xs text-(--color-ink-300) underline hover:text-(--color-ink-600)"
        >
          Remove credit
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GuestPostCheckoutNudge
// ─────────────────────────────────────────────────────────────────────────────

function GuestPostCheckoutNudge({ email }: { email: string }) {
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

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export default function CheckoutPage() {
  const navigate = useNavigate();
  const { items } = useCart();
  const { user, isAuthenticated } = useAuth();
  const isGuest = !isAuthenticated;

  const {
    checkout,
    reset,
    otpChallenge,
    retryWithToken,
    guestPhase,
    isLoading,
    error: routerError,
  } = useCheckoutRouter();

  const showChallenge = guestPhase.tag === 'otp_required' || guestPhase.tag === 'retrying';
  const showBlocked = guestPhase.tag === 'blocked';

  const hasItems = Array.isArray(items) && items.length > 0;
  const subtotalCents = useMemo(() => {
    if (!hasItems) return 0;
    return items.reduce((sum, i) => sum + computeDisplayLineTotalCents(i), 0);
  }, [items, hasItems]);
  const estimatedTaxCents = useMemo(() => Math.round(subtotalCents * 0.095), [subtotalCents]);
  const estimatedTotalCents = useMemo(
    () => subtotalCents + estimatedTaxCents,
    [subtotalCents, estimatedTaxCents],
  );
  const itemCount = useMemo(() => {
    if (!hasItems) return 0;
    return items.reduce((acc, i) => acc + clampInt(i.quantity, 0, 10_000), 0);
  }, [items, hasItems]);

  // ── Order details ──────────────────────────────────────────────────────────
  const [orderDetails, setOrderDetails] = useState<OrderDetailsState>(() => {
    const storedType = safeLocalGet(STORAGE.ORDER_TYPE);
    const storedNotes = safeLocalGet(STORAGE.NOTES);
    const t: OrderType =
      storedType === 'pickup' || storedType === 'delivery' || storedType === 'dine_in'
        ? storedType
        : 'pickup';
    return {
      orderType: t,
      notes: typeof storedNotes === 'string' ? storedNotes.slice(0, LIMITS.NOTES_MAX) : '',
    };
  });

  const [pickupTime, setPickupTime] = useState<string | null>(null);

  useEffect(() => {
    if (orderDetails.orderType !== 'pickup') setPickupTime(null);
  }, [orderDetails.orderType]);
  useEffect(() => {
    safeLocalSet(STORAGE.ORDER_TYPE, orderDetails.orderType);
  }, [orderDetails.orderType]);
  useEffect(() => {
    if (!orderDetails.notes) safeLocalRemove(STORAGE.NOTES);
    else safeLocalSet(STORAGE.NOTES, orderDetails.notes);
  }, [orderDetails.notes]);

  // ── Promo ──────────────────────────────────────────────────────────────────
  const [promo, setPromo] = useState<PromoState>(() => {
    const stored = safeLocalGet(STORAGE.PROMO);
    return { code: stored ? normalizePromo(stored) : '', applied: false, error: null };
  });

  const onPromoChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const code = normalizePromo(e.target.value);
    setPromo({ code, applied: false, error: null });
    if (code) safeLocalSet(STORAGE.PROMO, code);
    else safeLocalRemove(STORAGE.PROMO);
  }, []);
  const onPromoApply = useCallback(() => {
    if (promo.code.trim()) setPromo((p) => ({ ...p, applied: true, error: null }));
  }, [promo.code]);
  const onPromoClear = useCallback(() => {
    setPromo({ code: '', applied: false, error: null });
    safeLocalRemove(STORAGE.PROMO);
  }, []);
  const onPromoKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        onPromoApply();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        onPromoClear();
      }
    },
    [onPromoApply, onPromoClear],
  );

  // ── Guest state ────────────────────────────────────────────────────────────
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [smsOptIn, setSmsOptIn] = useState(false);

  // [FIX] Frozen identity email for OTP token binding.
  //
  // Captured when the phase enters 'otp_required'. Passed to the modal instead
  // of the live guestEmail state so that editing the email field while the
  // modal is open does not cause an identity mismatch on the retry call.
  //
  // Both client (buildCheckoutIdentityKey) and server (buildIdentityKey) apply
  // toLowerCase().trim() before hashing, so the captured value must match
  // the email in pendingInputRef.current (set by initiateGuestCheckout, which
  // normalises via `args.guestEmail!.trim().toLowerCase()`).
  //
  // Cleared on phase → 'idle' so a subsequent attempt with a different email
  // starts clean.
  const [challengeEmail, setChallengeEmail] = useState<string | null>(null);

  useEffect(() => {
    if (guestPhase.tag === 'otp_required' && challengeEmail === null) {
      setChallengeEmail(guestEmail.trim().toLowerCase() || null);
    }
    if (guestPhase.tag === 'idle') {
      setChallengeEmail(null);
    }
  }, [guestPhase.tag, guestEmail, challengeEmail]);

  // ── Auth: credits ──────────────────────────────────────────────────────────
  const [credits, setCredits] = useState<UserCredit[]>([]);
  const [selectedCredit, setSelectedCredit] = useState<string | null>(() =>
    safeLocalGet(STORAGE.CREDIT),
  );
  const [creditsLoading, setCreditsLoading] = useState(true);
  const [creditsError, setCreditsError] = useState<string | null>(null);
  const [creditsAvailableCents] = useMemo(
    () => [credits.reduce((s, c) => s + safeMoneyCents(c.amount_cents), 0)],
    [credits],
  );

  // ── Auth: loyalty ──────────────────────────────────────────────────────────
  const [loyaltyProfile, setLoyaltyProfile] = useState<LoyaltyProfile | null>(null);
  const [loyaltyPreview, setLoyaltyPreview] = useState<LoyaltyPreview | null>(null);
  const [loyaltyBalance, setLoyaltyBalance] = useState(0);
  const [loyaltyAccountId, setLoyaltyAccountId] = useState('');
  const [recentlyRedeemed, setRecentlyRedeemed] = useState(false);
  const [loyaltyIntent, setLoyaltyIntent] = useState<LoyaltyRedeemValue>({
    applyPoints: false,
    pointsToRedeem: 0,
    loyaltyAccountId: '',
  });

  // ── Auth: phone verification ───────────────────────────────────────────────
  const [verifiedPhone, setVerifiedPhone] = useState<string | null>(null);
  const [phoneSkipped, setPhoneSkipped] = useState(false);

  // ── Data loading (auth only) ───────────────────────────────────────────────
  const loadCredits = useCallback(async () => {
    setCreditsLoading(true);
    setCreditsError(null);
    try {
      const rows = await getAvailableCredits();
      const clean = (rows ?? []).filter((c) => typeof c?.id === 'string' && c.id.length > 0);
      setCredits(clean);
      if (selectedCredit && !clean.some((c) => c.id === selectedCredit)) {
        setSelectedCredit(null);
        safeLocalRemove(STORAGE.CREDIT);
      }
    } catch {
      setCredits([]);
      setCreditsError('Unable to load credits right now.');
    } finally {
      setCreditsLoading(false);
    }
  }, [selectedCredit]);

  useEffect(() => {
    if (!isAuthenticated) {
      setCreditsLoading(false);
      return;
    }
    let alive = true;
    void loadCredits().finally(() => {
      if (!alive) return;
    });
    return () => {
      alive = false;
    };
  }, [isAuthenticated, loadCredits]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let alive = true;
    void getLoyaltyProfile().then((p) => {
      if (alive) setLoyaltyProfile(p);
    });
    return () => {
      alive = false;
    };
  }, [isAuthenticated]);

  useEffect(() => {
    setLoyaltyPreview(
      subtotalCents > 0 ? calculatePointsPreview(subtotalCents, loyaltyProfile) : null,
    );
  }, [subtotalCents, loyaltyProfile]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let alive = true;
    void getLoyaltyAccount().then((acct) => {
      if (!alive || !acct) return;
      setLoyaltyBalance(acct.balance);
      setLoyaltyAccountId(acct.accountId);
      if (acct.lastRedeemAt) {
        const hoursSince = (Date.now() - new Date(acct.lastRedeemAt).getTime()) / 36e5;
        setRecentlyRedeemed(hoursSince < 24);
      }
    });
    return () => {
      alive = false;
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (!loyaltyAccountId) return;
    setLoyaltyIntent((prev) => ({ ...prev, loyaltyAccountId }));
  }, [loyaltyAccountId]);

  useEffect(() => {
    if (!selectedCredit) safeLocalRemove(STORAGE.CREDIT);
    else safeLocalSet(STORAGE.CREDIT, selectedCredit);
  }, [selectedCredit]);

  // ── handleCheckout — single checkout trigger ───────────────────────────────
  const handleCheckout = useCallback(async () => {
    const result = await checkout({
      guestEmail: guestEmail || undefined,
      orderType: orderDetails.orderType,
      notes: orderDetails.notes || null,
      pickupTime:
        orderDetails.orderType === 'pickup' && pickupTime != null ? pickupTime : undefined,
      promoCode: promo.applied ? promo.code : undefined,
      creditId: isGuest ? undefined : (selectedCredit ?? undefined),
      loyalty: loyaltyIntent,
    });

    if (isCheckoutSuccess(result)) {
      window.location.assign(result.url);
      return;
    }

    if (!isOtpRequired(result) && !isCheckoutBlocked(result)) {
      if (result.code === 'promo_invalid' || result.code === 'promo_not_found') {
        setPromo((prev) => ({
          ...prev,
          applied: false,
          error: result.error || 'Invalid promo code.',
        }));
      }
    }
  }, [
    checkout,
    guestEmail,
    orderDetails,
    pickupTime,
    promo.applied,
    promo.code,
    selectedCredit,
    loyaltyIntent,
    isGuest,
  ]);

  // ── Copy summary ───────────────────────────────────────────────────────────
  const copySummary = useCallback(async () => {
    if (!hasItems) return;
    const lines = [
      `Sofi's — Checkout Summary`,
      `Type: ${formatOrderTypeLabel(orderDetails.orderType)}`,
    ];
    if (pickupTime) {
      lines.push(
        `Pickup: ${new Date(pickupTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`,
      );
    }
    for (const item of items) {
      lines.push(
        `- ${item.name} x${clampInt(item.quantity, 1, 100)} — ${formatCents(computeDisplayLineTotalCents(item))}`,
      );
    }
    lines.push(`Subtotal: ${formatCents(subtotalCents)}`);
    lines.push(`Final total confirmed by Stripe.`);
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
    } catch {
      /* */
    }
  }, [hasItems, items, subtotalCents, orderDetails, pickupTime]);

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <main className="relative mx-auto w-full max-w-2xl px-4 py-8 sm:py-12">
      <motion.header
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="mb-7"
      >
        {isGuest ? (
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-(--color-ink-900)">Checkout</h1>
            <p className="mt-1 text-sm text-(--color-ink-400)">Fast, secure, no account needed.</p>
          </div>
        ) : (
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-(--color-ember-500) mb-1">
              Welcome back{user?.name ? `, ${user.name.split(' ')[0]}` : ''}
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-(--color-ink-900)">Your Order</h1>
            <p className="mt-1 text-sm text-(--color-ink-400)">
              Your details are saved. Rewards applied automatically.
            </p>
          </div>
        )}
      </motion.header>

      {!hasItems ? (
        <SectionCard index={0}>
          <div className="p-10 text-center">
            <p className="text-(--color-ink-500)">Your cart is empty.</p>
            <div className="mt-6 flex justify-center gap-3">
              <button
                type="button"
                onClick={() => navigate('/menu')}
                className="btn btn-primary px-5 py-2.5 text-sm"
              >
                Browse Menu
              </button>
              <Link to="/" className="btn btn-ghost px-5 py-2.5 text-sm">
                Home
              </Link>
            </div>
          </div>
        </SectionCard>
      ) : (
        <div className="space-y-3">
          {/* SECTION 1: ORDER REVIEW */}
          <SectionCard index={0}>
            <SectionHeader
              title="Order Summary"
              subtitle={`${itemCount} item${itemCount !== 1 ? 's' : ''}`}
              right={
                <Link
                  to="/menu"
                  className="text-xs text-(--color-ink-400) hover:text-(--color-ink-700) underline"
                >
                  Edit
                </Link>
              }
            />
            <OrderItemsList items={items} />
            <OrderTotals
              subtotalCents={subtotalCents}
              estimatedTaxCents={estimatedTaxCents}
              estimatedTotalCents={estimatedTotalCents}
            />
          </SectionCard>

          {/* SECTION 2: ORDER TYPE + NOTES + PICKUP TIME */}
          <SectionCard index={1}>
            <SectionHeader title="Order details" />
            <div className="space-y-5 px-5 py-5">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-(--color-ink-400) mb-1.5">
                  Order type
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['pickup', 'delivery', 'dine_in'] as const).map((t) => {
                    const active = orderDetails.orderType === t;
                    const comingSoon = t === 'delivery' || t === 'dine_in';
                    return (
                      <div key={t} className="relative">
                        <button
                          type="button"
                          disabled={comingSoon}
                          onClick={() =>
                            !comingSoon && setOrderDetails((s) => ({ ...s, orderType: t }))
                          }
                          className={cx(
                            'w-full rounded-xl border px-3 py-2.5 text-sm font-semibold transition-all',
                            comingSoon
                              ? 'cursor-not-allowed border-(--color-cream-200) bg-(--color-cream-50) text-(--color-ink-300) select-none'
                              : active
                                ? 'border-(--color-ember-500) bg-(--color-ember-600) text-white shadow-sm'
                                : 'border-(--color-cream-300) bg-white text-(--color-ink-800) hover:border-(--color-ink-300) hover:bg-(--color-cream-50)',
                          )}
                          aria-pressed={active}
                        >
                          {formatOrderTypeLabel(t)}
                        </button>
                        {comingSoon && (
                          <span className="pointer-events-none absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-(--color-gold-400) px-2 py-px text-[9px] font-bold uppercase text-white shadow-sm tracking-wide">
                            Soon
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <AnimatePresence>
                {orderDetails.orderType === 'pickup' && (
                  <motion.div
                    key="pickup-time"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.22 }}
                    className="overflow-hidden"
                  >
                    <div className="rounded-xl border border-(--color-cream-200) bg-(--color-cream-50) p-4">
                      <PickupTimeSelector value={pickupTime} onChange={setPickupTime} />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div>
                <label
                  htmlFor="checkout-notes"
                  className="block text-xs font-semibold uppercase tracking-wide text-(--color-ink-400) mb-1.5"
                >
                  Kitchen notes{' '}
                  <span className="text-[11px] font-normal normal-case text-(--color-ink-300)">
                    (optional)
                  </span>
                </label>
                <textarea
                  id="checkout-notes"
                  value={orderDetails.notes}
                  onChange={(e) =>
                    setOrderDetails((s) => ({
                      ...s,
                      notes: String(e.target.value).slice(0, LIMITS.NOTES_MAX),
                    }))
                  }
                  rows={2}
                  placeholder="No onions, mild salsa, sauce on the side…"
                  className="input w-full resize-none"
                />
                <div className="mt-1 flex justify-end">
                  <span className="text-[11px] text-(--color-ink-300) tabular-nums">
                    {orderDetails.notes.length}/{LIMITS.NOTES_MAX}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="rounded-lg border border-(--color-cream-300) bg-white px-3 py-2 text-xs font-medium text-(--color-ink-600) hover:bg-(--color-cream-50)"
                >
                  Print / Save PDF
                </button>
                <button
                  type="button"
                  onClick={() => void copySummary()}
                  className="rounded-lg border border-(--color-cream-300) bg-white px-3 py-2 text-xs font-medium text-(--color-ink-600) hover:bg-(--color-cream-50)"
                >
                  Copy summary
                </button>
              </div>
            </div>
          </SectionCard>

          {/* SECTION 3: CONTACT */}
          <SectionCard index={2}>
            {isGuest ? (
              <>
                <SectionHeader title="Contact" subtitle="For your receipt and order updates" />
                <GuestContactStrip
                  email={guestEmail}
                  onEmailChange={setGuestEmail}
                  phone={guestPhone}
                  onPhoneChange={setGuestPhone}
                  smsOptIn={smsOptIn}
                  onSmsToggle={() => setSmsOptIn((v) => !v)}
                />
              </>
            ) : (
              <>
                <SectionHeader title="Your info" />
                <AuthContactStrip email={user?.email ?? ''} name={user?.name ?? null} />
                {!verifiedPhone && !phoneSkipped && (
                  <div className="border-t border-(--color-cream-200) px-5 py-4">
                    <PhoneVerification
                      onVerified={(phone) => setVerifiedPhone(phone)}
                      onSkip={() => setPhoneSkipped(true)}
                    />
                  </div>
                )}
                {verifiedPhone && (
                  <div className="border-t border-(--color-cream-200) px-5 py-3">
                    <div className="flex items-center justify-between rounded-xl border border-(--color-success) bg-(--color-success-bg) px-4 py-2.5">
                      <p className="text-sm font-medium text-(--color-success)">
                        📱 SMS updates active
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setVerifiedPhone(null);
                          setPhoneSkipped(false);
                        }}
                        className="text-xs text-(--color-success) underline"
                      >
                        Change
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </SectionCard>

          {/* SECTION 4: PROMO */}
          <SectionCard index={3}>
            <SectionHeader title="Promo Code" subtitle="Verified by the server at checkout" />
            <PromoSection
              promo={promo}
              onPromoChange={onPromoChange}
              onPromoApply={onPromoApply}
              onPromoClear={onPromoClear}
              onPromoKeyDown={onPromoKeyDown}
            />
          </SectionCard>

          {/* SECTION 5: REWARDS (AUTH ONLY) */}
          {!isGuest && (
            <SectionCard index={4}>
              {loyaltyPreview && <LoyaltyEarnBanner preview={loyaltyPreview} />}
              <SectionHeader
                title="Rewards & Credits"
                subtitle="Applied by the server — final balance confirmed at payment"
              />
              <div className="space-y-4 px-5 py-4">
                {recentlyRedeemed && (
                  <p className="rounded-xl border border-(--color-gold-200) bg-(--color-gold-50) px-3 py-2.5 text-xs text-(--color-gold-700)">
                    ✨ You recently redeemed points. Your balance reflects that.
                  </p>
                )}
                {loyaltyBalance > 0 && loyaltyAccountId && (
                  <RewardsRedeem
                    balance={loyaltyBalance}
                    accountId={loyaltyAccountId}
                    subtotalCents={subtotalCents}
                    onChange={setLoyaltyIntent}
                  />
                )}
                <CreditsSection
                  credits={credits}
                  creditsLoading={creditsLoading}
                  creditsError={creditsError}
                  creditsAvailableCents={creditsAvailableCents}
                  selectedCredit={selectedCredit}
                  onSelectCredit={(id) => setSelectedCredit(id)}
                  onRemoveCredit={() => setSelectedCredit(null)}
                  onRetry={() => void loadCredits()}
                />
              </div>
            </SectionCard>
          )}

          {/* SECTION 6: PAYMENT CTA
           *
           * Three mutually exclusive states:
           *
           *   Normal (idle / initiating):
           *     CheckoutButton visible, OTP modal absent.
           *
           *   Challenge (otp_required / retrying):
           *     CheckoutChallengeModal visible, CheckoutButton unmounted.
           *     Modal receives `challengeEmail` — frozen at OTP trigger —
           *     not the live `guestEmail` form state.
           *     key={otpChallenge.nonce} forces remount on fresh challenge.
           *
           *   Blocked:
           *     BlockedOrderCard visible, both button and modal absent.
           */}
          <SectionCard
            index={isGuest ? 4 : 5}
            className="border-(--color-ember-200) bg-linear-to-b from-white to-(--color-cream-50)"
          >
            <div className="px-5 py-5 space-y-3">
              {/* OTP challenge */}
              <AnimatePresence>
                {showChallenge && otpChallenge && (
                  <motion.div
                    key="otp-challenge"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <CheckoutChallengeModal
                      key={otpChallenge.nonce}
                      nonce={otpChallenge.nonce}
                      expiresAt={otpChallenge.expiresAt}
                      userId={isAuthenticated && user?.id ? user.id : null}
                      // [FIX] Pass the frozen email captured at OTP challenge start,
                      // not the live form state. Prevents identity hash divergence
                      // if the user edits the email field while the modal is open.
                      guestEmail={challengeEmail}
                      onToken={(token) => void retryWithToken(token)}
                      onExpired={() => reset()}
                    />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Blocked */}
              <AnimatePresence>
                {showBlocked && (
                  <motion.div
                    key="blocked"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <BlockedOrderCard onReset={reset} />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Normal checkout button — unmounted during challenge and blocked */}
              {!showChallenge && !showBlocked && (
                <CheckoutButton
                  onCheckout={handleCheckout}
                  isLoading={isLoading}
                  disabled={!hasItems}
                />
              )}

              {routerError && !showChallenge && !showBlocked && (
                <p className="text-sm text-center font-medium text-(--color-error)" role="alert">
                  {routerError}
                </p>
              )}

              <p className="text-center text-[11px] text-(--color-ink-300)">
                🔒 Secure payment via Stripe — card details never stored on our servers
              </p>
            </div>
          </SectionCard>

          {/* GUEST: POST-CTA NUDGE */}
          {isGuest && (
            <motion.div custom={5} variants={fadeUp} initial="hidden" animate="visible">
              <GuestPostCheckoutNudge email={guestEmail} />
            </motion.div>
          )}

          <motion.div custom={6} variants={fadeUp} initial="hidden" animate="visible">
            <div className="px-1 py-2 text-center">
              <p className="text-xs text-(--color-ink-400)">
                Need help?{' '}
                <a
                  href="mailto:sofisrestaurante@gmail.com"
                  className="underline hover:text-(--color-ink-700)"
                >
                  Email us
                </a>
                {' · '}
                <Link to="/contact" className="underline hover:text-(--color-ink-700)">
                  Contact form
                </Link>
                {isAuthenticated && (
                  <>
                    {' · '}
                    <Link to="/account/orders" className="underline hover:text-(--color-ink-700)">
                      Order history
                    </Link>
                  </>
                )}
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </main>
  );
}