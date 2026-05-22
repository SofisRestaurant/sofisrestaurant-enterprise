// path: src/components/home/FeaturedMenu.tsx
'use client';

import { useEffect, useState } from 'react';

import type { MenuItemPublic } from '@/domain/menu/menu.types';
import { pickMenuImageUrlFromRecord } from '@/lib/images/menuImageDelivery';
import { MenuFoodImage } from '@/modules/menu/components/MenuFoodImage';
import { invokePublicEdge } from '@/lib/supabase/invokePublic';

export type MenuItem = MenuItemPublic;

type FeaturedMenuResponse =
  | {
      ok?: boolean;
      featuredItems?: MenuItem[];
      items?: MenuItem[];
      data?: MenuItem[];
    }
  | MenuItem[];

type FeaturedImageVariant = 'hero' | 'circle' | 'mini';

const FEATURED_MENU_CACHE_KEY = 'sofis:featured-menu:v1';

function readCachedFeaturedItems(): MenuItem[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = sessionStorage.getItem(FEATURED_MENU_CACHE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as unknown;
    return readFeaturedItems(parsed as FeaturedMenuResponse).slice(0, 12);
  } catch {
    return [];
  }
}

function writeCachedFeaturedItems(items: MenuItem[]): void {
  if (typeof window === 'undefined' || items.length === 0) return;

  try {
    sessionStorage.setItem(FEATURED_MENU_CACHE_KEY, JSON.stringify(items.slice(0, 12)));
  } catch {
    // Quota/private mode — ignore
  }
}

// ─── Safe readers ─────────────────────────────────────────────────────────────

function safeStr(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
}

function formatPrice(value: unknown): string {
  const price = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(price) && price > 0 ? `$${price.toFixed(2)}` : '';
}

function readSpicyLevel(value: unknown): number {
  const spicy = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(spicy) ? Math.max(0, Math.round(spicy)) : 0;
}

function readName(item: MenuItem): string {
  return safeStr(item.name, 'Featured item');
}

function readDescription(item: MenuItem): string {
  return safeStr(item.description, '');
}

function readFeaturedItems(response: FeaturedMenuResponse | null | undefined): MenuItem[] {
  if (!response) return [];

  if (Array.isArray(response)) return response;
  if (Array.isArray(response.featuredItems)) return response.featuredItems;
  if (Array.isArray(response.items)) return response.items;
  if (Array.isArray(response.data)) return response.data;

  return [];
}

function itemKey(item: MenuItem, index: number): string {
  return safeStr(item.id, `featured-item-${index}`);
}

// ─── Image ────────────────────────────────────────────────────────────────────

function FeaturedImage({
  item,
  index,
  variant,
}: {
  item: MenuItem;
  index: number;
  variant: FeaturedImageVariant;
}) {
  const record = item as unknown as Record<string, unknown>;
  const isPriorityImage = index === 0;

  const wrapperClassByVariant: Record<FeaturedImageVariant, string> = {
    hero: 'relative aspect-[1.25/1] w-full overflow-hidden rounded-[1.75rem] lg:aspect-[1.05/1]',
    circle:
      'relative mx-auto mb-3 flex h-28 w-28 overflow-hidden rounded-full sm:h-32 sm:w-32',
    mini: 'relative h-[76px] w-[106px] shrink-0 overflow-hidden rounded-xl',
  };

  return (
    <div className={wrapperClassByVariant[variant]}>
      <MenuFoodImage
        record={record}
        rawUrl={pickMenuImageUrlFromRecord(record)}
        name={readName(item)}
        itemId={safeStr(item.id, '')}
        variant={variant}
        priority={isPriorityImage}
        enableHoverScale={variant === 'hero' && isPriorityImage}
        className="h-full w-full"
      />
    </div>
  );
}

// ─── Loading / empty / error states ───────────────────────────────────────────

function FeaturedMenuSkeleton() {
  return (
    <section
      aria-label="Featured menu loading"
      className="px-4 py-10 sm:px-6 lg:px-10 lg:py-16"
      style={{ background: 'var(--color-cream-100, #faf6ef)' }}
    >
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 max-w-2xl">
          <div className="h-4 w-36 rounded-full bg-stone-200" />
          <div className="mt-4 h-12 w-80 max-w-full rounded-2xl bg-stone-200" />
          <div className="mt-3 h-4 w-full max-w-xl rounded-full bg-stone-100" />
        </div>

        <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="h-[420px] rounded-[1.75rem] bg-stone-200" />

          <div>
            <div className="grid grid-cols-2 gap-3">
              {[0, 1, 2, 3].map((item) => (
                <div key={item} className="h-44 rounded-[1.25rem] bg-stone-100" />
              ))}
            </div>

            <div className="mt-5 h-72 rounded-[1.5rem] bg-stone-100" />
          </div>
        </div>
      </div>
    </section>
  );
}

function FeaturedMenuMessage({
  title,
  message,
  tone = 'neutral',
}: {
  title: string;
  message: string;
  tone?: 'neutral' | 'error';
}) {
  return (
    <section
      aria-label="Featured menu message"
      className="px-4 py-12 sm:px-6 lg:px-10"
      style={{ background: 'var(--color-cream-100, #faf6ef)' }}
    >
      <div className="mx-auto max-w-xl rounded-[1.5rem] bg-white p-6 text-center shadow-sm ring-1 ring-black/5">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-800">
          Sofi&apos;s Restaurant
        </p>

        <h2 className="mt-2 text-2xl font-black tracking-[-0.035em] text-stone-950">{title}</h2>

        <p
          className={tone === 'error' ? 'mt-2 text-sm text-red-600' : 'mt-2 text-sm text-stone-500'}
        >
          {message}
        </p>

        <a
          href="/menu"
          className="mt-5 inline-flex h-11 items-center justify-center rounded-full bg-stone-950 px-6 text-sm font-black text-white transition hover:bg-stone-800"
        >
          View menu
        </a>
      </div>
    </section>
  );
}

// ─── Strategic sections ───────────────────────────────────────────────────────

function FeaturedHeader() {
  return (
    <div className="mb-8 flex flex-col gap-4 lg:mb-10 lg:flex-row lg:items-end lg:justify-between">
      <div className="max-w-2xl">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-orange-800">
          Sofi&apos;s favorites
        </p>

        <h2 className="mt-2 text-3xl font-black leading-[0.95] tracking-[-0.055em] text-stone-950 sm:text-4xl lg:text-5xl">
          Start with what guests already love.
        </h2>

        <p className="mt-3 max-w-xl text-sm leading-relaxed text-stone-600 sm:text-base">
          A curated look at our most comforting plates, made fresh for the neighborhood.
        </p>
      </div>

      <a
        href="/menu"
        className="hidden h-11 items-center justify-center rounded-full bg-stone-950 px-6 text-sm font-black text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-stone-800 lg:inline-flex"
      >
        View full menu
        <span className="ml-2" aria-hidden="true">
          →
        </span>
      </a>
    </div>
  );
}

function HeroFeature({ item }: { item: MenuItem }) {
  const name = readName(item);
  const description = readDescription(item);
  const price = formatPrice(item.price);
  const spicyLevel = readSpicyLevel(item.spicy_level);

  return (
    <article className="group overflow-hidden rounded-[2rem] bg-white p-3 shadow-[0_18px_60px_rgba(28,25,21,0.10)] ring-1 ring-black/5">
      <FeaturedImage item={item} index={0} variant="hero" />

      <div className="p-3 pt-5 sm:p-5">
        <div className="mb-3 inline-flex items-center rounded-full bg-orange-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-orange-800">
          Guest favorite
        </div>

        <h3 className="text-3xl font-black leading-[0.95] tracking-[-0.055em] text-stone-950 sm:text-4xl">
          {name}
        </h3>

        {description.length > 0 && (
          <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-stone-600 sm:text-base">
            {description}
          </p>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-2">
          {price && (
            <span className="rounded-full bg-stone-950 px-4 py-2 text-sm font-black text-white">
              {price}
            </span>
          )}

          {spicyLevel > 0 && (
            <span className="rounded-full bg-red-50 px-3 py-2 text-xs font-black text-red-600">
              {'🌶'.repeat(Math.min(spicyLevel, 3))} Spicy
            </span>
          )}

          <a
            href="/menu"
            className="inline-flex h-10 items-center justify-center rounded-full bg-orange-600 px-5 text-sm font-black text-white transition hover:bg-orange-700"
          >
            View item
          </a>
        </div>
      </div>
    </article>
  );
}

function TrustNote() {
  return (
    <div className="rounded-[1.5rem] bg-white/70 p-4 text-sm leading-relaxed text-stone-600 ring-1 ring-black/5">
      <strong className="font-black text-stone-950">Local, fresh, and family-run.</strong> These are
      the plates we’d recommend first if you walked in and asked what to try.
    </div>
  );
}

function BestSellerGrid({ items }: { items: MenuItem[] }) {
  const favorites = items.slice(0, 4);

  if (favorites.length === 0) return null;

  return (
    <section aria-label="Best sellers">
      <div className="mb-3 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-800">
            Best sellers
          </p>
          <h2 className="mt-1 text-2xl font-black tracking-[-0.045em] text-stone-950">
            Easy first picks
          </h2>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {favorites.map((item, index) => {
          const name = readName(item);
          const price = formatPrice(item.price);

          return (
            <a
              key={itemKey(item, index)}
              href="/menu"
              aria-label={name}
              className="group rounded-[1.25rem] bg-white px-3 pb-4 pt-3 text-center shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-md active:scale-[0.99]"
            >
              <FeaturedImage item={item} index={index + 1} variant="circle" />

              <h3 className="mx-auto max-w-[12rem] text-sm font-black leading-tight text-stone-950">
                {name}
              </h3>

              {price && <p className="mt-1 text-xs font-bold text-orange-800">{price}</p>}
            </a>
          );
        })}
      </div>
    </section>
  );
}

function SoftFeaturedList({ items }: { items: MenuItem[] }) {
  const list = items.slice(4, 10);

  if (list.length === 0) return null;

  return (
    <section
      aria-label="More customer favorites"
      className="overflow-hidden rounded-[1.5rem] bg-white shadow-sm ring-1 ring-black/5"
    >
      <div className="border-b border-stone-200 px-4 py-3">
        <h2 className="text-sm font-black text-stone-950">More favorites</h2>
        <p className="mt-0.5 text-xs text-stone-500">
          Simple choices when you already know you want something good.
        </p>
      </div>

      {list.map((item, index) => {
        const name = readName(item);
        const description = readDescription(item);
        const price = formatPrice(item.price);
        const isLast = index === list.length - 1;

        return (
          <a
            key={itemKey(item, index)}
            href="/menu"
            aria-label={name}
            className={[
              'flex min-h-[102px] items-center gap-4 px-4 py-3 transition hover:bg-stone-50 active:bg-stone-50',
              !isLast ? 'border-b border-stone-200' : '',
            ].join(' ')}
          >
            <FeaturedImage item={item} index={index + 5} variant="mini" />

            <div className="min-w-0 flex-1">
              <h3 className="line-clamp-2 text-[0.95rem] font-black leading-tight text-stone-950">
                {name}
              </h3>

              {description.length > 0 && (
                <p className="mt-1 line-clamp-1 text-xs leading-relaxed text-stone-500">
                  {description}
                </p>
              )}

              {price && <p className="mt-1 text-xs font-black text-orange-800">{price}</p>}
            </div>

            <span className="text-lg font-black text-stone-300" aria-hidden="true">
              ›
            </span>
          </a>
        );
      })}
    </section>
  );
}

function FinalSoftCTA() {
  return (
    <div className="rounded-[1.5rem] bg-[#ede0ce] p-5 text-center ring-1 ring-black/5">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-800">
        Still deciding?
      </p>

      <h2 className="mt-2 text-2xl font-black tracking-[-0.045em] text-stone-950">
        Browse the full menu when you&apos;re ready.
      </h2>

      <a
        href="/menu"
        className="mt-5 inline-flex min-h-12 items-center justify-center rounded-full bg-stone-950 px-7 text-sm font-black text-white shadow-sm transition hover:bg-stone-800 active:scale-[0.98]"
      >
        Open full menu
      </a>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function FeaturedMenu() {
  const [featuredItems, setFeaturedItems] = useState<MenuItem[]>(() => readCachedFeaturedItems());
  const [loading, setLoading] = useState(() => featuredItems.length === 0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const hadCache = featuredItems.length > 0;

    async function loadFeatured() {
      try {
        if (!hadCache) {
          setLoading(true);
        }
        setError(null);

        const response = await invokePublicEdge<FeaturedMenuResponse>('get-featured-menu');

        if (!mounted) return;

        const items = readFeaturedItems(response).slice(0, 12);
        setFeaturedItems(items);
        writeCachedFeaturedItems(items);
      } catch (err: unknown) {
        if (!mounted) return;

        if (!hadCache) {
          setFeaturedItems([]);
          setError(err instanceof Error ? err.message : 'Failed to load featured menu.');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void loadFeatured();

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cache seed only on mount
  }, []);

  if (loading) {
    return <FeaturedMenuSkeleton />;
  }

  if (error) {
    return (
      <FeaturedMenuMessage tone="error" title="Featured items are loading slowly" message={error} />
    );
  }

  if (featuredItems.length === 0) {
    return (
      <FeaturedMenuMessage
        title="Fresh favorites are coming soon"
        message="Our featured plates are being updated. You can still explore the full menu."
      />
    );
  }

  const heroItem = featuredItems[0];

  return (
    <section
      aria-label="Featured menu"
      className="relative overflow-hidden px-4 pb-12 pt-8 sm:px-6 lg:px-10 lg:py-16"
      style={{ background: 'var(--color-cream-100, #faf6ef)' }}
    >
      <div
        className="pointer-events-none absolute left-1/2 top-0 h-72 w-72 -translate-x-1/2 rounded-full bg-orange-300/20 blur-3xl"
        aria-hidden="true"
      />

      <div className="relative mx-auto max-w-7xl">
        <FeaturedHeader />

        <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
          <div className="space-y-5 lg:sticky lg:top-24">
            <HeroFeature item={heroItem} />
            <TrustNote />
          </div>

          <div className="space-y-6">
            <BestSellerGrid items={featuredItems} />
            <SoftFeaturedList items={featuredItems} />
            <FinalSoftCTA />
          </div>
        </div>
      </div>
    </section>
  );
}

export default FeaturedMenu;
