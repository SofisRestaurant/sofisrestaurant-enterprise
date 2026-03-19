// src/components/ui/LanguageSwitcher.tsx
// =============================================================================
// LANGUAGE SWITCHER — Production ready (2026)
// =============================================================================
// Renders two pill buttons: English / Español.
// Uses i18n.changeLanguage() from react-i18next — automatically persists
// the choice to localStorage via the LanguageDetector config in i18n.ts.
//
// Usage:
//   import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';
//
//   // Compact (header/nav — default)
//   <LanguageSwitcher />
//
//   // With visible label (footer/settings)
//   <LanguageSwitcher showLabel />
//
//   // On a dark background (header with glass surface)
//   <LanguageSwitcher surface="dark" />
// =============================================================================

import { useTranslation } from '@/i18n/useTranslation';
import { type SupportedLocale, SUPPORTED_LOCALES, LOCALE_LABELS } from '@/i18n';

interface LanguageSwitcherProps {
  /** Show "Language:" label before the buttons */
  showLabel?: boolean;
  /** Visual surface context — adjusts colors for light vs dark backgrounds */
  surface?: 'light' | 'dark';
  /** Extra classes on the wrapper */
  className?: string;
}

export function LanguageSwitcher({
  showLabel = false,
  surface = 'light',
  className = '',
}: LanguageSwitcherProps) {
  const { t, i18n } = useTranslation();

  const currentLocale = i18n.language?.split('-')[0] as SupportedLocale;

  const handleChange = (locale: SupportedLocale) => {
    if (locale === currentLocale) return;
    // changeLanguage is async — persists choice via LanguageDetector automatically
    void i18n.changeLanguage(locale);
  };

  return (
    <div
      className={`flex items-center gap-2 ${className}`}
      role="group"
      aria-label={t('languageSwitcher.label')}
    >
      {showLabel ? (
        <span
          className="text-[0.65rem] font-medium uppercase tracking-[0.14em]"
          style={{
            color:
              surface === 'dark'
                ? 'rgba(255,255,255,0.40)'
                : 'var(--color-ink-500, #8a7a6a)',
          }}
        >
          {t('languageSwitcher.label')}
        </span>
      ) : null}

      <div className="flex items-center gap-1">
        {SUPPORTED_LOCALES.map((locale) => {
          const isActive = currentLocale === locale;

          return (
            <button
              key={locale}
              type="button"
              onClick={() => handleChange(locale)}
              aria-pressed={isActive}
              aria-label={`${t('languageSwitcher.label')}: ${LOCALE_LABELS[locale]}`}
              className={[
                // Base pill styles
                'rounded-full px-2.5 py-1 text-[0.68rem] font-medium',
                'transition-all duration-var(--duration-base,200ms)]',
                'focus:outline-none focus-visible:ring-2',
                'focus-visible:ring-var(--color-gold-400,#d4af37)] focus-visible:ring-offset-1',
                // Active vs inactive
                isActive
                  ? surface === 'dark'
                    ? 'bg-var(--color-gold-400,#d4af37)] text-var(--color-stone-900,#1c1915)]'
                    : 'bg-var(--color-ember-50,#fdf4ef)] text-var(--color-ember-700,#6b3820)] ring-1 ring-var(--color-ember-200,#eebfa0)]'
                  : surface === 'dark'
                    ? 'text-white/50 hover:text-white/80 hover:bg-white/8'
                    : 'text-var(--color-ink-500,#8a7a6a)] hover:text-var(--color-ink-700,#4e3e34)] hover:bg-var(--color-ink-50,#faf8f5)]',
              ].join(' ')}
            >
              {LOCALE_LABELS[locale]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default LanguageSwitcher;