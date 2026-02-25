// src/features/auth/components/AuthModal.tsx
// ============================================================================
// AUTH MODAL COORDINATOR — PRODUCTION GRADE 2026
// ============================================================================
// Single mount point for all auth modals. Owns switching AND post-login
// navigation — individual modals stay unaware of each other and of routing.
// ============================================================================

import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useModal } from '@/components/ui/useModal'
import { LoginModal } from '@/features/auth/components/LoginModal';
import { SignupModal } from '@/features/auth/components/SignupModal';
import ForgotPasswordModal from '@/features/auth/components/ForgotPasswordModal'

type AuthView = 'login' | 'signup' | 'forgot-password';

export function AuthModal() {
  const { activeModal, openModal, closeModal } = useModal();
  const navigate = useNavigate();

  // ── Modal switching ───────────────────────────────────────────────────────
  const switchTo = useCallback(
    (next: AuthView) => {
      closeModal();
      if (typeof queueMicrotask === 'function') {
        queueMicrotask(() => openModal(next));
      } else {
        Promise.resolve().then(() => openModal(next));
      }
    },
    [closeModal, openModal],
  );

  const handleSwitchToSignup = useCallback(() => switchTo('signup'), [switchTo]);
  const handleSwitchToLogin = useCallback(() => switchTo('login'), [switchTo]);
  const handleForgotPassword = useCallback(() => switchTo('forgot-password'), [switchTo]);

  // ── Post-login redirect ───────────────────────────────────────────────────
  // Navigation lives here, not in LoginModal or LoginForm.
  // Reads ?redirect= query param so deep links survive the auth flow.
  const handleLoginSuccess = useCallback(() => {
    closeModal();
    const params = new URLSearchParams(window.location.search);
    const redirectTo = params.get('redirect') || '/account';
    navigate(redirectTo);
  }, [closeModal, navigate]);

  return (
    <>
      <LoginModal
        isOpen={activeModal === 'login'}
        onClose={closeModal}
        onSwitchToSignup={handleSwitchToSignup}
        onForgotPassword={handleForgotPassword}
        onLoginSuccess={handleLoginSuccess}
      />
      <SignupModal
        isOpen={activeModal === 'signup'}
        onClose={closeModal}
        onSwitchToLogin={handleSwitchToLogin}
      />
      <ForgotPasswordModal
        isOpen={activeModal === 'forgot-password'}
        onClose={closeModal}
        onSwitchToLogin={handleSwitchToLogin}
      />
    </>
  );
}

export default AuthModal;