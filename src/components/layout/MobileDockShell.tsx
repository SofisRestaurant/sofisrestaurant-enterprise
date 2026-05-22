// src/components/layout/MobileDockShell.tsx
// =============================================================================
// Single fixed container for FloatingCartPill + BottomNav.
//
// MOVEMENT CONTRACT:
//   The ONLY scroll-driven transform lives in utilities.css on .mobile-dock-shell:
//     transform: translate3d(0, var(--mobile-dock-translate-y), 0)
//   bottomDockState.tsx sets --mobile-dock-translate-y on :root.
//   This component does NOT set any inline transform or Tailwind translate.
//
//   Cart slot show/hide is handled by utilities.css via [data-cart-visible].
//   This component only sets the data attribute — no Tailwind opacity/translate.
// =============================================================================

import type { ReactNode } from 'react';

import { useBottomDock } from '@/components/layout/useBottomDockState';

type Props = {
  cart: ReactNode;
  nav: ReactNode;
};

export function MobileDockShell({ cart, nav }: Props) {
  const { dockPhase, shouldShowFloatingCart, isDockInteractive } = useBottomDock();

  if (dockPhase === 'hidden') return null;

  const cartVisible = shouldShowFloatingCart;

  return (
    <div
      data-mobile-dock="true"
      data-dock-phase={dockPhase}
      className={[
        'mobile-dock-shell',
        'pointer-events-none fixed inset-x-0 bottom-0 z-[var(--z-mobile-dock)]',
        'flex transform-gpu flex-col justify-end md:hidden',
        // Transition is defined in utilities.css on .mobile-dock-shell.
        // Do NOT add motion-safe:transition-transform here.
      ].join(' ')}
      aria-hidden={false}
    >
      {/* Cart pill slot — show/hide animated by utilities.css [data-cart-visible] */}
      <div
        className={[
          'mobile-dock-cart-slot px-3 min-[390px]:px-4',
          cartVisible ? 'pointer-events-auto' : 'pointer-events-none',
        ].join(' ')}
        data-cart-visible={cartVisible ? 'true' : 'false'}
        aria-hidden={cartVisible ? undefined : true}
      >
        <div className="pb-[var(--mobile-cart-pill-gap)]">{cart}</div>
      </div>

      {/* Nav slot */}
      <div
        className={[
          'mobile-dock-nav-slot w-full',
          isDockInteractive ? 'pointer-events-auto' : 'pointer-events-none',
        ].join(' ')}
        data-dock-interactive={isDockInteractive ? 'true' : 'false'}
      >
        {nav}
      </div>
    </div>
  );
}
