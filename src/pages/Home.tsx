// =============================================================================
// src/pages/Home.tsx
// =============================================================================
//
// Sofi's Restaurant — App-style homepage
//
// Purpose:
// - Keep homepage short and fast.
// - Render the smart service choice modal.
// - FeaturedMenu in initial home chunk (LCP image discoverable early).
// - ServiceChoiceModal lazy-loaded (delayed modal, not LCP-critical).
// =============================================================================

import { Suspense, lazy, useEffect } from 'react';

import { FeaturedMenu } from '@/components/home/FeaturedMenu';

const ServiceChoiceModal = lazy(() =>
  import('@/components/home/ServiceChoiceModal').then((mod) => ({
    default: mod.ServiceChoiceModal,
  })),
);

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
      <FeaturedMenu />

      <Suspense fallback={null}>
        <ServiceChoiceModal />
      </Suspense>
    </main>
  );
}
