// src/features/auth/components/LoginModal.tsx
import { useCallback, useEffect } from 'react'
import { Modal } from '@/components/ui/Modal'
import { useModal } from '@/components/ui/useModal'
import LoginForm from './LoginForm'

type AuthTarget = 'signup' | 'forgot-password'

export interface LoginModalProps {
  isOpen: boolean
  onClose: () => void

  // ✅ Added: used by AuthModals coordinator
  onSwitchToSignup?: () => void
  onForgotPassword?: () => void
}

export function LoginModal({
  isOpen,
  onClose,
  onSwitchToSignup,
  onForgotPassword,
}: LoginModalProps) {
  const modal = useModal()

  // Close using the coordinator if present; fallback to modal context; always call onClose.
  const handleClose = useCallback(() => {
    // If parent controls modal state, onClose will close it.
    // Still close modal context in case this is used standalone.
    modal.closeModal()
    onClose()
  }, [modal, onClose])

  const openNext = useCallback(
    (next: AuthTarget) => {
      // Prefer parent-provided navigation (AuthModals), fallback to modal context.
      const go =
        next === 'signup'
          ? onSwitchToSignup ?? (() => modal.openModal?.('signup'))
          : onForgotPassword ?? (() => modal.openModal?.('forgot-password'))

      // Close current first, then open next on a microtask to avoid focus/overlay conflicts.
      handleClose()

      if (typeof queueMicrotask === 'function') {
        queueMicrotask(go)
      } else {
        Promise.resolve().then(go)
      }
    },
    [handleClose, modal, onSwitchToSignup, onForgotPassword]
  )

  const handleSuccess = useCallback(() => {
    handleClose()
  }, [handleClose])

  const handleSwitchToSignup = useCallback(() => {
    openNext('signup')
  }, [openNext])

  const handleForgotPassword = useCallback(() => {
    openNext('forgot-password')
  }, [openNext])

  // Optional: ESC close safety (Modal also handles it, but this won’t hurt)
  useEffect(() => {
    if (!isOpen) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen, handleClose])

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
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
        <a href="/terms-of-service" className="underline hover:text-gray-700">
          Terms
        </a>{' '}
        and{' '}
        <a href="/privacy-policy" className="underline hover:text-gray-700">
          Privacy Policy
        </a>
        .
      </div>
    </Modal>
  )
}

export default LoginModal