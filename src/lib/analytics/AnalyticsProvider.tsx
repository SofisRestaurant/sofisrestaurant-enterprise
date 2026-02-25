import { ReactNode, useEffect, useMemo, useContext } from 'react'
import { analytics } from './client'
import { AnalyticsContext, type AnalyticsContextValue } from './AnalyticsContext'
import { UserContext } from '@/contexts/UserContext'

interface AnalyticsProviderProps {
  children: ReactNode
}

export function AnalyticsProvider({ children }: AnalyticsProviderProps) {
  const userContext = useContext(UserContext)

  const userId = userContext?.user?.id ?? null
  const email = userContext?.user?.email ?? null
  const name = userContext?.user?.name ?? null
  const role = userContext?.role ?? null

  useEffect(() => {
    if (!userId) return

    analytics.identify(userId, {
      email,
      name,
      role,
    })
  }, [userId, email, name, role])

  useEffect(() => {
    return () => analytics.flush()
  }, [])

  const value: AnalyticsContextValue = useMemo(
    () => ({
      track: analytics.track.bind(analytics),
      page: analytics.page.bind(analytics),
      identify: analytics.identify.bind(analytics),
    }),
    []
  )

  return <AnalyticsContext.Provider value={value}>{children}</AnalyticsContext.Provider>
}