// src/modules/orders/pages/FindOrder.tsx
// ============================================================================
// FIND MY ORDER — Guest order recovery (Step 5 of Find My Order feature)
// ============================================================================
//
// Two-step recovery flow:
//   Step 1 — Guest enters order_number + contact → request-guest-order-access
//             Response is always generic: "If we found your order, we sent a code."
//   Step 2 — Guest enters 6-digit OTP → verify-guest-order-access
//             On success: stores guest_recovery_token in sessionStorage and
//             navigates to /order-status/:orderId.
//             On failure: generic error, no oracle about what failed.
//
// Security contract:
//   - contact, code, and guest_recovery_token are never logged.
//   - guest_recovery_token is stored in sessionStorage ONLY, never the URL.
//   - checkout_guest_token (same-session flow) is completely untouched.
//   - Authenticated user flow is completely untouched.
//   - Error messages never reveal whether an order or contact was found.
//
// Wire-up: add to router only after this file exists (Step 7 of the feature).
//   { path: 'find-order', lazy: lazyRoute(() => import('@/modules/orders/pages/FindOrder')) }
// ============================================================================

import { useState, useCallback }       from 'react';
import { useNavigate, Link }           from 'react-router-dom';
import { motion, AnimatePresence, MotionConfig } from 'framer-motion';
import { ArrowLeft, Search, CheckCircle2 } from 'lucide-react';

import { invokeEdge, InvokeEdgeError } from '@/lib/supabase/invoke';

// ─── Types ────────────────────────────────────────────────────────────────────

type FlowStep = 'request' | 'verify';

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * sessionStorage key for the recovered tracking token.
 * OrderStatus reads this alongside checkout_guest_token to authorize polling.
 * DISTINCT from checkout_guest_token — the two keys serve different flows.
 */
const RECOVERY_TOKEN_STORAGE_KEY = 'guest_order_recovery_token';

/** Always-generic message shown after step 1, regardless of server outcome. */
const GENERIC_SENT_MSG =
  'If we found your order, we sent you a verification code. Check your messages.';

/** Always-generic message shown on step 2 failure, regardless of failure reason. */
const GENERIC_FAIL_MSG =
  'That code is incorrect or has expired. Please request a new one.';

// ─── Client-side validation (UX only — not security gates) ───────────────────

function isNumericOrderNumber(v: string): boolean {
  const t = v.trim();
  return t.length > 0 && /^\d{1,8}$/.test(t);
}

function isPlausibleContact(v: string): boolean {
  const t = v.trim();
  if (t.length < 3) return false;
  // Phone: starts with +, digit, or common local formats
  if (/^[+\d\(]/.test(t)) return true;
  // Email: contains @ with text on both sides
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(t);
}

/** Strips non-digits, returns up to 6 characters. */
function sanitizeCode(v: string): string {
  return v.replace(/\D/g, '').slice(0, 6);
}

// ─── Animation variants ───────────────────────────────────────────────────────

const slideVariants = {
  hidden:  { opacity: 0, y: 18 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring' as const, stiffness: 340, damping: 28 },
  },
  exit:    { opacity: 0, y: -12, transition: { duration: 0.14 } },
};

const staggerContainer = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};

const fadeUp = {
  hidden:  { opacity: 0, y: 14 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring' as const, stiffness: 340, damping: 28 },
  },
};

// ─── Primitives ───────────────────────────────────────────────────────────────

function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) {
  return (
    <label
      htmlFor={htmlFor}
      className="block text-[11px] font-bold uppercase tracking-caps text-neutral-500"
    >
      {children}
    </label>
  );
}

function TextInput({
  className = '',
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={[
        'w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3',
        'text-sm text-white placeholder:text-neutral-600',
        'transition focus:border-amber-500/50 focus:outline-none focus:ring-1 focus:ring-amber-500/30',
        'disabled:cursor-not-allowed disabled:opacity-40',
        className,
      ].join(' ')}
    />
  );
}

function SubmitButton({
  busy,
  disabled,
  children,
}: {
  busy?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={disabled || busy}
      className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 py-3 text-sm font-bold text-neutral-950 transition hover:bg-amber-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {busy ? (
        <span
          className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-950/25 border-t-neutral-950"
          aria-hidden="true"
        />
      ) : null}
      {children}
    </button>
  );
}

function InfoBanner({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="status"
      className="flex gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm leading-relaxed text-amber-200"
    >
      <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-amber-400" />
      <span>{children}</span>
    </div>
  );
}

function ErrorBanner({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      role="alert"
      aria-live="assertive"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 28 }}
      className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300"
    >
      {children}
    </motion.div>
  );
}

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepDots({ current }: { current: FlowStep }) {
  return (
    <div className="mb-6 flex items-center gap-1.5" aria-hidden="true">
      <div className="h-1 w-6 rounded-full bg-amber-500 transition-all" />
      <div
        className={[
          'h-1 w-6 rounded-full transition-all',
          current === 'verify' ? 'bg-amber-500' : 'bg-white/10',
        ].join(' ')}
      />
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function FindOrder() {
  const navigate = useNavigate();

  const [step, setStep] = useState<FlowStep>('request');

  // Step 1 form state
  const [orderNumber, setOrderNumber]     = useState('');
  const [contact, setContact]             = useState('');
  const [requestBusy, setRequestBusy]     = useState(false);
  const [requestError, setRequestError]   = useState<string | null>(null);

  // Step 2 form state
  const [code, setCode]                   = useState('');
  const [verifyBusy, setVerifyBusy]       = useState(false);
  const [verifyError, setVerifyError]     = useState<string | null>(null);

  // ── Step 1: request a verification code ──────────────────────────────────
  //
  // The server always returns a generic 200 when inputs are valid, regardless
  // of whether an order was found. We move to step 2 on any 200 response.
  // 4xx/5xx errors surface as user-facing messages that do not reveal order data.

  const handleRequestCode = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (requestBusy) return;

      setRequestError(null);
      setRequestBusy(true);

      try {
        await invokeEdge('request-guest-order-access', {
          order_number: orderNumber.trim(),
          contact:      contact.trim(),
        });
        // Success (200) → step 2. Message is always generic.
        setStep('verify');
      } catch (err) {
        if (err instanceof InvokeEdgeError) {
          if (err.status === 429) {
            setRequestError('Too many requests. Please wait a few minutes before trying again.');
            return;
          }
          if (err.status === 400) {
            setRequestError('Please check your order number and contact details and try again.');
            return;
          }
        }
        // All other errors: generic fallback.
        setRequestError('Something went wrong. Please try again in a moment.');
      } finally {
        setRequestBusy(false);
      }
    },
    [requestBusy, orderNumber, contact],
  );

  // ── Step 2: verify the OTP and receive recovery token ────────────────────
  //
  // On success: store token in sessionStorage ONLY (never in URL), navigate.
  // On any failure: generic message — no oracle about which part failed.

  const handleVerifyCode = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (verifyBusy) return;

      setVerifyError(null);
      setVerifyBusy(true);

      const sanitizedCode = sanitizeCode(code);

      try {
        const result = await invokeEdge<{
          ok:                   boolean;
          order_id?:            string;
          guest_recovery_token?: string;
        }>('verify-guest-order-access', {
          order_number: orderNumber.trim(),
          contact:      contact.trim(),
          code:         sanitizedCode,
        });

        if (result.ok && result.order_id && result.guest_recovery_token) {
          // Persist token to sessionStorage — scoped to this browser tab.
          // NEVER placed in the URL, NEVER in localStorage.
          try {
            sessionStorage.setItem(RECOVERY_TOKEN_STORAGE_KEY, result.guest_recovery_token);
          } catch {
            // sessionStorage unavailable (sandboxed iframe, storage blocked).
            // Proceed to navigation — get-order-status will return 401 and the
            // guest can request a fresh code. Do not block the flow.
          }

          // Navigate: order_id goes in the path ONLY.
          // The recovery token is read from sessionStorage by OrderStatus.
          navigate(`/order-status/${result.order_id}`);
        } else {
          // Unexpected success shape — treat as failure.
          setVerifyError(GENERIC_FAIL_MSG);
        }
      } catch {
        // All failures use the same generic message.
        // The specific reason (wrong code, expired, wrong order, wrong contact)
        // is intentionally not surfaced to prevent an enumeration oracle.
        setVerifyError(GENERIC_FAIL_MSG);
      } finally {
        setVerifyBusy(false);
      }
    },
    [verifyBusy, code, orderNumber, contact, navigate],
  );

  // ── Start over: go back to step 1 ────────────────────────────────────────

  const handleStartOver = useCallback(() => {
    setStep('request');
    setCode('');
    setVerifyError(null);
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex min-h-svh items-center justify-center bg-neutral-950 px-4 py-10 text-neutral-200">
        <div className="w-full max-w-md">

          {/* ── Card ─────────────────────────────────────────────────────── */}
          <div className="overflow-hidden rounded-2xl border border-white/8 bg-neutral-950 shadow-2xl shadow-black/60">
            {/* Amber accent line — matches OrderSuccess */}
            <div className="h-0.5 w-full bg-linear-to-r from-transparent via-amber-500/60 to-transparent" />

            <div className="p-6 sm:p-8">

              {/* ── Back navigation ── */}
              <Link
                to="/menu"
                className="mb-7 inline-flex items-center gap-1.5 text-xs font-medium text-neutral-600 transition hover:text-neutral-400"
              >
                <ArrowLeft size={13} />
                Back to menu
              </Link>

              {/* ── Page header (static — always visible) ── */}
              <motion.div
                variants={staggerContainer}
                initial="hidden"
                animate="visible"
                className="mb-6"
              >
                <motion.div
                  variants={fadeUp}
                  className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/15 ring-1 ring-amber-500/30"
                >
                  <Search size={19} className="text-amber-400" />
                </motion.div>

                <motion.h1
                  variants={fadeUp}
                  className="text-2xl font-bold tracking-tight text-white"
                >
                  Find My Order
                </motion.h1>

                <motion.p
                  variants={fadeUp}
                  className="mt-2 text-sm leading-relaxed text-neutral-500"
                >
                  {step === 'request'
                    ? "Enter your order number and the phone or email used at checkout. If we find your order, we'll send a verification code."
                    : 'Enter the verification code we sent to your contact.'}
                </motion.p>
              </motion.div>

              {/* ── Step dots ── */}
              <StepDots current={step} />

              {/* ── Step forms — animated transition between steps ── */}
              <AnimatePresence mode="wait" initial={false}>

                {/* ─── Step 1: Request code ─────────────────────────────── */}
                {step === 'request' && (
                  <motion.form
                    key="step-request"
                    onSubmit={handleRequestCode}
                    noValidate
                    variants={slideVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    className="space-y-4"
                    aria-label="Request verification code"
                  >
                    {/* Order number */}
                    <div className="space-y-1.5">
                      <FieldLabel htmlFor="find-order-number">Order Number</FieldLabel>
                      <TextInput
                        id="find-order-number"
                        type="text"
                        inputMode="numeric"
                        placeholder="e.g. 0042"
                        value={orderNumber}
                        onChange={e =>
                          setOrderNumber(e.target.value.replace(/\D/g, '').slice(0, 8))
                        }
                        autoComplete="off"
                        autoFocus
                        disabled={requestBusy}
                        required
                        aria-describedby="order-number-hint"
                      />
                      <p id="order-number-hint" className="text-[11px] leading-relaxed text-neutral-600">
                        Found in your confirmation email or printed receipt.
                      </p>
                    </div>

                    {/* Contact */}
                    <div className="space-y-1.5">
                      <FieldLabel htmlFor="find-order-contact">Phone or Email</FieldLabel>
                      <TextInput
                        id="find-order-contact"
                        type="text"
                        placeholder="Phone number or email address"
                        value={contact}
                        onChange={e => setContact(e.target.value)}
                        autoComplete="email"
                        disabled={requestBusy}
                        required
                        aria-describedby="contact-hint"
                      />
                      <p id="contact-hint" className="text-[11px] leading-relaxed text-neutral-600">
                        Use the phone or email you provided at checkout.
                      </p>
                    </div>

                    {/* Error */}
                    <AnimatePresence>
                      {requestError ? (
                        <ErrorBanner key="req-error">{requestError}</ErrorBanner>
                      ) : null}
                    </AnimatePresence>

                    {/* Submit */}
                    <SubmitButton
                      busy={requestBusy}
                      disabled={!isNumericOrderNumber(orderNumber) || !isPlausibleContact(contact)}
                    >
                      Send Code
                    </SubmitButton>
                  </motion.form>
                )}

                {/* ─── Step 2: Verify code ──────────────────────────────── */}
                {step === 'verify' && (
                  <motion.div
                    key="step-verify"
                    variants={slideVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    className="space-y-4"
                  >
                    {/* Generic sent message — always visible, never conditional.
                        Rendered outside <form> so it cannot be confused as a
                        form field description. */}
                    <InfoBanner>{GENERIC_SENT_MSG}</InfoBanner>

                    <form
                      onSubmit={handleVerifyCode}
                      noValidate
                      className="space-y-4"
                      aria-label="Enter verification code"
                    >
                      {/* Code input */}
                      <div className="space-y-1.5">
                        <FieldLabel htmlFor="find-order-code">Verification Code</FieldLabel>
                        <TextInput
                          id="find-order-code"
                          type="text"
                          inputMode="numeric"
                          placeholder="000000"
                          value={code}
                          onChange={e => setCode(sanitizeCode(e.target.value))}
                          maxLength={6}
                          autoComplete="one-time-code"
                          autoFocus
                          disabled={verifyBusy}
                          required
                          className="font-mono text-center text-xl tracking-[0.4em]"
                          aria-describedby="code-hint"
                        />
                        <p id="code-hint" className="text-[11px] leading-relaxed text-neutral-600">
                          Enter the 6-digit code from your message.
                        </p>
                      </div>

                      {/* Error */}
                      <AnimatePresence>
                        {verifyError ? (
                          <ErrorBanner key="ver-error">{verifyError}</ErrorBanner>
                        ) : null}
                      </AnimatePresence>

                      {/* Submit */}
                      <SubmitButton
                        busy={verifyBusy}
                        disabled={sanitizeCode(code).length !== 6}
                      >
                        Verify &amp; Track Order
                      </SubmitButton>
                    </form>

                    {/* Escape hatch — start over with different details */}
                    <button
                      type="button"
                      onClick={handleStartOver}
                      disabled={verifyBusy}
                      className="w-full text-[11px] text-neutral-600 underline underline-offset-2 transition hover:text-neutral-400 disabled:opacity-40"
                    >
                      Try a different order or contact
                    </button>
                  </motion.div>
                )}

              </AnimatePresence>
            </div>
          </div>

          {/* ── Footer ───────────────────────────────────────────────────── */}
          <p className="mt-4 text-center text-[11px] text-neutral-700">
            Still need help?{' '}
            <Link
              to="/contact"
              className="underline underline-offset-2 transition hover:text-neutral-500"
            >
              Contact us
            </Link>
            {' '}and include your order number.
          </p>

        </div>
      </div>
    </MotionConfig>
  );
}