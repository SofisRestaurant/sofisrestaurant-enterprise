export enum AnalyticsEvent {
  PAGE_VIEW = 'page_view',
  ADD_TO_CART = 'add_to_cart',
  REMOVE_FROM_CART = 'remove_from_cart',
  BEGIN_CHECKOUT = 'begin_checkout',
  PURCHASE = 'purchase',
  VIEW_ITEM = 'view_item',
  SEARCH = 'search',
  CLICK = 'click',
  SCROLL = 'scroll',
}

type EventData = Record<string, unknown>

// Declare global window types
declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
    fbq?: (...args: unknown[]) => void
  }
}

class AnalyticsClient {
  private isEnabled: boolean
  private queue: Array<{ event: string; data?: EventData }> = []

  constructor() {
    this.isEnabled = !import.meta.env.DEV
  }

  track(event: AnalyticsEvent | string, data?: EventData): void {
    if (!this.isEnabled) {
      console.log('[Analytics DEV]', event, data)
      return
    }

    this.queue.push({ event, data })

    if (typeof window !== 'undefined') {
      // Google Analytics 4
      if (window.gtag) {
        window.gtag('event', event, data)
      }

      // Facebook Pixel
      if (window.fbq) {
        window.fbq('track', event, data)
      }

      this.sendToEndpoint(event, data)
    }
  }

  page(path: string, data?: EventData): void {
    this.track(AnalyticsEvent.PAGE_VIEW, {
      page_path: path,
      page_title: document.title,
      ...data,
    })
  }

  identify(userId: string, traits?: EventData): void {
    if (!this.isEnabled) {
      console.log('[Analytics DEV] Identify:', userId, traits)
      return
    }

    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('config', 'GA_MEASUREMENT_ID', {
        user_id: userId,
        ...traits,
      })
    }
  }

  private async sendToEndpoint(event: string, data?: EventData): Promise<void> {
    try {
      await fetch('/api/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event, data, timestamp: Date.now() }),
      })
    } catch (error) {
      console.error('Analytics error:', error)
    }
  }

  flush(): void {
    if (this.queue.length > 0) {
      console.log('Flushing analytics queue:', this.queue.length)
      this.queue = []
    }
  }
}

export const analytics = new AnalyticsClient()