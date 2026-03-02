// src/components/ui/ModalRenderer.tsx
// ============================================================================
// MODAL RENDERER
// ============================================================================
// Single mount point for all modals. Reads from modal context and renders
// the correct modal component.
//
// This repo’s cart layer expects: addItem(Omit<CartItem,'lineTotalCents'>)
// so MenuItemModal adds to cart internally via useCart().
// ModalRenderer only controls open/close + shell rendering.
// ============================================================================

import React, { useMemo } from 'react';
import { useModal } from './useModal';
import { useScrollLock } from './hooks/useScrollLock';
import { useModalEscape } from './hooks/useModalEscape';
import { ModalShell } from './ModalShell';
import MenuItemModal from '@/components/menu/MenuItemModal';
import type { MenuItemPublic } from '@/domain/menu/menu.types';

const MODAL_WIDTH: Partial<Record<string, string>> = {
  'menu-item': 'max-w-2xl',
}

type MenuItemModalData = { item: MenuItemPublic };

function isMenuItemModalData(v: unknown): v is MenuItemModalData {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  const item = r['item'];
  if (!item || typeof item !== 'object') return false;
  const ir = item as Record<string, unknown>;
  return typeof ir['id'] === 'string' && typeof ir['name'] === 'string';
}

export function ModalRenderer() {
  const { activeModal, modalConfig, closeModal } = useModal();

  const isOpen = activeModal !== null;
  useScrollLock(isOpen)
  useModalEscape(closeModal, isOpen)

  const maxWidth = useMemo(
    () => (activeModal ? (MODAL_WIDTH[activeModal] ?? 'max-w-2xl') : 'max-w-2xl'),
    [activeModal],
  );

  if (!isOpen) return null

  let content: React.ReactNode = null

  switch (activeModal) {
    case 'menu-item': {
      const data = modalConfig?.data;

      if (!isMenuItemModalData(data)) {
        console.warn('[ModalRenderer] menu-item opened without valid item data', { data });
        content = null;
        break;
      }

      content = <MenuItemModal isOpen item={data.item} onClose={closeModal} />;
      break;
    }

    default:
      content = null
      break
  }

  if (!content) return null;

  return (
    <ModalShell isOpen onClose={closeModal} maxWidth={maxWidth} label={activeModal ?? 'modal'}>
      {content}
    </ModalShell>
  );
}

export default ModalRenderer;