// src/pages/Account/AccountHome.tsx
// ============================================================================
// ACCOUNT HOME — Enterprise Loyalty Dashboard (2026) • Sofi's Restaurant
// ============================================================================
// ✅ Uses Edge Function `loyalty-account` as source of truth
// ✅ Matches current Edge payload shape:
//    { ok, meta, account, profile, ledger }
// ✅ Hardened against runtime crashes (never blanks the route)
// ✅ Premium UX: QR card, perks, next reward, activity ledger, orders shortcut
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

// ─────────────────────────────────────────────────────────────
// Types (match your Edge Function response)
// ─────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────
// Safe helpers
// ─────────────────────────────────────────────────────────────

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
  if (streak >= 30) {
    return '🔥 Legendary';
  }

  if (streak >= 14) {
    return '🔥 On Fire';
  }

  if (streak >= 7) {
    return '⚡ Weekly';
  }

  if (streak >= 3) {
    return '✨ Heating up';
  }

  if (streak >= 1) {
    return '🌱 Started';
  }

  return '🌱 Start your streak today';
}

function streakBadgeClass(streak: number): string {
  if (streak >= 30) {
    return 'text-red-700 bg-red-50 border-red-200';
  }

  if (streak >= 14) {
    return 'text-orange-700 bg-orange-50 border-orange-200';
  }

  if (streak >= 7) {
    return 'text-amber-700 bg-amber-50 border-amber-200';
  }

  if (streak >= 3) {
    return 'text-yellow-700 bg-yellow-50 border-yellow-200';
  }

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

// ─────────────────────────────────────────────────────────────
// UI: Skeleton
// ─────────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-40 rounded-2xl bg-gray-100" />
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map((item) => (
          <div key={item} className="h-24 rounded-xl bg-gray-100" />
        ))}
      </div>
      <div className="h-16 rounded-xl bg-gray-100" />
      <div className="h-52 rounded-xl bg-gray-100" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// UI: QR Card
// ─────────────────────────────────────────────────────────────

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
    if (!name) {
      return 'Member';
    }

    const handle = name.split('@')[0]?.trim();
    return handle && handle.length > 0 ? handle : 'Member';
  }, [name]);

  const handleCopy = useCallback(async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(loyaltyPublicId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // no-op
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
    <div
      className={`overflow-hidden rounded-2xl border ${config.colors.border} bg-white shadow-sm`}
    >
      <div className={`bg-linear-to-br ${config.gradient} px-5 py-3`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/70">
              Loyalty Card
            </p>
            <p className="mt-0.5 text-sm font-semibold text-white">{displayName}</p>
          </div>
          <span className="text-2xl">{config.icon}</span>
        </div>
      </div>

      <div className="flex flex-col items-center gap-4 px-6 py-6">
        <div className={`rounded-2xl border-2 ${config.colors.border} bg-white p-3 shadow-sm`}>
          <QRCodeSVG
            value={loyaltyPublicId}
            size={184}
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

        <div className="text-center">
          <p className="text-xs font-medium text-gray-500">Show this code to staff at any visit</p>
          <p className="mt-1 select-all break-all font-mono text-[11px] text-gray-400">
            {loyaltyPublicId}
          </p>

          <button
            type="button"
            onClick={() => {
              void handleCopy();
            }}
            className="mt-2 inline-flex items-center justify-center rounded-lg px-2 py-1 text-xs font-semibold text-gray-700 transition hover:bg-gray-50"
          >
            {copied ? '✓ Copied' : 'Copy ID'}
          </button>
        </div>

        <button
          type="button"
          onClick={handleDownload}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-gray-50 py-2.5 text-xs font-semibold text-gray-800 transition hover:bg-gray-100 active:scale-95"
        >
          ↓ Save QR
        </button>
      </div>

      <div className="border-t border-gray-100 px-5 py-2.5">
        <p className="text-center text-[10px] text-gray-400">
          This code is permanent and unique to your account
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// UI: Transaction row
// ─────────────────────────────────────────────────────────────

function TransactionRow({ tx }: { tx: LoyaltyTransaction }) {
  const isPositive = tx.points_delta > 0;

  const typeLabel: Record<LoyaltyTransactionType, string> = {
    earned: 'Points earned',
    redeemed: 'Points redeemed',
    bonus: 'Bonus awarded',
    expired: 'Points expired',
    adjusted: 'Manual adjustment',
  };

  const typeIcon: Record<LoyaltyTransactionType, string> = {
    earned: '⬆',
    redeemed: '⬇',
    bonus: '🎁',
    expired: '⏱',
    adjusted: '✏',
  };

  const date = new Date(tx.created_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-sm">
          {typeIcon[tx.transaction_type]}
        </div>

        <div>
          <div className="text-sm font-medium text-gray-900">{typeLabel[tx.transaction_type]}</div>
          <div className="text-xs text-gray-400">
            {date}
            {tx.reference_id ? (
              <>
                <span className="ml-1.5 text-gray-300">·</span>
                <span className="ml-1.5 font-mono">
                  ref {tx.reference_id.slice(0, 8).toUpperCase()}
                </span>
              </>
            ) : null}
          </div>
          {tx.source !== 'unknown' ? (
            <div className="mt-0.5 text-[10px] text-gray-300">source: {tx.source}</div>
          ) : null}
        </div>
      </div>

      <div className="text-right">
        <div
          className={`text-sm font-semibold tabular-nums ${isPositive ? 'text-emerald-600' : 'text-red-500'}`}
        >
          {isPositive ? '+' : '-'}
          {fmt(Math.abs(tx.points_delta))} pts
        </div>
        <div className="text-xs text-gray-400">Balance: {fmt(tx.points_balance)}</div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Data hook (never blank the page)
// ─────────────────────────────────────────────────────────────

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
        setSafe(() => setError('Unable to load loyalty data'));
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
      setSafe(() => setError(getErrorMessage(loadError, 'Unable to load loyalty data')));
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

// ─────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────

export default function AccountHome() {
  const { user } = useUserContext();
  const { profile, transactions, loading, refreshing, error, refresh } = useLoyaltyData();

  const email = user?.email ?? null;
  const nextTier = profile ? getNextTier(profile.tier) : null;
  const nextTierConfig = nextTier ? LOYALTY_TIERS[nextTier] : null;

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

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Account Overview</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage your profile and track your loyalty rewards.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            void refresh();
          }}
          className="shrink-0 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 active:scale-95"
        >
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
        <div className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          Signed in as
        </div>
        <div className="mt-1 font-medium text-gray-900">{email}</div>
        <div className="mt-0.5 text-sm text-gray-500">
          Role:{' '}
          <span className="font-medium capitalize text-gray-700">
            {String(user?.role ?? 'user')}
          </span>
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Loyalty Rewards</h2>
          {profile ? (
            <span
              className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${LOYALTY_TIERS[profile.tier].badge}`}
            >
              {LOYALTY_TIERS[profile.tier].icon} {LOYALTY_TIERS[profile.tier].label}
            </span>
          ) : null}
        </div>

        {loading ? <LoadingSkeleton /> : null}

        {error ? (
          <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
            <div className="mt-2">
              <button
                type="button"
                onClick={() => {
                  void refresh();
                }}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700"
              >
                Try again
              </button>
            </div>
          </div>
        ) : null}

        {!loading && !error && !profile ? (
          <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
            Place your first order to start earning loyalty points.
          </div>
        ) : null}

        {!loading && !error && profile ? (
          <div className="space-y-4">
            {profile.loyaltyPublicId ? (
              <LoyaltyQRCard
                loyaltyPublicId={profile.loyaltyPublicId}
                tier={profile.tier}
                name={profile.fullName ?? email}
              />
            ) : (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
                <div className="text-sm font-semibold text-amber-900">QR card not ready yet</div>
                <div className="mt-1 text-xs text-amber-800">
                  Tap Refresh — it should appear once generated.
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
                <div className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                  Spendable
                </div>
                <div className="mt-1 text-2xl font-bold tabular-nums text-gray-900">
                  {fmt(profile.points)}{' '}
                  <span className="text-sm font-medium text-gray-400">pts</span>
                </div>
              </div>

              <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
                <div className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                  Streak
                </div>
                <div className="mt-1 text-2xl font-bold tabular-nums text-gray-900">
                  {profile.streak}
                  <span className="ml-0.5 text-sm font-medium text-gray-400">d</span>
                </div>
                <div
                  className={`mt-2 inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${streakBadgeClass(profile.streak)}`}
                >
                  {streakLabel(profile.streak)}
                </div>
              </div>

              <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
                <div className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                  Lifetime
                </div>
                <div className="mt-1 text-2xl font-bold tabular-nums text-gray-900">
                  {fmt(profile.lifetimePoints)}
                </div>
                <div className="mt-2 text-xs font-medium text-gray-400">total earned</div>
              </div>
            </div>

            {progressToNextTier ? (
              <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                      Next reward tier
                    </div>
                    <div className="mt-1 text-sm font-semibold text-gray-900">
                      {progressToNextTier.nextIcon} {progressToNextTier.nextLabel}
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      {fmt(progressToNextTier.remaining)} lifetime points to go
                    </div>
                  </div>
                  <Link
                    to="/account/orders"
                    className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-50"
                  >
                    View orders
                  </Link>
                </div>

                <div className="mt-4 h-2 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-gray-900 transition-all"
                    style={{ width: `${progressToNextTier.percent}%` }}
                    aria-hidden
                  />
                </div>
              </div>
            ) : null}

            {transactions.length > 0 ? (
              <div className="rounded-xl border border-gray-100 bg-white">
                <div className="border-b border-gray-100 px-4 py-3">
                  <h3 className="text-sm font-semibold text-gray-900">Recent Activity</h3>
                </div>

                <div className="divide-y divide-gray-50 px-4">
                  {transactions.map((transaction) => (
                    <TransactionRow key={transaction.id} tx={transaction} />
                  ))}
                </div>

                <div className="border-t border-gray-100 px-4 py-3 text-right">
                  <Link
                    to="/account/orders"
                    className="text-xs font-semibold text-gray-700 hover:text-gray-900"
                  >
                    View orders →
                  </Link>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-5 text-center">
                <p className="text-sm text-gray-500">No activity yet.</p>
                <div className="mt-3">
                  <Link
                    to="/menu"
                    className="inline-flex items-center justify-center rounded-xl bg-gray-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-black"
                  >
                    Order now
                  </Link>
                </div>
              </div>
            )}

            <details className="group rounded-xl border border-gray-100 bg-white">
              <summary className="flex cursor-pointer select-none items-center justify-between px-4 py-3 text-sm font-medium text-gray-700">
                <span>How points work</span>
                <span className="text-gray-400 transition-transform group-open:rotate-180">▾</span>
              </summary>
              <div className="space-y-2 border-t border-gray-100 px-4 py-3 text-xs text-gray-500">
                <p>
                  <span className="font-semibold text-gray-700">Base rate</span> — 1 point per $1
                  spent
                </p>
                <p>
                  <span className="font-semibold text-gray-700">Tier multipliers</span> —{' '}
                  {TIER_ORDER.map(
                    (tierKey) =>
                      `${LOYALTY_TIERS[tierKey].label} ${LOYALTY_TIERS[tierKey].multiplier}×`,
                  ).join(' · ')}
                </p>
                {nextTierConfig ? (
                  <p>
                    <span className="font-semibold text-gray-700">Next tier</span> —{' '}
                    {nextTierConfig.icon} {nextTierConfig.label}
                  </p>
                ) : (
                  <p>
                    <span className="font-semibold text-gray-700">Status</span> — You are at the top
                    tier.
                  </p>
                )}
              </div>
            </details>
          </div>
        ) : null}
      </div>
    </div>
  );
}