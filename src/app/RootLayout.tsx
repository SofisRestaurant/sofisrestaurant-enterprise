// src/app/RootLayout.tsx
// =============================================================================
// ROOT LAYOUT — 2026
// =============================================================================
// Secure + performance-safe root shell:
//   - Keeps the initial app shell small
//   - Does NOT directly import CartDrawer
//   - Mounts LazyCartDrawer only once
//   - Mounts CartDisplaySync globally so cart badges / FloatingCartPill restore
//     immediately after page reload
//   - Keeps auth/session/modal systems lazy
//   - Avoids duplicate portals and duplicate dialogs
//
// Layer order:
//   1. CartDisplaySync, invisible sync bridge
//   2. TopBar
//   3. main / Outlet
//   4. Footer, lazy on desktop
//   5. FloatingCartPill
//   6. BottomNav
//   7. SessionExpiryWarning, AuthModals, ModalRenderer
//   8. LazyCartDrawer, once only, last
// =============================================================================

import { lazy, Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { LazyMotion, domAnimation, MotionConfig } from 'framer-motion';

import AppBoot from './AppBoot';
import { ActiveOrderProvider } from '@/app/ActiveOrderContext';

import TopBar from '@/components/layout/TopBar';
import BottomNav from '@/components/layout/BottomNav';
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
            <div className="flex min-h-dvh flex-col">
              {/*
                Invisible cart display bridge.

                This must stay mounted at the root level so mobile shell UI
                can restore cart itemCount/subtotalCents after a hard reload
                without waiting for the user to open the cart drawer.
              */}
              <CartDisplaySync />

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