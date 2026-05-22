// src/app/RootLayout.tsx
// =============================================================================
// ROOT LAYOUT — 2026
// =============================================================================
//
// MOBILE DOCK CONTRACT:
//   Only ONE mobile dock system exists: MobileDockShell.
//   It wraps both FloatingCartPill and BottomNav.
//   No other component (MobileNav, etc.) may render a fixed bottom bar.
//
// Layer order:
//   1. CartDisplaySync — invisible sync bridge
//   2. TopBar
//   3. main / Outlet
//   4. Footer (desktop only, lazy)
//   5. MobileDockShell (cart + nav, single scroll-moving wrapper)
//   6. Global overlays (lazy)
//   7. LazyCartDrawer (once only, last)
// =============================================================================

import { lazy, Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { LazyMotion, domAnimation, MotionConfig } from 'framer-motion';

import AppBoot from './AppBoot';
import { ActiveOrderProvider } from '@/app/ActiveOrderContext';

import TopBar from '@/components/layout/TopBar';
import BottomNav from '@/components/layout/BottomNav';
import { BottomDockProvider } from '@/components/layout/useBottomDockState';
import { MobileDockShell } from '@/components/layout/MobileDockShell';
import ScrollSafety from '@/components/app/ScrollSafety';

import CartDisplaySync from '@/modules/cart/components/CartDisplaySync';
import { FloatingCartPill } from '@/modules/cart/components/FloatingCartPill';
import { LazyCartDrawer } from '@/modules/cart/components/LazyCartDrawer';

// DO NOT import MobileNav — it is a deprecated duplicate of BottomNav.
// See MobileNav.tsx for details.

const Footer = lazy(() => import('@/components/layout/Footer'));
const AuthModals = lazy(() => import('@/features/auth/components/AuthModals'));
const SessionExpiryWarning = lazy(() => import('@/components/auth/SessionExpiryWarning'));
const ModalRenderer = lazy(() => import('@/components/ui/ModalRenderer'));

export default function RootLayout() {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">
        <AppBoot>
          <ActiveOrderProvider>
            <BottomDockProvider>
              <div className="flex min-h-dvh flex-col">
                {/* Invisible cart display bridge — restores cart badge after reload */}
                <CartDisplaySync />

                {/* Header */}
                <TopBar />

                {/* Page content */}
                <main
                  id="main-content"
                  className="mobile-fixed-ui-page-pad flex-1 overscroll-contain md:pb-0"
                >
                  <Outlet />

                  {/* Desktop footer only */}
                  <div className="hidden md:block">
                    <Suspense fallback={null}>
                      <Footer />
                    </Suspense>
                  </div>
                </main>

                {/* ── Mobile commerce dock ─────────────────────────────────────
                    Single shell moves cart pill + bottom nav as one unit.
                    No other fixed bottom bar may exist.
                    ──────────────────────────────────────────────────────────── */}
                <MobileDockShell cart={<FloatingCartPill />} nav={<BottomNav />} />

                {/* Global overlays, lazy and non-blocking */}
                <Suspense fallback={null}>
                  <SessionExpiryWarning />
                  <AuthModals />
                  <ModalRenderer />
                </Suspense>

                <ScrollSafety />

                {/* Cart drawer — mounted once only, lazy */}
                <LazyCartDrawer />
              </div>
            </BottomDockProvider>
          </ActiveOrderProvider>
        </AppBoot>
      </MotionConfig>
    </LazyMotion>
  );
}