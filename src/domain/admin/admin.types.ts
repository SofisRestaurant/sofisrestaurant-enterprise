export interface AdminDashboardMetrics {
  todayRevenue: number
  weekRevenue: number
  monthRevenue: number
  avgOrderValue: number

  todayOrders: number
  weekOrders: number
  pendingOrders: number

  pointsIssued: number
  pointsRedeemed: number
  outstandingLiability: number

  failedPayments: number
  fraudAlerts: number
  blockedIPs: number

  lowStockItems: number
  outOfStockItems: number

  activeCampaigns: number
  abandonedCarts: number
  recoveryRate: number
}

export interface RevenueSummary {
  period: 'day' | 'week' | 'month'
  totalRevenue: number
  orderCount: number
  avgOrderValue: number
  taxCollected: number
  grossProfit: number
  netProfit: number
}

export interface SecurityAlert {
  id: string
  type: 'payment' | 'auth' | 'fraud' | 'system'
  severity: 'low' | 'medium' | 'high' | 'critical'
  message: string
  metadata: Record<string, unknown>
  createdAt: string
}

export interface LoyaltyMetrics {
  issued: number
  redeemed: number
  liability: number
}