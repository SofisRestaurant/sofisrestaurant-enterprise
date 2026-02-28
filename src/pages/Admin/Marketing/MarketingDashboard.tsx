// src/pages/Admin/Marketing/MarketingDashboard.tsx

import { useEffect, useState } from 'react';
import { marketingService } from '@/services/marketing.service';
import type { Campaign } from '@/types/marketing';

export default function MarketingDashboard() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);

  useEffect(() => {
    marketingService.getCampaigns().then(setCampaigns);
  }, []);

  const totalRevenue = campaigns.reduce(
  (s, c) => s + c.revenue,
  0
);

const totalSpent = campaigns.reduce(
  (s, c) => s + c.spent,
  0
);

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-6">Marketing Command Center</h1>

      <div className="grid grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded shadow">
          <div>Total Revenue</div>
          <div className="text-2xl font-bold">
            ${(totalRevenue / 100).toFixed(2)}
          </div>
        </div>

        <div className="bg-white p-6 rounded shadow">
          <div>Total Spent</div>
          <div className="text-2xl font-bold">
            ${(totalSpent / 100).toFixed(2)}
          </div>
        </div>

        <div className="bg-white p-6 rounded shadow">
          <div>ROI</div>
          <div className="text-2xl font-bold">
            {totalSpent > 0
              ? ((totalRevenue - totalSpent) / totalSpent * 100).toFixed(1)
              : 0}%
          </div>
        </div>
      </div>
    </div>
  );
}