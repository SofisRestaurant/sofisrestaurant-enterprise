// src/features/admin/dashboard/AdminRevenuePanel.tsx
// ZERO frontend calculations - displays server metrics only
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/supabaseClient';
import { StatCard, MetricGrid, Alert, LoadingSpinner } from '../ui/AdminPrimitives';
import { ROIChart } from './ROIChart';
import { RevenueByChannelCard } from './RevenueByChannelCard';

interface AdminMetrics {
  revenue: {
    today: number;
    week: number;
    month: number;
  };
  topItems: Array<{
    item_name: string;
    total_revenue: number;
    order_count: number;
  }>;
  loyalty: {
    total_points_issued: number;
    total_points_redeemed: number;
    active_accounts: number;
  };
  liability: {
    outstanding_liability: number;
  };
  risk: {
    high_risk_transactions: number;
    blocked_ips: number;
  };
  fraud: {
    flagged_orders: number;
    total_disputes: number;
  };
  executive: {
    total_revenue: number;
    total_orders: number;
    avg_order_value: number;
  };
}

export function AdminRevenuePanel() {
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadMetrics();
  }, []);

  const loadMetrics = async () => {
    setLoading(true);
    setError(null);

    try {
      const { data: session } = await supabase.auth.getSession();
      
      if (!session?.session?.access_token) {
        throw new Error('Not authenticated');
      }

      // Call admin-metrics Edge Function (service role inside function)
      const { data, error: fnError } = await supabase.functions.invoke('admin-metrics', {
        headers: {
          Authorization: `Bearer ${session.session.access_token}`,
        },
      });

      if (fnError) throw fnError;

      // Server returns ALL computed metrics - frontend just displays
      setMetrics(data as AdminMetrics);
    } catch (err) {
      console.error('Failed to load admin metrics:', err);
      setError(err instanceof Error ? err.message : 'Failed to load metrics');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

if (error || !metrics) {
  return (
    <div className="p-8">
      <Alert
  tone="danger"
  title="Failed to Load Metrics"
  message={error || 'Unable to fetch admin dashboard data'}
/>

      <button
        type="button"
        onClick={() => void loadMetrics()}
        className="mt-4 bg-amber-500 hover:bg-amber-600 text-white font-bold py-2 px-6 rounded-lg"
      >
        Retry
      </button>
    </div>
    );
  }

  // Calculate trends (server should do this, but demo with frontend for now)
  const todayRevenue = metrics.revenue?.today || 0;
  const weekRevenue = metrics.revenue?.week || 0;
  const monthRevenue = metrics.revenue?.month || 0;

  return (
    <div className="space-y-8">
      {/* Key Metrics Grid */}
      <MetricGrid columns={4}>
        <StatCard
          title="Today's Revenue"
          value={`$${(todayRevenue / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
          icon="💰"
          color="success"
          subtitle="Real-time updated"
        />

        <StatCard
          title="Week Revenue"
          value={`$${(weekRevenue / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
          icon="📊"
          color="info"
          subtitle="Last 7 days"
        />

        <StatCard
          title="Month Revenue"
          value={`$${(monthRevenue / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`}
          icon="📈"
          color="default"
          subtitle="Last 30 days"
        />

        <StatCard
          title="Avg Order Value"
          value={`$${((metrics.executive?.avg_order_value || 0) / 100).toFixed(2)}`}
          icon="🛒"
          color="warning"
          subtitle={`${metrics.executive?.total_orders || 0} orders`}
        />
      </MetricGrid>

      {/* Loyalty Metrics */}
      <MetricGrid columns={3}>
        <StatCard
          title="Points Issued"
          value={(metrics.loyalty?.total_points_issued || 0).toLocaleString()}
          icon="⭐"
          color="success"
          subtitle="Lifetime total"
        />

        <StatCard
          title="Points Redeemed"
          value={(metrics.loyalty?.total_points_redeemed || 0).toLocaleString()}
          icon="🎁"
          color="info"
          subtitle="Customer redemptions"
        />

        <StatCard
          title="Outstanding Liability"
          value={`$${((metrics.liability?.outstanding_liability || 0) / 100).toLocaleString()}`}
          icon="💳"
          color="warning"
          subtitle="Unredeemed value"
        />
      </MetricGrid>

      {/* Security & Risk */}
      <MetricGrid columns={4}>
        <StatCard
          title="High Risk Orders"
          value={metrics.risk?.high_risk_transactions || 0}
          icon="⚠️"
          color="danger"
          subtitle="Flagged for review"
        />

        <StatCard
          title="Blocked IPs"
          value={metrics.risk?.blocked_ips || 0}
          icon="🚫"
          color="danger"
          subtitle="Active blocks"
        />

        <StatCard
          title="Fraud Flags"
          value={metrics.fraud?.flagged_orders || 0}
          icon="🔍"
          color="warning"
          subtitle="Under investigation"
        />

        <StatCard
          title="Disputes"
          value={metrics.fraud?.total_disputes || 0}
          icon="⚖️"
          color="warning"
          subtitle="Active chargebacks"
        />
      </MetricGrid>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <ROIChart 
          data={[]} // Would come from admin-metrics function
          loading={false}
        />
        <RevenueByChannelCard 
          data={[]} // Would come from admin-metrics function
          loading={false}
        />
      </div>

      {/* Top Items */}
      {metrics.topItems && metrics.topItems.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Top Selling Items</h2>
          <div className="space-y-3">
            {metrics.topItems.slice(0, 5).map((item, index) => (
              <div key={index} className="flex items-center justify-between py-2 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <span className="text-lg font-bold text-gray-400">#{index + 1}</span>
                  <span className="font-medium text-gray-900">{item.item_name}</span>
                </div>
                <div className="text-right">
                  <div className="font-bold text-green-600">
                    ${(item.total_revenue / 100).toFixed(2)}
                  </div>
                  <div className="text-xs text-gray-500">
                    {item.order_count} orders
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}