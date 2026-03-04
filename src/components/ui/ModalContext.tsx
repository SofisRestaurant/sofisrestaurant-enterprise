// =============================================================================
// src/components/ui/ModalContext.tsx
// MODAL CONTEXT — 2026 Production Grade (Strict + Compatible)
// =============================================================================

import { createContext } from 'react';
import type { ModalConfig, ModalType } from '@/components/ui/modalTypes';

export type ModalContextValue = {
  /** Which modal is currently active (or null if none) */
  activeModal: ModalType | null;

  /**
   * Config for the currently active modal.
   * null when no modal is open (matches real runtime state).
   */
  modalConfig: ModalConfig<Record<string, unknown>> | null;

  /**
   * Open a modal, optionally passing typed config.
   * Config is stored internally as ModalConfig<Record<string, unknown>> to keep
   * the context stable and avoid generic context pitfalls.
   */
  openModal: <T extends Record<string, unknown> = Record<string, unknown>>(
    modal: ModalType,
    config?: ModalConfig<T>,
  ) => void;

  /** Close the current modal and clear config */
  closeModal: () => void;

  /**
   * Optional helper for renderers:
   * lets you request a typed config when you *know* modal kind.
   * (Implementation usually lives in useModal, but typing here is useful.)
   */
  getTypedConfig?: <
    T extends Record<string, unknown> = Record<string, unknown>,
  >() => ModalConfig<T> | null;

  /** Optional UI state for transitions/spinners if you add them later */
  isPending?: boolean;
};

/**
 * ModalContext is intentionally initialized as undefined
 * to enforce provider usage (useModal should throw/guard if missing).
 */
export const ModalContext = createContext<ModalContextValue | undefined>(undefined);
