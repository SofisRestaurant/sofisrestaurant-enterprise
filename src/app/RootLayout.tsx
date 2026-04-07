// src/app/RootLayout.tsx
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

export default function RootLayout() {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">
        <AppBoot>
          {/*
            ActiveOrderProvider calls useActiveOrder() exactly once.
            TopBar and BottomNav read useActiveOrderId() from context —
            zero duplicate Supabase channels.
          */}
          <ActiveOrderProvider>
            <div className="flex min-h-dvh flex-col">
              <TopBar />

              <main id="main-content" className="flex-1">
                <Outlet />
              </main>

              <div className="hidden md:block">
                <Footer />
              </div>

              <BottomNav />

              <SessionExpiryWarning />
              <AuthModals />
              <ModalRenderer />
              <ScrollSafety />
            </div>
          </ActiveOrderProvider>
        </AppBoot>
      </MotionConfig>
    </LazyMotion>
  );
}