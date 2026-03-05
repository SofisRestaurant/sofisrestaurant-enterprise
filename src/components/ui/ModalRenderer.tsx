// src/components/ui/ModalRenderer.tsx
import { useContext, useEffect, useMemo } from 'react';
import { ModalContext } from '@/components/ui/ModalContext';
import type { ModalConfig, ModalType } from '@/components/ui/modalTypes';
import { useScrollLock } from '@/lib/ui/useScrollLock';

import MenuItemModal from '@/modules/menu/components/MenuItemModal';
import type { MenuItemPublic } from '@/domain/menu/menu.types';

type UnknownRecord = Record<string, unknown>;
type AnyModalConfig = ModalConfig<Record<string, unknown>>;

const isRecord = (v: unknown): v is UnknownRecord =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function isMenuItemPublic(v: unknown): v is MenuItemPublic {
  return isRecord(v) && typeof v.id === 'string' && v.id.length > 0 && typeof v.name === 'string';
}

function extractMenuItem(config: unknown): MenuItemPublic | null {
  if (!isRecord(config)) return null;

  const data = config.data;
  if (isRecord(data) && isMenuItemPublic((data as UnknownRecord).item)) {
    return (data as UnknownRecord).item as MenuItemPublic;
  }

  if (isMenuItemPublic((config as UnknownRecord).item)) {
    return (config as UnknownRecord).item as MenuItemPublic;
  }

  return null;
}

export default function ModalRenderer() {
  const ctx = useContext(ModalContext);
  if (!ctx) return null;

  const { activeModal, modalConfig, closeModal } = ctx;

  useEffect(() => {
    if (!activeModal) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeModal, closeModal]);

  const isMenuItem = activeModal === ('menu-item' as ModalType);

  // lock only for modals that this shell actually owns
  useScrollLock({ enabled: Boolean(activeModal) && !isMenuItem, token: 'modal-renderer' });

  const content = useMemo(() => {
    if (!activeModal) return null;

    if (isMenuItem) {
      const item = extractMenuItem(modalConfig as AnyModalConfig);
      if (!item) return null;
      return <MenuItemModal item={item} onClose={closeModal} />;
    }

    return null;
  }, [activeModal, isMenuItem, modalConfig, closeModal]);

  if (!activeModal || !content) return null;

  // MenuItemModal provides its own overlay
  if (isMenuItem) return content;

  return (
    <div className="fixed inset-0 z-50" data-modal-root="true">
      <button
        type="button"
        aria-label="Close modal"
        onClick={closeModal}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div role="dialog" aria-modal="true" className="w-full max-w-5xl rounded-3xl bg-zinc-950">
          {content}
        </div>
      </div>
    </div>
  );
}
