// src/i18n/useTranslation.ts
// =============================================================================
// SOFIS — Typed useTranslation wrapper
// =============================================================================
//
// WHY THIS FILE EXISTS
// ──────────────────────────────────────────────────────────────────────────────
// react-i18next's useTranslation() returns `t` typed as `TFunction`, which
// accepts `string` for the key argument. That means:
//
//   t('typo.in.key')   // compiles fine — runtime miss, silent bug
//
// This wrapper re-types `t` to only accept keys that actually exist in
// en/translation.json. TranslationKey is derived fully automatically from the
// JSON shape by DotPaths<TranslationTree> in i18n.ts — no manual key lists ever.
//
//   t('typo.in.key')   // TypeScript error — caught at compile time ✅
//   t('common.loading')// valid key — compiles and resolves correctly ✅
//
// ARCHITECTURE LAYERS
// ──────────────────────────────────────────────────────────────────────────────
//   i18n.ts                     ← engine init (react-i18next + LanguageDetector)
//   i18n/useTranslation.ts      ← this file — typed hook (component layer)
//   components/**/*.tsx         ← import from @/i18n/useTranslation
//
// react-i18next itself is only directly imported in:
//   • i18n.ts           (engine)
//   • i18n/useTranslation.ts  (this wrapper)
//
// All other files import from @/i18n/useTranslation, ensuring the typed
// version is always used.
//
// USAGE
// ──────────────────────────────────────────────────────────────────────────────
//   import { useTranslation } from '@/i18n/useTranslation';
//
//   function MyComponent() {
//     const { t, i18n, locale } = useTranslation();
//
//     return (
//       <>
//         <p>{t('common.loading')}</p>
//         <p>{t('header.cart.ariaPlural', { count: 3 })}</p>
//         <button onClick={() => void i18n.changeLanguage('es')}>
//           Español
//         </button>
//       </>
//     );
//   }
// =============================================================================

import { useTranslation as useTranslationBase } from 'react-i18next';
import type { i18n as I18nInstance } from 'i18next';

import type {
  TranslationTree,
  TranslationKey,
  SupportedLocale,
} from '@/i18n';

// ── Interpolation values ──────────────────────────────────────────────────────
// Matches i18next's expected interpolation object shape.
export type InterpolationValues = Record<string, string | number>;

// ── Typed t() signature ───────────────────────────────────────────────────────
//
// Accepts only keys that exist in en/translation.json.
// The return type is always `string` — i18next always resolves to a string
// (falling back to the key itself on a miss, which debug mode will warn about).
//
export type TypedT = (key: TranslationKey, values?: InterpolationValues) => string;

// ── Re-export TranslationTree for components that need it (e.g. HeroSection) ──
export type { TranslationTree, TranslationKey, SupportedLocale };

// ── Hook ──────────────────────────────────────────────────────────────────────

export interface UseTranslationReturn {
  /** Type-safe translation function. Key must exist in en/translation.json. */
  t: TypedT;
  /** The underlying i18next instance. Use i18n.changeLanguage('es') to switch. */
  i18n: I18nInstance;
  /** The currently active locale, normalized to the base language tag ('en' | 'es'). */
  locale: SupportedLocale;
}

/**
 * Typed wrapper around react-i18next's useTranslation.
 *
 * Drop-in replacement for `import { useTranslation } from 'react-i18next'`
 * with the key difference that `t()` only accepts valid TranslationKey values.
 *
 * @example
 *   const { t, i18n, locale } = useTranslation();
 *   t('common.loading')                              // ✅ valid key
 *   t('header.cart.ariaPlural', { count: 3 })        // ✅ interpolation
 *   t('not.a.real.key')                              // ❌ TypeScript error
 */
export function useTranslation(): UseTranslationReturn {
  const { t: rawT, i18n } = useTranslationBase();

  // Cast rawT to our TypedT.
  // This is the one intentional cast in the entire system — it is safe because:
  // 1. TranslationKey only contains keys that exist in the loaded resources.
  // 2. i18next will always return a string (falling back to the key on miss).
  // 3. InterpolationValues matches i18next's internal interpolation options.
  const t = rawT as unknown as TypedT;

  // Normalize the locale: i18next may return 'en-US', we want 'en'.
  const locale = (i18n.language?.split('-')[0] ?? 'en') as SupportedLocale;

  return { t, i18n, locale };
}