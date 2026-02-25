import { createContext } from 'react'
import { analytics } from './client'

export interface AnalyticsContextValue {
  track: typeof analytics.track
  page: typeof analytics.page
  identify: typeof analytics.identify
}

export const AnalyticsContext = createContext<AnalyticsContextValue | null>(null)