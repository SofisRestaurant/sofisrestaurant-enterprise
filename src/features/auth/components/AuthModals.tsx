// src/features/auth/components/AuthModals.tsx
// =============================================================================
// AUTH MODALS — Enterprise Coordinator (Production Hardened 2026)
// =============================================================================

import { Suspense, lazy, memo, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { NavigateFunction, NavigateOptions, To } from 'react-router-dom';

import { useModal } from '@/components/ui/useModal';
import { useScrollLock } from '@/lib/ui/useScrollLock';
import { useModalEscape } from '@/components/ui/hooks/useModalEscape';
import { ModalShell } from '@/components/ui/ModalShell';
import { AUTH_ALLOWED_REDIRECT_PREFIXES, AUTH_SAFE_REDIRECT_DEFAULT } from '@/security/auth';

const LoginModal = lazy(() => import('./LoginModal'));
const SignupModal = lazy(() => import('./SignupModal'));
const ForgotPasswordModal = lazy(() => import('./ForgotPasswordModal'));

// ── Types ─────────────────────────────────────────────────────────────────────

export type AuthModalKey = 'login' | 'signup' | 'forgot-password';

const AUTH_MODAL_SCROLL_LOCK_TOKEN = 'auth-modals';

// ── Redirect validation ───────────────────────────────────────────────────────

function safeRedirectPath(raw: string | null): string {
  if (!raw) return AUTH_SAFE_REDIRECT_DEFAULT;

  const value = raw.trim();
  if (!value) return AUTH_SAFE_REDIRECT_DEFAULT;

  if (/^(https?:)?\/\//i.test(value)) return AUTH_SAFE_REDIRECT_DEFAULT;
  if (!value.startsWith('/')) return AUTH_SAFE_REDIRECT_DEFAULT;
  if (value.startsWith('//')) return AUTH_SAFE_REDIRECT_DEFAULT;

  const isAllowed = AUTH_ALLOWED_REDIRECT_PREFIXES.some(
    (prefix) =>
      value === prefix || value.startsWith(`${prefix}/`) || value.startsWith(`${prefix}?`),
  );

  return isAllowed ? value : AUTH_SAFE_REDIRECT_DEFAULT;
}

function safeNavigate(navigate: NavigateFunction, to: To, options?: NavigateOptions): void {
  void Promise.resolve(navigate(to, options));
}

function isAuthModalKey(value: unknown): value is AuthModalKey {
  return value === 'login' || value === 'signup' || value === 'forgot-password';
}

// ── Component ─────────────────────────────────────────────────────────────────

function AuthModalsComponent() {
  const { activeModal, openModal, closeModal } = useModal();
  const navigate = useNavigate();

  const currentModal = isAuthModalKey(activeModal) ? activeModal : null;

  const isOpen = useMemo(
    () =>
      currentModal === 'login' || currentModal === 'signup' || currentModal === 'forgot-password',
    [currentModal],
  );

  useScrollLock({ enabled: isOpen, token: AUTH_MODAL_SCROLL_LOCK_TOKEN });
  useModalEscape(closeModal, isOpen);

  const switchTo = useCallback(
    (next: AuthModalKey) => {
      if (currentModal === next) return;

      closeModal();

      queueMicrotask(() => {
        openModal(next);
      });
    },
    [closeModal, currentModal, openModal],
  );

  const handleLoginSuccess = useCallback(() => {
    closeModal();

    const params = new URLSearchParams(window.location.search);
    const redirectTo = safeRedirectPath(params.get('redirect'));

    safeNavigate(navigate, redirectTo);
  }, [closeModal, navigate]);

  const handleClose = useCallback(() => {
    closeModal();
  }, [closeModal]);

  if (!isOpen || !currentModal) return null;

  return (
    <ModalShell isOpen={isOpen} onClose={handleClose} maxWidth="max-w-md" label={currentModal}>
      <Suspense fallback={null}>
        {currentModal === 'login' ? (
          <LoginModal
            isOpen={isOpen}
            onClose={handleClose}
            onSwitchToSignup={() => switchTo('signup')}
            onForgotPassword={() => switchTo('forgot-password')}
            onLoginSuccess={handleLoginSuccess}
          />
        ) : null}

        {currentModal === 'signup' ? (
          <SignupModal
            isOpen={isOpen}
            onClose={handleClose}
            onSwitchToLogin={() => switchTo('login')}
          />
        ) : null}

        {currentModal === 'forgot-password' ? (
          <ForgotPasswordModal
            isOpen={isOpen}
            onClose={handleClose}
            onSwitchToLogin={() => switchTo('login')}
          />
        ) : null}
      </Suspense>
    </ModalShell>
  );
}

export default memo(AuthModalsComponent);
