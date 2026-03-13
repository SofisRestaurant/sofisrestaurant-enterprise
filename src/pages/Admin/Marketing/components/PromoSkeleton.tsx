import type { ReactElement } from 'react';

export function PromoSkeleton(): ReactElement {
  const rows = [
    'promo-skel-1',
    'promo-skel-2',
    'promo-skel-3',
    'promo-skel-4',
    'promo-skel-5',
    'promo-skel-6',
  ];

  return (
    <div
      className="divide-y divide-zinc-800/50 px-4 py-2"
      role="status"
      aria-label="Loading promo codes"
      aria-busy="true"
    >
      {rows.map((rowKey) => (
        <div key={rowKey} className="flex items-center gap-4 py-4">
          <div className="h-4 w-32 animate-pulse rounded bg-zinc-800" />
          <div className="h-5 w-14 animate-pulse rounded-full bg-zinc-800" />
          <div className="hidden h-4 w-12 animate-pulse rounded bg-zinc-800 md:block" />
          <div className="hidden h-4 w-10 animate-pulse rounded bg-zinc-800 lg:block" />
          <div className="ml-auto h-4 w-20 animate-pulse rounded bg-zinc-800" />
          <div className="h-8 w-20 animate-pulse rounded-lg bg-zinc-800" />
        </div>
      ))}
    </div>
  );
}