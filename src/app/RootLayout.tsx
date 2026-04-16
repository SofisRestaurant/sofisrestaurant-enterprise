// src/app/RootLayout.tsx

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
            {/* ROOT LAYER: prevents Chrome flex/dvh bugs */}
            <div className="h-dvh overflow-hidden flex flex-col">
              {/* HEADER (fixed natural flow) */}
              <TopBar />

              {/* SCROLL CONTAINER (ONLY scrollable region) */}
              <main id="main-content" className="flex-1 overflow-y-auto overscroll-contain">
                <Outlet />

                {/* Desktop footer lives inside scroll (correct UX) */}
                <div className="hidden md:block">
                  <Footer />
                </div>
              </main>

              {/* FIXED UI LAYER (DO NOT PARTICIPATE IN FLEX FLOW) */}
              <FloatingCartPill />
              <BottomNav />

              {/* GLOBAL OVERLAYS (portal-safe, independent layer) */}
              <SessionExpiryWarning />
              <AuthModals />
              <ModalRenderer />
              <ScrollSafety />

              {/* CART (portal-based, fully isolated from layout) */}
              <CartDrawer />
            </div>
          </ActiveOrderProvider>
        </AppBoot>
      </MotionConfig>
    </LazyMotion>
  );
}