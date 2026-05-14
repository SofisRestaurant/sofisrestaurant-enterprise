// src/components/ui/ModalRenderer.tsx
//
// MenuItemModal is LAZY — the static import has been replaced with React.lazy()
// so the modal chunk is excluded from the initial app bundle and deferred until
// the first menu-item modal is opened.
//
// This file previously imported MenuItemModal statically, which pulled the full
// modal tree (useCart, useScrollLock, preflight, modifiers, image, utilities)
// into the initial bundle regardless of whether the modal was ever opened.
// Removing that static import is required for any lazy() split in MenuGrid or
// MenuPage to have effect — a single static import anywhere in the app graph
// defeats the code split entirely.
//
// Suspense fallback: null — MenuItemModal provides its own backdrop and
// spinner (the ModalLoadingFallback in MenuGrid), so this shell renders nothing
// while the chunk loads. Rendering a competing fallback here would produce a
// double-backdrop flash.
//
// All existing behaviour is unchanged:
//   - Escape key closes the modal
//   - Scroll lock is delegated to MenuItemModal for isMenuItem (same as before)
//   - extractMenuItem logic is identical
//   - Non-menu-item modal path (generic dialog shell) is identical

import { lazy, Suspense, useContext, useEffect, useMemo } from 'react';
import { ModalContext } from '@/components/ui/ModalContext';
import type { ModalConfig, ModalType } from '@/components/ui/modalTypes';
import { useScrollLock } from '@/lib/ui/useScrollLock';
import type { MenuItemPublic } from '@/domain/menu/menu.types';

// ── Lazy modal ─────────────────────────────────────────────────────────────
//
// Must reference the same import path used in MenuGrid.tsx and MenuPage.tsx
// so Vite/webpack deduplicates all three lazy() calls into one shared chunk.
// A mismatched path (e.g. aliased vs relative) produces a separate chunk and
// a double download.
const MenuItemModal = lazy(() => import('@/modules/menu/components/MenuItemModal'));

// ── Types ──────────────────────────────────────────────────────────────────

type UnknownRecord = Record<string, unknown>;
type AnyModalConfig = ModalConfig<Record<string, unknown>>;

// ── Guards ─────────────────────────────────────────────────────────────────

const isRecord = (v: unknown): v is UnknownRecord =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function isMenuItemPublic(v: unknown): v is MenuItemPublic {
  return isRecord(v) && typeof v.id === 'string' && v.id.length > 0 && typeof v.name === 'string';
}

function extractMenuItem(config: unknown): MenuItemPublic | null {
  if (!isRecord(config)) return null;
  const data = config.data;
  if (isRecord(data) && isMenuItemPublic(data.item)) return data.item;
  if (isMenuItemPublic(config.item)) return config.item;
  return null;
}

// ── Component ──────────────────────────────────────────────────────────────

export default function ModalRenderer() {
  const ctx = useContext(ModalContext);

  const activeModal = ctx?.activeModal ?? null;
  const modalConfig = ctx?.modalConfig ?? null;
  const closeModal = ctx?.closeModal;

  const isMenuItem = activeModal === ('menu-item' as ModalType);

  useEffect(() => {
    if (!activeModal || !closeModal) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeModal, closeModal]);

  // Scroll lock is delegated to MenuItemModal for the menu-item case —
  // MenuItemModal manages its own token internally. This shell only locks
  // for non-menu-item modals that it owns directly.
  useScrollLock({
    enabled: Boolean(activeModal) && !isMenuItem,
    token: 'modal-renderer',
  });

  const content = useMemo(() => {
    if (!activeModal || !closeModal) return null;

    if (isMenuItem) {
      const item = extractMenuItem(modalConfig as AnyModalConfig | null);
      if (!item) return null;
      // Suspense fallback is null: MenuItemModal renders its own backdrop +
      // spinner (ModalLoadingFallback) while its chunk loads. A fallback here
      // would produce a double-backdrop flash on first open.
      return (
        <Suspense fallback={null}>
          <MenuItemModal item={item} onClose={closeModal} />
        </Suspense>
      );
    }

    return null;
  }, [activeModal, isMenuItem, modalConfig, closeModal]);

  if (!ctx || !activeModal || !content) return null;

  // MenuItemModal provides its own fixed overlay at z-[100] — return it
  // directly so this shell adds no extra DOM nodes or stacking contexts.
  if (isMenuItem) return content;

  return (
    <div className="fixed inset-0 z-100" data-modal-root="true">
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