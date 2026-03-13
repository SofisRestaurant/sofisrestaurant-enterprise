// src/features/admin/dashboard/RevenueByChannelCard.tsx
// Channel performance - displays server-calculated metrics only

import { Panel, ProgressBar } from '../ui/AdminPrimitives';

interface ChannelData {
  channel: string;
  revenue: number;
  orders: number;
  roi: number;
}

interface RevenueByChannelCardProps {
  data: ChannelData[];
  loading?: boolean;
}

type ProgressColor = 'primary' | 'success' | 'warning' | 'danger';

const channelConfig: Record<string, { icon: string; color: ProgressColor; label: string }> = {
  email: { icon: '📧', color: 'primary', label: 'Email' },
  sms: { icon: '📱', color: 'success', label: 'SMS' },
  instagram: { icon: '📸', color: 'primary', label: 'Instagram' },
  facebook: { icon: '👥', color: 'primary', label: 'Facebook' },
  google_ads: { icon: '🔍', color: 'warning', label: 'Google Ads' },
  organic: { icon: '🌱', color: 'success', label: 'Organic' },
  direct: { icon: '🎯', color: 'primary', label: 'Direct' },
  abandoned_cart: { icon: '🛒', color: 'danger', label: 'Cart Recovery' },
};

export function RevenueByChannelCard({ data, loading }: RevenueByChannelCardProps) {
  if (loading) {
    return (
      <Panel title="Revenue by Channel">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600" />
        </div>
      </Panel>
    );
  }

  // Server already calculated totals
  const totalRevenue = data.reduce((sum, ch) => sum + ch.revenue, 0);

  return (
    <Panel title="Revenue by Channel" subtitle="Performance by marketing source">
      {data.length === 0 ? (
        <div className="text-center py-12 text-gray-500">No channel data available</div>
      ) : (
        <div className="space-y-6">
          {data.map((channel) => {
            const percentage = totalRevenue > 0 ? (channel.revenue / totalRevenue) * 100 : 0;

            const config = channelConfig[channel.channel] || {
              icon: '📊',
              color: 'primary' as ProgressColor,
              label: channel.channel,
            };

            return (
              <div key={channel.channel} className="space-y-3">
                {/* Channel Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{config.icon}</span>
                    <span className="font-medium text-gray-900">{config.label}</span>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-gray-900">
                      ${(channel.revenue / 100).toLocaleString()}
                    </div>
                    <div className="text-sm text-gray-500">{channel.orders} orders</div>
                  </div>
                </div>

                {/* Progress Bar (design system primitive) */}
                <ProgressBar
                  value={percentage}
                  max={100}
                  label={`${config.label} share`}
                  showPercentage={false}
                  color={config.color}
                />

                {/* Stats Row */}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">{percentage.toFixed(1)}% of total</span>
                  <span
                    className={`font-medium ${
                      channel.roi >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}
                  >
                    ROI: {channel.roi.toFixed(0)}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Summary */}
      {data.length > 0 && (
        <div className="mt-6 pt-6 border-t border-gray-200">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-600">Total Revenue</span>
              <div className="font-bold text-lg text-gray-900">
                ${(totalRevenue / 100).toLocaleString()}
              </div>
            </div>
            <div>
              <span className="text-gray-600">Total Orders</span>
              <div className="font-bold text-lg text-gray-900">
                {data.reduce((sum, ch) => sum + ch.orders, 0).toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}
