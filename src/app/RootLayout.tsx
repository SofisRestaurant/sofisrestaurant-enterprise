// src/app/RootLayout.tsx
// =============================================================================
// ROOT LAYOUT — 2026
// =============================================================================
// Secure + performance-safe root shell:
//   - Keeps the initial app shell small
//   - Does NOT directly import CartDrawer
//   - Mounts LazyCartDrawer only once
//   - Keeps auth/session/modal systems lazy
//   - Avoids duplicate portals and duplicate dialogs
//
// Layer order:
//   1. TopBar
//   2. main / Outlet
//   3. Footer, lazy on desktop
//   4. FloatingCartPill
//   5. BottomNav
//   6. SessionExpiryWarning, AuthModals, ModalRenderer
//   7. LazyCartDrawer, once only, last
// =============================================================================

import { lazy, Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { LazyMotion, domAnimation, MotionConfig } from 'framer-motion';

import AppBoot from './AppBoot';
import { ActiveOrderProvider } from '@/app/ActiveOrderContext';

import TopBar from '@/components/layout/TopBar';
import BottomNav from '@/components/layout/BottomNav';
import ScrollSafety from '@/components/app/ScrollSafety';

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
            <div className="flex min-h-dvh flex-col">
              {/* Header */}
              <TopBar />

              {/* Page content */}
              <main id="main-content" className="flex-1 overscroll-contain">
                <Outlet />

                {/* Desktop footer only. Do not mount cart here. */}
                <div className="hidden md:block">
                  <Suspense fallback={null}>
                    <Footer />
                  </Suspense>
                </div>
              </main>

              {/* Fixed mobile UI */}
              <FloatingCartPill />
              <BottomNav />

              {/* Global overlays, lazy and non-blocking */}
              <Suspense fallback={null}>
                <SessionExpiryWarning />
                <AuthModals />
                <ModalRenderer />
              </Suspense>

              <ScrollSafety />

              {/*
                Cart drawer must be mounted once only.
                LazyCartDrawer should lazy-load the heavy drawer code and ideally
                only render the real drawer when the cart is opened.
              */}
              <LazyCartDrawer />
            </div>
          </ActiveOrderProvider>
        </AppBoot>
      </MotionConfig>
    </LazyMotion>
  );
}