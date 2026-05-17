import { lazy, Suspense, useEffect, useState } from 'react';
import { useCartUiStore } from '@/modules/cart/store/cartUi.store';

const CartDrawer = lazy(() =>
  import('@/modules/cart/components/CartDrawer').then((mod) => ({
    default: mod.CartDrawer,
  })),
);

export function LazyCartDrawer() {
  const isOpen = useCartUiStore((s) => s.isOpen);
  const [shouldMount, setShouldMount] = useState(false);

  useEffect(() => {
    if (isOpen) setShouldMount(true);
  }, [isOpen]);

  if (!shouldMount) return null;

  return (
    <Suspense fallback={null}>
      <CartDrawer />
    </Suspense>
  );
}