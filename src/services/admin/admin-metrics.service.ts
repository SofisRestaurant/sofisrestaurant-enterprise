// src/services/admin/admin-metrics.service.ts
// Enterprise-grade admin metrics aggregation

import { createClient } from '@supabase/supabase-js';
import type { 
  AdminDashboardMetrics, 
  RevenueSummary,
  SecurityAlert,
  LoyaltyMetrics 
} from '@/domain/admin/admin.types';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

export class AdminMetricsService {
  /**
   * Get all dashboard metrics in one call
   * Uses materialized views for performance
   */
  static async getDashboardMetrics(): Promise<AdminDashboardMetrics> {
    try {
      // Parallel queries for performance
      const [
        revenueData,
        orderData,
        loyaltyData,
        securityData,
        inventoryData,
        marketingData
      ] = await Promise.all([
        this.getRevenueMetrics(),
        this.getOrderMetrics(),
        this.getLoyaltyMetrics(),
        this.getSecurityMetrics(),
        this.getInventoryMetrics(),
        this.getMarketingMetrics(),
      ]);

      return {
        // Revenue
        todayRevenue: revenueData.today,
        weekRevenue: revenueData.week,
        monthRevenue: revenueData.month,
        avgOrderValue: revenueData.avgOrderValue,
        
        // Orders
        todayOrders: orderData.today,
        weekOrders: orderData.week,
        pendingOrders: orderData.pending,
        
        // Loyalty
        pointsIssued: loyaltyData.issued,
        pointsRedeemed: loyaltyData.redeemed,
        outstandingLiability: loyaltyData.liability,
        
        // Security
        failedPayments: securityData.failedPayments,
        fraudAlerts: securityData.fraudAlerts,
        blockedIPs: securityData.blockedIPs,
        
        // Inventory
        lowStockItems: inventoryData.lowStock,
        outOfStockItems: inventoryData.outOfStock,
        
        // Marketing
        activeCampaigns: marketingData.active,
        abandonedCarts: marketingData.abandoned,
        recoveryRate: marketingData.recoveryRate,
      };
    } catch (error) {
      console.error('Error fetching dashboard metrics:', error);
      throw new Error('Failed to load dashboard metrics');
    }
  }

  /**
   * Get revenue metrics from materialized view
   */
  private static async getRevenueMetrics() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    
    const monthAgo = new Date(today);
    monthAgo.setMonth(monthAgo.getMonth() - 1);

    const { data: todayData } = await supabase
      .from('revenue_summary')
      .select('total_revenue, order_count')
      .gte('period_start', today.toISOString())
      .single();

    const { data: weekData } = await supabase
      .from('revenue_summary')
      .select('total_revenue')
      .gte('period_start', weekAgo.toISOString())
      .single();

    const { data: monthData } = await supabase
      .from('revenue_summary')
      .select('total_revenue')
      .gte('period_start', monthAgo.toISOString())
      .single();

    return {
      today: todayData?.total_revenue || 0,
      week: weekData?.total_revenue || 0,
      month: monthData?.total_revenue || 0,
      avgOrderValue: todayData?.order_count 
        ? todayData.total_revenue / todayData.order_count 
        : 0,
    };
  }

  /**
   * Get order counts and status
   */
  private static async getOrderMetrics() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);

    const [todayResult, weekResult, pendingResult] = await Promise.all([
      supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', today.toISOString()),
      
      supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', weekAgo.toISOString()),
      
      supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .in('status', ['pending', 'confirmed', 'preparing']),
    ]);

    return {
      today: todayResult.count || 0,
      week: weekResult.count || 0,
      pending: pendingResult.count || 0,
    };
  }

  /**
   * Get loyalty metrics from ledger
   */
 private static async getLoyaltyMetrics(): Promise<LoyaltyMetrics> {
    const { data: ledgerData } = await supabase
      .from('loyalty_ledger')
      .select('entry_type, amount')
      .in('entry_type', ['earned', 'redeemed']);

    const issued = ledgerData
      ?.filter(e => e.entry_type === 'earned')
      .reduce((sum, e) => sum + e.amount, 0) || 0;

    const redeemed = ledgerData
      ?.filter(e => e.entry_type === 'redeemed')
      .reduce((sum, e) => sum + Math.abs(e.amount), 0) || 0;

    return {
      issued,
      redeemed,
      liability: issued - redeemed,
    };
  }

  /**
   * Get security and fraud metrics
   */
  private static async getSecurityMetrics() {
    const [failedPayments, fraudAlerts, blockedIPs] = await Promise.all([
      supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('payment_status', 'failed')
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
      
      supabase
        .from('fraud_logs')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
      
      supabase
        .from('ip_blocks')
        .select('*', { count: 'exact', head: true })
        .gt('blocked_until', new Date().toISOString()),
    ]);

    return {
      failedPayments: failedPayments.count || 0,
      fraudAlerts: fraudAlerts.count || 0,
      blockedIPs: blockedIPs.count || 0,
    };
  }

  /**
   * Get inventory status
   */
  private static async getInventoryMetrics() {
    const { data: items } = await supabase
      .from('menu_items')
      .select('inventory_count, low_stock_threshold, available');

    const lowStock = items?.filter(
      i => i.inventory_count && i.inventory_count <= i.low_stock_threshold
    ).length || 0;

    const outOfStock = items?.filter(i => !i.available).length || 0;

    return { lowStock, outOfStock };
  }

  /**
   * Get marketing metrics
   */
  private static async getMarketingMetrics() {
    const [campaigns, carts, recovery] = await Promise.all([
      supabase
        .from('growth_campaigns')
        .select('*', { count: 'exact', head: true })
        .eq('active', true),
      
      supabase
        .from('admin_abandoned_cart_metrics')
        .select('total_abandoned')
        .single(),
      
      supabase
        .from('admin_abandoned_cart_metrics')
        .select('recovery_rate')
        .single(),
    ]);

    return {
      active: campaigns.count || 0,
      abandoned: carts.data?.total_abandoned || 0,
      recoveryRate: recovery.data?.recovery_rate || 0,
    };
  }

  /**
   * Get detailed revenue summary for a period
   */
  static async getRevenueSummary(
    period: 'day' | 'week' | 'month'
  ): Promise<RevenueSummary> {
    const now = new Date();
    const startDate = new Date();
    
    switch (period) {
      case 'day':
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'week':
        startDate.setDate(now.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(now.getMonth() - 1);
        break;
    }

    const { data: orders } = await supabase
      .from('orders')
      .select('amount_subtotal, amount_tax, amount_total')
      .gte('created_at', startDate.toISOString())
      .eq('payment_status', 'paid');

    const totalRevenue = orders?.reduce((sum, o) => sum + o.amount_total, 0) || 0;
    const taxCollected = orders?.reduce((sum, o) => sum + o.amount_tax, 0) || 0;
    const orderCount = orders?.length || 0;

    return {
      period,
      totalRevenue,
      orderCount,
      avgOrderValue: orderCount > 0 ? totalRevenue / orderCount : 0,
      taxCollected,
      grossProfit: totalRevenue * 0.65, // Estimate 65% margin
      netProfit: totalRevenue * 0.25, // Estimate 25% net
    };
  }

  /**
   * Get recent security alerts
   */
  static async getSecurityAlerts(limit = 10): Promise<SecurityAlert[]> {
    const { data } = await supabase
      .from('security_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    return data?.map(event => ({
      id: event.id,
      type: event.event_type as SecurityAlert['type'],
      severity: event.severity as SecurityAlert['severity'],
      message: event.description || 'Security event detected',
      metadata: event.metadata || {},
      createdAt: event.created_at,
    })) || [];
  }
}

export const adminMetricsService = AdminMetricsService;