import { useState, useEffect } from 'react';
import { marketingService } from '@/services/marketing.service';
import type { Campaign } from '@/types/marketing';

export default function CampaignManager() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    loadCampaigns();
  }, []);

  const loadCampaigns = async () => {
    try {
      const data = await marketingService.getCampaigns();
      setCampaigns(data);
    } catch (error) {
      console.error('Failed to load campaigns:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleCampaignStatus = async (
    id: string,
    currentStatus: Campaign['status']
  ) => {
    const newStatus = currentStatus === 'active' ? 'paused' : 'active';

    try {
      await marketingService.updateCampaign(id, { status: newStatus });
      await loadCampaigns();
    } catch (error) {
      console.error('Failed to update campaign:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600" />
      </div>
    );
  }

  const totalSpent = campaigns.reduce(
    (sum, c) => sum + c.spent,
    0
  );

  const totalRevenue = campaigns.reduce(
    (sum, c) => sum + c.revenue,
    0
  );

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Campaign Manager
          </h1>
          <p className="text-gray-600">
            Create and manage marketing campaigns
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="bg-amber-500 hover:bg-amber-600 text-white font-bold py-3 px-6 rounded-lg transition-colors"
        >
          + New Campaign
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <StatCard title="Total Campaigns" value={campaigns.length} />
        <StatCard
          title="Active"
          value={campaigns.filter(c => c.status === 'active').length}
          highlight="text-green-600"
        />
        <StatCard
          title="Total Spent"
          value={`$${(totalSpent / 100).toLocaleString()}`}
        />
        <StatCard
          title="Total Revenue"
          value={`$${(totalRevenue / 100).toLocaleString()}`}
          highlight="text-green-600"
        />
      </div>

      {/* Campaign Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {campaigns.map((campaign) => {
          const roi =
           campaign.spent  > 0
              ? ((campaign.revenue - campaign.spent) /
                  campaign.spent) *
                100
              : 0;

          return (
            <div
              key={campaign.id}
              className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow overflow-hidden"
            >
              {/* Header */}
              <div
                className={`p-4 ${
                  campaign.status === 'active'
                    ? 'bg-linear-to-r from-green-500 to-emerald-500'
                    : 'bg-gray-400'
                }`}
              >
                <div className="flex items-center justify-between text-white">
                  <div>
                    <div className="text-sm font-medium opacity-90 uppercase">
                      {campaign.type}
                    </div>
                    <div className="text-lg font-bold">
                      {campaign.name}
                    </div>
                  </div>
                  <button
                    onClick={() =>
                      toggleCampaignStatus(campaign.id, campaign.status)
                    }
                    className="bg-white/20 hover:bg-white/30 rounded-full px-3 py-1 text-sm font-medium transition-colors"
                  >
                    {campaign.status === 'active'
                      ? 'Pause'
                      : 'Activate'}
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="p-6 space-y-4">
                <MetricRow
                  label="Budget"
                  value={`$${(campaign.budget / 100).toLocaleString()}`}
                />
                <MetricRow
                  label="Spent"
                  value={`$${(campaign.spent / 100).toLocaleString()}`}
                />
                <MetricRow
                  label="Revenue"
                  value={`$${(campaign.revenue / 100).toLocaleString()}`}
                  highlight="text-green-600"
                />
                <MetricRow
                  label="ROI"
                  value={`${roi.toFixed(0)}%`}
                  highlight={roi >= 0 ? 'text-green-600' : 'text-red-600'}
                />

                <div className="pt-4 border-t border-gray-200 text-sm">
                  <div>
                    <span className="text-gray-600">Conversions:</span>
                    <span className="ml-2 font-bold text-gray-900">
                      {campaign.conversions}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2 text-xs">
                  <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full font-medium">
                    {campaign.channel}
                  </span>
                  <span className="text-gray-500">
                    Started{' '}
                    {new Date(campaign.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Empty State */}
      {campaigns.length === 0 && (
        <div className="text-center py-20">
          <div className="text-6xl mb-4">📊</div>
          <p className="text-xl text-gray-600 mb-4">
            No campaigns yet
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-amber-500 hover:bg-amber-600 text-white font-bold py-3 px-6 rounded-lg transition-colors"
          >
            Create Your First Campaign
          </button>
        </div>
      )}

      {/* Simple Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center">
          <div className="bg-white p-8 rounded-lg shadow-lg w-96">
            <h2 className="text-xl font-bold mb-4">
              Create Campaign (Coming Soon)
            </h2>
            <button
              onClick={() => setShowCreateModal(false)}
              className="mt-4 bg-gray-200 px-4 py-2 rounded"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------- */
/* Small UI Components */
/* ---------------------------------- */

function StatCard({
  title,
  value,
  highlight = 'text-gray-900',
}: {
  title: string;
  value: string | number;
  highlight?: string;
}) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="text-sm text-gray-600 mb-1">{title}</div>
      <div className={`text-3xl font-bold ${highlight}`}>
        {value}
      </div>
    </div>
  );
}

function MetricRow({
  label,
  value,
  highlight = 'text-gray-900',
}: {
  label: string;
  value: string;
  highlight?: string;
}) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-gray-600">{label}</span>
      <span className={`font-bold ${highlight}`}>{value}</span>
    </div>
  );
}