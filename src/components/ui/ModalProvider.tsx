// src/components/ui/ModalProvider.tsx
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ModalContext } from '@/components/ui/ModalContext';
import type { ModalConfig, ModalType } from '@/components/ui/modalTypes';

type AnyConfig = ModalConfig<Record<string, unknown>>;

interface ModalProviderProps {
  children: ReactNode;
}

/**
 * ModalProvider
 * - Single active modal at a time (matches your UI + RootLayout renderer pattern)
 * - Stores the last passed config as-is (title/data/onSuccess/onCancel/props)
 * - openModal is generically typed, but stored safely as a normalized AnyConfig
 */
export function ModalProvider({ children }: ModalProviderProps) {
  const [activeModal, setActiveModal] = useState<ModalType | null>(null);
  const [modalConfig, setModalConfig] = useState<AnyConfig>({});
  const isMounted = useRef(true);

  // Guard: prevent setState calls after unmount (async modal handlers)
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const openModal = useCallback(
    <T extends Record<string, unknown> = Record<string, unknown>>(
      modal: ModalType,
      config?: ModalConfig<T>,
    ) => {
      if (!isMounted.current) return;
      setActiveModal(modal);

      // Store config in a normalized shape (no mutation)
      if (!config) {
        setModalConfig({});
        return;
      }

      const normalized: AnyConfig = {
        title: config.title,
        data: (config.data ?? undefined) as unknown as Record<string, unknown> | undefined,
        onSuccess: config.onSuccess as unknown as AnyConfig['onSuccess'],
        onCancel: config.onCancel,
        props: config.props,
      };

      setModalConfig(normalized);
    },
    [],
  );

  const closeModal = useCallback(() => {
    if (!isMounted.current) return;
    setActiveModal(null);
    setModalConfig({});
  }, []);

  const value = useMemo(
    () => ({
      activeModal,
      modalConfig,
      openModal,
      closeModal,
    }),
    [activeModal, modalConfig, openModal, closeModal],
  );

  return <ModalContext.Provider value={value}>{children}</ModalContext.Provider>;
}