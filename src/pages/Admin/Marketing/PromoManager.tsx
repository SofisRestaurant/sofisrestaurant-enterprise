// ============================================================================
// src/pages/Admin/Marketing/PromoManager.tsx
// ============================================================================

import { useState, useEffect } from 'react';
import { marketingService } from '@/services/marketing.service';
import type { PromoCode } from '@/types/marketing';

export function PromoManager() {
  const [promos, setPromos] = useState<PromoCode[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPromos();
  }, []);

  const loadPromos = async () => {
    try {
      const data = await marketingService.getPromoCodes();
      setPromos(data);
    } catch (error) {
      console.error('Failed to load promos:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="p-8">Loading promos...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <h1 className="text-4xl font-bold mb-8">Promo Codes</h1>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-6 py-3 text-left">Code</th>
              <th className="px-6 py-3 text-left">Discount</th>
              <th className="px-6 py-3 text-left">Status</th>
              <th className="px-6 py-3 text-left">Expires</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-200">
            {promos.map((promo) => (
              <tr key={promo.id} className="hover:bg-gray-50">
                {/* Code */}
                <td className="px-6 py-4 font-mono font-bold text-amber-600">
                  {promo.code}
                </td>

                {/* Discount */}
                <td className="px-6 py-4">
                  {promo.discount_percent !== null
                    ? `${promo.discount_percent}%`
                    : promo.discount_amount !== null
                    ? `$${(promo.discount_amount / 100).toFixed(2)}`
                    : '—'}
                </td>

                {/* Status */}
                <td className="px-6 py-4">
                  <span
                    className={`px-2 py-1 text-xs rounded-full ${
                      promo.active
                        ? 'bg-green-100 text-green-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {promo.active ? 'Active' : 'Inactive'}
                  </span>
                </td>

                {/* Expiration */}
                <td className="px-6 py-4 text-sm text-gray-500">
                  {promo.ends_at
                    ? new Date(promo.ends_at).toLocaleDateString()
                    : 'No expiration'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}