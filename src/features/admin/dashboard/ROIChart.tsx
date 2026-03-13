// src/features/admin/dashboard/ROIChart.tsx
// ROI visualization - display-only, server-computed data

import { useMemo } from 'react';
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

type RankedCampaign = ROIData & {
  rank: number;
  key: string;
};

function safeNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function safeString(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function currencyFromCents(cents: number): string {
  return (safeNumber(cents) / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}

function buildCampaignKey(campaign: ROIData, rank: number): string {
  const name = safeString(campaign.campaign_name, 'campaign').toLowerCase().replace(/\s+/g, '-');
  const revenue = Math.trunc(safeNumber(campaign.revenue));
  const spent = Math.trunc(safeNumber(campaign.spent));
  const conversions = Math.trunc(safeNumber(campaign.conversions));
  const roi = Math.trunc(safeNumber(campaign.roi) * 100);
  return `${name}-${revenue}-${spent}-${conversions}-${roi}-${rank}`;
}

export function ROIChart({ data, loading = false }: ROIChartProps) {
  const sortedData = useMemo<RankedCampaign[]>(() => {
    const safeData = Array.isArray(data) ? data : [];

    return [...safeData]
      .map((campaign, index) => ({
        campaign_name: safeString(campaign.campaign_name, `Campaign ${index + 1}`),
        revenue: safeNumber(campaign.revenue),
        spent: safeNumber(campaign.spent),
        roi: safeNumber(campaign.roi),
        conversions: Math.max(0, Math.trunc(safeNumber(campaign.conversions))),
        rank: index + 1,
        key: '',
      }))
      .sort((a, b) => b.roi - a.roi)
      .slice(0, 5)
      .map((campaign, index) => ({
        ...campaign,
        rank: index + 1,
        key: buildCampaignKey(campaign, index + 1),
      }));
  }, [data]);

  const maxROI = useMemo(() => {
    const largest = sortedData.reduce((max, campaign) => {
      return Math.max(max, Math.abs(campaign.roi));
    }, 0);

    return Math.max(largest, 100);
  }, [sortedData]);

  const totalMarketingRevenue = useMemo(() => {
    return sortedData.reduce((sum, campaign) => sum + campaign.revenue, 0);
  }, [sortedData]);

  if (loading) {
    return (
      <Panel title="Campaign ROI">
        <div className="flex h-64 items-center justify-center">
          <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-amber-600" />
        </div>
      </Panel>
    );
  }

  return (
    <Panel title="Top Campaigns by ROI" subtitle="Server-calculated return on investment">
      {sortedData.length === 0 ? (
        <div className="py-12 text-center text-gray-500">No campaign data available</div>
      ) : (
        <div className="space-y-4">
          {sortedData.map((campaign) => {
            const barWidth = Math.max(0, Math.min(100, (Math.abs(campaign.roi) / maxROI) * 100));
            const isPositive = campaign.roi >= 0;
            const isTopRank = campaign.rank === 1;

            return (
              <div key={campaign.key} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={[
                        'flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold',
                        isTopRank ? 'bg-amber-500 text-white' : 'bg-gray-200 text-gray-600',
                      ].join(' ')}
                    >
                      {campaign.rank}
                    </div>

                    <div>
                      <div className="font-medium text-gray-900">{campaign.campaign_name}</div>
                      <div className="text-xs text-gray-500">
                        {campaign.conversions} conversions • {currencyFromCents(campaign.revenue)}{' '}
                        revenue
                      </div>
                    </div>
                  </div>

                  <Badge tone={isPositive ? 'success' : 'danger'}>
                    {campaign.roi.toFixed(0)}% ROI
                  </Badge>
                </div>

                <div className="relative h-3 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className={[
                      'absolute inset-y-0 left-0 rounded-full transition-all duration-700',
                      isPositive
                        ? 'bg-linear-to-r from-green-500 to-emerald-500'
                        : 'bg-linear-to-r from-red-500 to-pink-500',
                    ].join(' ')}
                    style={{ width: `${barWidth}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-xs text-gray-600">
                  <span>Spent: {currencyFromCents(campaign.spent)}</span>
                  <span>Revenue: {currencyFromCents(campaign.revenue)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {sortedData.length > 0 ? (
        <div className="mt-6 border-t border-gray-200 pt-6">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">Total Marketing Revenue</span>
            <span className="font-bold text-gray-900">
              {currencyFromCents(totalMarketingRevenue)}
            </span>
          </div>
        </div>
      ) : null}
    </Panel>
  );
}