// =============================================================================
// src/pages/Home.tsx
// =============================================================================
//
// Sofi's Restaurant — App-style homepage
//
// Purpose:
// - Keep homepage short and fast.
// - Render the smart service choice modal.
// - Lazy-load FeaturedMenu.
// - No heavy homepage sections.
// =============================================================================

import { Suspense, lazy, useEffect } from 'react';

import { ServiceChoiceModal } from '@/components/home/ServiceChoiceModal';

const FeaturedMenu = lazy(() =>
  import('@/components/home/FeaturedMenu').then((mod) => ({ default: mod.FeaturedMenu })),
);

function FeaturedMenuFallback() {
  return (
    <section
      aria-label="Featured menu loading"
      className="px-4 pb-12 pt-8 sm:px-6 lg:px-10 lg:py-16"
      style={{ background: 'var(--color-cream-100, #faf6ef)' }}
    >
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 max-w-2xl">
          <div className="h-4 w-36 rounded-full bg-stone-200" aria-hidden="true" />
          <div className="mt-4 h-12 w-80 max-w-full rounded-2xl bg-stone-200" aria-hidden="true" />
          <div className="mt-3 h-4 w-full max-w-xl rounded-full bg-stone-100" aria-hidden="true" />
        </div>

        <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <div>
            <div className="h-[420px] rounded-[1.75rem] bg-stone-200" aria-hidden="true" />
            <div className="mt-5 h-28 rounded-[1.5rem] bg-stone-100" aria-hidden="true" />
          </div>

          <div>
            <div className="mb-4 h-7 w-64 rounded-full bg-stone-200" aria-hidden="true" />

            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              {[0, 1, 2, 3].map((item) => (
                <div
                  key={item}
                  className="rounded-[1.25rem] bg-white px-3 pb-4 pt-3 shadow-sm ring-1 ring-black/5"
                  aria-hidden="true"
                >
                  <div className="mx-auto mb-3 h-28 w-28 rounded-full bg-stone-100" />
                  <div className="mx-auto h-4 w-24 rounded-full bg-stone-200" />
                  <div className="mx-auto mt-2 h-3 w-14 rounded-full bg-stone-100" />
                </div>
              ))}
            </div>

            <div className="mt-6 overflow-hidden rounded-[1.5rem] bg-white shadow-sm ring-1 ring-black/5">
              {[0, 1, 2, 3].map((item) => (
                <div
                  key={item}
                  className="flex min-h-[102px] items-center gap-4 border-b border-stone-200 px-4 py-3 last:border-b-0"
                  aria-hidden="true"
                >
                  <div className="h-[76px] w-[106px] shrink-0 rounded-xl bg-stone-100" />
                  <div className="min-w-0 flex-1">
                    <div className="h-4 w-40 max-w-full rounded-full bg-stone-200" />
                    <div className="mt-2 h-3 w-56 max-w-full rounded-full bg-stone-100" />
                    <div className="mt-2 h-3 w-14 rounded-full bg-stone-100" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function HomePage() {
  useEffect(() => {
    document.title = "Sofi's Restaurant — Fresh Mexican-American Food in Surprise, AZ";
  }, []);

  return (
    <main
      className="min-h-screen"
      style={{
        background: 'var(--color-cream-100, #faf6ef)',
        color: 'var(--color-ink-900, #1c1c1c)',
      }}
    >
      <ServiceChoiceModal />

      <Suspense fallback={<FeaturedMenuFallback />}>
        <FeaturedMenu />
      </Suspense>
    </main>
  );
}
