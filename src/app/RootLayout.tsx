import { Outlet } from 'react-router-dom';
import Header from '@/components/layout/Header';
import AuthModals from '@/features/auth/components/AuthModals';
import Footer from '@/components/layout/Footer';
import SessionExpiryWarning from '@/components/auth/SessionExpiryWarning';
import { ModalRenderer } from '@/components/ui/ModalRenderer';
import AppBoot from './AppBoot';

export default function RootLayout() {
  return (
    <AppBoot>
      <div className="min-h-screen flex flex-col bg-gray-50">
        <Header />

        <main id="main-content" className="flex-1">
          <Outlet />
        </main>

        <Footer />

        <SessionExpiryWarning />
        <AuthModals />
        <ModalRenderer />
      </div>
    </AppBoot>
  );
}
