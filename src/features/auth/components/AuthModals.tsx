// src/features/auth/components/AuthModals.tsx
// =============================================================================
// AUTH MODALS — Enterprise Coordinator (Production Hardened 2026)
// =============================================================================
// Responsibilities:
// - Centralize auth modal orchestration
// - Enforce safe internal post-auth redirects
// - Coordinate tokenized scroll lock + escape close
// - Prevent modal-switch race conditions
// - Handle navigate() return type safely for eslint/no-floating-promises
//
// Security:
// - No console logging
// - Redirect allowlist enforced
// - Rejects absolute / protocol-relative redirect targets
// - Graceful fallback to AUTH_SAFE_REDIRECT_DEFAULT
// =============================================================================

import { memo, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { NavigateFunction, NavigateOptions, To } from 'react-router-dom';

import { useModal } from '@/components/ui/useModal';
import { useScrollLock } from '@/lib/ui/useScrollLock';
import { useModalEscape } from '@/components/ui/hooks/useModalEscape';
import { ModalShell } from '@/components/ui/ModalShell';
import { AUTH_ALLOWED_REDIRECT_PREFIXES, AUTH_SAFE_REDIRECT_DEFAULT } from '@/security/auth';

import LoginModal from './LoginModal';
import SignupModal from './SignupModal';
import ForgotPasswordModal from './ForgotPasswordModal';

// ── Types ─────────────────────────────────────────────────────────────────────

export type AuthModalKey = 'login' | 'signup' | 'forgot-password';

const AUTH_MODAL_SCROLL_LOCK_TOKEN = 'auth-modals';

// ── Redirect validation ───────────────────────────────────────────────────────

/**
 * Validates a redirect path against the internal allowlist.
 * Rejects:
 * - absolute URLs: http://, https://
 * - protocol-relative URLs: //
 * - non-root-relative paths
 * - paths outside AUTH_ALLOWED_REDIRECT_PREFIXES
 *
 * Returns AUTH_SAFE_REDIRECT_DEFAULT when invalid.
 */
function safeRedirectPath(raw: string | null): string {
  if (!raw) return AUTH_SAFE_REDIRECT_DEFAULT;

  const value = raw.trim();
  if (!value) return AUTH_SAFE_REDIRECT_DEFAULT;

  // Reject absolute / protocol-relative targets
  if (/^(https?:)?\/\//i.test(value)) return AUTH_SAFE_REDIRECT_DEFAULT;

  // Only internal root-relative paths are allowed
  if (!value.startsWith('/')) return AUTH_SAFE_REDIRECT_DEFAULT;

  // Normalize repeated slashes at start defensively
  if (value.startsWith('//')) return AUTH_SAFE_REDIRECT_DEFAULT;

  const isAllowed = AUTH_ALLOWED_REDIRECT_PREFIXES.some(
    (prefix) =>
      value === prefix || value.startsWith(`${prefix}/`) || value.startsWith(`${prefix}?`),
  );

  return isAllowed ? value : AUTH_SAFE_REDIRECT_DEFAULT;
}

// ── Promise-safe navigation helper ───────────────────────────────────────────

/**
 * react-router's navigate can return void | Promise<void> depending on router mode.
 * This wrapper keeps eslint happy and prevents unhandled promise warnings.
 */
function safeNavigate(navigate: NavigateFunction, to: To, options?: NavigateOptions): void {
  void Promise.resolve(navigate(to, options));
}

// ── Modal helper ──────────────────────────────────────────────────────────────

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

  // Enterprise-safe global scroll lock
  useScrollLock({ enabled: isOpen, token: AUTH_MODAL_SCROLL_LOCK_TOKEN });

  // Escape-to-close only while visible
  useModalEscape(closeModal, isOpen);

  const switchTo = useCallback(
    (next: AuthModalKey) => {
      if (currentModal === next) return;

      closeModal();

      // queueMicrotask prevents close/open collisions in the same turn
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
    </ModalShell>
  );
}

export default memo(AuthModalsComponent);