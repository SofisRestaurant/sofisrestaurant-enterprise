// src/features/admin/dashboard/ROIChart.tsx
// ROI visualization - NO calculations, only display server-computed data

import { Panel, Badge } from '../ui/AdminPrimitives';

interface ROIData {
  campaign_name: string;
  revenue: number;
  spent: number;
  roi: number;
  conversions: number;
}

interface ROIChartProps {
  data: ROIData[];
  loading?: boolean;
}

export function ROIChart({ data, loading }: ROIChartProps) {
  if (loading) {
    return (
      <Panel title="Campaign ROI">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600" />
        </div>
      </Panel>
    );
  }

  const sortedData = [...data]
    .sort((a, b) => b.roi - a.roi)
    .slice(0, 5);

  const maxROI = Math.max(...sortedData.map(d => Math.abs(d.roi)), 100);

  return (
    <Panel 
      title="Top Campaigns by ROI"
      subtitle="Server-calculated return on investment"
    >
      {sortedData.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          No campaign data available
        </div>
      ) : (
        <div className="space-y-4">
          {sortedData.map((campaign, index) => {
            const barWidth = (Math.abs(campaign.roi) / maxROI) * 100;
            const isPositive = campaign.roi >= 0;
            
            return (
              <div key={index} className="space-y-2">
                {/* Campaign Info */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`
                      w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm
                      ${index === 0 ? 'bg-amber-500 text-white' : 'bg-gray-200 text-gray-600'}
                    `}>
                      {index + 1}
                    </div>
                    <div>
                      <div className="font-medium text-gray-900">
                        {campaign.campaign_name}
                      </div>
                      <div className="text-xs text-gray-500">
                        {campaign.conversions} conversions • 
                        ${(campaign.revenue / 100).toLocaleString()} revenue
                      </div>
                    </div>
                  </div>
                  
                  <Badge tone={isPositive ? 'success' : 'danger'}>
                    {campaign.roi.toFixed(0)}% ROI
                  </Badge>
                </div>
                
                {/* Progress Bar */}
                <div className="relative h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`
                      absolute inset-y-0 left-0 rounded-full transition-all duration-700
                      ${isPositive 
                        ? 'bg-linear-to-r from-green-500 to-emerald-500' 
                        : 'bg-lineaer-to-r from-red-500 to-pink-500'
                      }
                    `}
                    style={{ width: `${barWidth}%` }}
                  />
                </div>

                {/* Spent vs Revenue */}
                <div className="flex items-center justify-between text-xs text-gray-600">
                  <span>Spent: ${(campaign.spent / 100).toFixed(2)}</span>
                  <span>Revenue: ${(campaign.revenue / 100).toFixed(2)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Summary Footer */}
      {sortedData.length > 0 && (
        <div className="mt-6 pt-6 border-t border-gray-200">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">Total Marketing Revenue</span>
            <span className="font-bold text-gray-900">
              ${(sortedData.reduce((sum, d) => sum + d.revenue, 0) / 100).toLocaleString()}
            </span>
          </div>
        </div>
      )}
    </Panel>
  );
}