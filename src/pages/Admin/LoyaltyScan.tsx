// =============================================================================
// src/pages/Admin/LoyaltyScan.tsx
// Owns: auth guard, state, scanner lifecycle, event handlers.
// UI → features/loyalty/components   API → domain/loyalty/loyalty.service
// =============================================================================

import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { supabase } from '@/lib/supabase/supabaseClient';
import { LOYALTY_TIERS, asTier } from '@/domain/loyalty/tiers';
import { formatCurrency } from '@/utils/currency';

import {
  verifyLoyaltyQR,
  awardLoyaltyPoints,
  redeemLoyaltyPoints,
} from '@/domain/loyalty/loyalty.service';
import type {
  ScanMode,
  ScanState,
  CustomerProfile,
  AwardResult,
  RedeemResult,
} from '@/domain/loyalty/loyalty.types';
import { CustomerCard } from '@/features/loyalty/components/CustomerCard';
import { AwardSection } from '@/features/loyalty/components/AwardSection';
import { RedeemSection } from '@/features/loyalty/components/RedeemSection';

// ── Constants ─────────────────────────────────────────────────────────────────
const SCANNER_DIV_ID = 'qr-scanner-region';
const UUID_RE = /^[0-9a-f-]{36}$/i;

// ── Page ──────────────────────────────────────────────────────────────────────
export default function LoyaltyScan() {
  const navigate = useNavigate();

  // auth
  const [authChecking, setAuthChecking] = useState(true);
  const [adminReady, setAdminReady] = useState(false);

  // scanner
  const [mode, setMode] = useState<ScanMode>('award');
  const [scanState, setScanState] = useState<ScanState>('scanning');
  const [scannerStarted, setScannerStarted] = useState(false);

  // data
  const [scannedId, setScannedId] = useState<string | null>(null);
  const [customer, setCustomer] = useState<CustomerProfile | null>(null);
  const [awardResult, setAwardResult] = useState<AwardResult | null>(null);
  const [redeemResult, setRedeemResult] = useState<RedeemResult | null>(null);

  // inputs
  const [amountDollars, setAmountDollars] = useState('');
  const [redeemPoints, setRedeemPoints] = useState('');

  // ui
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const hasScannedRef = useRef(false);

  // ── Auth ─────────────────────────────────────────────────────────────────
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
        setAuthChecking(false);
      }
    }
    checkAdmin();
  }, [navigate]);

  // ── QR scanned ───────────────────────────────────────────────────────────
  const handleQRScanned = useCallback(async (raw: string) => {
    if (scannerRef.current?.isScanning) {
      await scannerRef.current.stop().catch(() => {});
    }
    setScannerStarted(false);
    setScanState('loading');
    setErrorMsg(null);

    const trimmed = raw.trim();
    if (!UUID_RE.test(trimmed)) {
      setErrorMsg('Not a valid loyalty QR code. Try again.');
      setScanState('error');
      return;
    }

    try {
      const profile = await verifyLoyaltyQR(trimmed);
      setScannedId(trimmed);
      setCustomer(profile);
      setScanState('found');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Verification failed. Please try again.');
      setScanState('error');
    }
  }, []);

  // ── Scanner lifecycle ────────────────────────────────────────────────────
  useEffect(() => {
    if (!adminReady || scanState !== 'scanning' || scannerStarted) return;

    async function startScanner() {
      try {
        const scanner = new Html5Qrcode(SCANNER_DIV_ID);
        scannerRef.current = scanner;
        hasScannedRef.current = false;

        await scanner.start(
          { facingMode: 'environment' },
          { fps: 15, qrbox: { width: 240, height: 240 }, aspectRatio: 1.0, disableFlip: false },
          (decoded) => {
            if (hasScannedRef.current) return;
            hasScannedRef.current = true;
            handleQRScanned(decoded);
          },
          () => {},
        );
        setScannerStarted(true);
      } catch {
        setErrorMsg('Camera access denied. Please allow camera permission and reload.');
        setScanState('error');
      }
    }

    startScanner();
    return () => {
      const scanner = scannerRef.current;

      if (scanner?.isScanning) {
        void scanner.stop().catch(() => {});
      }
    };
  }, [adminReady, scanState, scannerStarted, handleQRScanned]);

  // ── Award ────────────────────────────────────────────────────────────────
  async function handleAward() {
    if (!customer) return;

    const dollars = parseFloat(amountDollars);
    if (isNaN(dollars) || dollars <= 0 || dollars > 99999) {
      setErrorMsg('Enter a valid purchase amount (e.g. 24.50)');
      return;
    }

    const previousTier = customer.tier; // 👈 capture BEFORE update

    setScanState('awarding');
    setErrorMsg(null);

    try {
      const result = await awardLoyaltyPoints(customer.account_id, Math.round(dollars * 100));

      // Update live customer state
      setCustomer((prev) =>
        prev
          ? {
              ...prev,
              balance: result.new_balance,
              lifetime_earned: result.new_lifetime,
              tier: result.new_tier,
              streak: result.streak,
            }
          : prev,
      );

      // Store result + previous tier for animation
      setAwardResult({
        ...result,
        tier_before: previousTier,
      });

      setScanState('success');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Award failed. Try again.');
      setScanState('found');
    }
  }

  // ── Redeem ───────────────────────────────────────────────────────────────
  async function handleRedeem() {
    if (!customer) return;
    const pts = parseInt(redeemPoints, 10);
    if (!pts || pts < 100 || pts > 50000) {
      setErrorMsg('Enter a valid point amount (min 100, max 50,000)');
      return;
    }
    if (pts > customer.balance) {
      setErrorMsg(`Customer only has ${Number(customer?.balance ?? 0).toLocaleString()} points`);
      return;
    }
    setScanState('awarding');
    setErrorMsg(null);
    try {
      const result = await redeemLoyaltyPoints(customer.account_id, pts);
      setCustomer((prev) =>
        prev
          ? {
              ...prev,
              balance: result.new_balance,
            }
          : prev,
      );
      setRedeemResult(result);
      setScanState('success');
    } catch (err) {
      if (err instanceof Error && err.message === 'DUPLICATE') {
        setErrorMsg('This redemption was already processed.');
        setScanState('found');
        return;
      }
      setErrorMsg(err instanceof Error ? err.message : 'Redemption failed. Try again.');
      setScanState('found');
    }
  }

  // ── Reset ────────────────────────────────────────────────────────────────
  function reset() {
    setScannedId(null);
    setCustomer(null);
    setAmountDollars('');
    setRedeemPoints('');
    setAwardResult(null);
    setRedeemResult(null);
    setErrorMsg(null);
    hasScannedRef.current = false;
    setScanState('scanning');
    setScannerStarted(false);
  }

  function handleModeSwitch(next: ScanMode) {
    if (next === mode) return;
    setMode(next);
    reset();
  }

  // ── Guards ───────────────────────────────────────────────────────────────
  if (authChecking)
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-gray-700" />
      </div>
    );
  if (!adminReady) return null;

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-950 px-4 py-8">
      <div className="mx-auto max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-bold tracking-tight text-white">Loyalty Scanner</h1>
          <p className="mt-1 text-sm text-gray-500">Scan a customer's QR code</p>
        </div>

        {/* Mode toggle */}
        {scanState === 'scanning' && (
          <div className="mb-4 flex rounded-xl border border-white/10 bg-white/5 p-1">
            {(['award', 'redeem'] as ScanMode[]).map((m) => (
              <button
                key={m}
                onClick={() => handleModeSwitch(m)}
                className={`flex-1 rounded-lg py-2 text-sm font-semibold capitalize transition
                  ${mode === m ? 'bg-amber-500 text-white shadow' : 'text-gray-400 hover:text-white'}`}
              >
                {m === 'award' ? '⭐ Award Points' : '🎁 Redeem Points'}
              </button>
            ))}
          </div>
        )}

        {/* ── SCANNING ──────────────────────────────────────────────────── */}
        {scanState === 'scanning' && (
          <div className="overflow-hidden rounded-2xl border border-white/8 bg-gray-900">
            <div className="relative aspect-square w-full overflow-hidden bg-black">
              <div id={SCANNER_DIV_ID} className="h-full w-full" />
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="relative h-52 w-52">
                  {[
                    'top-0 left-0 border-t-2 border-l-2 rounded-tl-md',
                    'top-0 right-0 border-t-2 border-r-2 rounded-tr-md',
                    'bottom-0 left-0 border-b-2 border-l-2 rounded-bl-md',
                    'bottom-0 right-0 border-b-2 border-r-2 rounded-br-md',
                  ].map((cls, i) => (
                    <div key={i} className={`absolute h-8 w-8 border-amber-400 ${cls}`} />
                  ))}
                  <div className="absolute left-2 right-2 top-0 h-0.5 animate-[scan_2s_ease-in-out_infinite] bg-amber-400/60" />
                </div>
              </div>
            </div>
            <div className="px-5 py-4 text-center">
              <p className="text-sm text-gray-400">
                {mode === 'award'
                  ? 'Point camera at customer QR to award points'
                  : 'Point camera at customer QR to redeem points'}
              </p>
            </div>
          </div>
        )}

        {/* ── LOADING / PROCESSING ──────────────────────────────────────── */}
        {(scanState === 'loading' || scanState === 'awarding') && (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-white/8 bg-gray-900 px-6 py-12">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-gray-700 border-t-amber-400" />
            <p className="text-sm text-gray-400">
              {scanState === 'loading'
                ? 'Verifying customer…'
                : mode === 'award'
                  ? 'Awarding points…'
                  : 'Processing redemption…'}
            </p>
          </div>
        )}

        {/* ── FOUND ─────────────────────────────────────────────────────── */}
        {scanState === 'found' && customer && scannedId && (
          <div className="space-y-4">
            <CustomerCard customer={customer} loyaltyId={scannedId} />
            {mode === 'award' ? (
              <AwardSection
                amountDollars={amountDollars}
                errorMsg={errorMsg}
                onChange={setAmountDollars}
                onAward={handleAward}
                onCancel={reset}
              />
            ) : (
              <RedeemSection
                balance={customer.balance}
                redeemPoints={redeemPoints}
                errorMsg={errorMsg}
                onChange={setRedeemPoints}
                onRedeem={handleRedeem}
                onCancel={reset}
              />
            )}
          </div>
        )}

        {/* ── AWARD SUCCESS ──────────────────────────────────────────────── */}
        {scanState === 'success' && mode === 'award' && awardResult && customer && (
          <div className="space-y-4">
            <div className="overflow-hidden rounded-2xl border border-emerald-500/20 bg-gray-900">
              <div className="flex flex-col items-center gap-3 bg-emerald-500/10 px-6 py-8">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20 ring-1 ring-emerald-500/30">
                  <span className="text-2xl">✓</span>
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-emerald-400">Points Awarded</p>
                  <p className="mt-1 font-mono text-4xl font-bold text-white">
                    +{Number(awardResult?.points_earned ?? 0).toLocaleString()}
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
                    {Number(awardResult?.new_balance ?? 0).toLocaleString()} pts
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Streak</span>
                  <span className="font-medium text-white">
                    {Number(awardResult?.streak ?? 0)} days
                  </span>
                </div>
                {awardResult?.tier_changed &&
                  (() => {
                    const prev = LOYALTY_TIERS[asTier(awardResult.tier_before!)];
                    const next = LOYALTY_TIERS[asTier(awardResult.new_tier)];
                    return (
                      <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-center">
                        <p className="text-xs font-semibold text-amber-300">
                          🎊 Tier upgrade! {prev.icon} {prev.label} → {next.icon} {next.label}
                        </p>
                      </div>
                    );
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

        {/* ── REDEEM SUCCESS ─────────────────────────────────────────────── */}
        {scanState === 'success' && mode === 'redeem' && redeemResult && customer && (
          <div className="space-y-4">
            <div className="overflow-hidden rounded-2xl border border-emerald-500/20 bg-gray-900">
              <div className="flex flex-col items-center gap-3 bg-emerald-500/10 px-6 py-8">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20 ring-1 ring-emerald-500/30">
                  <span className="text-2xl">🎁</span>
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-emerald-400">Redemption Applied</p>
                  <p className="mt-1 font-mono text-4xl font-bold text-white">
                    {formatCurrency((parseInt(redeemPoints || '0', 10) || 0) / 100)}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">discount applied to order</p>
                </div>
              </div>
              <div className="space-y-3 px-5 py-4">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Customer</span>
                  <span className="font-medium text-white">{customer.full_name ?? 'Member'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Remaining balance</span>
                  <span className="font-mono font-bold text-amber-400">
                    {Number(redeemResult?.new_balance ?? 0).toLocaleString()} pts
                  </span>
                </div>
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
  );
}
