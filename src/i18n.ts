// src/i18n.ts
// =============================================================================
// SOFIS — i18next initialization
// =============================================================================
//
// Stack:
//   • i18next                       — core engine
//   • react-i18next                 — React bindings (useTranslation, Trans)
//   • i18next-browser-languagedetector — auto-detects browser language,
//                                        query string (?lng=es), localStorage
//   • i18next-http-backend          — lazy-loads JSON from
//                                        /public/locales/{{lng}}/translation.json
//                                        (optional; comment out if bundling)
//
// Install (if not already installed):
//   npm install i18next react-i18next i18next-browser-languagedetector
//   npm install i18next-http-backend   # only if using lazy-loading
//
// Usage in components:
//   import { useTranslation } from '@/i18n/useTranslation';
//
//   function MyComponent() {
//     const { t, i18n } = useTranslation();
//     return <p>{t('common.loading')}</p>;
//   }
//
// Language switching:
//   const { i18n } = useTranslation();
//   await i18n.changeLanguage('es');   // persisted to localStorage automatically
//
// Interpolation:
//   t('header.cart.ariaPlural', { count: 3 })
//   // → "Shopping cart with 3 items"
//
// Import this file once, at the top of src/main.tsx:
//   import './i18n';
// =============================================================================

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// ── Bundled translations (import directly — zero network round-trip) ──────────
// Remove these imports and use i18next-http-backend instead if you want
// lazy-loading from /public/locales/{{lng}}/translation.json.
import enTranslation from './i18n/locales/en/translation.json';
import esTranslation from './i18n/locales/es/translation.json';

// ── Translation types (derived from JSON — never written by hand) ─────────────
//
// TranslationTree is the exact shape of en/translation.json, inferred by
// TypeScript from the import. Every key, every nested object, every leaf
// string — all reflected in the type automatically.
//
// DotPaths converts the nested tree into a union of dot-notation strings:
//   DotPaths<{ a: { b: string } }> = 'a' | 'a.b'
//
// TranslationKey is the full union of valid translation keys. Using it in
// t() means typos are caught at compile time, not at runtime.
//


export type TranslationTree = typeof enTranslation;

type DotPaths<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends Record<string, unknown>
    ? DotPaths<T[K], `${Prefix}${K}.`> | `${Prefix}${K}`
    : `${Prefix}${K}`;
}[keyof T & string];

export type TranslationKey = DotPaths<TranslationTree>;

// ── Supported locale type ─────────────────────────────────────────────────────
export type SupportedLocale = 'en' | 'es';

export const SUPPORTED_LOCALES: readonly SupportedLocale[] = ['en', 'es'] as const;

export const LOCALE_LABELS: Record<SupportedLocale, string> = {
  en: 'English',
  es: 'Español',
} as const;

// ── i18next configuration ─────────────────────────────────────────────────────

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    // ── Resources (bundled) ─────────────────────────────────────────────────
    resources: {
      en: { translation: enTranslation },
      es: { translation: esTranslation },
    },

    // ── Supported locales ───────────────────────────────────────────────────
    supportedLngs: SUPPORTED_LOCALES,

    // ── Fallback ────────────────────────────────────────────────────────────
    // If a key is missing in the active locale, fall back to English.
    fallbackLng: 'en' satisfies SupportedLocale,

    // ── Default namespace ───────────────────────────────────────────────────
    // Matches the "translation" key in resources above.
    defaultNS: 'translation',
    ns: ['translation'],

    // ── Interpolation ───────────────────────────────────────────────────────
    interpolation: {
      // React already escapes output — no need for i18next to double-escape.
      escapeValue: false,
    },

    // ── Language detection options ──────────────────────────────────────────
    detection: {
      // Order controls which source wins first:
      // 1. localStorage (persisted user preference)
      // 2. query string (?lng=es) — useful for testing / sharing links
      // 3. browser language (navigator.language)
      order: ['localStorage', 'querystring', 'navigator', 'htmlTag'],

      // localStorage key used to persist the user's choice
      lookupLocalStorage: 'sofis_locale',

      // Query string param: ?lng=es
      lookupQuerystring: 'lng',

      // Cache the detected language back to localStorage on each visit
      caches: ['localStorage'],

      // Do not cache to cookies (privacy-first)
      excludeCacheFor: ['cimode'],
    },

    // ── React-specific ──────────────────────────────────────────────────────
    react: {
      // Suspense mode is off by default. Turn on if using <Suspense> for
      // lazy-loaded translations (requires i18next-http-backend).
      useSuspense: false,
    },

    // ── Debug (dev only) ────────────────────────────────────────────────────
    // Shows missing key warnings in the console during development.
    debug: import.meta.env.DEV,
  });

export default i18n;