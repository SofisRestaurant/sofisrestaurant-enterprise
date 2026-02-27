// src/features/auth/components/AuthModals.tsx
// =============================================================================
// AUTH MODALS — Enterprise Coordinator
// =============================================================================
// Changes from previous version:
//   • console.log removed (was leaking modal state to production console)
//   • ?redirect= parameter validated against allowlist — prevents open redirect
//   • Auth security layer imported for rate limit awareness
// =============================================================================

import { memo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useModal } from '@/components/ui/useModal';
import { useScrollLock } from '@/components/ui/hooks/useScrollLock';
import { useModalEscape } from '@/components/ui/hooks/useModalEscape';
import { ModalShell } from '@/components/ui/ModalShell';
import { AUTH_ALLOWED_REDIRECT_PREFIXES, AUTH_SAFE_REDIRECT_DEFAULT } from '@/security/auth';
import LoginModal from './LoginModal';
import SignupModal from './SignupModal';
import ForgotPasswordModal from './ForgotPasswordModal';

// ── Types ─────────────────────────────────────────────────────────────────────

export type AuthModalKey = 'login' | 'signup' | 'forgot-password';

// ── Redirect validation ───────────────────────────────────────────────────────

/**
 * Validates a redirect path against the internal allowlist.
 * Rejects:
 *   • Absolute URLs (http://, https://, //)
 *   • Protocol-relative paths (//)
 *   • Paths not in AUTH_ALLOWED_REDIRECT_PREFIXES
 *
 * Returns AUTH_SAFE_REDIRECT_DEFAULT if invalid.
 */
function safeRedirectPath(raw: string | null): string {
  if (!raw) return AUTH_SAFE_REDIRECT_DEFAULT;

  // Reject anything that looks like an absolute URL or protocol-relative
  if (/^(https?:)?\/\//.test(raw)) return AUTH_SAFE_REDIRECT_DEFAULT;

  // Must start with /
  if (!raw.startsWith('/')) return AUTH_SAFE_REDIRECT_DEFAULT;

  // Must match one of the allowed prefixes
  const isAllowed = AUTH_ALLOWED_REDIRECT_PREFIXES.some(
    (prefix) => raw === prefix || raw.startsWith(`${prefix}/`),
  );

  return isAllowed ? raw : AUTH_SAFE_REDIRECT_DEFAULT;
}

// ── Component ─────────────────────────────────────────────────────────────────

function AuthModalsComponent() {
  const { activeModal, openModal, closeModal } = useModal();
  const navigate = useNavigate();

  // ── Modal switching (microtask-safe — prevents state collision) ─────────────
  const switchTo = useCallback(
    (next: AuthModalKey) => {
      closeModal();
      queueMicrotask(() => openModal(next));
    },
    [closeModal, openModal],
  );

  // ── Post-login redirect (validated) ─────────────────────────────────────────
  const handleLoginSuccess = useCallback(() => {
    closeModal();
    const params = new URLSearchParams(window.location.search);
    const redirectTo = safeRedirectPath(params.get('redirect'));
    navigate(redirectTo);
  }, [closeModal, navigate]);

  // ── Modal open state ─────────────────────────────────────────────────────────
  const isOpen =
    activeModal === 'login' || activeModal === 'signup' || activeModal === 'forgot-password';

  useScrollLock(isOpen);
  useModalEscape(closeModal, isOpen);

  if (!isOpen) return null;

  return (
    <ModalShell isOpen onClose={closeModal} maxWidth="max-w-md" label={activeModal ?? 'auth-modal'}>
      {activeModal === 'login' && (
        <LoginModal
          isOpen
          onClose={closeModal}
          onSwitchToSignup={() => switchTo('signup')}
          onForgotPassword={() => switchTo('forgot-password')}
          onLoginSuccess={handleLoginSuccess}
        />
      )}
      {activeModal === 'signup' && (
        <SignupModal isOpen onClose={closeModal} onSwitchToLogin={() => switchTo('login')} />
      )}

      {activeModal === 'forgot-password' && (
        <ForgotPasswordModal
          isOpen
          onClose={closeModal}
          onSwitchToLogin={() => switchTo('login')}
        />
      )}
    </ModalShell>
  );
}

export default memo(AuthModalsComponent);
