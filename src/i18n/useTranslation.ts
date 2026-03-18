// src/i18n/useTranslation.ts
// =============================================================================
// SOFIS — useTranslation hook
// React integration for the i18n engine. Zero external dependencies.
// =============================================================================
//
// Usage:
//   const { t, locale, setLocale } = useTranslation();
//
//   <p>{t('checkout.button.loading')}</p>
//   <p>{t('checkout.button.retryIn', { seconds: 5 })}</p>
//
// The hook re-renders automatically whenever setLocale() is called anywhere
// in the app (pub/sub via subscribeToLocale).
// =============================================================================

import { useCallback, useSyncExternalStore } from 'react';

import {
  t as coreT,
  getLocale,
  setLocale,
  subscribeToLocale,
  type SupportedLocale,
  type TranslationKey,
  type InterpolationValues,
} from './index';

export function useTranslation() {
  // useSyncExternalStore is the React 18+ way to subscribe to external stores.
  // It is concurrent-safe and SSR-safe (no tearing, no extra renders).
  const locale = useSyncExternalStore<SupportedLocale>(
    subscribeToLocale,
    getLocale,
    // Server snapshot — always default to 'en' during SSR
    () => 'en' as SupportedLocale,
  );

  // Stable reference — locale in closure is always current via useSyncExternalStore
  const translate = useCallback(
    (key: TranslationKey, values?: InterpolationValues): string => coreT(key, values),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locale], // re-memoize on locale change so derived values update
  );

  return {
    /** Translate a key with optional interpolation */
    t: translate,
    /** Currently active locale */
    locale,
    /** Change the active locale globally */
    setLocale,
  } as const;
}