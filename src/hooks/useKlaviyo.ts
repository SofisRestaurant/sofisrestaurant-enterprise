// src/hooks/useKlaviyo.ts
// ─── useKlaviyo ───────────────────────────────────────────────────────────────
//
// Low-level React hook that wraps the three Klaviyo primitives.
// Prefer useNewsletter or useNotifications for higher-level use-cases.
//
// Features:
//   • Stable function references (useCallback — safe in dependency arrays)
//   • Per-call loading state exposed so UIs can show spinners
//   • All errors are caught and returned — never throws
//   • Dev-mode logging via the KlaviyoResult shape
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useState } from 'react';
import { trackEvent, identifyUser, subscribeToList } from '@/lib/klaviyo';
import type {
  KlaviyoEventInput,
  IdentifyUserInput,
  SubscribeToListInput,
  KlaviyoResult,
} from '@/lib/klaviyo';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UseKlaviyoReturn {
  /** True while any Klaviyo call is in-flight */
  loading: boolean;

  /**
   * Track a behavioural event.
   * @see KlaviyoEvents for pre-defined event name constants.
   */
  track: (input: KlaviyoEventInput) => Promise<KlaviyoResult<void>>;

  /**
   * Upsert a profile in Klaviyo.
   * Call after login/checkout to associate behaviour with an identity.
   */
  identify: (input: IdentifyUserInput) => Promise<KlaviyoResult<{ id?: string }>>;

  /**
   * Subscribe a profile to a Klaviyo list (email and/or SMS).
   * Respects the list's double opt-in settings.
   */
  subscribe: (input: SubscribeToListInput) => Promise<KlaviyoResult<void>>;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useKlaviyo(): UseKlaviyoReturn {
  const [loading, setLoading] = useState(false);

  const track = useCallback(
    async (input: KlaviyoEventInput): Promise<KlaviyoResult<void>> => {
      setLoading(true);
      try {
        return await trackEvent(input);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const identify = useCallback(
    async (input: IdentifyUserInput): Promise<KlaviyoResult<{ id?: string }>> => {
      setLoading(true);
      try {
        return await identifyUser(input);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const subscribe = useCallback(
    async (input: SubscribeToListInput): Promise<KlaviyoResult<void>> => {
      setLoading(true);
      try {
        return await subscribeToList(input);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  return { loading, track, identify, subscribe };
}