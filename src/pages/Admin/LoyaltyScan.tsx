// src/pages/Admin/LoyaltyScan.tsx
// ============================================================================
// ADMIN LOYALTY SCANNER
// ============================================================================
//
// Tier config sourced entirely from @/domain/loyalty/tiers.
// Local TIER_ICON and TIER_COLORS objects removed.
// ============================================================================

import { useEffect, useRef, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Html5Qrcode } from 'html5-qrcode'
import { supabase } from '@/lib/supabase/supabaseClient'
import { LOYALTY_TIERS, asTier } from '@/domain/loyalty/tiers'

// ============================================================================
// TYPES
// ============================================================================

type ScanState = 'scanning' | 'loading' | 'found' | 'awarding' | 'success' | 'error'

interface CustomerProfile {
  full_name:       string | null
  loyalty_tier:    string
  loyalty_points:  number
  lifetime_points: number
  loyalty_streak:  number
  last_order_date: string | null
}

interface AwardResult {
  points_earned: number
  new_balance:   number
  tier:          string
  tier_changed:  boolean
  tier_before:   string
  streak:        number
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function LoyaltyScan() {
  const navigate = useNavigate()

  const [adminReady, setAdminReady] = useState(false);
  const [authChecking,  setAuthChecking]  = useState(true)

  const [scanState,      setScanState]      = useState<ScanState>('scanning')
  const [scannedId,      setScannedId]      = useState<string | null>(null)
  const [customer,       setCustomer]       = useState<CustomerProfile | null>(null)
  const [amountDollars,  setAmountDollars]  = useState('')
  const [awardResult,    setAwardResult]    = useState<AwardResult | null>(null)
  const [errorMsg,       setErrorMsg]       = useState<string | null>(null)
  const [scannerStarted, setScannerStarted] = useState(false)
  const [copied,         setCopied]         = useState(false)

  const scannerRef    = useRef<Html5Qrcode | null>(null)
  const scannerDivId  = 'qr-scanner-region'
  const hasScannedRef = useRef(false)

  // ── Copy loyalty ID ─────────────────────────────────────────────────────
  async function handleCopy() {
    if (!scannedId) return
    try {
      await navigator.clipboard.writeText(scannedId)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* ignore */ }
  }

  // ============================================================================
  // AUTH CHECK
  // ============================================================================

  useEffect(() => {
    async function checkAdmin() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.access_token || !session?.user?.id) {
          navigate('/login', { replace: true });
          return;
        }

        const { data: prof, error } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', session.user.id)
          .single();

        if (error || prof?.role !== 'admin') {
          navigate('/', { replace: true });
          return;
        }

        setAdminReady(true);
      } finally {
        setAuthChecking(false)
      }
    }

    checkAdmin()
  }, [navigate])

  // ============================================================================
  // QR SCANNED → VERIFY
  // ============================================================================

const handleQRScanned = useCallback(async (raw: string) => {
  if (scannerRef.current?.isScanning) {
    await scannerRef.current.stop().catch(() => {});
  }

  setScannerStarted(false);
  setScanState('loading');
  setErrorMsg(null);

  const UUID_RE = /^[0-9a-f-]{36}$/i;
  const trimmed = raw.trim();

  if (!UUID_RE.test(trimmed)) {
    setErrorMsg('Not a valid loyalty QR code. Try again.');
    setScanState('error');
    return;
  }

  try {
    // ✅ ALWAYS GET FRESH SESSION
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      throw new Error('Not authenticated');
    }

    const res = await supabase.functions.invoke('verify-loyalty-qr', {
      body: { loyalty_public_id: trimmed },
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    if (res.error || !res.data) {
      throw new Error(res.error?.message ?? 'Customer not found');
    }

    setScannedId(trimmed);
    setCustomer(res.data);
    setScanState('found');
  } catch (err) {
    setErrorMsg(err instanceof Error ? err.message : 'Verification failed');
    setScanState('error');
  }
}, []);

  // ============================================================================
  // SCANNER LIFECYCLE
  // ============================================================================

  useEffect(() => {
    if (!adminReady || scanState !== 'scanning' || scannerStarted) return

    let scanner: Html5Qrcode | null = null

    async function startScanner() {
      try {
        scanner = new Html5Qrcode(scannerDivId)
        scannerRef.current   = scanner
        hasScannedRef.current = false

        await scanner.start(
          { facingMode: 'environment' },
          { fps: 15, qrbox: { width: 240, height: 240 }, aspectRatio: 1.0, disableFlip: false },
          (decodedText) => {
            if (hasScannedRef.current) return
            hasScannedRef.current = true
            handleQRScanned(decodedText)
          },
          () => {}
        )

        setScannerStarted(true)
      } catch {
        setErrorMsg('Camera access denied. Please allow camera permission and reload.')
        setScanState('error')
      }
    }

    startScanner()

    return () => {
      if (scannerRef.current?.isScanning) {
        scannerRef.current.stop().catch(() => {})
      }
    }
  }, [adminReady, scanState, scannerStarted, handleQRScanned])

  // ============================================================================
  // AWARD POINTS
  // ============================================================================

 async function handleAwardPoints() {
   if (!scannedId || !customer) return;

   const dollars = parseFloat(amountDollars);
   if (isNaN(dollars) || dollars <= 0 || dollars > 99999) {
     setErrorMsg('Enter a valid purchase amount (e.g. 24.50)');
     return;
   }

   const amountCents = Math.round(dollars * 100);
   setScanState('awarding');
   setErrorMsg(null);

   try {
     // ✅ ALWAYS GET FRESH SESSION
     const {
       data: { session },
     } = await supabase.auth.getSession();

     if (!session?.access_token) {
       throw new Error('Not authenticated');
     }

     const res = await supabase.functions.invoke('award-loyalty-qr', {
       body: {
         loyalty_public_id: scannedId,
         amount_cents: amountCents,
       },
       headers: {
         Authorization: `Bearer ${session.access_token}`,
       },
     });

     if (res.error || !res.data) {
       throw new Error(res.error?.message ?? 'Award failed');
     }

     setAwardResult(res.data);
     setScanState('success');
   } catch (err) {
     setErrorMsg(err instanceof Error ? err.message : 'Award failed. Try again.');
     setScanState('found');
   }
 }
  // ============================================================================
  // RESET
  // ============================================================================

  function reset() {
    setScannedId(null)
    setCustomer(null)
    setAmountDollars('')
    setAwardResult(null)
    setErrorMsg(null)
    hasScannedRef.current = false
    setScanState('scanning')
    setScannerStarted(false)
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  if (authChecking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-gray-700" />
      </div>
    )
  }

  if (!adminReady) return null

  return (
    <div className="min-h-screen bg-gray-950 px-4 py-8">
      <div className="mx-auto max-w-sm">

        <div className="mb-6 text-center">
          <h1 className="text-xl font-bold tracking-tight text-white">Loyalty Scanner</h1>
          <p className="mt-1 text-sm text-gray-500">Scan a customer's QR code</p>
        </div>

        {/* ── SCANNING ──────────────────────────────────────────────────── */}
        {scanState === 'scanning' && (
          <div className="overflow-hidden rounded-2xl border border-white/8 bg-gray-900">
            <div className="relative aspect-square w-full overflow-hidden bg-black">
              <div id={scannerDivId} className="h-full w-full" />
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="relative h-52 w-52">
                  {(['top-0 left-0', 'top-0 right-0', 'bottom-0 left-0', 'bottom-0 right-0'] as const).map((pos, i) => (
                    <div key={i} className={`absolute h-8 w-8 ${pos} border-amber-400 ${
                      i === 0 ? 'border-t-2 border-l-2 rounded-tl-md' :
                      i === 1 ? 'border-t-2 border-r-2 rounded-tr-md' :
                      i === 2 ? 'border-b-2 border-l-2 rounded-bl-md' :
                               'border-b-2 border-r-2 rounded-br-md'
                    }`} />
                  ))}
                  <div className="absolute left-2 right-2 top-0 h-0.5 animate-[scan_2s_ease-in-out_infinite] bg-amber-400/60" />
                </div>
              </div>
            </div>
            <div className="px-5 py-4 text-center">
              <p className="text-sm text-gray-400">Point camera at customer's loyalty QR code</p>
            </div>
          </div>
        )}

        {/* ── LOADING ───────────────────────────────────────────────────── */}
        {scanState === 'loading' && (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-white/8 bg-gray-900 px-6 py-12">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-gray-700 border-t-amber-400" />
            <p className="text-sm text-gray-400">Verifying customer…</p>
          </div>
        )}

        {/* ── FOUND ─────────────────────────────────────────────────────── */}
        {scanState === 'found' && customer && (
          <div className="space-y-4">

            {/* Customer card — tier badge uses LOYALTY_TIERS[tier] from domain */}
            <div className="rounded-2xl border border-white/8 bg-gray-900 p-5">
              {(() => {
                const tier    = asTier(customer.loyalty_tier)
                const tierCfg = LOYALTY_TIERS[tier]
                return (
                  <>
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-500">
                          Customer Found
                        </p>
                        <p className="mt-1 text-lg font-bold text-white">
                          {customer.full_name ?? 'Anonymous Member'}
                        </p>
                      </div>
                      {/* icon + label + colors from LOYALTY_TIERS — not from local config */}
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${tierCfg.colors.text} ${tierCfg.colors.bg} ${tierCfg.colors.border}`}>
                        {tierCfg.icon} {tierCfg.label}
                      </span>
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-2">
                      {[
                        { label: 'Balance',  value: customer.loyalty_points.toLocaleString()  },
                        { label: 'Lifetime', value: customer.lifetime_points.toLocaleString() },
                        { label: 'Streak',   value: `${customer.loyalty_streak}d`             },
                      ].map(({ label, value }) => (
                        <div key={label} className="rounded-lg bg-white/4 px-3 py-2.5 text-center">
                          <p className="text-[10px] uppercase tracking-wider text-gray-500">{label}</p>
                          <p className="mt-0.5 font-mono text-base font-bold text-white">{value}</p>
                        </div>
                      ))}
                    </div>

                    {scannedId && (
                      <button
                        onClick={handleCopy}
                        className="mt-4 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-mono text-xs text-gray-400 transition hover:bg-white/10 active:scale-[0.98]"
                      >
                        {copied ? '✓ Copied Loyalty ID' : 'Copy Loyalty ID'}
                      </button>
                    )}

                    {customer.last_order_date && (
                      <p className="mt-3 text-[11px] text-gray-600">
                        Last order:{' '}
                        {new Date(customer.last_order_date).toLocaleDateString('en-US', {
                          month: 'short', day: 'numeric', year: 'numeric',
                        })}
                      </p>
                    )}
                  </>
                )
              })()}
            </div>

            {/* Amount input */}
            <div className="rounded-2xl border border-white/8 bg-gray-900 p-5">
              <label className="block text-xs font-bold uppercase tracking-[0.15em] text-gray-500">
                Purchase Amount
              </label>
              <div className="mt-2 flex items-center overflow-hidden rounded-xl border border-white/10 bg-white/4 focus-within:border-amber-500/50 focus-within:ring-1 focus-within:ring-amber-500/30">
                <span className="pl-4 font-mono text-lg text-gray-400">$</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0.01"
                  max="99999"
                  placeholder="0.00"
                  value={amountDollars}
                  onChange={(e) => setAmountDollars(e.target.value)}
                  className="flex-1 bg-transparent px-2 py-3.5 font-mono text-xl text-white placeholder-gray-700 outline-none"
                  autoFocus
                />
              </div>

              {amountDollars && !isNaN(parseFloat(amountDollars)) && parseFloat(amountDollars) > 0 && (
                <p className="mt-2 text-center text-xs text-gray-500">
                  ≈ <span className="font-semibold text-amber-400">
                    {Math.floor(parseFloat(amountDollars))} base pts
                  </span>{' '}
                  before tier & streak multipliers
                </p>
              )}

              {errorMsg && (
                <p className="mt-2 text-center text-xs font-medium text-red-400">{errorMsg}</p>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={reset}
                className="rounded-xl border border-white/8 px-4 py-3 text-sm font-medium text-gray-400 transition hover:bg-white/4"
              >
                Cancel
              </button>
              <button
                onClick={handleAwardPoints}
                disabled={!amountDollars || parseFloat(amountDollars) <= 0}
                className="flex-1 rounded-xl bg-amber-500 py-3 text-sm font-bold text-white shadow-lg shadow-amber-500/20 transition hover:bg-amber-400 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Award Points
              </button>
            </div>
          </div>
        )}

        {/* ── AWARDING ──────────────────────────────────────────────────── */}
        {scanState === 'awarding' && (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-white/8 bg-gray-900 px-6 py-12">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-gray-700 border-t-amber-400" />
            <p className="text-sm text-gray-400">Awarding points…</p>
          </div>
        )}

        {/* ── SUCCESS ───────────────────────────────────────────────────── */}
        {scanState === 'success' && awardResult && customer && (
          <div className="space-y-4">
            <div className="overflow-hidden rounded-2xl border border-emerald-500/20 bg-gray-900">
              <div className="flex flex-col items-center gap-3 bg-emerald-500/10 px-6 py-8">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20 ring-1 ring-emerald-500/30">
                  <span className="text-2xl">✓</span>
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-emerald-400">Points Awarded</p>
                  <p className="mt-1 font-mono text-4xl font-bold text-white">
                    +{awardResult.points_earned.toLocaleString()}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">points</p>
                </div>
              </div>

              <div className="space-y-3 px-5 py-4">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Customer</span>
                  <span className="font-medium text-white">{customer.full_name ?? 'Member'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">New balance</span>
                  <span className="font-mono font-bold text-amber-400">
                    {awardResult.new_balance.toLocaleString()} pts
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Streak</span>
                  <span className="font-medium text-white">{awardResult.streak} days</span>
                </div>
                {awardResult.tier_changed && (() => {
                  // Use LOYALTY_TIERS for before/after labels — not local strings
                  const before = asTier(awardResult.tier_before)
                  const after  = asTier(awardResult.tier)
                  return (
                    <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-center">
                      <p className="text-xs font-semibold text-amber-300">
                        🎊 Tier upgrade!{' '}
                        {LOYALTY_TIERS[before].icon} {LOYALTY_TIERS[before].label} →{' '}
                        {LOYALTY_TIERS[after].icon} {LOYALTY_TIERS[after].label}
                      </p>
                    </div>
                  )
                })()}
              </div>
            </div>

            <button
              onClick={reset}
              className="w-full rounded-xl bg-white/8 py-3.5 text-sm font-bold text-white transition hover:bg-white/12 active:scale-95"
            >
              Scan Next Customer
            </button>
          </div>
        )}

        {/* ── ERROR ─────────────────────────────────────────────────────── */}
        {scanState === 'error' && (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-4 rounded-2xl border border-red-500/20 bg-gray-900 px-6 py-10 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10 ring-1 ring-red-500/20">
                <span className="text-xl">⚠</span>
              </div>
              <div>
                <p className="font-semibold text-white">Scan Failed</p>
                <p className="mt-1 text-sm text-gray-500">{errorMsg ?? 'Something went wrong.'}</p>
              </div>
            </div>
            <button
              onClick={reset}
              className="w-full rounded-xl bg-amber-500 py-3.5 text-sm font-bold text-white transition hover:bg-amber-400 active:scale-95"
            >
              Try Again
            </button>
          </div>
        )}

      </div>

      <style>{`
        @keyframes scan {
          0%   { top: 0; }
          50%  { top: calc(100% - 2px); }
          100% { top: 0; }
        }
      `}</style>
    </div>
  )
}