// src/features/auth/components/LoginModal.tsx
// ============================================================================
// LOGIN MODAL — PRODUCTION GRADE 2026
// ============================================================================
// Pure shell: wraps LoginForm in a Modal. All navigation and switching is
// delegated upward to the AuthModal coordinator via props.
// This component has zero knowledge of routing or other modals.
// ============================================================================

import { useCallback } from 'react'
import { Modal } from '@/components/ui/Modal';
import LoginForm from './LoginForm'

// ============================================================================
// TYPES
// ============================================================================

export interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Coordinator handles switching — never reach into modal context here */
  onSwitchToSignup?: () => void;
  onForgotPassword?: () => void;
  /** Coordinator handles redirect after successful login */
  onLoginSuccess?: () => void;
}

// ============================================================================
// COMPONENT
// ============================================================================

export function LoginModal({
  isOpen,
  onClose,
  onSwitchToSignup,
  onForgotPassword,
  onLoginSuccess,
}: LoginModalProps) {
  // Prefer coordinator's success handler; fall back to just closing.
  const handleSuccess = useCallback(() => {
    if (onLoginSuccess) {
      onLoginSuccess();
    } else {
      onClose();
    }
  }, [onLoginSuccess, onClose]);

  const handleSwitchToSignup = useCallback(() => {
    onSwitchToSignup?.();
  }, [onSwitchToSignup]);

  const handleForgotPassword = useCallback(() => {
    onForgotPassword?.();
  }, [onForgotPassword]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Log In"
      description="Welcome back. Log in to continue your order."
    >
      <LoginForm
        onSuccess={handleSuccess}
        onSwitchToSignup={handleSwitchToSignup}
        onForgotPassword={handleForgotPassword}
      />

      <div className="mt-4 text-center text-xs text-gray-500">
        By continuing, you agree to our{' '}
        <a href="/terms-of-service" className="underline hover:text-gray-700 transition-colors">
          Terms
        </a>{' '}
        and{' '}
        <a href="/privacy-policy" className="underline hover:text-gray-700 transition-colors">
          Privacy Policy
        </a>
        .
      </div>
    </Modal>
  );
}

export default LoginModal