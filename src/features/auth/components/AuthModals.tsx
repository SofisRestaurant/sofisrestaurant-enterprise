import { memo } from 'react';
import { useModal } from '@/components/ui/useModal';
import { LoginModal } from './LoginModal';
import { SignupModal } from './SignupModal';
import ForgotPasswordModal from './ForgotPasswordModal';

/**
 * Available auth modal types
 */
export type AuthModalKey = 'login' | 'signup' | 'forgot-password';

/**
 * AuthModals - Centralized auth modal coordinator
 * 
 * Features:
 * - Memoized for performance
 * - Single source of truth for auth modals
 * - Integrates with global modal state
 * - Lazy renders only active modal
 * 
 * Usage:
 * - Place once in app root (RootLayout.tsx)
 * - Control via useModal() hook anywhere in app
 * - Example: openModal('login')
 */
function AuthModalsComponent() {
  const { activeModal, closeModal } = useModal();

  // Only one modal can be active at a time
  const isLoginOpen = activeModal === 'login';
  const isSignupOpen = activeModal === 'signup';
  const isForgotPasswordOpen = activeModal === 'forgot-password';

  return (
    <>
      {/* Login Modal */}
      <LoginModal 
        isOpen={isLoginOpen} 
        onClose={closeModal} 
      />

      {/* Signup Modal */}
      <SignupModal 
        isOpen={isSignupOpen} 
        onClose={closeModal} 
      />

      {/* Forgot Password Modal */}
      <ForgotPasswordModal
        isOpen={isForgotPasswordOpen}
        onClose={closeModal}
      />
    </>
  );
}

/**
 * Memoized export for performance
 * Prevents unnecessary re-renders when parent updates
 */
export default memo(AuthModalsComponent);