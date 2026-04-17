// =============================================================================
// src/pages/Admin/LoyaltyScan.tsx
// =============================================================================
// Owns:
//   - admin auth guard
//   - scanner lifecycle
//   - scan flow state machine
//   - award / redeem event handlers
//
// UI  → features/loyalty/components
// API → domain/loyalty/loyalty.service
//
// 2026 Production Fix:
//   ✅ Fixes scanner start/stop loop caused by effect cleanup churn
//   ✅ Serializes scanner operations to avoid overlapping media sessions
//   ✅ Waits for visible scanner host before starting camera
//   ✅ Uses dynamic qrbox sizing to avoid html5-qrcode min-size failures
//   ✅ Stops scanner before UI transitions that hide/move the scanner host
//   ✅ Prevents stale callbacks and stale async state writes
//   ✅ Keeps deterministic award idempotency via scan_id
//   ✅ Adds manual loyalty ID fallback
//   ✅ Preserves existing child component contracts
//   ✅ Improves accessibility and mobile resilience
// =============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  AwardResult,
  CustomerProfile,
  RedeemResult,
  ScanMode,
  ScanState,
} from '@/domain/loyalty/loyalty.types';

import { CustomerCard } from '@/features/loyalty/components/CustomerCard';
import { AwardSection } from '@/features/loyalty/components/AwardSection';
import { RedeemSection } from '@/features/loyalty/components/RedeemSection';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const SCANNER_DIV_ID = 'qr-scanner-region';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MIN_SCANNER_HOST_SIZE_PX = 160;
const MAX_HOST_READY_FRAMES = 30;

const SCANNER_CONFIG = {
  fps: 12,
  aspectRatio: 1,
  disableFlip: false,
  qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
    const shortestSide = Math.floor(Math.min(viewfinderWidth, viewfinderHeight));
    const safeMax = Math.max(50, shortestSide - 8);
    const target = Math.floor(shortestSide * 0.72);
    const edge = Math.min(Math.max(target, 50), safeMax, 280);

    return {
      width: edge,
      height: edge,
    };
  },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim().length > 0 ? error.message : fallback;
}

function normalizeScannerError(error: unknown, fallback: string): string {
  const message = getErrorMessage(error, fallback);
  const lower = message.toLowerCase();

  if (
    lower.includes("minimum size of 'config.qrbox' dimension value is 50px") ||
    lower.includes('qrbox')
  ) {
    return 'Scanner viewport is too small to initialize. Reopen the scanner and try again.';
  }

  if (lower.includes('notallowederror') || lower.includes('permission denied')) {
    return 'Camera access was blocked. Allow camera permission and try again.';
  }

  if (
    lower.includes('notreadableerror') ||
    lower.includes('could not start video source') ||
    lower.includes('trackstarterror')
  ) {
    return 'Camera is already in use by another app or browser tab. Close the other camera session and try again.';
  }

  if (lower.includes('notfounderror') || lower.includes('no camera')) {
    return 'No camera was found on this device.';
  }

  if (
    lower.includes('overconstrainederror') ||
    lower.includes('constraint') ||
    lower.includes('facingmode')
  ) {
    return 'The selected camera is unavailable. Switch cameras and try again.';
  }

  if (lower.includes('secure') || lower.includes('https')) {
    return 'Camera scanning requires HTTPS or localhost.';
  }

  if (lower.includes('aborterror')) {
    return 'The camera session ended unexpectedly. Please try again.';
  }

  return message;
}
function toError(error: unknown, fallback: string): Error {
  return error instanceof Error ? error : new Error(fallback);
}
function isValidUuid(value: string): boolean {
  return UUID_RE.test(value.trim());
}

function parseDollarsToCents(value: string): number | null {
  const dollars = Number.parseFloat(value);
  if (!Number.isFinite(dollars) || dollars <= 0 || dollars > 99_999) return null;
  return Math.round(dollars * 100);
}

function parseRedeemPoints(value: string): number | null {
  const points = Number.parseInt(value, 10);
  if (!Number.isFinite(points) || points < 100 || points > 50_000) return null;
  return points;
}

function sanitizeCurrencyInput(value: string): string {
  const normalized = value.replace(/[^\d.]/g, '');
  const firstDotIndex = normalized.indexOf('.');

  if (firstDotIndex === -1) {
    return normalized.slice(0, 5);
  }

  const whole = normalized.slice(0, firstDotIndex).replace(/\./g, '').slice(0, 5);
  const fraction = normalized
    .slice(firstDotIndex + 1)
    .replace(/\./g, '')
    .slice(0, 2);

  return `${whole || '0'}.${fraction}`;
}

function sanitizePointsInput(value: string): string {
  return value.replace(/\D/g, '').slice(0, 5);
}

function sanitizeManualLoyaltyId(value: string): string {
  return value.replace(/[^0-9a-fA-F-]/g, '').slice(0, 36);
}

async function stopScannerInstance(scanner: Html5Qrcode | null): Promise<void> {
  if (!scanner) return;

  try {
    if (scanner.isScanning) {
      await scanner.stop();
    }
  } catch {
    // swallow stop failure: scanner may already be tearing down
  }

  try {
    scanner.clear();
  } catch {
    // swallow clear failure: DOM/video may already be gone
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function LoyaltyScan() {
  const navigate = useNavigate();

  // auth
  const [authChecking, setAuthChecking] = useState(true);
  const [adminReady, setAdminReady] = useState(false);

  // flow
  const [mode, setMode] = useState<ScanMode>('award');
  const [scanState, setScanState] = useState<ScanState>('scanning');
  const [scannerStarted, setScannerStarted] = useState(false);
  const [cameraFacingMode, setCameraFacingMode] = useState<'environment' | 'user'>('environment');

  // deterministic idempotency anchor for a scan flow
  const [scanId, setScanId] = useState<string | null>(null);

  // data
  const [scannedId, setScannedId] = useState<string | null>(null);
  const [customer, setCustomer] = useState<CustomerProfile | null>(null);
  const [awardResult, setAwardResult] = useState<AwardResult | null>(null);
  const [redeemResult, setRedeemResult] = useState<RedeemResult | null>(null);

  // inputs
  const [amountDollars, setAmountDollars] = useState('');
  const [redeemPoints, setRedeemPoints] = useState('');
  const [manualLoyaltyId, setManualLoyaltyId] = useState('');

  // ui
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [manualErrorMsg, setManualErrorMsg] = useState<string | null>(null);
  const [lastAwardAmountCents, setLastAwardAmountCents] = useState<number | null>(null);
  const [lastRedeemedPoints, setLastRedeemedPoints] = useState<number | null>(null);

  // refs
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerHostRef = useRef<HTMLDivElement | null>(null);
  const mountedRef = useRef(false);
  const hasScannedRef = useRef(false);
  const scanRunIdRef = useRef(0);
  const verifyRequestRef = useRef(0);
  const mutationRequestRef = useRef(0);
  const authCheckRef = useRef(0);
  const scannerOpsRef = useRef<Promise<void>>(Promise.resolve());

  const adminReadyRef = useRef(adminReady);
  const scanStateRef = useRef(scanState);
  const cameraFacingModeRef = useRef(cameraFacingMode);

  // focus refs
  const foundSectionRef = useRef<HTMLDivElement | null>(null);
  const successSectionRef = useRef<HTMLDivElement | null>(null);
  const errorSectionRef = useRef<HTMLDivElement | null>(null);
  const manualInputRef = useRef<HTMLInputElement | null>(null);

  const cameraSupport = useMemo(() => {
    const secureContext = typeof window !== 'undefined' ? window.isSecureContext : false;
    const hasMediaDevices =
      typeof navigator !== 'undefined' &&
      typeof navigator.mediaDevices !== 'undefined' &&
      typeof navigator.mediaDevices.getUserMedia === 'function';

    return {
      secureContext,
      hasMediaDevices,
      canUseCamera: secureContext && hasMediaDevices,
    };
  }, []);

  useEffect(() => {
    adminReadyRef.current = adminReady;
  }, [adminReady]);

  useEffect(() => {
    scanStateRef.current = scanState;
  }, [scanState]);

  useEffect(() => {
    cameraFacingModeRef.current = cameraFacingMode;
  }, [cameraFacingMode]);

  const nextFrame = useCallback(async (): Promise<void> => {
    await new Promise<void>((resolve) => {
      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(() => {
          resolve();
        });
        return;
      }

      setTimeout(() => {
        resolve();
      }, 16);
    });
  }, []);

  const enqueueScannerOp = useCallback(async (operation: () => Promise<void>): Promise<void> => {
    const next = scannerOpsRef.current.then(operation, operation);
    scannerOpsRef.current = next.then(
      () => undefined,
      () => undefined,
    );
    await next;
  }, []);

  const waitForScannerHostReady = useCallback(async (): Promise<boolean> => {
    for (let frame = 0; frame < MAX_HOST_READY_FRAMES; frame += 1) {
      if (!mountedRef.current) return false;

      const host = scannerHostRef.current;
      if (!host) {
        await nextFrame();
        continue;
      }

      const rect = host.getBoundingClientRect();
      if (rect.width >= MIN_SCANNER_HOST_SIZE_PX && rect.height >= MIN_SCANNER_HOST_SIZE_PX) {
        return true;
      }

      await nextFrame();
    }

    return false;
  }, [nextFrame]);

  const requestStopScanner = useCallback(async (): Promise<void> => {
    await enqueueScannerOp(async () => {
      const scanner = scannerRef.current;
      scannerRef.current = null;
      hasScannedRef.current = false;

      await stopScannerInstance(scanner);

      if (mountedRef.current) {
        setScannerStarted(false);
      }
    });
  }, [enqueueScannerOp]);

  // ───────────────────────────────────────────────────────────────────────────
  // Mount lifecycle
  // ───────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      scanRunIdRef.current += 1;
      verifyRequestRef.current += 1;
      mutationRequestRef.current += 1;
      authCheckRef.current += 1;
      void requestStopScanner();
    };
  }, [requestStopScanner]);

  // ───────────────────────────────────────────────────────────────────────────
  // Reset helpers
  // ───────────────────────────────────────────────────────────────────────────

  const reset = useCallback(() => {
    scanRunIdRef.current += 1;
    verifyRequestRef.current += 1;
    mutationRequestRef.current += 1;
    hasScannedRef.current = false;

    setScanId(null);
    setScannedId(null);
    setCustomer(null);
    setAwardResult(null);
    setRedeemResult(null);
    setAmountDollars('');
    setRedeemPoints('');
    setManualLoyaltyId('');
    setErrorMsg(null);
    setManualErrorMsg(null);
    setLastAwardAmountCents(null);
    setLastRedeemedPoints(null);
    setScannerStarted(false);
    setScanState('scanning');

    void requestStopScanner();
  }, [requestStopScanner]);

  const handleModeSwitch = useCallback(
    (next: ScanMode) => {
      if (next === mode) return;
      setMode(next);
      reset();
    },
    [mode, reset],
  );

  const handleCameraFlip = useCallback(() => {
    setCameraFacingMode((current) => (current === 'environment' ? 'user' : 'environment'));
  }, []);

  const handleAmountChange = useCallback((nextValue: string) => {
    setAmountDollars(sanitizeCurrencyInput(nextValue));
    setErrorMsg(null);
  }, []);

  const handleRedeemPointsChange = useCallback((nextValue: string) => {
    setRedeemPoints(sanitizePointsInput(nextValue));
    setErrorMsg(null);
  }, []);

  // ───────────────────────────────────────────────────────────────────────────
  // Admin auth gate
  // ───────────────────────────────────────────────────────────────────────────

  const redirectUnauthorized = useCallback(
    (path: '/' | '/login') => {
      if (!mountedRef.current) return;

      setAdminReady(false);
      setAuthChecking(false);
      void requestStopScanner();
      void navigate(path, { replace: true });
    },
    [navigate, requestStopScanner],
  );

  const validateAdminUser = useCallback(
    async (userId: string | null | undefined): Promise<void> => {
      const authCheckId = authCheckRef.current + 1;
      authCheckRef.current = authCheckId;

      if (!userId) {
        redirectUnauthorized('/login');
        return;
      }

      try {
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', userId)
          .single();

        if (!mountedRef.current || authCheckRef.current !== authCheckId) return;

        if (error || profile?.role !== 'admin') {
          redirectUnauthorized('/');
          return;
        }

        setAdminReady(true);
        setAuthChecking(false);
      } catch {
        if (!mountedRef.current || authCheckRef.current !== authCheckId) return;
        redirectUnauthorized('/');
      }
    },
    [redirectUnauthorized],
  );

  useEffect(() => {
    let cancelled = false;

    async function checkAdmin(): Promise<void> {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (cancelled) return;
        await validateAdminUser(session?.user?.id ?? null);
      } catch {
        if (!cancelled) {
          redirectUnauthorized('/login');
        }
      }
    }

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      void validateAdminUser(session?.user?.id ?? null);
    });

    void checkAdmin();

    return () => {
      cancelled = true;
      authListener.subscription.unsubscribe();
    };
  }, [redirectUnauthorized, validateAdminUser]);

  // ───────────────────────────────────────────────────────────────────────────
  // Visibility/pagehide cleanup
  // ───────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!adminReady) return;

    const handleHidden = () => {
      scanRunIdRef.current += 1;
      hasScannedRef.current = false;
      setScannerStarted(false);
      void requestStopScanner();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        handleHidden();
      }
    };

    const onPageHide = () => {
      handleHidden();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', onPageHide);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [adminReady, requestStopScanner]);

  // ───────────────────────────────────────────────────────────────────────────
  // Focus management
  // ───────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    let frameId: number | null = null;

    const target =
      scanState === 'found'
        ? foundSectionRef.current
        : scanState === 'success'
          ? successSectionRef.current
          : scanState === 'error'
            ? errorSectionRef.current
            : null;

    if (!target) return;

    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      frameId = window.requestAnimationFrame(() => {
        target.focus();
      });
    } else {
      target.focus();
    }

    return () => {
      if (
        frameId !== null &&
        typeof window !== 'undefined' &&
        typeof window.cancelAnimationFrame === 'function'
      ) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [scanState]);

  // ───────────────────────────────────────────────────────────────────────────
  // Shared lookup flow
  // ───────────────────────────────────────────────────────────────────────────

  const performLookup = useCallback(async (trimmedId: string) => {
    const requestId = verifyRequestRef.current + 1;
    verifyRequestRef.current = requestId;

    setErrorMsg(null);
    setManualErrorMsg(null);
    setAwardResult(null);
    setRedeemResult(null);
    setLastAwardAmountCents(null);
    setLastRedeemedPoints(null);
    setCustomer(null);
    setScannedId(null);
    setScanId(null);
    setScanState('loading');

    try {
      const nextScanId = crypto.randomUUID();
      const profile = await verifyLoyaltyQR(trimmedId);

      if (!mountedRef.current || verifyRequestRef.current !== requestId) return;

      setScanId(nextScanId);
      setScannedId(trimmedId);
      setManualLoyaltyId(trimmedId);
      setCustomer(profile);
      setScanState('found');
    } catch (error) {
      if (!mountedRef.current || verifyRequestRef.current !== requestId) return;

      setErrorMsg(getErrorMessage(error, 'Verification failed. Please try again.'));
      setScanState('error');
    }
  }, []);

  // ───────────────────────────────────────────────────────────────────────────
  // QR scanned / manual lookup handlers
  // ───────────────────────────────────────────────────────────────────────────

  const handleQRScanned = useCallback(
    async (raw: string) => {
      if (hasScannedRef.current) return;

      hasScannedRef.current = true;
      scanRunIdRef.current += 1;

      await requestStopScanner();

      if (!mountedRef.current) return;

      setErrorMsg(null);
      setManualErrorMsg(null);

      const trimmed = raw.trim();
      if (!isValidUuid(trimmed)) {
        setScanState('error');
        setErrorMsg('Not a valid loyalty QR code. Try again.');
        return;
      }

      await performLookup(trimmed);
    },
    [performLookup, requestStopScanner],
  );

  const handleManualLookup = useCallback(async (): Promise<void> => {
    const trimmed = manualLoyaltyId.trim();

    if (!isValidUuid(trimmed)) {
      setManualErrorMsg('Enter a valid loyalty UUID.');
      if (manualInputRef.current) {
        manualInputRef.current.focus();
      }
      return;
    }

    hasScannedRef.current = true;
    scanRunIdRef.current += 1;

    await requestStopScanner();

    if (!mountedRef.current) return;

    setErrorMsg(null);
    setManualErrorMsg(null);

    await performLookup(trimmed);
  }, [manualLoyaltyId, performLookup, requestStopScanner]);

  // ───────────────────────────────────────────────────────────────────────────
  // Scanner lifecycle
  // ───────────────────────────────────────────────────────────────────────────

  const requestStartScanner = useCallback(
    (runId: number) => {
      void enqueueScannerOp(async () => {
        if (
          !mountedRef.current ||
          !adminReadyRef.current ||
          scanStateRef.current !== 'scanning' ||
          !cameraSupport.canUseCamera
        ) {
          return;
        }

        if (scannerRef.current) {
          return;
        }

        const hostReady = await waitForScannerHostReady();
        if (
          !hostReady ||
          !mountedRef.current ||
          scanRunIdRef.current !== runId ||
          !adminReadyRef.current ||
          scanStateRef.current !== 'scanning'
        ) {
          return;
        }

        const scanner = new Html5Qrcode(SCANNER_DIV_ID);
        scannerRef.current = scanner;
        hasScannedRef.current = false;

        let lastError: Error | null = null;

        const tryStart = async (facingMode: 'environment' | 'user'): Promise<boolean> => {
          try {
            await scanner.start(
              { facingMode },
              SCANNER_CONFIG,
              (decodedText) => {
                if (!mountedRef.current) return;
                if (scanRunIdRef.current !== runId) return;
                if (hasScannedRef.current) return;

                void handleQRScanned(decodedText);
              },
              () => {
                // ignore per-frame decode misses
              },
            );

            return true;
          } catch (error: unknown) {
            lastError = toError(error, 'Failed to start QR scanner.');
            return false;
          }
        };

        const preferredFacingMode = cameraFacingModeRef.current;
        const fallbackFacingMode = preferredFacingMode === 'environment' ? 'user' : 'environment';

        const started =
          (await tryStart(preferredFacingMode)) || (await tryStart(fallbackFacingMode));

        if (!started) {
          if (scannerRef.current === scanner) {
            scannerRef.current = null;
          }

          await stopScannerInstance(scanner);
          throw lastError ?? new Error('Failed to start QR scanner.');
        }

        if (
          !mountedRef.current ||
          scanRunIdRef.current !== runId ||
          !adminReadyRef.current ||
          scanStateRef.current !== 'scanning'
        ) {
          if (scannerRef.current === scanner) {
            scannerRef.current = null;
          }

          await stopScannerInstance(scanner);

          if (mountedRef.current) {
            setScannerStarted(false);
          }

          return;
        }

        if (mountedRef.current) {
          setScannerStarted(true);
        }
      }).catch((error: unknown) => {
        if (!mountedRef.current) return;
        if (!adminReadyRef.current) return;
        if (scanStateRef.current !== 'scanning') return;

        const resolvedError = toError(
          error,
          'Camera access failed. Allow camera permission and try again.',
        );

        setScannerStarted(false);
        setScanState('error');
        setErrorMsg(
          normalizeScannerError(
            resolvedError,
            'Camera access failed. Allow camera permission and try again.',
          ),
        );
      });
    },
    [cameraSupport.canUseCamera, enqueueScannerOp, handleQRScanned, waitForScannerHostReady],
  );

  useEffect(() => {
    if (!adminReady || scanState !== 'scanning' || !cameraSupport.canUseCamera) {
      void requestStopScanner();
      return;
    }

    const runId = scanRunIdRef.current;
    requestStartScanner(runId);

    return () => {
      void requestStopScanner();
    };
  }, [
    adminReady,
    cameraFacingMode,
    cameraSupport.canUseCamera,
    requestStartScanner,
    requestStopScanner,
    scanState,
  ]);

  // ───────────────────────────────────────────────────────────────────────────
  // Award flow
  // ───────────────────────────────────────────────────────────────────────────

  const handleAward = useCallback(async () => {
    if (!customer) return;

    const amountCents = parseDollarsToCents(amountDollars);
    if (amountCents === null) {
      setErrorMsg('Enter a valid purchase amount (e.g. 24.50)');
      return;
    }

    const stableScanId = scanId ?? crypto.randomUUID();
    if (!scanId) {
      setScanId(stableScanId);
    }

    const previousTier = customer.tier;
    const requestId = mutationRequestRef.current + 1;
    mutationRequestRef.current = requestId;

    setScanState('awarding');
    setErrorMsg(null);

    try {
      const result = await awardLoyaltyPoints(customer.account_id, amountCents, stableScanId);

      if (!mountedRef.current || mutationRequestRef.current !== requestId) return;

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

      setAwardResult({
        ...result,
        tier_before: previousTier,
      });
      setLastAwardAmountCents(amountCents);
      setScanState('success');
    } catch (error) {
      if (!mountedRef.current || mutationRequestRef.current !== requestId) return;

      setErrorMsg(getErrorMessage(error, 'Award failed. Try again.'));
      setScanState('found');
    }
  }, [amountDollars, customer, scanId]);

  // ───────────────────────────────────────────────────────────────────────────
  // Redeem flow
  // ───────────────────────────────────────────────────────────────────────────

  const handleRedeem = useCallback(async () => {
    if (!customer) return;

    const points = parseRedeemPoints(redeemPoints);
    if (points === null) {
      setErrorMsg('Enter a valid point amount (min 100, max 50,000)');
      return;
    }

    if (points > customer.balance) {
      setErrorMsg(`Customer only has ${Number(customer.balance).toLocaleString()} points`);
      return;
    }

    const requestId = mutationRequestRef.current + 1;
    mutationRequestRef.current = requestId;

    setScanState('awarding');
    setErrorMsg(null);

    try {
      const result = await redeemLoyaltyPoints(customer.account_id, points);

      if (!mountedRef.current || mutationRequestRef.current !== requestId) return;

      setCustomer((prev) =>
        prev
          ? {
              ...prev,
              balance: result.new_balance,
            }
          : prev,
      );

      setRedeemResult(result);
      setLastRedeemedPoints(points);
      setScanState('success');
    } catch (error) {
      if (!mountedRef.current || mutationRequestRef.current !== requestId) return;

      if (error instanceof Error && error.message === 'DUPLICATE') {
        setErrorMsg('This redemption was already processed.');
        setScanState('found');
        return;
      }

      setErrorMsg(getErrorMessage(error, 'Redemption failed. Try again.'));
      setScanState('found');
    }
  }, [customer, redeemPoints]);

  // ───────────────────────────────────────────────────────────────────────────
  // Derived UI
  // ───────────────────────────────────────────────────────────────────────────

  const isScanning = scanState === 'scanning';
  const isBusy = scanState === 'loading' || scanState === 'awarding';
  const showManualFallback = scanState === 'scanning' || scanState === 'error';

  const scannerShellClassName = useMemo(
    () =>
      isScanning
        ? 'mb-4 overflow-hidden rounded-2xl border border-white/8 bg-gray-900'
        : 'pointer-events-none fixed -left-[10000px] top-0 h-px w-px overflow-hidden opacity-0',
    [isScanning],
  );

  const liveRegionMessage = useMemo(() => {
    if (authChecking) return 'Checking admin access.';
    if (!adminReady) return 'Admin access required.';
    if (manualErrorMsg) return manualErrorMsg;

    switch (scanState) {
      case 'scanning':
        return scannerStarted ? 'Camera ready. Aim at a loyalty QR code.' : 'Starting camera.';
      case 'loading':
        return 'Verifying loyalty customer.';
      case 'found':
        return 'Customer found.';
      case 'awarding':
        return mode === 'award' ? 'Awarding loyalty points.' : 'Processing redemption.';
      case 'success':
        return mode === 'award'
          ? 'Loyalty points awarded successfully.'
          : 'Loyalty redemption completed successfully.';
      case 'error':
        return errorMsg ?? 'Something went wrong.';
      default:
        return 'Loyalty scanner ready.';
    }
  }, [adminReady, authChecking, errorMsg, manualErrorMsg, mode, scanState, scannerStarted]);

  const scannerHintText =
    mode === 'award'
      ? 'Point camera at customer QR to award points'
      : 'Point camera at customer QR to redeem points';

  const cameraStatusText = !cameraSupport.canUseCamera
    ? !cameraSupport.hasMediaDevices
      ? 'This browser does not support camera scanning.'
      : 'Camera scanning requires HTTPS or localhost.'
    : scannerStarted
      ? cameraFacingMode === 'environment'
        ? 'Rear camera active'
        : 'Front camera active'
      : 'Starting camera…';

  // ───────────────────────────────────────────────────────────────────────────
  // Guards
  // ───────────────────────────────────────────────────────────────────────────

  if (authChecking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50" aria-busy="true">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-gray-700" />
      </div>
    );
  }

  if (!adminReady) {
    return null;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Render
  // ───────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-950 px-4 py-8" aria-busy={isBusy}>
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {liveRegionMessage}
      </div>

      <div className="mx-auto max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-bold tracking-tight text-white">Loyalty Scanner</h1>
          <p className="mt-1 text-sm text-gray-500">Scan a customer&apos;s QR code</p>
        </div>

        {isScanning ? (
          <div className="mb-4 space-y-3">
            <div className="flex rounded-xl border border-white/10 bg-white/5 p-1">
              {(['award', 'redeem'] as const).map((nextMode) => (
                <button
                  key={nextMode}
                  type="button"
                  onClick={() => handleModeSwitch(nextMode)}
                  aria-pressed={mode === nextMode}
                  disabled={isBusy}
                  className={`flex-1 rounded-lg py-2 text-sm font-semibold capitalize transition ${
                    mode === nextMode
                      ? 'bg-amber-500 text-white shadow'
                      : 'text-gray-400 hover:text-white'
                  } ${isBusy ? 'cursor-not-allowed opacity-70' : ''}`}
                >
                  {nextMode === 'award' ? '⭐ Award Points' : '🎁 Redeem Points'}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-gray-400">
              <span>{cameraStatusText}</span>

              {cameraSupport.canUseCamera ? (
                <button
                  type="button"
                  onClick={handleCameraFlip}
                  disabled={isBusy}
                  className={`rounded-md px-2 py-1 font-medium text-white transition hover:bg-white/10 ${
                    isBusy ? 'cursor-not-allowed opacity-70' : ''
                  }`}
                >
                  {cameraFacingMode === 'environment' ? 'Use front camera' : 'Use rear camera'}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className={scannerShellClassName} aria-hidden={!isScanning}>
          <div
            ref={scannerHostRef}
            className="relative aspect-square w-full overflow-hidden bg-black"
          >
            <div id={SCANNER_DIV_ID} className="h-full w-full" />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="relative h-52 w-52">
                {[
                  'top-0 left-0 rounded-tl-md border-l-2 border-t-2',
                  'top-0 right-0 rounded-tr-md border-r-2 border-t-2',
                  'bottom-0 left-0 rounded-bl-md border-b-2 border-l-2',
                  'bottom-0 right-0 rounded-br-md border-b-2 border-r-2',
                ].map((cls) => (
                  <div key={cls} className={`absolute h-8 w-8 border-amber-400 ${cls}`} />
                ))}
                <div className="absolute left-2 right-2 top-0 h-0.5 animate-[scan_2s_ease-in-out_infinite] bg-amber-400/60" />
              </div>
            </div>
          </div>

          <div className="px-5 py-4 text-center">
            <p className="text-sm text-gray-400">{scannerHintText}</p>
          </div>
        </div>

        {isBusy ? (
          <div
            className="flex flex-col items-center gap-4 rounded-2xl border border-white/8 bg-gray-900 px-6 py-12"
            role="status"
            aria-live="polite"
          >
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-gray-700 border-t-amber-400" />
            <p className="text-sm text-gray-400">
              {scanState === 'loading'
                ? 'Verifying customer…'
                : mode === 'award'
                  ? 'Awarding points…'
                  : 'Processing redemption…'}
            </p>
          </div>
        ) : null}

        {scanState === 'found' && customer && scannedId ? (
          <div ref={foundSectionRef} tabIndex={-1} className="space-y-4 outline-none">
            <CustomerCard customer={customer} loyaltyId={scannedId} />

            {mode === 'award' ? (
              <AwardSection
                amountDollars={amountDollars}
                errorMsg={errorMsg}
                onChange={handleAmountChange}
                onAward={() => {
                  void handleAward();
                }}
                onCancel={reset}
              />
            ) : (
              <RedeemSection
                balance={customer.balance}
                redeemPoints={redeemPoints}
                errorMsg={errorMsg}
                onChange={handleRedeemPointsChange}
                onRedeem={() => {
                  void handleRedeem();
                }}
                onCancel={reset}
              />
            )}
          </div>
        ) : null}

        {scanState === 'success' && mode === 'award' && awardResult && customer ? (
          <div ref={successSectionRef} tabIndex={-1} className="space-y-4 outline-none">
            <div className="overflow-hidden rounded-2xl border border-emerald-500/20 bg-gray-900">
              <div className="flex flex-col items-center gap-3 bg-emerald-500/10 px-6 py-8">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20 ring-1 ring-emerald-500/30">
                  <span className="text-2xl">✓</span>
                </div>

                <div className="text-center">
                  <p className="text-sm font-medium text-emerald-400">Points Awarded</p>
                  <p className="mt-1 font-mono text-4xl font-bold text-white">
                    +{Number(awardResult.points_earned ?? 0).toLocaleString()}
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
                  <span className="text-gray-500">Purchase amount</span>
                  <span className="font-medium text-white">
                    {formatCurrency((lastAwardAmountCents ?? 0) / 100)}
                  </span>
                </div>

                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">New balance</span>
                  <span className="font-mono font-bold text-amber-400">
                    {Number(awardResult.new_balance ?? 0).toLocaleString()} pts
                  </span>
                </div>

                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Streak</span>
                  <span className="font-medium text-white">
                    {Number(awardResult.streak ?? 0)} days
                  </span>
                </div>

                {awardResult.tier_changed
                  ? (() => {
                      const previousTier = LOYALTY_TIERS[asTier(awardResult.tier_before)];
                      const nextTier = LOYALTY_TIERS[asTier(awardResult.new_tier)];

                      return (
                        <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-center">
                          <p className="text-xs font-semibold text-amber-300">
                            🎊 Tier upgrade! {previousTier.icon} {previousTier.label} →{' '}
                            {nextTier.icon} {nextTier.label}
                          </p>
                        </div>
                      );
                    })()
                  : null}
              </div>
            </div>

            <button
              type="button"
              onClick={reset}
              className="w-full rounded-xl bg-white/8 py-3.5 text-sm font-bold text-white transition hover:bg-white/12 active:scale-95"
            >
              Scan Next Customer
            </button>
          </div>
        ) : null}

        {scanState === 'success' && mode === 'redeem' && redeemResult && customer ? (
          <div ref={successSectionRef} tabIndex={-1} className="space-y-4 outline-none">
            <div className="overflow-hidden rounded-2xl border border-emerald-500/20 bg-gray-900">
              <div className="flex flex-col items-center gap-3 bg-emerald-500/10 px-6 py-8">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20 ring-1 ring-emerald-500/30">
                  <span className="text-2xl">🎁</span>
                </div>

                <div className="text-center">
                  <p className="text-sm font-medium text-emerald-400">Redemption Applied</p>
                  <p className="mt-1 font-mono text-4xl font-bold text-white">
                    {formatCurrency((lastRedeemedPoints ?? 0) / 100)}
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
                  <span className="text-gray-500">Redeemed points</span>
                  <span className="font-medium text-white">
                    {Number(lastRedeemedPoints ?? 0).toLocaleString()} pts
                  </span>
                </div>

                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Remaining balance</span>
                  <span className="font-mono font-bold text-amber-400">
                    {Number(redeemResult.new_balance ?? 0).toLocaleString()} pts
                  </span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={reset}
              className="w-full rounded-xl bg-white/8 py-3.5 text-sm font-bold text-white transition hover:bg-white/12 active:scale-95"
            >
              Scan Next Customer
            </button>
          </div>
        ) : null}

        {scanState === 'error' ? (
          <div ref={errorSectionRef} tabIndex={-1} className="space-y-4 outline-none">
            <div
              className="flex flex-col items-center gap-4 rounded-2xl border border-red-500/20 bg-gray-900 px-6 py-10 text-center"
              role="alert"
              aria-live="assertive"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10 ring-1 ring-red-500/20">
                <span className="text-xl">⚠</span>
              </div>

              <div>
                <p className="font-semibold text-white">Scan Failed</p>
                <p className="mt-1 text-sm text-gray-500">{errorMsg ?? 'Something went wrong.'}</p>
              </div>
            </div>

            <button
              type="button"
              onClick={reset}
              className="w-full rounded-xl bg-amber-500 py-3.5 text-sm font-bold text-white transition hover:bg-amber-400 active:scale-95"
            >
              Try Again
            </button>
          </div>
        ) : null}

        {showManualFallback ? (
          <div className="mt-4 rounded-2xl border border-white/8 bg-gray-900 p-4">
            <div className="mb-3">
              <h2 className="text-sm font-semibold text-white">Manual lookup fallback</h2>
              <p className="mt-1 text-xs text-gray-500">
                Paste a loyalty UUID from a trusted source when camera access is unavailable or
                unreliable.
              </p>
            </div>

            <label
              htmlFor="manual-loyalty-id"
              className="mb-2 block text-xs font-medium text-gray-400"
            >
              Loyalty UUID
            </label>

            <input
              ref={manualInputRef}
              id="manual-loyalty-id"
              type="text"
              value={manualLoyaltyId}
              onChange={(event) => {
                setManualLoyaltyId(sanitizeManualLoyaltyId(event.target.value));
                setManualErrorMsg(null);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void handleManualLookup();
                }
              }}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              inputMode="text"
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-sm text-white outline-none transition placeholder:text-gray-600 focus:border-amber-400"
              aria-invalid={manualErrorMsg ? 'true' : 'false'}
              aria-describedby={manualErrorMsg ? 'manual-loyalty-id-error' : undefined}
            />

            {manualErrorMsg ? (
              <p id="manual-loyalty-id-error" className="mt-2 text-xs text-red-400" role="alert">
                {manualErrorMsg}
              </p>
            ) : null}

            {!cameraSupport.canUseCamera ? (
              <p className="mt-2 text-xs text-amber-300">{cameraStatusText}</p>
            ) : null}

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  void handleManualLookup();
                }}
                disabled={isBusy}
                className={`flex-1 rounded-xl bg-amber-500 py-3 text-sm font-semibold text-white transition hover:bg-amber-400 active:scale-95 ${
                  isBusy ? 'cursor-not-allowed opacity-70' : ''
                }`}
              >
                Verify Loyalty ID
              </button>

              <button
                type="button"
                onClick={reset}
                disabled={isBusy}
                className={`rounded-xl bg-white/8 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/12 active:scale-95 ${
                  isBusy ? 'cursor-not-allowed opacity-70' : ''
                }`}
              >
                Reset
              </button>
            </div>
          </div>
        ) : null}
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