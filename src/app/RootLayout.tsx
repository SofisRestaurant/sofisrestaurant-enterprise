// src/app/RootLayout.tsx
// =============================================================================
// ROOT LAYOUT — 2026
// =============================================================================
//
// MOBILE DOCK CONTRACT:
//   Only ONE mobile dock exists: MobileDockShell.
//   It wraps FloatingCartPill + BottomNav as a single scroll-moving unit.
//   No other component may render a fixed bottom bar.
//   DO NOT import MobileNav — it is a deprecated duplicate.
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
                {/* Invisible cart display bridge */}
                <CartDisplaySync />

                {/* Header */}
                <TopBar />

                {/* Page content */}
                <main
                  id="main-content"
                  className="mobile-fixed-ui-page-pad flex-1 overscroll-contain md:pb-0"
                >
                  <Outlet />

                  <div className="hidden md:block">
                    <Suspense fallback={null}>
                      <Footer />
                    </Suspense>
                  </div>
                </main>

                {/* Single mobile dock — only scroll-moving element */}
                <MobileDockShell cart={<FloatingCartPill />} nav={<BottomNav />} />

                {/* Global overlays */}
                <Suspense fallback={null}>
                  <SessionExpiryWarning />
                  <AuthModals />
                  <ModalRenderer />
                </Suspense>

                <ScrollSafety />
                <LazyCartDrawer />
              </div>
            </BottomDockProvider>
          </ActiveOrderProvider>
        </AppBoot>
      </MotionConfig>
    </LazyMotion>
  );
}