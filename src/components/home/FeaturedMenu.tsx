'use client';

import { useEffect, useState } from 'react';

import type { MenuItemPublic } from '@/domain/menu/menu.types';
import { supabaseImageSrcSet, supabaseImageUrl } from '@/lib/images/supabaseImage';
import { invokeEdge } from '@/lib/supabase/invoke';

export type MenuItem = MenuItemPublic;

type FeaturedMenuResponse = {
  ok?: boolean;
  featuredItems?: MenuItem[];
};

function formatPrice(value: unknown): string {
  const price = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(price) ? `$${price.toFixed(2)}` : '$0.00';
}

function readSpicyLevel(value: unknown): number {
  const spicy = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(spicy) ? Math.max(0, Math.round(spicy)) : 0;
}

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

        setError(err instanceof Error ? err.message : 'Failed to load featured menu.');
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void loadFeatured();

    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return (
      <section
        aria-label="Featured menu"
        className="px-5 py-10 text-center text-sm text-gray-500 sm:px-8 md:px-12"
      >
        Loading featured items...
      </section>
    );
  }

  if (error) {
    return (
      <section
        aria-label="Featured menu error"
        className="px-5 py-10 text-center text-sm text-red-500 sm:px-8 md:px-12"
      >
        Error: {error}
      </section>
    );
  }

  if (featuredItems.length === 0) {
    return (
      <section
        aria-label="Featured menu"
        className="px-5 py-10 text-center text-sm text-gray-500 sm:px-8 md:px-12"
      >
        No featured items available.
      </section>
    );
  }

  return (
    <section
      aria-label="Featured menu"
      className="px-5 py-10 sm:px-8 md:px-12"
      style={{ background: 'var(--color-cream-100, #faf6ef)' }}
    >
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {featuredItems.map((item, index) => {
          const imageUrl = item.image_url;
          const spicyLevel = readSpicyLevel(item.spicy_level);
          const isPriorityImage = index === 0;

          return (
            <article
              key={item.id}
              className="rounded-xl border bg-white p-4 shadow transition hover:shadow-lg"
            >
              {imageUrl && (
                <img
                  src={supabaseImageUrl(
                    imageUrl,
                    isPriorityImage ? 800 : 480,
                    isPriorityImage ? 76 : 72,
                  )}
                  srcSet={supabaseImageSrcSet(imageUrl)}
                  sizes="(max-width: 640px) 92vw, (max-width: 1024px) 45vw, 360px"
                  alt={item.name}
                  width={756}
                  height={567}
                  loading={isPriorityImage ? 'eager' : 'lazy'}
                  fetchPriority={isPriorityImage ? 'high' : 'auto'}
                  decoding="async"
                  className="mb-3 h-48 w-full rounded-lg object-cover"
                />
              )}

              <h3 className="text-xl font-semibold">{item.name}</h3>

              {item.description && <p className="mb-2 text-gray-600">{item.description}</p>}

              <p className="text-lg font-bold">{formatPrice(item.price)}</p>

              {spicyLevel > 0 && <p className="text-red-500">🌶 Spicy Level: {spicyLevel}</p>}
            </article>
          );
        })}
      </div>
    </section>
  );
}

export default FeaturedMenu;