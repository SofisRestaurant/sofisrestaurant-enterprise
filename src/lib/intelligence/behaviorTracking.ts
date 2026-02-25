export interface UserBehavior {
  pageViews: string[]
  cartActions: string[]
  searchQueries: string[]
  timeOnPage: Record<string, number>
}

class BehaviorTracker {
  private behavior: UserBehavior = {
    pageViews: [],
    cartActions: [],
    searchQueries: [],
    timeOnPage: {},
  }

  trackPageView(path: string): void {
    this.behavior.pageViews.push(path)
  }

  trackCartAction(action: string): void {
    this.behavior.cartActions.push(action)
  }

  trackSearch(query: string): void {
    this.behavior.searchQueries.push(query)
  }

  trackTimeOnPage(path: string, seconds: number): void {
    this.behavior.timeOnPage[path] = 
      (this.behavior.timeOnPage[path] || 0) + seconds
  }

  getBehavior(): UserBehavior {
    return { ...this.behavior }
  }

  reset(): void {
    this.behavior = {
      pageViews: [],
      cartActions: [],
      searchQueries: [],
      timeOnPage: {},
    }
  }
}

export const behaviorTracker = new BehaviorTracker()
