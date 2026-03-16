// src/hooks/useNewsletter.ts
// ─── useNewsletter ────────────────────────────────────────────────────────────
//
// Architecture:
//   Browser → POST /functions/v1/subscribe (Supabase Edge Function)
//           → Edge function calls Klaviyo with PRIVATE key server-side
//
// Status states:
//   'idle'               — initial, form visible
//   'loading'            — request in-flight (or retrying)
//   'success'            — newly subscribed
//   'already-subscribed' — profile was already on the list
//   'error'              — validation failure or all retries exhausted
//
// This file exports ONE function: useNewsletter.
// It is imported and called ONCE inside Newsletter.tsx.
// It never calls itself.
//
// ── Why doSubmit uses a loop, not recursion ─────────────────────────────────
//
// The natural pattern for retry is:
//   const doSubmit = useCallback(async (...) => {
//     return doSubmit(...)   // ← recurse on retry
//   }, [...])
//
// But this causes a TDZ (Temporal Dead Zone) error:
//   "doSubmit accessed before it is declared"
//
// `const` bindings are not hoisted. At the time the useCallback arrow function
// body is evaluated, `doSubmit` does not yet exist in scope — the assignment
// hasn't happened. The body sees a TDZ hole, not the eventual value.
//
// Fix: replace recursion with a while-loop.
// The loop increments `currentAttempt` and breaks on success or non-retryable
// error. No self-reference. No TDZ. Identical runtime behaviour.
//
// ── Why dataLayer receives `payload` directly, not `{ event, ...payload }` ─
//
// `payload` already contains `{ event, source, ...utm, ...extra }`.
// Writing `{ event, ...payload }` spreads `event` twice — TS2783 error:
// "event is specified more than once, so this usage will be overwritten".
// Fix: push `payload` directly — the event name is already inside it.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useRef, useState } from 'react';
import type { KlaviyoProfileAttributes }  from '@/lib/klaviyo';

// ── Types ─────────────────────────────────────────────────────────────────────

export type NewsletterStatus =
  | 'idle'
  | 'loading'
  | 'success'
  | 'already-subscribed'
  | 'error';

export type NewsletterAnalyticsEvent =
  | 'newsletter_form_viewed'
  | 'newsletter_email_typed'
  | 'newsletter_name_revealed'
  | 'newsletter_submit_started'
  | 'newsletter_submit_success'
  | 'newsletter_submit_already_subscribed'
  | 'newsletter_submit_error'
  | 'newsletter_submit_retry';

export interface UseNewsletterOptions {
  listId?:              string;
  identify?:            boolean;
  source?:              string;
  maxRetries?:          number;
  /** Fires before the first network request — use to show success card optimistically */
  onOptimistic?:        (email: string) => void;
  onSuccess?:           (email: string) => void;
  onAlreadySubscribed?: (email: string) => void;
  onError?:             (message: string) => void;
  /** Receives every analytics event — wire to gtag / Segment / Klaviyo */
  onAnalyticsEvent?:    (event: NewsletterAnalyticsEvent, props: Record<string, unknown>) => void;
}

export interface UseNewsletterReturn {
  status:            NewsletterStatus;
  loading:           boolean;
  subscribed:        boolean;
  alreadySubscribed: boolean;
  /** True for either success variant — use to hide the form */
  done:              boolean;
  error:             string | null;
  /** Current attempt number (1-based) — show "Retrying (2/3)…" in button */
  attempt:           number;
  /** True when a retryable error occurred and retries remain */
  canRetry:          boolean;
  addSubscriber: (
    email:          string,
    profileAttrs?:  Omit<KlaviyoProfileAttributes, 'email'>,
    captchaToken?:  string,
  ) => Promise<void>;
  retry:             () => Promise<void>;
  reset:             () => void;
  /** Call when the form scrolls into view — fires once per session */
  trackFormViewed:   () => void;
  /** Call on first keystroke in the email field — fires once per session */
  trackEmailTyped:   () => void;
  /** Call when the name field becomes visible — fires once per session */
  trackNameRevealed: () => void;
}

// ── Module-level helpers (defined once, never re-created on render) ───────────

const EMAIL_RE = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;

function validateEmail(email: string): string | null {
  const t = email.trim();
  if (!t)                                           return 'Please enter your email address.';
  if (t.length > 254)                               return '⚠️ Email address is too long.';
  const [local] = t.split('@');
  if (!local || local.length > 64)                  return '⚠️ Email address is too long.';
  if (local.startsWith('.') || local.endsWith('.')) return '⚠️ Please enter a valid email.';
  if (local.includes('..'))                         return '⚠️ Please enter a valid email.';
  if (!EMAIL_RE.test(t))                            return '⚠️ Please enter a valid email.';
  return null;
}

/** Exponential backoff: 1 s → 2 s → 4 s + jitter, capped at 10 s */
function backoffMs(attempt: number): number {
  return Math.min(1000 * Math.pow(2, attempt - 1) + Math.random() * 200, 10_000);
}

/** True for errors worth retrying (network / 5xx). False for 4xx validation errors. */
function isRetryable(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('network') || m.includes('fetch') || m.includes('timeout') ||
    m.includes('500')     || m.includes('502')   || m.includes('503')     ||
    m.includes('504')     || m.includes('temporarily')
  );
}

/** Read UTM parameters from the current URL. Returns {} on the server. */
function captureUTM(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const p = new URLSearchParams(window.location.search);
  const utm: Record<string, string> = {};
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) {
    const v = p.get(k);
    if (v) utm[k] = v;
  }
  return utm;
}

/** Resolve the Supabase Edge Function URL from the Vite env var */
function getEdgeFunctionUrl(): string {
  const base = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '') ?? 'http://localhost:54321';
  return `${base}/functions/v1/subscribe`;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useNewsletter(options: UseNewsletterOptions = {}): UseNewsletterReturn {

  const {
    listId,
    identify        = true,
    source,
    maxRetries      = 3,
    onOptimistic,
    onSuccess,
    onAlreadySubscribed,
    onError,
    onAnalyticsEvent,
  } = options;

  const [status,  setStatus]  = useState<NewsletterStatus>('idle');
  const [error,   setError]   = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const submittedRef   = useRef(false);
  const lastPayloadRef = useRef<{
    email:          string;
    profileAttrs?:  Omit<KlaviyoProfileAttributes, 'email'>;
    captchaToken?:  string;
  } | null>(null);
  const firedEventsRef = useRef<Set<string>>(new Set());

  // ── Analytics emitter ──────────────────────────────────────────────────────
  const emit = useCallback(
    (event: NewsletterAnalyticsEvent, extra: Record<string, unknown> = {}) => {
      const utm     = captureUTM();
      // payload includes event as its first field
      const payload = { event, source: source ?? utm.utm_source ?? 'direct', ...utm, ...extra };

      onAnalyticsEvent?.(event, payload);

      if (typeof window === 'undefined') return;

      // Cast to unknown to avoid conflicting with the project's existing
      // window.gtag declaration (e.g. from @types/gtag.js / GtagFn).
      const w = window as unknown as {
        dataLayer?: unknown[];
        analytics?: { track: (name: string, props: unknown) => void };
        gtag?:      unknown;
      };

      // Push `payload` directly — it already contains the event name.
      // Writing `{ event, ...payload }` would duplicate the key (TS2783).
      if (Array.isArray(w.dataLayer)) {
        w.dataLayer.push(payload);
      }
      if (typeof w.analytics?.track === 'function') {
        w.analytics.track(event, payload);
      }
      if (typeof w.gtag === 'function') {
        (w.gtag as (...args: unknown[]) => void)('event', event, payload);
      }
    },
    [source, onAnalyticsEvent],
  );

  // ── Core fetch with retry loop ─────────────────────────────────────────────
  //
  // Uses a while-loop instead of recursion to avoid the TDZ error.
  //
  // Why not recursion?
  //   const doSubmit = useCallback(async () => {
  //     return doSubmit(...)   // ← TDZ: const is not hoisted, doSubmit
  //   }, [...])                //         doesn't exist yet at definition time
  //
  // The loop is functionally identical — it increments the attempt counter
  // and breaks on success, validation error, or exhausted retries.
  //
  const doSubmit = useCallback(
    async (
      email:          string,
      profileAttrs:   Omit<KlaviyoProfileAttributes, 'email'>,
      captchaToken?:  string,
      startAttempt    = 1,
    ): Promise<void> => {

      let currentAttempt = startAttempt;

      while (currentAttempt <= maxRetries + startAttempt - 1) {
        setAttempt(currentAttempt);
        setStatus('loading');
        setError(null);

        const utm = captureUTM();
        emit('newsletter_submit_started', { attempt: currentAttempt, ...utm });

        if (currentAttempt === 1) {
          onOptimistic?.(email);
        }

        try {
          const res = await fetch(getEdgeFunctionUrl(), {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email,
              ...profileAttrs,
              ...(listId              ? { listId }       : {}),
              ...(source              ? { source }       : {}),
              ...(identify !== undefined ? { identify }  : {}),
              ...(captchaToken        ? { captchaToken } : {}),
              ...utm,
            }),
          });

          const body = await res.json().catch(() => ({})) as {
            ok?:                boolean;
            alreadySubscribed?: boolean;
            error?:             string;
            detail?:            string;
          };

          if (!res.ok || body.ok === false) {
            const msg       = body.error ?? body.detail ?? '⚠️ Something went wrong, try again.';
            const retryable = isRetryable(msg);

            if (retryable && currentAttempt < maxRetries) {
              emit('newsletter_submit_retry', { attempt: currentAttempt });
              onError?.(msg);
              setError(`Retrying… (${currentAttempt}/${maxRetries})`);
              await new Promise<void>((r) => setTimeout(r, backoffMs(currentAttempt)));
              currentAttempt++;
              continue;          // ← loop to next attempt
            }

            emit('newsletter_submit_error', { attempt: currentAttempt, error: msg });
            setError(msg);
            setStatus('error');
            onError?.(msg);
            return;
          }

          // ── Success ──────────────────────────────────────────────────────
          submittedRef.current = true;

          if (body.alreadySubscribed) {
            emit('newsletter_submit_already_subscribed', { attempt: currentAttempt });
            setStatus('already-subscribed');
            onAlreadySubscribed?.(email);
          } else {
            emit('newsletter_submit_success', { attempt: currentAttempt, ...utm });
            setStatus('success');
            onSuccess?.(email);
          }
          return; // done

        } catch (err) {
          const msg       = err instanceof Error ? err.message : '⚠️ Something went wrong, try again.';
          const retryable = isRetryable(msg);

          if (retryable && currentAttempt < maxRetries) {
            emit('newsletter_submit_retry', { attempt: currentAttempt });
            onError?.(msg);
            setError(`Retrying… (${currentAttempt}/${maxRetries})`);
            await new Promise<void>((r) => setTimeout(r, backoffMs(currentAttempt)));
            currentAttempt++;
            continue;            // ← loop to next attempt
          }

          emit('newsletter_submit_error', { attempt: currentAttempt, error: msg });
          setError(msg);
          setStatus('error');
          onError?.(msg);
          return;
        }
      }
    },
    [emit, identify, listId, maxRetries, onAlreadySubscribed, onError, onOptimistic, onSuccess, source],
  );

  // ── addSubscriber — public entry point ─────────────────────────────────────
  const addSubscriber = useCallback(
    async (
      email:          string,
      profileAttrs:   Omit<KlaviyoProfileAttributes, 'email'> = {},
      captchaToken?:  string,
    ): Promise<void> => {
      if (submittedRef.current) return;

      const validationError = validateEmail(email);
      if (validationError) {
        setError(validationError);
        setStatus('error');
        onError?.(validationError);
        return;
      }

      const normalised = email.trim().toLowerCase();
      lastPayloadRef.current = { email: normalised, profileAttrs, captchaToken };
      await doSubmit(normalised, profileAttrs, captchaToken, 1);
    },
    [doSubmit, onError],
  );

  // ── retry — triggered by "Try again" button ────────────────────────────────
  const retry = useCallback(async (): Promise<void> => {
    const p = lastPayloadRef.current;
    if (!p) return;
    submittedRef.current = false;
    await doSubmit(p.email, p.profileAttrs ?? {}, p.captchaToken, attempt + 1);
  }, [attempt, doSubmit]);

  // ── reset ──────────────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    setStatus('idle');
    setError(null);
    setAttempt(0);
    submittedRef.current   = false;
    lastPayloadRef.current = null;
  }, []);

  // ── Funnel tracking helpers — each fires at most once per session ──────────
  const trackFormViewed = useCallback(() => {
    if (firedEventsRef.current.has('viewed')) return;
    firedEventsRef.current.add('viewed');
    emit('newsletter_form_viewed');
  }, [emit]);

  const trackEmailTyped = useCallback(() => {
    if (firedEventsRef.current.has('typed')) return;
    firedEventsRef.current.add('typed');
    emit('newsletter_email_typed');
  }, [emit]);

  const trackNameRevealed = useCallback(() => {
    if (firedEventsRef.current.has('name')) return;
    firedEventsRef.current.add('name');
    emit('newsletter_name_revealed');
  }, [emit]);

  // ── Return ─────────────────────────────────────────────────────────────────
  return {
    status,
    loading:           status === 'loading',
    subscribed:        status === 'success',
    alreadySubscribed: status === 'already-subscribed',
    done:              status === 'success' || status === 'already-subscribed',
    error,
    attempt,
    canRetry:          status === 'error' && attempt < maxRetries && !!lastPayloadRef.current,
    addSubscriber,
    retry,
    reset,
    trackFormViewed,
    trackEmailTyped,
    trackNameRevealed,
  };
}