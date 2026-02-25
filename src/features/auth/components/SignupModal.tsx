import { Modal } from '@/components/ui/Modal';
import { SignupForm } from './SignupForm';

export interface SignupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSwitchToLogin?: () => void;
}

export function SignupModal({ isOpen, onClose, onSwitchToLogin }: SignupModalProps) {
  const handleSuccess = () => {
    onClose();
  };

  const handleSwitchToLoginClick = () => {
    onSwitchToLogin?.();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create Account">
      <SignupForm onSuccess={handleSuccess} onSwitchToLogin={handleSwitchToLoginClick} />
    </Modal>
  );
}

export default SignupModal;
