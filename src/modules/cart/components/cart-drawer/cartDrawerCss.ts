// Injected once for cart drawer open/close transitions (no JS animation libs).

const CART_CSS = `
.cart-backdrop {
  transition: opacity 250ms ease;
}
.cart-backdrop[data-state="closed"] { opacity: 0; pointer-events: none; }
.cart-backdrop[data-state="open"]   { opacity: 1; pointer-events: auto; }

.cart-sheet {
  transition: transform 350ms cubic-bezier(0.32,0.72,0,1);
  will-change: transform;
}
.cart-sheet[data-state="closed"] { transform: translateY(100%); pointer-events: none; }
.cart-sheet[data-state="open"]   { transform: translateY(0);    pointer-events: auto; }

.cart-panel {
  transition: transform 300ms cubic-bezier(0.32,0.72,0,1);
  will-change: transform;
}
.cart-panel[data-state="closed"] { transform: translateX(100%); pointer-events: none; }
.cart-panel[data-state="open"]   { transform: translateX(0);    pointer-events: auto; }

@keyframes cart-shimmer {
  0%   { transform: translateX(0); }
  60%  { transform: translateX(600%); }
  100% { transform: translateX(600%); }
}

@media (prefers-reduced-motion: reduce) {
  .cart-backdrop,
  .cart-sheet,
  .cart-panel {
    transition-duration: 0.01ms !important;
  }
  [data-cart-shimmer] {
    animation: none !important;
  }
}
`;

let cssInjected = false;

export function injectCartDrawerCss(): void {
  if (cssInjected || typeof document === 'undefined') return;

  const existing = document.head.querySelector('style[data-cart-drawer]');
  if (existing) {
    cssInjected = true;
    return;
  }

  const el = document.createElement('style');
  el.setAttribute('data-cart-drawer', '');
  el.textContent = CART_CSS;
  document.head.appendChild(el);
  cssInjected = true;
}
