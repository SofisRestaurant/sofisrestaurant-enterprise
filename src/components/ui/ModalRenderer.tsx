import { useContext, useEffect, useMemo } from 'react';
import { ModalContext } from '@/components/ui/ModalContext';
import type { ModalConfig, ModalType } from '@/components/ui/modalTypes';
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

  // preferred: config.data.item
  const data = config.data;
  if (isRecord(data) && isMenuItemPublic(data.item)) return data.item;

  // tolerated legacy: config.item
  if (isMenuItemPublic((config as UnknownRecord).item))
    return (config as UnknownRecord).item as MenuItemPublic;

  return null;
}

function lockBodyScroll(locked: boolean) {
  const body = document.body;
  if (!body) return;
  if (locked) {
    if (body.dataset.modalLock !== '1') {
      body.dataset.modalLock = '1';
      body.dataset.modalPrevOverflow = body.style.overflow || '';
      body.style.overflow = 'hidden';
    }
  } else {
    if (body.dataset.modalLock === '1') {
      body.style.overflow = body.dataset.modalPrevOverflow ?? '';
      delete body.dataset.modalPrevOverflow;
      delete body.dataset.modalLock;
    }
  }
}

export default function ModalRenderer() {
  const ctx = useContext(ModalContext);
  if (!ctx) return null;

  const { activeModal, modalConfig, closeModal } = ctx;

  useEffect(() => {
    if (!activeModal) return;
    const onKeyDown = (e: KeyboardEvent) => e.key === 'Escape' && closeModal();
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeModal, closeModal]);

  useEffect(() => {
    lockBodyScroll(Boolean(activeModal));
    return () => lockBodyScroll(false);
  }, [activeModal]);

  const content = useMemo(() => {
    if (!activeModal) return null;

    if (activeModal === ('menu-item' as ModalType)) {
      const item = extractMenuItem(modalConfig as AnyModalConfig);
      if (!item) return null;
      return <MenuItemModal item={item} onClose={closeModal} />;
    }

    return null;
  }, [activeModal, modalConfig, closeModal]);

  if (!activeModal || !content) return null;

  return (
    <div className="fixed inset-0 z-100">
      <button
        type="button"
        aria-label="Close modal"
        onClick={closeModal}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div
          role="dialog"
          aria-modal="true"
          className="relative w-full max-w-5xl overflow-hidden rounded-3xl border border-white/10 bg-zinc-950 shadow-2xl"
        >
          <button
            type="button"
            onClick={closeModal}
            aria-label="Close"
            className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-xl bg-white/10 text-white transition hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-amber-500/60"
          >
            ×
          </button>
          {content}
        </div>
      </div>
    </div>
  );
}
