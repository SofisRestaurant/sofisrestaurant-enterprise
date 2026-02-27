// src/components/ui/modalTypes.ts
export type ModalType =
  | 'login'
  | 'signup'
  | 'forgot-password'
  | 'menu-item'
  | 'custom'; // for future custom modals
  
/**
 * Generic modal configuration.
 * T represents the shape of data passed to the modal.
 */
export interface ModalConfig<T = Record<string, unknown>> {
  /** Optional modal title for display */
  title?: string;

  /** Data passed to the modal (e.g., prefilled form info) */
  data?: T;

  /** Called when the modal action is successful (e.g., login completed) */
  onSuccess?: (result?: T) => void;

  /** Called when the modal is cancelled/closed without success */
  onCancel?: () => void;

  /** Optional extra props specific to the modal */
  props?: Record<string, unknown>;
}

/**
 * Central store of all modals mapped to their configs.
 * Useful for the useModal context.
 */
export type ModalsState = Record<ModalType, ModalConfig | null>;