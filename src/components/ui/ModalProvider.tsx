// src/components/ui/ModalProvider.tsx
import { ReactNode, useState, useCallback, useMemo } from 'react';
import { ModalContext, ModalContextValue } from './ModalContext';
import { ModalConfig, ModalType } from './modalTypes';

interface ModalProviderProps {
  children: ReactNode;
}

export function ModalProvider({ children }: ModalProviderProps) {
  const [activeModal, setActiveModal] = useState<ModalType | null>(null);
  const [modalConfig, setModalConfig] = useState<ModalConfig<Record<string, unknown>>>({});

  // Open modal with optional typed config
  const openModal = useCallback(
    <T extends Record<string, unknown> = Record<string, unknown>>(
      modal: ModalType,
      config?: ModalConfig<T>
    ) => {
      setActiveModal(modal);
      setModalConfig(config ? (config as ModalConfig<Record<string, unknown>>) : {});
    },
    []
  );

  // Close modal and reset config
  const closeModal = useCallback(() => {
    setActiveModal(null);
    setModalConfig({});
  }, []);

  // Memoize context value to avoid unnecessary re-renders
  const value: ModalContextValue = useMemo(() => ({
    activeModal,
    modalConfig,
    openModal,
    closeModal,
  }), [activeModal, modalConfig, openModal, closeModal]);

  return (
    <ModalContext.Provider value={value}>
      {children}
    </ModalContext.Provider>
  );
}