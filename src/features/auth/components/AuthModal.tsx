// src/features/auth/components/AuthModal.tsx
import { useModal } from '@/components/ui/useModal'

// Use default vs named imports to match YOUR exports:
import { LoginModal }from '@/features/auth/components/LoginModal'
import  { SignupModal} from '@/features/auth/components/SignupModal'
import ForgotPasswordModal from '@/features/auth/components/ForgotPasswordModal'

export function AuthModal() {
  const { activeModal, closeModal } = useModal()

  return (
    <>
      <LoginModal isOpen={activeModal === 'login'} onClose={closeModal} />
      <SignupModal isOpen={activeModal === 'signup'} onClose={closeModal} />
      <ForgotPasswordModal
        isOpen={activeModal === 'forgot-password'}
        onClose={closeModal}
      />
    </>
  )
}