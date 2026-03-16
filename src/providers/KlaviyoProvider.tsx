// src/providers/KlaviyoProvider.tsx
// ─── KlaviyoProvider ──────────────────────────────────────────────────────────
//
// Provides Klaviyo primitives app-wide via React context so any component can
// call useKlaviyoContext() without prop-drilling.
//
// Usage:
//   // In your root layout / App.tsx:
//   <KlaviyoProvider>
//     <App />
//   </KlaviyoProvider>
//
//   // In any component:
//   const { track, identify, subscribe } = useKlaviyoContext();
//
// Design decisions:
//   • Functions are defined with useCallback at provider level so all consumers
//     share the same stable references — safe in useEffect dependency arrays.
//   • The context value is memoised to prevent unnecessary re-renders.
//   • A guard is included so useKlaviyoContext() fails loudly if used outside
//     the provider (dev-only — silent in prod to avoid crashing the UI).
// ─────────────────────────────────────────────────────────────────────────────

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
} from 'react';

import { trackEvent, identifyUser, subscribeToList } from '@/lib/klaviyo';
import type {
  KlaviyoEventInput,
  IdentifyUserInput,
  SubscribeToListInput,
  KlaviyoResult,
} from '@/lib/klaviyo';

// ── Context shape ─────────────────────────────────────────────────────────────

export interface KlaviyoContextValue {
  track:     (input: KlaviyoEventInput)     => Promise<KlaviyoResult<void>>;
  identify:  (input: IdentifyUserInput)     => Promise<KlaviyoResult<{ id?: string }>>;
  subscribe: (input: SubscribeToListInput)  => Promise<KlaviyoResult<void>>;
}

// ── Context ───────────────────────────────────────────────────────────────────

const KlaviyoContext = createContext<KlaviyoContextValue | null>(null);
KlaviyoContext.displayName = 'KlaviyoContext';

// ── Provider ──────────────────────────────────────────────────────────────────

interface KlaviyoProviderProps {
  children: React.ReactNode;
}

export function KlaviyoProvider({ children }: KlaviyoProviderProps) {
  const track = useCallback(
    (input: KlaviyoEventInput) => trackEvent(input),
    [],
  );

  const identify = useCallback(
    (input: IdentifyUserInput) => identifyUser(input),
    [],
  );

  const subscribe = useCallback(
    (input: SubscribeToListInput) => subscribeToList(input),
    [],
  );

  // Memoised so the context object reference is stable — prevents every
  // consumer from re-rendering when the provider's parent re-renders.
  const value = useMemo<KlaviyoContextValue>(
    () => ({ track, identify, subscribe }),
    [track, identify, subscribe],
  );

  return (
    <KlaviyoContext.Provider value={value}>
      {children}
    </KlaviyoContext.Provider>
  );
}

// ── Consumer hook ─────────────────────────────────────────────────────────────

/**
 * Access Klaviyo primitives from any component inside KlaviyoProvider.
 *
 * @example
 * const { track } = useKlaviyoContext();
 * await track({ metric: { name: KlaviyoEvents.ORDER_PLACED }, profile: { email } });
 */
export function useKlaviyoContext(): KlaviyoContextValue {
  const ctx = useContext(KlaviyoContext);

  if (!ctx) {
    // In development, fail loudly so engineers catch the missing provider early.
    if (import.meta.env.DEV) {
      throw new Error(
        '[useKlaviyoContext] must be used inside <KlaviyoProvider>. ' +
        'Wrap your app root or the relevant subtree with <KlaviyoProvider>.',
      );
    }
    // In production, return no-op functions so the UI never crashes.
    const noop = async (): Promise<KlaviyoResult<void>> => ({
      ok:     false,
      errors: [{ status: 0, code: 'no_provider', title: 'No provider', detail: 'KlaviyoProvider not mounted.' }],
      status: 0,
    });
    return {
      track:     noop,
      identify:  noop as KlaviyoContextValue['identify'],
      subscribe: noop,
    };
  }

  return ctx;
}