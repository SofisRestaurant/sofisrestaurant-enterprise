// MobileDockShell — single fixed movement container for cart pill + bottom nav.

import type { CSSProperties, ReactNode } from 'react';

import { useBottomDock } from '@/components/layout/useBottomDockState';

type Props = {
  cart: ReactNode;
  nav: ReactNode;
};

export function MobileDockShell({ cart, nav }: Props) {
  const { dockPhase, shouldShowFloatingCart, isDockInteractive } = useBottomDock();

  if (dockPhase === 'hidden') return null;

  const isCollapsed = dockPhase === 'collapsed';

  const shellStyle = {
    transform: isCollapsed
      ? 'translate3d(0, var(--mobile-bottom-dock-collapse-y), 0)'
      : 'translate3d(0, 0, 0)',
  } satisfies CSSProperties;

  return (
    <div
      data-mobile-dock="true"
      data-dock-phase={dockPhase}
      data-dock-collapsed={isCollapsed ? 'true' : 'false'}
      className={[
        'mobile-dock-shell pointer-events-none fixed inset-x-0 bottom-0 z-[var(--z-mobile-dock)] flex transform-gpu flex-col justify-end md:hidden',
        'will-change-transform motion-safe:transition-transform motion-safe:duration-500 motion-safe:ease-[cubic-bezier(0.16,1,0.3,1)]',
      ].join(' ')}
      style={shellStyle}
      aria-hidden={false}
    >
      <div
        className={[
          'mobile-dock-cart-slot pointer-events-none px-3 min-[390px]:px-4',
          'motion-safe:transition-[opacity,transform] motion-safe:duration-300 motion-safe:ease-[cubic-bezier(0.16,1,0.3,1)]',
          shouldShowFloatingCart ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0',
        ].join(' ')}
        data-cart-visible={shouldShowFloatingCart ? 'true' : 'false'}
        aria-hidden={shouldShowFloatingCart ? undefined : true}
      >
        <div
          className={[
            'pb-[var(--mobile-cart-pill-gap)]',
            shouldShowFloatingCart ? 'pointer-events-auto' : 'pointer-events-none',
          ].join(' ')}
        >
          {cart}
        </div>
      </div>

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