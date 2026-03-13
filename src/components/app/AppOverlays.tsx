import AuthModals from '@/features/auth/components/AuthModals';
import SessionExpiryWarning from '@/components/auth/SessionExpiryWarning';
import ModalRenderer from '@/components/ui/ModalRenderer';
import ScrollSafety from '@/components/app/ScrollSafety';

export default function AppOverlays() {
  return (
    <>
      {/* Security/session UX */}
      <SessionExpiryWarning />

      {/* Auth overlay system */}
      <AuthModals />

      {/* App-wide modal host */}
      <ModalRenderer />

      {/* Safety net — must be last */}
      <ScrollSafety />
    </>
  );
}
