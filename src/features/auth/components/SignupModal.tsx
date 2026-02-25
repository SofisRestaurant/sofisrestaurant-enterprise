import { Modal } from '@/components/ui/Modal';
import { SignupForm } from './SignupForm';
import { useModal } from '@/components/ui/useModal';

interface SignupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SignupModal({ isOpen, onClose }: SignupModalProps) {
  const { openModal } = useModal();

  const handleSuccess = () => {
    onClose();
  };

  const handleSwitchToLogin = () => {
    onClose();
    openModal('login');
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create Account">
      <SignupForm
        onSuccess={handleSuccess}
        onSwitchToLogin={handleSwitchToLogin}
      />
    </Modal>
  );
}