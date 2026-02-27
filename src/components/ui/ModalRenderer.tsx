// src/components/ui/ModalRenderer.tsx

import { useModal } from './useModal'
import { useCart } from '@/hooks/useCart'
import { useScrollLock } from './hooks/useScrollLock'
import { useModalEscape } from './hooks/useModalEscape'
import { ModalShell } from './ModalShell'
import MenuItemModal from '@/components/menu/MenuItemModal'
import type { MenuItem } from '@/types/menu'

const MODAL_WIDTH: Partial<Record<string, string>> = {
  'menu-item': 'max-w-2xl',
}

export function ModalRenderer() {
  const { activeModal, modalConfig, closeModal } = useModal()
  const { addItem } = useCart()

  const isOpen = activeModal !== null

  useScrollLock(isOpen)
  useModalEscape(closeModal, isOpen)

  if (!isOpen) return null

  let content: React.ReactNode = null

  switch (activeModal) {
    case 'menu-item': {
      const data = modalConfig?.data as { item: MenuItem } | undefined

      if (!data?.item) {
        console.warn('MenuItem modal opened without item data')
        return null
      }

      const item = data.item

      content = (
        <MenuItemModal
          item={item}
          onClose={closeModal}
          onAddToCart={({ quantity, special_instructions }) => {
            addItem(item, quantity, special_instructions)
            closeModal()
          }}
        />
      )

      break
    }

    default:
      return null
  }

  return (
    <ModalShell
      isOpen
      onClose={closeModal}
      maxWidth={MODAL_WIDTH[activeModal] ?? 'max-w-2xl'}
      label={activeModal}
    >
      {content}
    </ModalShell>
  )
}