// src/app/RootLayout.tsx
// =============================================================================
// ROOT LAYOUT — 2026 App Shell
// =============================================================================
// Changed from old layout:
//   - Header        → TopBar     (minimal, app-style)
//   - (new)         → BottomNav  (mobile primary navigation)
//   - pb-safe-area  → native iOS home bar clearance
//
// The main content area fills available vertical space between
// TopBar and the bottom nav spacer (which BottomNav itself renders).
// =============================================================================

import { Outlet } from 'react-router-dom';
import { LazyMotion, domAnimation, MotionConfig } from 'framer-motion';

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
    // LazyMotion loads only the animation features we actually use (domAnimation),
    // keeping the bundle smaller than importing the full motion package.
    //
    // MotionConfig applies settings to every Framer Motion component in the tree:
    //   reducedMotion="user" — respects the OS prefers-reduced-motion setting.
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">
        <AppBoot>
          <div className="flex min-h-dvh flex-col">
            {/* Slim app-style top bar — replaces old Header */}
            <TopBar />

            {/*
              Page content.
              flex-1 fills the vertical space between TopBar and
              the bottom of the viewport. BottomNav renders its own
              spacer div to prevent content from hiding behind the bar.
            */}
            <main id="main-content" className="flex-1">
              <Outlet />
            </main>

            {/*
              Footer — hidden on mobile (bottom nav takes that space).
              Visible on md+ where bottom nav is hidden.
            */}
            <div className="hidden md:block">
              <Footer />
            </div>

            {/* Mobile bottom navigation — hidden on md+ */}
            <BottomNav />

            {/* Global UI systems — unchanged */}
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
