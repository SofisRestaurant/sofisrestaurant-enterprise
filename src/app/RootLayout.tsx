// src/app/RootLayout.tsx
// CartDrawer and FloatingCartPill added here — single render, no duplication.
import { Outlet } from 'react-router-dom';
import { LazyMotion, domAnimation, MotionConfig } from 'framer-motion';
import { ActiveOrderProvider } from '@/app/ActiveOrderContext';
import TopBar from '@/components/layout/TopBar';
import BottomNav from '@/components/layout/BottomNav';
import AuthModals from '@/features/auth/components/AuthModals';
import Footer from '@/components/layout/Footer';
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
            <div className="flex min-h-dvh flex-col">
              <TopBar />

              <main id="main-content" className="flex-1">
                <Outlet />
              </main>

              <div className="hidden md:block">
                <Footer />
              </div>

              {/* FloatingCartPill sits above BottomNav on mobile */}
              <FloatingCartPill />
              <BottomNav />

              <SessionExpiryWarning />
              <AuthModals />
              <ModalRenderer />
              <ScrollSafety />

              {/* Single CartDrawer instance — reads cartUi.store */}
              <CartDrawer />
            </div>
          </ActiveOrderProvider>
        </AppBoot>
      </MotionConfig>
    </LazyMotion>
  );
}