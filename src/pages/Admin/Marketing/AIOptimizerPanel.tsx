// ============================================================================
// src/pages/Admin/Marketing/AIOptimizerPanel.tsx
// ============================================================================

import { useState, useEffect } from 'react';
import { marketingService } from '@/services/marketing.service';
import type { AIOptimizerRule } from '@/types/marketing';

export function AIOptimizerPanel() {
  const [rules, setRules] = useState<AIOptimizerRule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRules();
  }, []);

  const loadRules = async () => {
    try {
      const data = await marketingService.getOptimizerRules();
      setRules(data);
    } catch (error) {
      console.error('Failed to load optimizer rules:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="p-8">Loading optimizer...</div>;
  }

  const activeCount = rules.filter((r) => r.active).length;

  return (
    <div className="min-h-screen bg-linear-to-br from-purple-50 to-indigo-50 p-8">
      <h1 className="text-4xl font-bold mb-8">
        🤖 AI Discount Optimizer
      </h1>

      <div className="grid grid-cols-3 gap-6 mb-8">
        <StatCard
          title="Total Rules"
          value={rules.length}
        />

        <StatCard
          title="Active Rules"
          value={activeCount}
        />

        <StatCard
          title="Avg Confidence"
          value={
            rules.length > 0
              ? (
                  rules.reduce((sum, r) => sum + r.confidence_score, 0) /
                  rules.length
                ).toFixed(2)
              : '0'
          }
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {rules.map((rule) => (
          <div
            key={rule.id}
            className="bg-white rounded-lg shadow p-6"
          >
            <div className="flex justify-between items-center mb-4">
              <div className="font-bold text-lg">{rule.name}</div>
              <span
                className={`px-3 py-1 rounded-full text-sm ${
                  rule.active
                    ? 'bg-green-100 text-green-800'
                    : 'bg-gray-100 text-gray-800'
                }`}
              >
                {rule.active ? 'Active' : 'Inactive'}
              </span>
            </div>

            <div className="text-sm text-gray-600">
              Min Cart Value: ${rule.min_cart_value}
            </div>

            <div className="text-sm text-gray-600">
              Suggested Discount: {rule.suggested_discount_percent}%
            </div>

            <div className="text-sm text-gray-600">
              Confidence Score: {rule.confidence_score}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
}: {
  title: string;
  value: string | number;
}) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="text-sm text-gray-600 mb-1">{title}</div>
      <div className="text-3xl font-bold">{value}</div>
    </div>
  );
}