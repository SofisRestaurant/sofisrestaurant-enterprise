import { createContext } from 'react'
import type { ModalType, ModalConfig } from './modalTypes'

export type ModalContextValue = {
  activeModal: ModalType | null
  modalConfig: ModalConfig<Record<string, unknown>>
  openModal: <T extends Record<string, unknown> = Record<string, unknown>>(
    modal: ModalType,
    config?: ModalConfig<T>
  ) => void
  closeModal: () => void
  isPending?: boolean
}

export const ModalContext = createContext<ModalContextValue | undefined>(undefined)