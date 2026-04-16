// src/features/auth/components/SignupModal.tsx
// ============================================================================
// SIGNUP MODAL — Passwordless (2026)
// ============================================================================
// Sign up and sign in are the same flow with passwordless auth.
// This component is a thin alias of LoginModal so existing callers that
// open 'signup' via useModal() continue to work without changes.
// ============================================================================

import LoginModal from './LoginModal';

interface SignupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  onSwitchToLogin?: () => void;
}

export default function SignupModal({ isOpen, onClose, onSuccess }: SignupModalProps) {
  return <LoginModal isOpen={isOpen} onClose={onClose} onSuccess={onSuccess} />;
}