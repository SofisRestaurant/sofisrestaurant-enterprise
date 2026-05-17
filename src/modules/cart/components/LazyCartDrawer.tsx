// src/modules/cart/components/LazyCartDrawer.tsx
// =============================================================================
// LAZY CART DRAWER
// =============================================================================
// Performance contract:
//   - CartDrawer is NOT in the initial route render.
//   - CartDrawer JS is only requested when the drawer opens.
//   - When closed, the heavy drawer tree unmounts.
//   - cartUi.store remains the single source of truth.
// =============================================================================

import { lazy, Suspense } from 'react';
import { useCartUiStore } from '@/modules/cart/store/cartUi.store';

const CartDrawer = lazy(() =>
  import('@/modules/cart/components/CartDrawer').then((mod) => ({
    default: mod.CartDrawer,
  })),
);

export function LazyCartDrawer() {
  const isOpen = useCartUiStore((s) => s.isOpen);

  if (!isOpen) return null;

  return (
    <Suspense fallback={null}>
      <CartDrawer />
    </Suspense>
  );
}

export default LazyCartDrawer;
