import { useEffect, type ReactNode } from 'react';

type ResolvedTheme = 'light' | 'dark';

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme: ResolvedTheme): void {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

/**
 * System-only theme provider.
 *
 * Reads prefers-color-scheme on mount, sets data-theme + colorScheme on <html>,
 * and listens for live system changes. No localStorage. No manual override.
 * No context. No re-renders. Pure side-effect.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    applyTheme(getSystemTheme());

    const mq = window.matchMedia('(prefers-color-scheme: dark)');

    const handleChange = (e: MediaQueryListEvent): void => {
      applyTheme(e.matches ? 'dark' : 'light');
    };

    mq.addEventListener('change', handleChange);
    return () => mq.removeEventListener('change', handleChange);
  }, []);

  return <>{children}</>;
}