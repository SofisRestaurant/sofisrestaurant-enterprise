// src/pages/Account/AccountHome.tsx
// ============================================================================
// ACCOUNT HOME - Loyalty dashboard for Sofi's Restaurant
// ============================================================================
// Uses Edge Function `loyalty-account` as source of truth.
// Edge payload shape:
// { ok, meta, account, profile, ledger }
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
import type { LoyaltyProfile } from '@/modules/checkout/api/checkout.api';

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

function safeStr(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function safeNum(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
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

  if (candidate.length > 0) {
    return candidate;
  }

  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `tx-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function getTierFloorPoints(tier: LoyaltyTier): number {
  const tierIndex = TIER_ORDER.indexOf(tier);

  if (tierIndex <= 0) {
    return 0;
  }

  const previousTier = TIER_ORDER[tierIndex - 1];
  const previousConfig = LOYALTY_TIERS[previousTier];

  return typeof previousConfig.threshold === 'number' ? previousConfig.threshold : 0;
}

function getTierThresholdPoints(tier: LoyaltyTier): number | null {
  const config = LOYALTY_TIERS[tier];
  return typeof config.threshold === 'number' ? config.threshold : null;
}

const fmt = (value: number): string => value.toLocaleString();

function mapEntryType(raw: unknown): LoyaltyTransactionType {
  const normalized = typeof raw === 'string' ? raw.toLowerCase() : '';

  if (normalized === 'earn' || normalized === 'earned') {
    return 'earned';
  }

  if (normalized === 'redeem' || normalized === 'redeemed') {
    return 'redeemed';
  }

  if (normalized === 'bonus') {
    return 'bonus';
  }

  if (normalized === 'expired') {
    return 'expired';
  }

  return 'adjusted';
}

function streakLabel(streak: number): string {
  if (streak >= 30) return 'Legendary streak';
  if (streak >= 14) return 'On fire';
  if (streak >= 7) return 'Weekly regular';
  if (streak >= 3) return 'Heating up';
  if (streak >= 1) return 'Streak started';
  return 'Start your streak';
}

function streakBadgeClass(streak: number): string {
  if (streak >= 30) return 'text-red-700 bg-red-50 border-red-200';
  if (streak >= 14) return 'text-orange-700 bg-orange-50 border-orange-200';
  if (streak >= 7) return 'text-amber-700 bg-amber-50 border-amber-200';
  if (streak >= 3) return 'text-yellow-700 bg-yellow-50 border-yellow-200';

  return 'text-gray-600 bg-gray-50 border-gray-200';
}

function buildTransactions(ledger: LoyaltyAccountEdgeResp['ledger']): LoyaltyTransaction[] {
  const rows = Array.isArray(ledger) ? ledger : [];

  return rows.map((row) => {
    const entryType = mapEntryType(row.entry_type);
    const delta = safeNum(row.amount, 0);
    const tierAtTime = safeStr(row.tier_at_time, 'bronze');
    const tierMultiplier = LOYALTY_TIERS[asTier(tierAtTime)]?.multiplier ?? 1;

    return {
      id: safeId(row.id),
      transaction_type: entryType,
      points_delta: delta,
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

function LoadingSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-44 rounded-3xl bg-gray-100" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((item) => (
          <div key={item} className="h-24 rounded-2xl bg-gray-100" />
        ))}
      </div>
      <div className="h-28 rounded-2xl bg-gray-100" />
      <div className="h-52 rounded-2xl bg-gray-100" />
    </div>
  );
}

function AccountCard({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={[
        'w-full min-w-0 rounded-3xl border border-gray-100 bg-white shadow-sm',
        className,
      ].join(' ')}
    >
      {children}
    </section>
  );
}

function StatCard({
  label,
  value,
  helper,
  tone = 'default',
}: {
  label: string;
  value: React.ReactNode;
  helper?: React.ReactNode;
  tone?: 'default' | 'warm';
}) {
  return (
    <div
      className={[
        'rounded-2xl border p-4 shadow-sm',
        tone === 'warm'
          ? 'border-amber-100 bg-gradient-to-br from-amber-50 to-white'
          : 'border-gray-100 bg-white',
      ].join(' ')}
    >
      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
        {label}
      </div>
      <div className="mt-1 text-2xl font-black tabular-nums tracking-tight text-gray-950">
        {value}
      </div>
      {helper ? <div className="mt-2 text-xs font-medium text-gray-500">{helper}</div> : null}
    </div>
  );
}

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
      `${loyaltyPublicId.slice(0, 6).toUpperCase()}...${loyaltyPublicId.slice(-4).toUpperCase()}`,
    [loyaltyPublicId],
  );

  const handleCopy = useCallback(async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(loyaltyPublicId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard can be unavailable in some browsers.
    }
  }, [loyaltyPublicId]);

  const handleDownload = useCallback((): void => {
    const canvas = canvasRef.current?.querySelector('canvas');

    if (!(canvas instanceof HTMLCanvasElement)) {
      return;
    }

    const link = document.createElement('a');
    link.download = `sofis-loyalty-${loyaltyPublicId.slice(0, 8)}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }, [loyaltyPublicId]);

  return (
    <AccountCard className="overflow-hidden">
      <div className={`bg-linear-to-br ${config.gradient} px-5 py-4 text-white`}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/70">
              Sofi&apos;s Rewards
            </p>
            <h2 className="mt-1 truncate text-xl font-black tracking-tight">{displayName}</h2>
            <p className="mt-1 text-xs font-semibold text-white/75">
              Show your QR code when you visit.
            </p>
          </div>

          <div className="shrink-0 rounded-2xl bg-white/15 px-3 py-2 text-center ring-1 ring-white/20">
            <div className="text-2xl leading-none">{config.icon}</div>
            <div className="mt-1 text-[10px] font-black uppercase tracking-wide text-white/80">
              {config.label}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-5 px-5 py-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
        <div className="flex justify-center sm:justify-start">
          <div className={`rounded-3xl border-2 ${config.colors.border} bg-white p-3 shadow-sm`}>
            <QRCodeSVG
              value={loyaltyPublicId}
              size={168}
              fgColor={config.qr.fg}
              bgColor={config.qr.bg}
              level="H"
            />
          </div>

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
          <p className="text-sm font-bold text-gray-950">Your loyalty card is ready</p>
          <p className="mt-1 text-sm leading-6 text-gray-500">
            Use this at Sofi&apos;s so staff can quickly find your rewards account.
          </p>

          <div className="mt-3 rounded-2xl bg-gray-50 px-3 py-2">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-gray-400">
              Member ID
            </p>
            <p className="mt-0.5 select-all truncate font-mono text-xs font-semibold text-gray-700">
              {shortId}
            </p>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                void handleCopy();
              }}
              className="inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-black text-gray-800 transition hover:bg-gray-50 active:scale-95"
            >
              {copied ? 'Copied' : 'Copy ID'}
            </button>

            <button
              type="button"
              onClick={handleDownload}
              className="inline-flex items-center justify-center rounded-xl bg-gray-950 px-3 py-2 text-xs font-black text-white transition hover:bg-black active:scale-95"
            >
              Save QR
            </button>
          </div>
        </div>
      </div>
    </AccountCard>
  );
}

function TransactionRow({ tx }: { tx: LoyaltyTransaction }) {
  const isPositive = tx.points_delta > 0;

  const typeLabel: Record<LoyaltyTransactionType, string> = {
    earned: 'Points earned',
    redeemed: 'Points redeemed',
    bonus: 'Bonus awarded',
    expired: 'Points expired',
    adjusted: 'Account adjustment',
  };

  const typeIcon: Record<LoyaltyTransactionType, string> = {
    earned: '+',
    redeemed: '-',
    bonus: 'Gift',
    expired: 'Exp',
    adjusted: 'Edit',
  };

  const date = new Date(tx.created_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <div
          className={[
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-black',
            isPositive ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600',
          ].join(' ')}
        >
          {typeIcon[tx.transaction_type]}
        </div>

        <div className="min-w-0">
          <div className="truncate text-sm font-bold text-gray-950">
            {typeLabel[tx.transaction_type]}
          </div>
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-gray-400">
            <span>{date}</span>
            {tx.reference_id ? (
              <>
                <span className="text-gray-300">·</span>
                <span className="truncate font-mono">
                  #{tx.reference_id.slice(0, 8).toUpperCase()}
                </span>
              </>
            ) : null}
          </div>
        </div>
      </div>

      <div className="shrink-0 text-right">
        <div
          className={[
            'text-sm font-black tabular-nums',
            isPositive ? 'text-emerald-600' : 'text-red-500',
          ].join(' ')}
        >
          {isPositive ? '+' : '-'}
          {fmt(Math.abs(tx.points_delta))}
        </div>
        <div className="text-[11px] font-medium text-gray-400">{fmt(tx.points_balance)} bal.</div>
      </div>
    </div>
  );
}

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
      if (!cancelledRef.current) {
        callback();
      }
    };

    setSafe(() => {
      if (!soft) {
        setLoading(true);
      }

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

export default function AccountHome() {
  const { user } = useUserContext();
  const { profile, transactions, loading, refreshing, error, refresh } = useLoyaltyData();

  const email = user?.email ?? null;
  const nextTier = profile ? getNextTier(profile.tier) : null;
  const nextTierConfig = nextTier ? LOYALTY_TIERS[nextTier] : null;
  const currentTierConfig = profile ? LOYALTY_TIERS[profile.tier] : null;

  const progressToNextTier = useMemo(() => {
    if (profile === null || nextTier === null || nextTierConfig === null) {
      return null;
    }

    const currentFloor = getTierFloorPoints(profile.tier);
    const nextFloor = getTierThresholdPoints(nextTier);

    if (nextFloor === null) {
      return null;
    }

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

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 px-0 sm:space-y-6">
      <div className="overflow-hidden rounded-3xl border border-gray-100 bg-gradient-to-br from-white via-amber-50/45 to-white shadow-sm">
        <div className="px-4 py-5 sm:px-6 sm:py-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-amber-700/80">
                My Sofi&apos;s Account
              </p>

              <h1 className="mt-2 text-2xl font-black tracking-tight text-gray-950 sm:text-3xl">
                Welcome back, {firstName}
              </h1>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">
                Track your rewards, view your loyalty card, and see your recent activity in one
                simple place.
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {profile && currentTierConfig ? (
                <span
                  className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-black ${currentTierConfig.badge}`}
                >
                  {currentTierConfig.icon} {currentTierConfig.label}
                </span>
              ) : null}

              <button
                type="button"
                onClick={() => {
                  void refresh();
                }}
                className="inline-flex items-center justify-center rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-black text-gray-700 shadow-sm transition hover:bg-gray-50 active:scale-95"
              >
                {refreshing ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-medium text-gray-500">
            <span className="rounded-full bg-white/80 px-3 py-1 ring-1 ring-gray-100">
              {email ?? 'Signed in'}
            </span>

            <span className="rounded-full bg-white/80 px-3 py-1 capitalize ring-1 ring-gray-100">
              {String(user?.role ?? 'user')} account
            </span>
          </div>
        </div>
      </div>

      {loading ? <LoadingSkeleton /> : null}

      {error ? (
        <AccountCard className="border-red-100 bg-red-50 px-4 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-black text-red-800">Rewards could not load</p>
              <p className="mt-1 text-sm text-red-700">{error}</p>
            </div>

            <button
              type="button"
              onClick={() => {
                void refresh();
              }}
              className="inline-flex items-center justify-center rounded-xl bg-red-600 px-4 py-2 text-xs font-black text-white transition hover:bg-red-700"
            >
              Try again
            </button>
          </div>
        </AccountCard>
      ) : null}

      {!loading && !error && !profile ? (
        <AccountCard className="px-4 py-8 text-center">
          <p className="text-lg font-black text-gray-950">Start earning rewards</p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-gray-500">
            Place your first order to activate your Sofi&apos;s rewards account.
          </p>

          <Link
            to="/menu"
            className="mt-4 inline-flex items-center justify-center rounded-2xl bg-gray-950 px-5 py-3 text-sm font-black text-white transition hover:bg-black"
          >
            Browse Menu
          </Link>
        </AccountCard>
      ) : null}

      {!loading && !error && profile ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
          <div className="min-w-0 space-y-5">
            {profile.loyaltyPublicId ? (
              <LoyaltyQRCard
                loyaltyPublicId={profile.loyaltyPublicId}
                tier={profile.tier}
                name={profile.fullName ?? email}
              />
            ) : (
              <AccountCard className="border-amber-200 bg-amber-50 px-5 py-4">
                <p className="text-sm font-black text-amber-900">QR card not ready yet</p>
                <p className="mt-1 text-sm text-amber-800">
                  Tap refresh. Your loyalty card should appear once it has been generated.
                </p>
              </AccountCard>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <StatCard
                label="Available points"
                value={
                  <>
                    {fmt(profile.points)}{' '}
                    <span className="text-sm font-bold text-gray-400">pts</span>
                  </>
                }
                helper="Ready to use when eligible."
                tone="warm"
              />

              <StatCard
                label="Visit streak"
                value={
                  <>
                    {profile.streak}
                    <span className="ml-1 text-sm font-bold text-gray-400">days</span>
                  </>
                }
                helper={
                  <span
                    className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-bold ${streakBadgeClass(
                      profile.streak,
                    )}`}
                  >
                    {streakLabel(profile.streak)}
                  </span>
                }
              />

              <StatCard
                label="Lifetime earned"
                value={fmt(profile.lifetimePoints)}
                helper="Total points earned."
              />
            </div>

            {progressToNextTier ? (
              <AccountCard className="px-4 py-4 sm:px-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
                      Next tier
                    </p>
                    <h2 className="mt-1 text-base font-black text-gray-950">
                      {progressToNextTier.nextIcon} {progressToNextTier.nextLabel}
                    </h2>
                    <p className="mt-1 text-sm text-gray-500">
                      {fmt(progressToNextTier.remaining)} lifetime points to go.
                    </p>
                  </div>

                  <Link
                    to="/account/orders"
                    className="inline-flex items-center justify-center rounded-xl border border-gray-200 bg-white px-4 py-2 text-xs font-black text-gray-700 transition hover:bg-gray-50"
                  >
                    View orders
                  </Link>
                </div>

                <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-gray-950 transition-all"
                    style={{ width: `${progressToNextTier.percent}%` }}
                    aria-hidden
                  />
                </div>
              </AccountCard>
            ) : (
              <AccountCard className="px-4 py-4 sm:px-5">
                <p className="text-sm font-black text-gray-950">Top tier status</p>
                <p className="mt-1 text-sm text-gray-500">
                  You are currently at the highest available rewards tier.
                </p>
              </AccountCard>
            )}

            <AccountCard className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 sm:px-5">
                <div>
                  <h2 className="text-sm font-black text-gray-950">Recent activity</h2>
                  <p className="mt-0.5 text-xs text-gray-400">Latest rewards updates.</p>
                </div>

                <Link
                  to="/account/orders"
                  className="text-xs font-black text-gray-700 hover:text-gray-950"
                >
                  Orders
                </Link>
              </div>

              {transactions.length > 0 ? (
                <div className="divide-y divide-gray-50 px-4 sm:px-5">
                  {transactions.slice(0, 6).map((transaction) => (
                    <TransactionRow key={transaction.id} tx={transaction} />
                  ))}
                </div>
              ) : (
                <div className="px-4 py-8 text-center sm:px-5">
                  <p className="text-sm font-semibold text-gray-500">No rewards activity yet.</p>

                  <Link
                    to="/menu"
                    className="mt-3 inline-flex items-center justify-center rounded-xl bg-gray-950 px-4 py-2 text-xs font-black text-white transition hover:bg-black"
                  >
                    Order now
                  </Link>
                </div>
              )}
            </AccountCard>
          </div>

          <aside className="min-w-0 space-y-4 lg:sticky lg:top-20">
            <AccountCard className="px-4 py-4 sm:px-5">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">
                Quick actions
              </p>

              <div className="mt-3 grid gap-2">
                <Link
                  to="/menu"
                  className="flex items-center justify-between rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm font-black text-gray-900 transition hover:bg-gray-100"
                >
                  Order again
                  <span aria-hidden="true">›</span>
                </Link>

                <Link
                  to="/account/orders"
                  className="flex items-center justify-between rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm font-black text-gray-900 transition hover:bg-gray-100"
                >
                  View orders
                  <span aria-hidden="true">›</span>
                </Link>
              </div>
            </AccountCard>

            <details className="group rounded-3xl border border-gray-100 bg-white shadow-sm">
              <summary className="flex cursor-pointer select-none items-center justify-between px-4 py-4 text-sm font-black text-gray-900 sm:px-5">
                <span>How points work</span>
                <span className="text-gray-400 transition-transform group-open:rotate-180">⌄</span>
              </summary>

              <div className="space-y-3 border-t border-gray-100 px-4 py-4 text-sm leading-6 text-gray-500 sm:px-5">
                <p>
                  <span className="font-black text-gray-800">Base rate:</span> 1 point per $1 spent.
                </p>

                <p>
                  <span className="font-black text-gray-800">Tier boost:</span>{' '}
                  {TIER_ORDER.map(
                    (tierKey) =>
                      `${LOYALTY_TIERS[tierKey].label} ${LOYALTY_TIERS[tierKey].multiplier}x`,
                  ).join(' · ')}
                </p>

                {nextTierConfig ? (
                  <p>
                    <span className="font-black text-gray-800">Next tier:</span>{' '}
                    {nextTierConfig.icon} {nextTierConfig.label}
                  </p>
                ) : (
                  <p>
                    <span className="font-black text-gray-800">Status:</span> You are at the top
                    rewards tier.
                  </p>
                )}
              </div>
            </details>
          </aside>
        </div>
      ) : null}
    </div>
  );
}