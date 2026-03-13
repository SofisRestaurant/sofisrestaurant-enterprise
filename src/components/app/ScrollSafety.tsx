// src/components/app/ScrollSafety.tsx
import { useEffect } from 'react';
import { forceUnlockScroll } from '@/lib/ui/scroll-lock';

function hasAnyOpenDialog(): boolean {
  return Boolean(
    document.querySelector('[role="dialog"][aria-modal="true"]') ||
    document.querySelector('[data-modal-root="true"]') ||
    document.querySelector('[data-overlay="true"]'),
  );
}

export default function ScrollSafety() {
  useEffect(() => {
    const tick = () => {
      if (hasAnyOpenDialog()) return;

      const b = document.body;
      const h = document.documentElement;

      // if something left it locked, unlock it safely
      if (b.style.overflow === 'hidden' || h.style.overflow === 'hidden') {
        forceUnlockScroll();
      }
    };

    tick();

    const mo = new MutationObserver(() => tick());
    mo.observe(document.body, { attributes: true, childList: true, subtree: true });

    window.addEventListener('popstate', tick);
    window.addEventListener('hashchange', tick);

    return () => {
      mo.disconnect();
      window.removeEventListener('popstate', tick);
      window.removeEventListener('hashchange', tick);
    };
  }, []);

  return null;
}
