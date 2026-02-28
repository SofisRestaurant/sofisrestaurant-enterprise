// ============================================================================
// src/pages/Admin/Marketing/AbandonedCartAnalytics.tsx
// ============================================================================

import { useState, useEffect } from 'react';
import { marketingService } from '@/services/marketing.service';
import type { AbandonedCart } from '@/types/marketing';

export function AbandonedCartAnalytics() {
  const [carts, setCarts] = useState<AbandonedCart[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCarts();
  }, []);

  const loadCarts = async () => {
    try {
      const data = await marketingService.getAbandonedCarts();
      setCarts(data);
    } catch (error) {
      console.error('Failed to load abandoned carts:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="p-8">Loading abandoned carts...</div>;
  }

 const totalValue = carts.reduce(
  (sum, cart) => sum + cart.cart_value,
  0
);

// If you do NOT track recovery revenue in your type,
// we compute recovered value as cart_value of recovered carts.

const recoveredValue = carts
  .filter((c) => c.recovered)
  .reduce((sum, cart) => sum + cart.cart_value, 0);

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <h1 className="text-4xl font-bold mb-8">
        Abandoned Cart Recovery
      </h1>

      <div className="grid grid-cols-3 gap-6 mb-8">
        <StatCard
          title="Total Abandoned"
          value={carts.length}
          sub={`$${(totalValue / 100).toLocaleString()} lost`}
        />

        <StatCard
          title="Recovered"
          value={carts.filter((c) => c.recovered).length}
          sub={`$${(recoveredValue / 100).toLocaleString()} saved`}
        />

        <StatCard
          title="Recovery Rate"
          value={
            carts.length > 0
              ? `${(
                  (carts.filter((c) => c.recovered).length /
                    carts.length) *
                  100
                ).toFixed(1)}%`
              : '0%'
          }
        />
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  sub,
}: {
  title: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="text-sm text-gray-600 mb-1">{title}</div>
      <div className="text-3xl font-bold">{value}</div>
      {sub && <div className="text-sm text-gray-500 mt-1">{sub}</div>}
    </div>
  );
}