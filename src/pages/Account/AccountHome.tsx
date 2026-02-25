// src/pages/Account/AccountHome.tsx
// ============================================================================
// ACCOUNT HOME — LOYALTY DASHBOARD + QR CARD
// ============================================================================
//
// Tier config sourced entirely from @/domain/loyalty/tiers.
// No tier data is defined in this file.
// ============================================================================

import { useEffect, useRef, useState } from 'react'
import { QRCodeSVG, QRCodeCanvas } from 'qrcode.react'
import { useUserContext } from '@/contexts/useUserContext'
import { supabase } from '@/lib/supabase/supabaseClient'
import { LOYALTY_TIERS, TIER_ORDER, getNextTier, type LoyaltyTier } from '@/domain/loyalty/tiers'
import type { LoyaltyProfile } from '@/features/checkout/checkout.api'

// ============================================================================
// STREAK HELPERS (display-only, not business logic)
// ============================================================================

const STREAK_LABEL = (streak: number): string => {
  if (streak >= 30) return '🔥 Legendary'
  if (streak >= 14) return '🔥 On Fire'
  if (streak >= 7)  return '⚡ Weekly'
  if (streak >= 3)  return '✨ Heating up'
  if (streak >= 1)  return '🌱 Started'
  return '🌱 Start your streak today'
}

const STREAK_COLOR = (streak: number): string => {
  if (streak >= 30) return 'text-red-600 bg-red-50 border-red-200'
  if (streak >= 14) return 'text-orange-600 bg-orange-50 border-orange-200'
  if (streak >= 7)  return 'text-amber-600 bg-amber-50 border-amber-200'
  if (streak >= 3)  return 'text-yellow-600 bg-yellow-50 border-yellow-200'
  return 'text-gray-500 bg-gray-50 border-gray-200'
}

// ============================================================================
// TYPES
// ============================================================================

interface LoyaltyTransaction {
  id:                string
  transaction_type:  'earned' | 'redeemed' | 'bonus' | 'expired' | 'adjusted'
  points_delta:      number
  points_balance:    number
  tier_at_time:      string
  streak_at_time:    number
  tier_multiplier:   number
  streak_multiplier: number
  created_at:        string
  metadata:          Record<string, unknown> | null
}

interface LoyaltyProfileWithQR extends LoyaltyProfile {
  loyaltyPublicId: string | null
}

// ============================================================================
// HOOK: useLoyaltyData
// ============================================================================

function useLoyaltyData() {
  const [profile,      setProfile]      = useState<LoyaltyProfileWithQR | null>(null)
  const [transactions, setTransactions] = useState<LoyaltyTransaction[]>([])
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        setLoading(true)
        setError(null)

        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user?.id) return

        const uid = session.user.id

        const [profileRes, txRes] = await Promise.all([
          supabase
            .from('profiles')
            .select('loyalty_points, lifetime_points, loyalty_tier, loyalty_streak, last_order_date, loyalty_public_id')
            .eq('id', uid)
            .single(),
          supabase
            .from('loyalty_transactions')
            .select('*')
            .eq('user_id', uid)
            .order('created_at', { ascending: false })
            .limit(10),
        ])

        if (cancelled) return

        if (profileRes.data) {
          setProfile({
            points:          profileRes.data.loyalty_points    ?? 0,
            lifetimePoints:  profileRes.data.lifetime_points   ?? 0,
            tier:            (profileRes.data.loyalty_tier     ?? 'bronze') as LoyaltyTier,
            streak:          profileRes.data.loyalty_streak    ?? 0,
            lastOrderDate:   profileRes.data.last_order_date   ?? null,
            loyaltyPublicId: profileRes.data.loyalty_public_id ?? null,
          })
        }

        if (txRes.data) setTransactions(txRes.data as LoyaltyTransaction[])

      } catch {
        if (!cancelled) setError('Unable to load loyalty data')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [])

  return { profile, transactions, loading, error }
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function TierCard({ profile }: { profile: LoyaltyProfile }) {
  const tier   = profile.tier
  const config = LOYALTY_TIERS[tier]
  const next   = getNextTier(tier)

  const progressPct = config.nextAt
    ? Math.min((profile.lifetimePoints / config.nextAt) * 100, 100)
    : 100
  const pointsToNext = config.nextAt
    ? Math.max(config.nextAt - profile.lifetimePoints, 0)
    : 0

  return (
    <div className={`relative overflow-hidden rounded-2xl ring-2 ${config.ring} shadow-lg ${config.glow}`}>
      {/* Gradient header */}
      <div className={`bg-linear-to-br ${config.gradient} px-6 py-5`}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-widest text-white/70">
              Loyalty Tier
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-2xl">{config.icon}</span>
              <span className="text-2xl font-bold tracking-tight text-white">
                {config.label}
              </span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs font-medium text-white/70">Spendable balance</div>
            <div className="text-3xl font-bold tabular-nums text-white">
              {profile.points.toLocaleString()}
              <span className="ml-1 text-sm font-medium text-white/70">pts</span>
            </div>
          </div>
        </div>
      </div>

      {/* Progress to next tier */}
      <div className="bg-white px-6 py-4">
        {config.nextAt && next ? (
          <>
            <div className="mb-2 flex items-center justify-between text-xs text-gray-500">
              <span className="font-medium">
                {profile.lifetimePoints.toLocaleString()} lifetime pts
              </span>
              <span>
                {pointsToNext.toLocaleString()} pts until{' '}
                <span className="font-semibold text-gray-700">
                  {LOYALTY_TIERS[next].label}
                </span>
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className={`h-full rounded-full transition-all duration-700 ${config.bar}`}
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </>
        ) : (
          <div className="text-center text-sm font-medium text-blue-700">
            💎 Maximum tier achieved — {config.multiplier}× points on every order
          </div>
        )}
      </div>
    </div>
  )
}

function StatsRow({ profile }: { profile: LoyaltyProfile }) {
  const streakLabel = STREAK_LABEL(profile.streak)
  const streakColor = STREAK_COLOR(profile.streak)
  const tierConfig  = LOYALTY_TIERS[profile.tier]

  return (
    <div className="grid grid-cols-3 gap-3">
      <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="text-xs font-semibold uppercase tracking-wider text-gray-400">Streak</div>
        <div className="mt-1 text-2xl font-bold tabular-nums text-gray-900">
          {profile.streak}
          <span className="ml-0.5 text-sm font-medium text-gray-400">d</span>
        </div>
        <div className={`mt-2 inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${streakColor}`}>
          {streakLabel}
        </div>
      </div>

      <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="text-xs font-semibold uppercase tracking-wider text-gray-400">Lifetime</div>
        <div className="mt-1 text-2xl font-bold tabular-nums text-gray-900">
          {profile.lifetimePoints.toLocaleString()}
        </div>
        <div className="mt-2 text-xs font-medium text-gray-400">total earned</div>
      </div>

      <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="text-xs font-semibold uppercase tracking-wider text-gray-400">Multiplier</div>
        <div className="mt-1 text-2xl font-bold tabular-nums text-gray-900">
          {tierConfig.multiplier}
          <span className="ml-0.5 text-sm font-medium text-gray-400">×</span>
        </div>
        <div className="mt-2 text-xs font-medium text-gray-400">pts per $1</div>
      </div>
    </div>
  )
}

function StreakBonusInfo({ streak }: { streak: number }) {
  const nextMilestone =
    streak < 3  ? { at: 3,  bonus: '+10%', label: '3-day streak'  } :
    streak < 7  ? { at: 7,  bonus: '+25%', label: '7-day streak'  } :
    streak < 30 ? { at: 30, bonus: '+50%', label: '30-day streak' } :
    null

  if (!nextMilestone) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-orange-100 bg-orange-50 px-4 py-3">
        <span className="text-xl">🔥</span>
        <p className="text-sm font-medium text-orange-800">
          Legendary 30-day streak active — earning +50% bonus points on every order
        </p>
      </div>
    )
  }

  const daysLeft = nextMilestone.at - streak
  return (
    <div className="flex items-center gap-3 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3">
      <span className="text-xl">⚡</span>
      <p className="text-sm text-amber-800">
        <span className="font-semibold">{daysLeft} more day{daysLeft !== 1 ? 's' : ''}</span> to unlock{' '}
        <span className="font-semibold">{nextMilestone.label}</span> — {nextMilestone.bonus} point bonus
      </p>
    </div>
  )
}

function TransactionRow({ tx }: { tx: LoyaltyTransaction }) {
  const isPositive = tx.points_delta > 0

  const typeLabel: Record<LoyaltyTransaction['transaction_type'], string> = {
    earned:   'Points earned',
    redeemed: 'Points redeemed',
    bonus:    'Bonus awarded',
    expired:  'Points expired',
    adjusted: 'Manual adjustment',
  }

  const typeIcon: Record<LoyaltyTransaction['transaction_type'], string> = {
    earned:   '⬆',
    redeemed: '⬇',
    bonus:    '🎁',
    expired:  '⏱',
    adjusted: '✏',
  }

  const date = new Date(tx.created_at).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })

  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-sm">
          {typeIcon[tx.transaction_type]}
        </div>
        <div>
          <div className="text-sm font-medium text-gray-900">
            {typeLabel[tx.transaction_type]}
          </div>
          <div className="text-xs text-gray-400">
            {date}
            {tx.tier_multiplier > 1 && <><span className="ml-1.5 text-gray-300">·</span><span className="ml-1.5">{tx.tier_multiplier}× tier</span></>}
            {tx.streak_multiplier > 1 && <><span className="ml-1.5 text-gray-300">·</span><span className="ml-1.5">{tx.streak_multiplier}× streak</span></>}
          </div>
        </div>
      </div>
      <div className="text-right">
        <div className={`text-sm font-semibold tabular-nums ${isPositive ? 'text-emerald-600' : 'text-red-500'}`}>
          {isPositive ? '+' : ''}{tx.points_delta.toLocaleString()} pts
        </div>
        <div className="text-xs text-gray-400">Balance: {tx.points_balance.toLocaleString()}</div>
      </div>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-36 rounded-2xl bg-gray-100" />
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => <div key={i} className="h-24 rounded-xl bg-gray-100" />)}
      </div>
      <div className="h-12 rounded-xl bg-gray-100" />
      <div className="h-48 rounded-xl bg-gray-100" />
    </div>
  )
}

// ============================================================================
// QR CARD
// All QR colors come from LOYALTY_TIERS[tier].qr and .colors.border
// ============================================================================

function LoyaltyQRCard({
  loyaltyPublicId,
  tier,
  name,
}: {
  loyaltyPublicId: string
  tier: LoyaltyTier
  name: string | null | undefined
}) {
  const config    = LOYALTY_TIERS[tier]
  const canvasRef = useRef<HTMLDivElement>(null)
  const [copied,  setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(loyaltyPublicId)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* ignore */ }
  }

  function handleDownload() {
    const canvas = canvasRef.current?.querySelector('canvas') as HTMLCanvasElement | null
    if (!canvas) return
    const link    = document.createElement('a')
    link.download = `loyalty-qr-${loyaltyPublicId.slice(0, 8)}.png`
    link.href     = canvas.toDataURL('image/png')
    link.click()
  }

  return (
    <div className={`overflow-hidden rounded-2xl border ${config.colors.border} bg-white shadow-sm`}>
      {/* Header — uses tier gradient from domain */}
      <div className={`bg-linear-to-br ${config.gradient} px-5 py-3`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/70">
              Loyalty Card
            </p>
            <p className="mt-0.5 text-sm font-semibold text-white">
              {name?.split('@')[0] ?? 'Member'}
            </p>
          </div>
          <span className="text-2xl">{config.icon}</span>
        </div>
      </div>

      {/* QR body */}
      <div className="flex flex-col items-center gap-4 px-6 py-6">
        {/* Visible SVG — uses tier QR colors from domain */}
        <div className={`rounded-xl border-2 ${config.colors.border} bg-white p-3 shadow-sm`}>
          <QRCodeSVG
            value={loyaltyPublicId}
            size={180}
            fgColor={config.qr.fg}
            bgColor={config.qr.bg}
            level="H"
            includeMargin={false}
          />
        </div>

        {/* Hidden canvas — PNG download only */}
        <div ref={canvasRef} className="hidden" aria-hidden>
          <QRCodeCanvas
            value={loyaltyPublicId}
            size={400}
            fgColor={config.qr.fg}
            bgColor={config.qr.bg}
            level="H"
            includeMargin
          />
        </div>

        <div className="text-center">
          <p className="text-xs font-medium text-gray-500">
            Show this code to staff at any visit
          </p>
          <p className="mt-1 font-mono text-[11px] text-gray-400 select-all break-all">
            {loyaltyPublicId}
          </p>
          <button
            onClick={handleCopy}
            className="mt-2 text-xs text-gray-600 transition hover:text-gray-800"
          >
            {copied ? '✓ Copied' : 'Copy ID'}
          </button>
        </div>

        <div className="flex w-full gap-2">
          <button
            onClick={handleDownload}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-100 active:scale-95"
          >
            ↓ Save QR
          </button>
        </div>
      </div>

      <div className="border-t border-gray-100 px-5 py-2.5">
        <p className="text-center text-[10px] text-gray-400">
          This code is permanent and unique to your account
        </p>
      </div>
    </div>
  )
}

// ============================================================================
// HOW IT WORKS — dynamically built from LOYALTY_TIERS
// ============================================================================

function HowItWorks() {
  return (
    <details className="group rounded-xl border border-gray-100 bg-white">
      <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 select-none">
        <span>How points work</span>
        <span className="text-gray-400 transition-transform group-open:rotate-180">▾</span>
      </summary>
      <div className="border-t border-gray-100 px-4 py-3 text-xs text-gray-500 space-y-2">
        <p>
          <span className="font-semibold text-gray-700">Base rate</span> — 1 point per $1 spent
        </p>
        <p>
          <span className="font-semibold text-gray-700">Tier multipliers</span> —{' '}
          {TIER_ORDER.map((t) => `${LOYALTY_TIERS[t].label} ${LOYALTY_TIERS[t].multiplier}×`).join(' · ')}
        </p>
        <p>
          <span className="font-semibold text-gray-700">Streak bonuses</span> —{' '}
          3 days +10% · 7 days +25% · 30 days +50%
        </p>
        <p>
          <span className="font-semibold text-gray-700">Tier thresholds</span> —{' '}
          {TIER_ORDER.filter(t => LOYALTY_TIERS[t].threshold > 0)
            .map(t => `${LOYALTY_TIERS[t].label} ${LOYALTY_TIERS[t].threshold.toLocaleString()}`)
            .join(' · ')} lifetime points
        </p>
        <p className="text-gray-400">
          Tiers are based on lifetime points and are never downgraded.
          Streaks reset if you miss a day.
        </p>
      </div>
    </details>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function AccountHome() {
  const { user }                                  = useUserContext()
  const { profile, transactions, loading, error } = useLoyaltyData()

  return (
    <div className="space-y-6">

      <div>
        <h1 className="text-xl font-semibold text-gray-900">Account Overview</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage your profile and track your loyalty rewards.
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
        <div className="text-xs font-semibold uppercase tracking-wider text-gray-400">Signed in as</div>
        <div className="mt-1 font-medium text-gray-900">{user?.email}</div>
        <div className="mt-0.5 text-sm text-gray-500">
          Role: <span className="font-medium text-gray-700 capitalize">{user?.role}</span>
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Loyalty Rewards</h2>
          {profile && (
            <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${LOYALTY_TIERS[profile.tier].badge}`}>
              {LOYALTY_TIERS[profile.tier].icon} {LOYALTY_TIERS[profile.tier].label}
            </span>
          )}
        </div>

        {loading && <LoadingSkeleton />}

        {error && (
          <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {!loading && !error && !profile && (
          <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
            Place your first order to start earning loyalty points.
          </div>
        )}

        {!loading && !error && profile && (
          <div className="space-y-4">

            {profile.loyaltyPublicId && (
              <LoyaltyQRCard
                loyaltyPublicId={profile.loyaltyPublicId}
                tier={profile.tier}
                name={user?.email}
              />
            )}

            <TierCard profile={profile} />
            <StatsRow profile={profile} />

            {profile.streak > 0 && <StreakBonusInfo streak={profile.streak} />}

            <HowItWorks />

            {transactions.length > 0 && (
              <div className="rounded-xl border border-gray-100 bg-white">
                <div className="border-b border-gray-100 px-4 py-3">
                  <h3 className="text-sm font-semibold text-gray-900">Recent Activity</h3>
                </div>
                <div className="divide-y divide-gray-50 px-4">
                  {transactions.map((tx) => <TransactionRow key={tx.id} tx={tx} />)}
                </div>
              </div>
            )}

            {transactions.length === 0 && (
              <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-5 text-center">
                <p className="text-sm text-gray-500">Place your first order to start earning points.</p>
                <p className="mt-0.5 text-xs text-gray-400">Every $1 earns 1 point.</p>
              </div>
            )}

          </div>
        )}
      </div>

    </div>
  )
}