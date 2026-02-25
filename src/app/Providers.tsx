import { ReactNode } from 'react'
import { UserProvider } from '@/providers/UserProvider'
import { AnalyticsProvider } from '@/lib/analytics/AnalyticsProvider'
import { ModalProvider } from '@/components/ui/ModalProvider'
import { ErrorBoundary } from '@/components/ErrorBoundary'

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary>
      <AnalyticsProvider>
        <UserProvider>
          <ModalProvider>
            {children}
          </ModalProvider>
        </UserProvider>
      </AnalyticsProvider>
    </ErrorBoundary>
  )
}