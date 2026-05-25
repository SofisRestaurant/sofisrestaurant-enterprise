// src/pages/Account/AccountHome.tsx
// ============================================================================
// ACCOUNT HOME — Sofi's Rewards Dashboard (2026)
// ============================================================================
// Redesign pillars:
//   - "Earn meals & merch" replaces abstract points language
//   - iOS-style frosted layered cards with warm restaurant palette
//   - Mobile-first: every section stacks cleanly, touch targets ≥44px
//   - Tier progress shows tangible reward milestones
//   - QR card is the hero — scan-to-earn at the counter
//   - No new dependencies, no framer-motion, CSS-only micro-interactions
//   - All business logic, edge function contract, types preserved exactly
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { QRCodeCanvas, QRCodeSVG } from 'qrcode.react';

import type { Database } from '@/types/supabase';
import { useUserContext } from '@/contexts/useUserContext';
import { supabase } from '@/lib/supabase/supabaseClient';
import { invokeEdge } from '@/lib/supabase/invoke';

import {
  LOYALTY_TIERS,
  TIER_ORDER,
  getNextTier,
  asTier,
  type LoyaltyTier,
} from '@/domain/loyalty/tiers';
import { getEarnedLoyaltyRewardsCount } from '@/domain/loyalty/rewards';
import { CustomerRewardsCard } from '@/features/loyalty/components/CustomerRewardsCard';
import type { LoyaltyProfile } from '@/modules/checkout/api/checkout.api';

// ── Types ────────────────────────────────────────────────────────────────────

type LedgerMeta = Database['public']['Tables']['loyalty_ledger']['Row']['metadata'];

type LoyaltyTransactionType = 'earned' | 'redeemed' | 'bonus' | 'expired' | 'adjusted';

type LoyaltyTransaction = {
  id: string;
  transaction_type: LoyaltyTransactionType;
  points_delta: number;
  points_balance: number;
  tier_at_time: string;
  streak_at_time: number;
  tier_multiplier: number;
  streak_multiplier: number;
  created_at: string;
  metadata: LedgerMeta | null;
  source: string;
  reference_id: string | null;
};

interface LoyaltyProfileWithQR extends LoyaltyProfile {
  loyaltyPublicId: string | null;
  fullName: string | null;
}

type LoyaltyAccountEdgeResp = {
  ok?: boolean;
  meta?: { requestId?: string; ts?: string };
  account?: {
    id?: string;
    balance?: number;
    lifetime_earned?: number;
    tier?: string;
    streak?: number;
    status?: string;
    last_activity?: string | null;
    last_award_at?: string | null;
    last_redeem_at?: string | null;
    updated_at?: string | null;
  } | null;
  profile?: {
    loyalty_public_id?: string | null;
    full_name?: string | null;
  } | null;
  ledger?: Array<{
    id?: string;
    entry_type?: string;
    amount?: number;
    balance_after?: number;
    tier_at_time?: string;
    streak_at_time?: number;
    created_at?: string;
    metadata?: LedgerMeta | null;
    source?: string;
    reference_id?: string | null;
  }>;
  error?: unknown;
  code?: unknown;
};

// ── Safe data helpers ────────────────────────────────────────────────────────

function safeStr(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function safeNum(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function safeIso(value: unknown): string {
  const candidate = safeStr(value, '');
  return candidate.length > 0 && !Number.isNaN(Date.parse(candidate))
    ? candidate
    : new Date().toISOString();
}

function safeId(value: unknown): string {
  const candidate = safeStr(value, '').trim();
  if (candidate.length > 0) return candidate;
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    return crypto.randomUUID();
  return `tx-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

// ── Tier math ────────────────────────────────────────────────────────────────

function getTierFloorPoints(tier: LoyaltyTier): number {
  const tierIndex = TIER_ORDER.indexOf(tier);
  if (tierIndex <= 0) return 0;
  const previousTier = TIER_ORDER[tierIndex - 1];
  const previousConfig = LOYALTY_TIERS[previousTier];
  return typeof previousConfig.threshold === 'number' ? previousConfig.threshold : 0;
}

function getTierThresholdPoints(tier: LoyaltyTier): number | null {
  const config = LOYALTY_TIERS[tier];
  return typeof config.threshold === 'number' ? config.threshold : null;
}

// ── Display helpers ──────────────────────────────────────────────────────────

const fmt = (value: number): string => value.toLocaleString();

function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

function mapEntryType(raw: unknown): LoyaltyTransactionType {
  const normalized = typeof raw === 'string' ? raw.toLowerCase() : '';
  if (normalized === 'earn' || normalized === 'earned') return 'earned';
  if (
    normalized === 'redeem' ||
    normalized === 'redeemed' ||
    normalized === 'reward_redeem' ||
    normalized === 'checkout_reserve'
  ) {
    return 'redeemed';
  }
  if (normalized === 'bonus') return 'bonus';
  if (normalized === 'expired') return 'expired';
  return 'adjusted';
}

function streakLabel(streak: number): string {
  if (streak >= 30) return 'Legendary';
  if (streak >= 14) return 'On fire';
  if (streak >= 7) return 'Regular';
  if (streak >= 3) return 'Heating up';
  if (streak >= 1) return 'Started';
  return 'Not started';
}

function buildTransactions(ledger: LoyaltyAccountEdgeResp['ledger']): LoyaltyTransaction[] {
  const rows = Array.isArray(ledger) ? ledger : [];
  return rows.map((row) => {
    const entryType = mapEntryType(row.entry_type);
    const tierAtTime = safeStr(row.tier_at_time, 'bronze');
    const tierMultiplier = LOYALTY_TIERS[asTier(tierAtTime)]?.multiplier ?? 1;
    return {
      id: safeId(row.id),
      transaction_type: entryType,
      points_delta: safeNum(row.amount, 0),
      points_balance: safeNum(row.balance_after, 0),
      tier_at_time: tierAtTime,
      streak_at_time: safeNum(row.streak_at_time, 0),
      tier_multiplier: tierMultiplier,
      streak_multiplier: 1,
      created_at: safeIso(row.created_at),
      metadata: row.metadata ?? null,
      source: safeStr(row.source, 'unknown'),
      reference_id: typeof row.reference_id === 'string' ? row.reference_id : null,
    };
  });
}

// ── Shared card surface ──────────────────────────────────────────────────────

const CARD = cx(
  'rounded-[1.25rem] border border-white/60',
  'bg-white/72 shadow-[0_2px_20px_rgba(80,40,20,0.05)]',
  'backdrop-blur-2xl',
  'dark:border-white/10 dark:bg-white/[0.06] dark:shadow-[0_2px_28px_rgba(0,0,0,0.3)]',
);

// ── Loading skeleton ─────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-4 animate-pulse" role="status" aria-label="Loading rewards">
      <div className="h-48 rounded-[1.25rem] bg-[var(--color-cream-100)]" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-[5.5rem] rounded-[1.15rem] bg-[var(--color-cream-100)]" />
        ))}
      </div>
      <div className="h-32 rounded-[1.25rem] bg-[var(--color-cream-100)]" />
      <div className="h-56 rounded-[1.25rem] bg-[var(--color-cream-100)]" />
    </div>
  );
}

// ── Stat pill ────────────────────────────────────────────────────────────────

function StatPill({
  label,
  value,
  sub,
  accent = false,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div
      className={cx(
        'rounded-[1.15rem] border p-4 transition-all',
        accent
          ? 'border-[var(--color-ember-200)] bg-gradient-to-br from-[var(--color-ember-50)] to-white'
          : 'border-black/[0.04] bg-white/50 dark:border-white/[0.06] dark:bg-white/[0.04]',
      )}
    >
      <p
        className="text-[10px] font-semibold uppercase tracking-[0.14em]"
        style={{ color: 'var(--color-ink-400)' }}
      >
        {label}
      </p>
      <p
        className="mt-1.5 text-[1.35rem] font-bold tabular-nums leading-none tracking-tight"
        style={{ color: 'var(--color-ink-900)' }}
      >
        {value}
      </p>
      {sub && (
        <p className="mt-2 text-[11.5px] font-medium" style={{ color: 'var(--color-ink-500)' }}>
          {sub}
        </p>
      )}
    </div>
  );
}

// ── QR Card ──────────────────────────────────────────────────────────────────

function LoyaltyQRCard({
  loyaltyPublicId,
  tier,
  name,
}: {
  loyaltyPublicId: string;
  tier: LoyaltyTier;
  name: string | null | undefined;
}) {
  const config = LOYALTY_TIERS[tier];
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [copied, setCopied] = useState(false);

  const displayName = useMemo(() => {
    if (!name) return 'Member';
    const handle = name.split('@')[0]?.trim();
    return handle && handle.length > 0 ? handle : 'Member';
  }, [name]);

  const shortId = useMemo(
    () =>
      `${loyaltyPublicId.slice(0, 6).toUpperCase()}\u2009\u00B7\u2009${loyaltyPublicId.slice(-4).toUpperCase()}`,
    [loyaltyPublicId],
  );

  const handleCopy = useCallback(async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(loyaltyPublicId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  }, [loyaltyPublicId]);

  const handleDownload = useCallback((): void => {
    const canvas = canvasRef.current?.querySelector('canvas');
    if (!(canvas instanceof HTMLCanvasElement)) return;
    const link = document.createElement('a');
    link.download = `sofis-rewards-${loyaltyPublicId.slice(0, 8)}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }, [loyaltyPublicId]);

  return (
    <section className={cx(CARD, 'overflow-hidden')}>
      {/* Tier gradient banner */}
      <div className={`bg-linear-to-br ${config.gradient} px-5 py-5 text-white sm:px-6`}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/65">
              Sofi's Rewards
            </p>
            <h2
              className="mt-1.5 truncate text-xl font-bold tracking-tight"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {displayName}
            </h2>
            <p className="mt-1 text-[12.5px] font-medium text-white/70">
              Show this QR at the counter to earn rewards.
            </p>
          </div>

          <div className="shrink-0 rounded-2xl bg-white/15 px-3 py-2 text-center ring-1 ring-white/20 backdrop-blur-sm">
            <div className="text-2xl leading-none">{config.icon}</div>
            <div className="mt-1 text-[10px] font-bold uppercase tracking-wide text-white/80">
              {config.label}
            </div>
          </div>
        </div>
      </div>

      {/* QR + actions */}
      <div className="grid gap-5 px-5 py-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:px-6">
        <div className="flex justify-center sm:justify-start">
          <div
            className={cx(
              'rounded-[1.25rem] border-2 bg-white p-3',
              config.colors.border,
              'shadow-[0_4px_20px_rgba(80,40,20,0.08)]',
            )}
          >
            <QRCodeSVG
              value={loyaltyPublicId}
              size={164}
              fgColor={config.qr.fg}
              bgColor={config.qr.bg}
              level="H"
            />
          </div>

          {/* Hidden canvas for PNG download */}
          <div ref={canvasRef} className="hidden" aria-hidden>
            <QRCodeCanvas
              value={loyaltyPublicId}
              size={420}
              fgColor={config.qr.fg}
              bgColor={config.qr.bg}
              level="H"
              includeMargin
            />
          </div>
        </div>

        <div className="min-w-0 text-center sm:text-left">
          <p className="text-[14px] font-bold" style={{ color: 'var(--color-ink-900)' }}>
            Your loyalty card
          </p>
          <p className="mt-1 text-[13px] leading-relaxed" style={{ color: 'var(--color-ink-500)' }}>
            Staff will scan this to credit your account instantly.
          </p>

          {/* Member ID chip */}
          <div
            className="mt-3 inline-flex items-center gap-2 rounded-xl px-3 py-2"
            style={{ background: 'var(--color-cream-100)' }}
          >
            <span
              className="text-[10px] font-semibold uppercase tracking-[0.12em]"
              style={{ color: 'var(--color-ink-400)' }}
            >
              ID
            </span>
            <span
              className="select-all font-mono text-[12px] font-semibold"
              style={{ color: 'var(--color-ink-700)' }}
            >
              {shortId}
            </span>
          </div>

          {/* Actions */}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                void handleCopy();
              }}
              className={cx(
                'inline-flex h-10 items-center justify-center rounded-xl',
                'border border-[var(--color-cream-300)] bg-white text-[12.5px] font-semibold',
                'text-[var(--color-ink-800)] transition-all',
                'hover:border-[var(--color-ink-200)] hover:bg-[var(--color-cream-100)]',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-400)]',
                'active:scale-[0.97]',
              )}
            >
              {copied ? '✓ Copied' : 'Copy ID'}
            </button>

            <button
              type="button"
              onClick={handleDownload}
              className={cx(
                'inline-flex h-10 items-center justify-center rounded-xl',
                'bg-[var(--color-ink-900)] text-[12.5px] font-semibold text-white',
                'transition-all hover:bg-black',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-400)]',
                'active:scale-[0.97]',
              )}
            >
              Save QR
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Transaction row ──────────────────────────────────────────────────────────

const TX_LABELS: Record<LoyaltyTransactionType, string> = {
  earned: 'Earned',
  redeemed: 'Redeemed',
  bonus: 'Bonus',
  expired: 'Expired',
  adjusted: 'Adjusted',
};

const TX_ICONS: Record<LoyaltyTransactionType, string> = {
  earned: '↑',
  redeemed: '↓',
  bonus: '★',
  expired: '○',
  adjusted: '~',
};

function TransactionRow({ tx }: { tx: LoyaltyTransaction }) {
  const isPositive = tx.points_delta > 0;

  const date = new Date(tx.created_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="flex items-center justify-between gap-3 py-3.5">
      <div className="flex min-w-0 items-center gap-3">
        <div
          className={cx(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[12px] font-bold',
            isPositive
              ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400'
              : 'bg-red-50 text-red-500 dark:bg-red-900/20 dark:text-red-400',
          )}
        >
          {TX_ICONS[tx.transaction_type]}
        </div>

        <div className="min-w-0">
          <p
            className="truncate text-[13.5px] font-semibold"
            style={{ color: 'var(--color-ink-900)' }}
          >
            {TX_LABELS[tx.transaction_type]}
          </p>
          <div
            className="mt-0.5 flex items-center gap-1.5 text-[11.5px]"
            style={{ color: 'var(--color-ink-400)' }}
          >
            <span>{date}</span>
            {tx.reference_id && (
              <>
                <span style={{ color: 'var(--color-cream-300)' }}>·</span>
                <span className="truncate font-mono">
                  #{tx.reference_id.slice(0, 8).toUpperCase()}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="shrink-0 text-right">
        <p
          className={cx(
            'text-[13.5px] font-bold tabular-nums',
            isPositive ? 'text-emerald-600' : 'text-red-500',
          )}
        >
          {isPositive ? '+' : ''}
          {fmt(tx.points_delta)} pts
        </p>
        <p className="text-[11px] font-medium" style={{ color: 'var(--color-ink-400)' }}>
          {fmt(tx.points_balance)} bal
        </p>
      </div>
    </div>
  );
}

// ── Streak badge ─────────────────────────────────────────────────────────────

function StreakBadge({ streak }: { streak: number }) {
  const flames = streak >= 30 ? '🔥🔥🔥' : streak >= 14 ? '🔥🔥' : streak >= 3 ? '🔥' : '';

  return (
    <div
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1',
        'text-[11px] font-semibold',
        streak >= 14
          ? 'border-[var(--color-ember-200)] bg-[var(--color-ember-50)] text-[var(--color-ember-700)]'
          : streak >= 3
            ? 'border-amber-200 bg-amber-50 text-amber-700'
            : 'border-[var(--color-cream-300)] bg-[var(--color-cream-100)] text-[var(--color-ink-500)]',
      )}
    >
      {flames && <span aria-hidden>{flames}</span>}
      {streakLabel(streak)}
    </div>
  );
}

// ── Data hook (preserved exactly) ────────────────────────────────────────────

function useLoyaltyData() {
  const [profile, setProfile] = useState<LoyaltyProfileWithQR | null>(null);
  const [transactions, setTransactions] = useState<LoyaltyTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cancelledRef = useRef(false);

  const load = useCallback(async (soft = false): Promise<void> => {
    cancelledRef.current = false;

    const setSafe = (callback: () => void): void => {
      if (!cancelledRef.current) callback();
    };

    setSafe(() => {
      if (!soft) setLoading(true);
      setRefreshing(soft);
      setError(null);
    });

    try {
      const sessionResult = await supabase.auth.getSession();
      const token = sessionResult.data.session?.access_token ?? null;

      if (token === null) {
        setSafe(() => {
          setProfile(null);
          setTransactions([]);
        });
        return;
      }

      const requestId =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `req-${Date.now()}`;

      const response = await invokeEdge<LoyaltyAccountEdgeResp>(
        'loyalty-account',
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'x-request-id': requestId,
          },
        },
      );

      if (response.ok !== true) {
        setSafe(() => setError('Unable to load loyalty data.'));
        return;
      }

      const account = response.account ?? null;
      const responseProfile = response.profile ?? null;

      if (account === null) {
        setSafe(() => {
          setProfile({
            points: 0,
            lifetimePoints: 0,
            tier: 'bronze',
            streak: 0,
            lastOrderDate: null,
            loyaltyPublicId: responseProfile?.loyalty_public_id ?? null,
            fullName: responseProfile?.full_name ?? null,
          });
          setTransactions([]);
        });
        return;
      }

      const tier = account.tier ? asTier(account.tier) : 'bronze';

      setSafe(() => {
        setProfile({
          points: safeNum(account.balance, 0),
          lifetimePoints: safeNum(account.lifetime_earned, 0),
          tier,
          streak: safeNum(account.streak, 0),
          lastOrderDate: account.last_activity ?? null,
          loyaltyPublicId: responseProfile?.loyalty_public_id ?? null,
          fullName: responseProfile?.full_name ?? null,
        });
        setTransactions(buildTransactions(response.ledger));
      });
    } catch (loadError: unknown) {
      setSafe(() => setError(getErrorMessage(loadError, 'Unable to load loyalty data.')));
    } finally {
      setSafe(() => {
        setLoading(false);
        setRefreshing(false);
      });
    }
  }, []);

  useEffect(() => {
    void load(false);
    return () => {
      cancelledRef.current = true;
    };
  }, [load]);

  const refresh = useCallback(async (): Promise<void> => {
    await load(true);
  }, [load]);

  return { profile, transactions, loading, refreshing, error, refresh };
}

// ── Main component ───────────────────────────────────────────────────────────

export default function AccountHome() {
  const { user } = useUserContext();
  const { profile, transactions, loading, refreshing, error, refresh } = useLoyaltyData();

  const email = user?.email ?? null;
  const nextTier = profile ? getNextTier(profile.tier) : null;
  const nextTierConfig = nextTier ? LOYALTY_TIERS[nextTier] : null;
  const currentTierConfig = profile ? LOYALTY_TIERS[profile.tier] : null;

  const progressToNextTier = useMemo(() => {
    if (profile === null || nextTier === null || nextTierConfig === null) return null;

    const currentFloor = getTierFloorPoints(profile.tier);
    const nextFloor = getTierThresholdPoints(nextTier);
    if (nextFloor === null) return null;

    const earnedWithinBand = Math.max(profile.lifetimePoints - currentFloor, 0);
    const bandSize = Math.max(nextFloor - currentFloor, 1);

    return {
      remaining: Math.max(nextFloor - profile.lifetimePoints, 0),
      percent: Math.min((earnedWithinBand / bandSize) * 100, 100),
      nextLabel: nextTierConfig.label,
      nextIcon: nextTierConfig.icon,
    };
  }, [nextTier, nextTierConfig, profile]);

  const firstName = useMemo(() => {
    const raw = profile?.fullName ?? user?.name ?? email ?? '';
    const clean = raw.split('@')[0]?.trim();
    if (!clean) return 'there';
    return clean.split(' ')[0] ?? clean;
  }, [email, profile?.fullName, user?.name]);

  const earnedCount = profile ? getEarnedLoyaltyRewardsCount(profile.points) : 0;

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 px-0 sm:space-y-6">
      {/* ── Hero header ──────────────────────────────────────────────────── */}
      <section
        className={cx(
          CARD,
          'overflow-hidden',
          'bg-gradient-to-br from-white via-[var(--color-cream-100)]/50 to-white',
        )}
      >
        <div className="px-5 py-6 sm:px-6 sm:py-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p
                className="text-[10px] font-semibold uppercase tracking-[0.16em]"
                style={{ color: 'var(--color-ember-600)' }}
              >
                My Rewards
              </p>

              <h1
                className="mt-2 text-[1.6rem] font-bold tracking-tight sm:text-[1.85rem]"
                style={{ fontFamily: 'var(--font-display)', color: 'var(--color-ink-900)' }}
              >
                Welcome back, {firstName}
              </h1>

              <p
                className="mt-2 max-w-lg text-[13.5px] leading-relaxed"
                style={{ color: 'var(--color-ink-500)' }}
              >
                Earn free meals and exclusive merch every time you dine with us.
                {profile && earnedCount > 0 && (
                  <>
                    {' '}
                    You've unlocked {earnedCount} reward{earnedCount > 1 ? 's' : ''} so far.
                  </>
                )}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {profile && currentTierConfig && (
                <span
                  className={cx(
                    'inline-flex items-center gap-1 rounded-full border px-3 py-1.5',
                    'text-[12px] font-bold',
                    currentTierConfig.badge,
                  )}
                >
                  {currentTierConfig.icon} {currentTierConfig.label}
                </span>
              )}

              <button
                type="button"
                onClick={() => {
                  void refresh();
                }}
                disabled={refreshing}
                className={cx(
                  'inline-flex h-9 items-center justify-center rounded-full',
                  'border border-[var(--color-cream-300)] bg-white/80 backdrop-blur-md',
                  'px-3.5 text-[12px] font-semibold text-[var(--color-ink-700)]',
                  'transition-all hover:border-[var(--color-ink-200)] hover:bg-white',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-400)]',
                  'active:scale-[0.97]',
                  refreshing && 'pointer-events-none opacity-50',
                )}
              >
                {refreshing ? 'Refreshing\u2026' : 'Refresh'}
              </button>
            </div>
          </div>

          {/* Identity chips */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span
              className="rounded-full px-3 py-1 text-[11.5px] font-medium ring-1 ring-[var(--color-cream-300)]"
              style={{
                color: 'var(--color-ink-500)',
                background: 'rgba(255,255,255,0.7)',
              }}
            >
              {email ?? 'Signed in'}
            </span>

            <span
              className="rounded-full px-3 py-1 text-[11.5px] font-medium capitalize ring-1 ring-[var(--color-cream-300)]"
              style={{
                color: 'var(--color-ink-500)',
                background: 'rgba(255,255,255,0.7)',
              }}
            >
              {String(user?.role ?? 'member')}
            </span>
          </div>
        </div>
      </section>

      {/* ── Loading ──────────────────────────────────────────────────────── */}
      {loading && <LoadingSkeleton />}

      {/* ── Error ────────────────────────────────────────────────────────── */}
      {error && (
        <section className={cx(CARD, 'border-red-200/60 px-5 py-5')}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[14px] font-bold text-red-800">Rewards could not load</p>
              <p className="mt-1 text-[13px] text-red-700">{error}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                void refresh();
              }}
              className={cx(
                'inline-flex h-10 items-center justify-center rounded-xl',
                'bg-red-600 px-4 text-[12.5px] font-semibold text-white',
                'transition-all hover:bg-red-700',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400',
                'active:scale-[0.97]',
              )}
            >
              Try again
            </button>
          </div>
        </section>
      )}

      {/* ── No profile: onboarding ───────────────────────────────────────── */}
      {!loading && !error && !profile && (
        <section className={cx(CARD, 'px-5 py-10 text-center sm:px-6')}>
          <div className="mx-auto max-w-sm">
            <p className="text-4xl" aria-hidden>
              🍽
            </p>
            <h2
              className="mt-4 text-xl font-bold tracking-tight"
              style={{ fontFamily: 'var(--font-display)', color: 'var(--color-ink-900)' }}
            >
              Start earning free meals
            </h2>
            <p
              className="mt-2 text-[13.5px] leading-relaxed"
              style={{ color: 'var(--color-ink-500)' }}
            >
              Place your first order and we'll set up your rewards account automatically. Every
              dollar you spend brings you closer to free dishes and exclusive merch.
            </p>

            <Link
              to="/menu"
              className={cx(
                'mt-6 inline-flex h-12 items-center justify-center rounded-2xl',
                'bg-[var(--color-ink-900)] px-7 text-[14px] font-semibold text-white',
                'transition-all hover:bg-black',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-400)]',
                'active:scale-[0.97]',
              )}
            >
              Browse the menu
            </Link>
          </div>
        </section>
      )}

      {/* ── Main dashboard ───────────────────────────────────────────────── */}
      {!loading && !error && profile && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start">
          {/* Left column */}
          <div className="min-w-0 space-y-5">
            {/* QR Card */}
            {profile.loyaltyPublicId ? (
              <LoyaltyQRCard
                loyaltyPublicId={profile.loyaltyPublicId}
                tier={profile.tier}
                name={profile.fullName ?? email}
              />
            ) : (
              <section className={cx(CARD, 'border-amber-200/60 px-5 py-5')}>
                <p className="text-[14px] font-bold text-amber-900">QR card not ready yet</p>
                <p className="mt-1 text-[13px] text-amber-800">
                  Tap refresh. Your loyalty card should appear once it has been generated.
                </p>
              </section>
            )}

            {/* Stats row */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <StatPill
                label="Available"
                value={
                  <>
                    {fmt(profile.points)}{' '}
                    <span
                      className="text-[13px] font-semibold"
                      style={{ color: 'var(--color-ink-400)' }}
                    >
                      pts
                    </span>
                  </>
                }
                sub="Redeem toward meals & merch"
                accent
              />

              <StatPill
                label="Visit streak"
                value={
                  <>
                    {profile.streak}
                    <span
                      className="ml-1 text-[13px] font-semibold"
                      style={{ color: 'var(--color-ink-400)' }}
                    >
                      days
                    </span>
                  </>
                }
                sub={<StreakBadge streak={profile.streak} />}
              />

              <div className="col-span-2 sm:col-span-1">
                <StatPill
                  label="Lifetime earned"
                  value={fmt(profile.lifetimePoints)}
                  sub="Total points earned all time"
                />
              </div>
            </div>

            {/* Reward redemption */}
            <CustomerRewardsCard
              balance={profile.points}
              onBalanceChange={() => {
                void refresh();
              }}
            />

            {/* Tier progress */}
            {progressToNextTier ? (
              <section className={cx(CARD, 'px-5 py-5 sm:px-6')}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p
                      className="text-[10px] font-semibold uppercase tracking-[0.14em]"
                      style={{ color: 'var(--color-ink-400)' }}
                    >
                      Next tier
                    </p>
                    <h2
                      className="mt-1 text-[15px] font-bold"
                      style={{ color: 'var(--color-ink-900)' }}
                    >
                      {progressToNextTier.nextIcon} {progressToNextTier.nextLabel}
                    </h2>
                    <p className="mt-1 text-[13px]" style={{ color: 'var(--color-ink-500)' }}>
                      {fmt(progressToNextTier.remaining)} lifetime points to go
                    </p>
                  </div>

                  <Link
                    to="/account/orders"
                    className={cx(
                      'inline-flex h-9 items-center justify-center rounded-xl',
                      'border border-[var(--color-cream-300)] bg-white/80',
                      'px-4 text-[12px] font-semibold text-[var(--color-ink-700)]',
                      'transition-all hover:bg-white',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-400)]',
                      'active:scale-[0.97]',
                    )}
                  >
                    View orders
                  </Link>
                </div>

                <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--color-cream-200)]">
                  <div
                    className="h-full rounded-full bg-[var(--color-ember-500)] transition-all duration-500"
                    style={{ width: `${progressToNextTier.percent}%` }}
                    role="progressbar"
                    aria-valuenow={Math.round(progressToNextTier.percent)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${Math.round(progressToNextTier.percent)}% progress to ${progressToNextTier.nextLabel}`}
                  />
                </div>
              </section>
            ) : (
              <section className={cx(CARD, 'px-5 py-5 sm:px-6')}>
                <p className="text-[14px] font-bold" style={{ color: 'var(--color-ink-900)' }}>
                  Top tier status ✦
                </p>
                <p className="mt-1 text-[13px]" style={{ color: 'var(--color-ink-500)' }}>
                  You're at the highest rewards tier. Enjoy maximum earning on every visit.
                </p>
              </section>
            )}

            {/* Activity feed */}
            <section className={cx(CARD, 'overflow-hidden')}>
              <div
                className="flex items-center justify-between border-b px-5 py-4 sm:px-6"
                style={{ borderColor: 'rgba(0,0,0,0.04)' }}
              >
                <div>
                  <h2 className="text-[14px] font-bold" style={{ color: 'var(--color-ink-900)' }}>
                    Recent activity
                  </h2>
                  <p className="mt-0.5 text-[11.5px]" style={{ color: 'var(--color-ink-400)' }}>
                    Your latest rewards updates
                  </p>
                </div>

                <Link
                  to="/account/orders"
                  className={cx(
                    'text-[12px] font-semibold transition-colors',
                    'text-[var(--color-ink-500)] hover:text-[var(--color-ink-900)]',
                  )}
                >
                  All orders
                </Link>
              </div>

              {transactions.length > 0 ? (
                <div
                  className="divide-y px-5 sm:px-6"
                  style={{ divideColor: 'rgba(0,0,0,0.03)' } as React.CSSProperties}
                >
                  {transactions.slice(0, 6).map((tx) => (
                    <TransactionRow key={tx.id} tx={tx} />
                  ))}
                </div>
              ) : (
                <div className="px-5 py-10 text-center sm:px-6">
                  <p className="text-3xl" aria-hidden>
                    📋
                  </p>
                  <p
                    className="mt-3 text-[13.5px] font-semibold"
                    style={{ color: 'var(--color-ink-500)' }}
                  >
                    No rewards activity yet
                  </p>

                  <Link
                    to="/menu"
                    className={cx(
                      'mt-4 inline-flex h-10 items-center justify-center rounded-xl',
                      'bg-[var(--color-ink-900)] px-5 text-[12.5px] font-semibold text-white',
                      'transition-all hover:bg-black',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-400)]',
                      'active:scale-[0.97]',
                    )}
                  >
                    Place your first order
                  </Link>
                </div>
              )}
            </section>
          </div>

          {/* ── Right sidebar ────────────────────────────────────────────── */}
          <aside className="min-w-0 space-y-4 lg:sticky lg:top-20">
            {/* Quick actions */}
            <section className={cx(CARD, 'px-5 py-5')}>
              <p
                className="text-[10px] font-semibold uppercase tracking-[0.14em]"
                style={{ color: 'var(--color-ink-400)' }}
              >
                Quick actions
              </p>

              <div className="mt-3 grid gap-2">
                <Link
                  to="/menu"
                  className={cx(
                    'group flex items-center justify-between rounded-[0.85rem]',
                    'border border-black/[0.04] bg-white/50 px-4 py-3.5',
                    'text-[13.5px] font-semibold transition-all',
                    'text-[var(--color-ink-900)] hover:bg-[var(--color-cream-100)]',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-400)]',
                    'active:scale-[0.99]',
                  )}
                >
                  Order again
                  <span
                    className="text-[var(--color-ink-400)] transition-transform group-hover:translate-x-0.5"
                    aria-hidden
                  >
                    ›
                  </span>
                </Link>

                <Link
                  to="/account/orders"
                  className={cx(
                    'group flex items-center justify-between rounded-[0.85rem]',
                    'border border-black/[0.04] bg-white/50 px-4 py-3.5',
                    'text-[13.5px] font-semibold transition-all',
                    'text-[var(--color-ink-900)] hover:bg-[var(--color-cream-100)]',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-400)]',
                    'active:scale-[0.99]',
                  )}
                >
                  View orders
                  <span
                    className="text-[var(--color-ink-400)] transition-transform group-hover:translate-x-0.5"
                    aria-hidden
                  >
                    ›
                  </span>
                </Link>

                <Link
                  to="/account/edit"
                  className={cx(
                    'group flex items-center justify-between rounded-[0.85rem]',
                    'border border-black/[0.04] bg-white/50 px-4 py-3.5',
                    'text-[13.5px] font-semibold transition-all',
                    'text-[var(--color-ink-900)] hover:bg-[var(--color-cream-100)]',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-400)]',
                    'active:scale-[0.99]',
                  )}
                >
                  Edit profile
                  <span
                    className="text-[var(--color-ink-400)] transition-transform group-hover:translate-x-0.5"
                    aria-hidden
                  >
                    ›
                  </span>
                </Link>
              </div>
            </section>

            {/* How rewards work */}
            <details className={cx(CARD, 'group')}>
              <summary
                className={cx(
                  'flex cursor-pointer select-none items-center justify-between',
                  'px-5 py-4 text-[13.5px] font-bold',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold-400)] focus-visible:rounded-[1.25rem]',
                )}
                style={{ color: 'var(--color-ink-900)' }}
              >
                <span>How rewards work</span>
                <span
                  className="text-[var(--color-ink-400)] transition-transform group-open:rotate-180"
                  aria-hidden
                >
                  ⌄
                </span>
              </summary>

              <div
                className="space-y-3 border-t px-5 py-4 text-[13px] leading-relaxed"
                style={{ borderColor: 'rgba(0,0,0,0.04)', color: 'var(--color-ink-500)' }}
              >
                <p>
                  <span className="font-bold" style={{ color: 'var(--color-ink-800)' }}>
                    Earn points:
                  </span>{' '}
                  1 point per $1 spent on every order.
                </p>

                <p>
                  <span className="font-bold" style={{ color: 'var(--color-ink-800)' }}>
                    Tier multipliers:
                  </span>{' '}
                  {TIER_ORDER.map(
                    (tierKey) =>
                      `${LOYALTY_TIERS[tierKey].label} ${LOYALTY_TIERS[tierKey].multiplier}x`,
                  ).join(' · ')}
                </p>

                <p>
                  <span className="font-bold" style={{ color: 'var(--color-ink-800)' }}>
                    Redeem for:
                  </span>{' '}
                  Free drinks, appetizers, entrees, and exclusive Sofi's merch.
                </p>

                {nextTierConfig ? (
                  <p>
                    <span className="font-bold" style={{ color: 'var(--color-ink-800)' }}>
                      Next tier:
                    </span>{' '}
                    {nextTierConfig.icon} {nextTierConfig.label}
                  </p>
                ) : (
                  <p>
                    <span className="font-bold" style={{ color: 'var(--color-ink-800)' }}>
                      Status:
                    </span>{' '}
                    You're at the top rewards tier.
                  </p>
                )}
              </div>
            </details>
          </aside>
        </div>
      )}
    </div>
  );
}