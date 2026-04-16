// src/app/RootLayout.tsx
// =============================================================================
// ROOT LAYOUT — 2026
// =============================================================================
// Layer order (bottom → top):
//   1. TopBar               — sticky, natural flex flow
//   2. main                 — only scrollable region
//   3. Footer               — inside scroll on desktop
//   4. FloatingCartPill     — position:fixed, mobile only
//   5. BottomNav            — position:fixed, mobile only
//   6. SessionExpiryWarning, AuthModals, ModalRenderer, ScrollSafety
//   7. CartDrawer           — portal z-9999, LAST so it's above everything
//
// Why min-h-dvh instead of h-dvh overflow-hidden:
//   h-dvh + overflow-hidden clips box-shadows from fixed children and
//   breaks position:fixed inside overflow:hidden on iOS Safari.
//   min-h-dvh fills the viewport without either of those side effects.
// =============================================================================

import { Outlet } from 'react-router-dom';
import { LazyMotion, domAnimation, MotionConfig } from 'framer-motion';

import { ActiveOrderProvider } from '@/app/ActiveOrderContext';

import TopBar from '@/components/layout/TopBar';
import BottomNav from '@/components/layout/BottomNav';
import Footer from '@/components/layout/Footer';

import AuthModals from '@/features/auth/components/AuthModals';
import SessionExpiryWarning from '@/components/auth/SessionExpiryWarning';
import ModalRenderer from '@/components/ui/ModalRenderer';

import AppBoot from './AppBoot';
import ScrollSafety from '@/components/app/ScrollSafety';

import { CartDrawer } from '@/modules/cart/components/CartDrawer';
import { FloatingCartPill } from '@/modules/cart/components/FloatingCartPill';

export default function RootLayout() {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">
        <AppBoot>
          <ActiveOrderProvider>
            {/*
              min-h-dvh: fills the full dynamic viewport height without
              clipping fixed children or breaking iOS Safari fixed positioning.
              No overflow-hidden here — that would trap the cart sheet inside
              an overflow context and clip its box-shadow on mobile.
            */}
            <div className="flex min-h-dvh flex-col">
              {/* ── 1. Header ─────────────────────────────────────────── */}
              <TopBar />

              {/* ── 2. Page content (only scrollable region) ──────────── */}
              <main id="main-content" className="flex-1 overscroll-contain">
                <Outlet />

                {/* Desktop footer lives inside the scroll (standard UX) */}
                <div className="hidden md:block">
                  <Footer />
                </div>
              </main>

              {/*
                ── 3. Fixed UI ──────────────────────────────────────────
                These are position:fixed so they don't affect the flex
                column height. Their internal spacer divs add bottom
                padding to the page content on mobile.
              */}
              <FloatingCartPill />
              <BottomNav />

              {/*
                ── 4. Global overlays ───────────────────────────────────
                Portal-based. Rendered in ascending priority order so
                later portals naturally stack above earlier ones.
              */}
              <SessionExpiryWarning />
              <AuthModals />
              <ModalRenderer />
              <ScrollSafety />

              {/*
                ── 5. Cart — must be the last child ─────────────────────
                CartDrawer calls createPortal → document.body at z-9999.
                Being the last sibling means its portal is the last node
                appended to <body>, placing it above all other portals in
                both DOM order and stacking context — including AuthModals
                and ModalRenderer.
              */}
              <CartDrawer />
            </div>
          </ActiveOrderProvider>
        </AppBoot>
      </MotionConfig>
    </LazyMotion>
  );
}