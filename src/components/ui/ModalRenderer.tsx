// src/components/ui/ModalRenderer.tsx
// ============================================================================
// MODAL RENDERER
// ============================================================================
// Single mount point for all modals. Reads from modal context and renders
// the correct modal component.
//
// addItem expects AddToCartPayload — MenuItemModal already builds this payload
// and passes it through onAddToCart. ModalRenderer just forwards it.
// ============================================================================

import React from 'react';
import { useModal } from './useModal';
import { useCart } from '@/hooks/useCart';
import { useScrollLock } from './hooks/useScrollLock';
import { useModalEscape } from './hooks/useModalEscape';
import { ModalShell } from './ModalShell';
import MenuItemModal from '@/components/menu/MenuItemModal';
import type { MenuItem } from '@/domain/menu/menu.types';
import type { AddToCartPayload } from '@/features/cart/cart.types';

const MODAL_WIDTH: Partial<Record<string, string>> = {
  'menu-item': 'max-w-2xl',
}

export function ModalRenderer() {
  const { activeModal, modalConfig, closeModal } = useModal()
  const { addItem } = useCart()

  const isOpen = activeModal !== null;
  useScrollLock(isOpen)
  useModalEscape(closeModal, isOpen)

  if (!isOpen) return null

  let content: React.ReactNode = null

  switch (activeModal) {
    case 'menu-item': {
      const data = modalConfig?.data as { item: MenuItem } | undefined;
      if (!data?.item) {
        console.warn('MenuItem modal opened without item data');
        return null;
      }
      const item = data.item;
      content = (
        <MenuItemModal
          item={item}
          onClose={closeModal}
          onAddToCart={(payload: AddToCartPayload) => {
            // payload is already a fully-built AddToCartPayload from MenuItemModal
            addItem(payload);
            closeModal();
          }}
        />
      );
      break;
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