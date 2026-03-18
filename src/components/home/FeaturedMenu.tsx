'use client';

import { useEffect, useState } from 'react';
import { invokeEdge } from '@/lib/supabase/invoke';
import type { MenuItemPublic } from '@/domain/menu/menu.types';

export type MenuItem = MenuItemPublic;

type FeaturedMenuResponse = {
  ok?: boolean;
  featuredItems?: MenuItem[];
};

// NAMED EXPORT
export function FeaturedMenu() {
  const [featuredItems, setFeaturedItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadFeatured() {
      try {
        setLoading(true);
        setError(null);

        const response = await invokeEdge<FeaturedMenuResponse>('get-featured-menu');

        if (!mounted) return;

        if (!response || !Array.isArray(response.featuredItems)) {
          setFeaturedItems([]);
          return;
        }

        setFeaturedItems(response.featuredItems);
      } catch (err: unknown) {
        if (!mounted) return;

        if (err instanceof Error) setError(err.message);
        else setError('Failed to load featured menu.');
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void loadFeatured();
    return () => {
      mounted = false;
    };
  }, []);

  if (loading)
    return <div className="text-center py-10 text-gray-500">Loading featured items...</div>;
  if (error) return <div className="text-center py-10 text-red-500">Error: {error}</div>;
  if (featuredItems.length === 0)
    return <div className="text-center py-10 text-gray-500">No featured items available.</div>;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {featuredItems.map((item) => (
        <div
          key={item.id}
          className="border rounded-xl p-4 shadow hover:shadow-lg transition bg-white"
        >
          {item.image_url && (
            <img
              src={item.image_url}
              alt={item.name}
              className="w-full h-48 object-cover rounded-lg mb-3"
            />
          )}
          <h3 className="text-xl font-semibold">{item.name}</h3>
          {item.description && <p className="text-gray-600 mb-2">{item.description}</p>}
          <p className="text-lg font-bold">
            $
            {typeof item.price === 'number'
              ? item.price.toFixed(2)
              : Number(item.price ?? 0).toFixed(2)}
          </p>
          {item.spicy_level && <p className="text-red-500">🌶 Spicy Level: {item.spicy_level}</p>}
        </div>
      ))}
    </div>
  );
}