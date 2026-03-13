// src/components/ui/modalTypes.ts
export type ModalType = 'login' | 'signup' | 'forgot-password' | 'menu-item' | 'custom';

export interface ModalConfig<T = Record<string, unknown>> {
  title?: string;
  data?: T;
  onSuccess?: (result?: T) => void;
  onCancel?: () => void;
  props?: Record<string, unknown>;
}

/**
 * Central store of all modals mapped to their configs.
 * Useful for the useModal context.
 */
export type ModalsState = Record<ModalType, ModalConfig | null>;
