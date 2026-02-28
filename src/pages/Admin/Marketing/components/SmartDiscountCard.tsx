import { useState } from 'react';

interface SmartDiscountCardProps {
  customerId?: string;
  cartValue?: number;
}

/**
 * Strict API response contract for AI optimizer
 */
interface SmartDiscountRecommendation {
  recommendedDiscount: number; // percent
  reason: string;
  expectedRevenue: number; // cents
  confidence: number; // 0–1
}

export default function SmartDiscountCard({
  customerId,
  cartValue = 0,
}: SmartDiscountCardProps) {
  const [loading, setLoading] = useState(false);
  const [recommendation, setRecommendation] =
    useState<SmartDiscountRecommendation | null>(null);

  const getRecommendation = async () => {
    setLoading(true);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/growth-orchestrator`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            action: 'optimize_discounts',
            data: { customerId, cartValue },
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`);
      }

      const data: unknown = await response.json();

      // Runtime validation guard (production safety)
      if (
        typeof data === 'object' &&
        data !== null &&
        'recommendedDiscount' in data &&
        'reason' in data &&
        'expectedRevenue' in data &&
        'confidence' in data
      ) {
        setRecommendation(data as SmartDiscountRecommendation);
      } else {
        throw new Error('Invalid response format');
      }
    } catch (error) {
      console.error('Failed to get recommendation:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-linear-to-br from-indigo-500 to-purple-600 rounded-lg shadow-lg p-6 text-white">
      <div className="flex items-center gap-3 mb-4">
        <span className="text-3xl">🤖</span>
        <div>
          <h3 className="text-xl font-bold">Smart Discount Engine</h3>
          <p className="text-sm text-indigo-100">AI-powered optimization</p>
        </div>
      </div>

      {!recommendation ? (
        <button
          onClick={getRecommendation}
          disabled={loading}
          className="w-full bg-white/20 hover:bg-white/30 rounded-lg py-3 font-semibold transition-colors disabled:opacity-50"
        >
          {loading ? 'Analyzing...' : 'Get AI Recommendation'}
        </button>
      ) : (
        <div className="space-y-4">
          <div className="bg-white/10 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm">Recommended Discount</span>
              <span className="text-3xl font-bold">
                {recommendation.recommendedDiscount}%
              </span>
            </div>
            <div className="text-xs text-indigo-100">
              {recommendation.reason}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white/10 rounded-lg p-3">
              <div className="text-xs text-indigo-100 mb-1">
                Expected Revenue
              </div>
              <div className="text-lg font-bold">
                ${(recommendation.expectedRevenue / 100).toFixed(2)}
              </div>
            </div>

            <div className="bg-white/10 rounded-lg p-3">
              <div className="text-xs text-indigo-100 mb-1">
                Confidence
              </div>
              <div className="text-lg font-bold">
                {(recommendation.confidence * 100).toFixed(0)}%
              </div>
            </div>
          </div>

          <button
            onClick={() => setRecommendation(null)}
            className="w-full bg-white/20 hover:bg-white/30 rounded-lg py-2 text-sm font-medium transition-colors"
          >
            Get New Recommendation
          </button>
        </div>
      )}

      <div className="mt-6 pt-6 border-t border-white/20">
        <div className="text-xs text-indigo-100">
          💡 Powered by machine learning algorithms that analyze customer behavior,
          order history, and cart value to maximize conversion rates.
        </div>
      </div>
    </div>
  );
}