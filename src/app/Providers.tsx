import type { ReactNode } from 'react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ModalProvider } from '@/components/ui/ModalProvider';
import { ThemeProvider } from '@/features/theme';
import { AnalyticsProvider } from '@/lib/analytics/AnalyticsProvider';
import { UserProvider } from '@/providers/UserProvider';

type ProvidersProps = {
  children: ReactNode;
};

export function Providers({ children }: ProvidersProps) {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AnalyticsProvider>
          <UserProvider>
            <ModalProvider>{children}</ModalProvider>
          </UserProvider>
        </AnalyticsProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
