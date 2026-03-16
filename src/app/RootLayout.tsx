import { Outlet } from 'react-router-dom';
import { LazyMotion, domAnimation, MotionConfig } from 'framer-motion';
import Header from '@/components/layout/Header';
import AuthModals from '@/features/auth/components/AuthModals';
import Footer from '@/components/layout/Footer';
import SessionExpiryWarning from '@/components/auth/SessionExpiryWarning';
import ModalRenderer from '@/components/ui/ModalRenderer';
import AppBoot from './AppBoot';
import ScrollSafety from '@/components/app/ScrollSafety';

export default function RootLayout() {
  return (
    // LazyMotion loads only the animation features we actually use (domAnimation),
    // keeping the bundle smaller than importing the full motion package.
    //
    // This is REQUIRED when using `m` components (import { m } from 'framer-motion').
    // Without it, m.div / m.section etc. render as plain elements with no animation.
    //
    // MotionConfig applies settings to every Framer Motion component in the tree:
    //   reducedMotion="user" — respects the OS prefers-reduced-motion setting.
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">
        <AppBoot>
          <div className="min-h-screen flex flex-col">
            <Header />

            <main id="main-content" className="flex-1">
              <Outlet />
            </main>

            <Footer />

            {/* Global UI systems */}
            <SessionExpiryWarning />
            <AuthModals />
            <ModalRenderer />
            <ScrollSafety />
          </div>
        </AppBoot>
      </MotionConfig>
    </LazyMotion>
  );
}