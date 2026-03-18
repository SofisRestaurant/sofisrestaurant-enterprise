// src/i18n/index.ts
// =============================================================================
// SOFIS — i18n Engine
// Zero external dependencies. Type-safe. Interpolation-ready.
// =============================================================================
//
// Usage:
//   import { t, setLocale, getLocale } from '@/i18n';
//
//   t('checkout.button.loading')
//   t('checkout.button.retryIn', { seconds: 5 })
//   t('header.auth.greeting', { name: 'Ana' })
//
// Locale persistence:
//   setLocale('es') — saves to localStorage + updates all subscribers
//   getLocale()     — returns current locale ('en' | 'es')
//
// React hook:
//   const { t, locale, setLocale } = useTranslation();
//
// Adding a new locale:
//   1. Add a JSON file: src/i18n/fr.json
//   2. Import and add it to the LOCALES map below.
//   3. Add 'fr' to the SupportedLocale union type.
//   That's it — TypeScript will catch any key mismatches immediately.
// =============================================================================

import en from './en.json';
import es from './es.json';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type SupportedLocale = 'en' | 'es';

export type TranslationTree = typeof en;

/**
 * Produces a union of all valid dot-notation keys from a nested object type.
 * Example: DotPaths<{ a: { b: string } }> = 'a' | 'a.b'
 */
type DotPaths<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends Record<string, unknown>
    ? DotPaths<T[K], `${Prefix}${K}.`> | `${Prefix}${K}`
    : `${Prefix}${K}`;
}[keyof T & string];

export type TranslationKey = DotPaths<TranslationTree>;

export type InterpolationValues = Record<string, string | number>;

// ─────────────────────────────────────────────────────────────────────────────
// Locale registry
// ─────────────────────────────────────────────────────────────────────────────

// Add new locales here. The type system enforces structural parity with en.json.
const LOCALES: Record<SupportedLocale, TranslationTree> = { en, es };

const SUPPORTED: ReadonlySet<SupportedLocale> = new Set<SupportedLocale>(
  Object.keys(LOCALES) as SupportedLocale[],
);

const STORAGE_KEY = 'sofis_locale';
const DEFAULT_LOCALE: SupportedLocale = 'en';

// ─────────────────────────────────────────────────────────────────────────────
// State (module-level singleton)
// ─────────────────────────────────────────────────────────────────────────────

function resolveInitialLocale(): SupportedLocale {
  // 1. Persisted preference
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && isSupportedLocale(stored)) return stored;
  } catch {
    // localStorage unavailable (SSR, incognito with strict settings)
  }

  // 2. Browser language (first match wins)
  if (typeof navigator !== 'undefined') {
    for (const lang of navigator.languages ?? [navigator.language]) {
      const base = lang.split('-')[0].toLowerCase() as SupportedLocale;
      if (isSupportedLocale(base)) return base;
    }
  }

  return DEFAULT_LOCALE;
}

let currentLocale: SupportedLocale = resolveInitialLocale();
const subscribers = new Set<() => void>();

// ─────────────────────────────────────────────────────────────────────────────
// Guards
// ─────────────────────────────────────────────────────────────────────────────

function isSupportedLocale(value: unknown): value is SupportedLocale {
  return typeof value === 'string' && SUPPORTED.has(value as SupportedLocale);
}

// ─────────────────────────────────────────────────────────────────────────────
// Core: nested key lookup
// ─────────────────────────────────────────────────────────────────────────────

function getNestedValue(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => {
    if (
      current !== null &&
      typeof current === 'object' &&
      key in current
    ) {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

// ─────────────────────────────────────────────────────────────────────────────
// Core: interpolation  →  "Hello {{name}}" + { name: 'Ana' } → "Hello Ana"
// ─────────────────────────────────────────────────────────────────────────────

function interpolate(template: string, values: InterpolationValues): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const value = values[key];
    return value !== undefined ? String(value) : `{{${key}}}`;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Translate a key, with optional interpolation.
 *
 * @param key    Dot-notation key (type-safe against en.json shape)
 * @param values Optional interpolation values: { count: 3, name: 'Ana' }
 * @returns      Translated string, or the key itself as a fallback
 *
 * @example
 *   t('checkout.button.loading')
 *   t('checkout.button.retryIn', { seconds: 5 })
 */
export function t(key: TranslationKey, values?: InterpolationValues): string {
  const translations = LOCALES[currentLocale];
  const fallback = LOCALES[DEFAULT_LOCALE];

  const raw =
    getNestedValue(translations, key) ??
    getNestedValue(fallback, key);

  if (typeof raw !== 'string') {
    if (import.meta.env.DEV) {
      console.warn(`[i18n] Missing key: "${key}" for locale "${currentLocale}"`);
    }
    return key;
  }

  return values ? interpolate(raw, values) : raw;
}

/**
 * Get the currently active locale.
 */
export function getLocale(): SupportedLocale {
  return currentLocale;
}

/**
 * Change the active locale. Persists to localStorage and notifies all
 * React subscribers (useTranslation hook triggers a re-render).
 */
export function setLocale(locale: unknown): void {
  if (!isSupportedLocale(locale)) {
    if (import.meta.env.DEV) {
      console.warn(
        `[i18n] Unsupported locale: "${String(locale)}". Supported: ${[...SUPPORTED].join(', ')}`
      );
    }
    return;
  }

  // Now TypeScript KNOWS locale is SupportedLocale
  if (locale === currentLocale) return;

  currentLocale = locale;

  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Ignore write failures
  }

  subscribers.forEach((fn) => fn());
}
/**
 * Subscribe to locale changes. Returns an unsubscribe function.
 * Used internally by useTranslation — you rarely need this directly.
 */
export function subscribeToLocale(callback: () => void): () => void {
  subscribers.add(callback);
  return () => subscribers.delete(callback);
}

/**
 * List all supported locales.
 */
export function getSupportedLocales(): readonly SupportedLocale[] {
  return [...SUPPORTED];
}
