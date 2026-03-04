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

import type { Database } from '@/types/supabase';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { QRCodeSVG, QRCodeCanvas } from 'qrcode.react';

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

type LedgerMeta = Database['public']['Tables']['loyalty_ledger']['Row']['metadata']

type LoyaltyTransactionType = 'earned' | 'redeemed' | 'bonus' | 'expired' | 'adjusted'

type LoyaltyTransaction = {
  id: string
  transaction_type: LoyaltyTransactionType
  points_delta: number
  points_balance: number
  tier_at_time: string
  streak_at_time: number
  tier_multiplier: number
  streak_multiplier: number
  created_at: string
  metadata: LedgerMeta | null
  source: string
  reference_id: string | null
}

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
    metadata?: unknown | null;
    source?: string;
    reference_id?: string | null;
  }>;
  error?: unknown;
  code?: unknown;
};

// ─────────────────────────────────────────────────────────────
// Safe helpers
// ─────────────────────────────────────────────────────────────

function safeStr(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function safeNum(v: unknown, fallback = 0): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function safeIso(v: unknown): string {
  const s = safeStr(v, '');
  return s && !Number.isNaN(Date.parse(s)) ? s : new Date().toISOString();
}

const fmt = (n: number) => n.toLocaleString();

function mapEntryType(raw: unknown): LoyaltyTransactionType {
  const t = String(raw ?? '').toLowerCase();
  if (t === 'earn' || t === 'earned') return 'earned';
  if (t === 'redeem' || t === 'redeemed') return 'redeemed';
  if (t === 'bonus') return 'bonus';
  if (t === 'expired') return 'expired';
  return 'adjusted';
}

function streakLabel(streak: number): string {
  if (streak >= 30) return '🔥 Legendary';
  if (streak >= 14) return '🔥 On Fire';
  if (streak >= 7) return '⚡ Weekly';
  if (streak >= 3) return '✨ Heating up';
  if (streak >= 1) return '🌱 Started';
  return '🌱 Start your streak today';
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
    const type = mapEntryType(row.entry_type);

    // IMPORTANT:
    // Your API already returns signed amounts (redeem = -2500).
    // So we keep amount as-is. No double-sign.
    const delta = safeNum(row.amount, 0);

    const tierAt = safeStr(row.tier_at_time, 'bronze');
    const tierMult = LOYALTY_TIERS[asTier(tierAt)]?.multiplier ?? 1;

    return {
      id: safeStr(row.id, crypto.randomUUID()),
      transaction_type: type,
      points_delta: delta,
      points_balance: safeNum(row.balance_after, 0),
      tier_at_time: tierAt,
      streak_at_time: safeNum(row.streak_at_time, 0),
      tier_multiplier: tierMult,
      streak_multiplier: 1,
      created_at: safeIso(row.created_at),
      metadata: (row.metadata ?? null) as LedgerMeta | null,
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
    <div className="animate-pulse space-y-4">
      <div className="h-40 rounded-2xl bg-gray-100" />
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-24 rounded-xl bg-gray-100" />
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
  loyaltyPublicId: string
  tier: LoyaltyTier
  name: string | null | undefined
}) {
  const cfg = LOYALTY_TIERS[tier]
  const canvasRef = useRef<HTMLDivElement>(null)
  const [copied, setCopied] = useState(false)

  const displayName = useMemo(() => {
    if (!name) return 'Member'
    const h = name.split('@')[0]?.trim()
    return h ? h : 'Member'
  }, [name])

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(loyaltyPublicId)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      // ignore
    }
  }, [loyaltyPublicId])

  const handleDownload = useCallback(() => {
    const canvas = canvasRef.current?.querySelector('canvas') as HTMLCanvasElement | null
    if (!canvas) return
    const link = document.createElement('a')
    link.download = `sofis-loyalty-${loyaltyPublicId.slice(0, 8)}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
  }, [loyaltyPublicId])

  return (
    <div className={`overflow-hidden rounded-2xl border ${cfg.colors.border} bg-white shadow-sm`}>
      <div className={`bg-linear-to-br ${cfg.gradient} px-5 py-3`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/70">
              Loyalty Card
            </p>
            <p className="mt-0.5 text-sm font-semibold text-white">{displayName}</p>
          </div>
          <span className="text-2xl">{cfg.icon}</span>
        </div>
      </div>

      <div className="flex flex-col items-center gap-4 px-6 py-6">
        <div className={`rounded-2xl border-2 ${cfg.colors.border} bg-white p-3 shadow-sm`}>
          <QRCodeSVG
            value={loyaltyPublicId}
            size={184}
            fgColor={cfg.qr.fg}
            bgColor={cfg.qr.bg}
            level="H"
          />
        </div>

        <div ref={canvasRef} className="hidden" aria-hidden>
          <QRCodeCanvas
            value={loyaltyPublicId}
            size={420}
            fgColor={cfg.qr.fg}
            bgColor={cfg.qr.bg}
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
            onClick={handleCopy}
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
            {tx.reference_id && (
              <>
                <span className="ml-1.5 text-gray-300">·</span>
                <span className="ml-1.5 font-mono">
                  ref {tx.reference_id.slice(0, 8).toUpperCase()}
                </span>
              </>
            )}
          </div>
          {tx.source && tx.source !== 'unknown' && (
            <div className="mt-0.5 text-[10px] text-gray-300">source: {tx.source}</div>
          )}
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
  const [profile, setProfile] = useState<LoyaltyProfileWithQR | null>(null)
  const [transactions, setTransactions] = useState<LoyaltyTransaction[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const abortRef = useRef(false)

  const load = useCallback(async (soft = false) => {
    abortRef.current = false;

    const setSafe = (fn: () => void) => {
      if (!abortRef.current) fn();
    };

    setSafe(() => {
      if (!soft) setLoading(true);
      setRefreshing(soft);
      setError(null);
    });

    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.access_token ?? null;
      if (!token) {
        setSafe(() => {
          setProfile(null);
          setTransactions([]);
        });
        return;
      }

      const resp = await invokeEdge<LoyaltyAccountEdgeResp>(
        'loyalty-account',
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'x-request-id': crypto.randomUUID(),
          },
        },
      );

      if (!resp?.ok) {
        setSafe(() => setError('Unable to load loyalty data'));
        return;
      }

      const acct = resp.account ?? null;
      const prof = resp.profile ?? null;

      if (!acct) {
        setSafe(() => {
          setProfile({
            points: 0,
            lifetimePoints: 0,
            tier: 'bronze',
            streak: 0,
            lastOrderDate: null,
            loyaltyPublicId: prof?.loyalty_public_id ?? null,
            fullName: prof?.full_name ?? null,
          });
          setTransactions([]);
        });
        return;
      }

      const tier = (acct.tier ? asTier(acct.tier) : 'bronze') as LoyaltyTier;

      setSafe(() => {
        setProfile({
          points: safeNum(acct.balance, 0),
          lifetimePoints: safeNum(acct.lifetime_earned, 0),
          tier,
          streak: safeNum(acct.streak, 0),
          lastOrderDate: acct.last_activity ?? null,
          loyaltyPublicId: prof?.loyalty_public_id ?? null, // ✅ correct field
          fullName: prof?.full_name ?? null,
        });
        setTransactions(buildTransactions(resp.ledger));
      });
    } catch {
      setSafe(() => setError('Unable to load loyalty data'));
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
      abortRef.current = true;
    };
  }, [load]);

  const refresh = useCallback(async () => {
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
          onClick={() => void refresh()}
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
          Role: <span className="font-medium text-gray-700 capitalize">{user?.role}</span>
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Loyalty Rewards</h2>
          {profile && (
            <span
              className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${LOYALTY_TIERS[profile.tier].badge}`}
            >
              {LOYALTY_TIERS[profile.tier].icon} {LOYALTY_TIERS[profile.tier].label}
            </span>
          )}
        </div>

        {loading && <LoadingSkeleton />}

        {error && (
          <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
            <div className="mt-2">
              <button
                type="button"
                onClick={() => void refresh()}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700"
              >
                Try again
              </button>
            </div>
          </div>
        )}

        {!loading && !error && !profile && (
          <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
            Place your first order to start earning loyalty points.
          </div>
        )}

        {!loading && !error && profile && (
          <div className="space-y-4">
            {/* QR */}
            {profile.loyaltyPublicId ? (
              <LoyaltyQRCard
                loyaltyPublicId={profile.loyaltyPublicId}
                tier={profile.tier}
                name={email}
              />
            ) : (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
                <div className="text-sm font-semibold text-amber-900">QR card not ready yet</div>
                <div className="mt-1 text-xs text-amber-800">
                  Tap Refresh — it should appear once generated.
                </div>
              </div>
            )}

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-3">
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

            {/* Activity */}
            {transactions.length > 0 ? (
              <div className="rounded-xl border border-gray-100 bg-white">
                <div className="border-b border-gray-100 px-4 py-3">
                  <h3 className="text-sm font-semibold text-gray-900">Recent Activity</h3>
                </div>

                <div className="divide-y divide-gray-50 px-4">
                  {transactions.map((tx) => (
                    <TransactionRow key={tx.id} tx={tx} />
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

            {/* Explain */}
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
                    (t) => `${LOYALTY_TIERS[t].label} ${LOYALTY_TIERS[t].multiplier}×`,
                  ).join(' · ')}
                </p>
              </div>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}