// =============================================================================
// PATH: src/modules/menu/hooks/modal/useMenuItemModalLifecycle.ts
// =============================================================================
// Owns all modal side-effects:
//   - scroll lock token composition
//   - focus management (capture + restore)
//   - ESC + Tab focus-trap keyboard handler
//   - cleanup (abort controller, timers)
//   - debounced preflight trigger
//
// Receives refs from the shell so they remain stable across renders.
// =============================================================================

import { useCallback, useEffect } from 'react';
import { unlockScroll } from '@/lib/ui/scroll-lock';
import { useScrollLock } from '@/lib/ui/useScrollLock';
import { getFocusable } from '../../utils/uiHelpers';
import {
  MODAL_SCROLL_LOCK_PREFIX,
  MODAL_PREFLIGHT_DEBOUNCE_MS,
} from '../../constants/menuItemModal.constants';

interface UseMenuItemModalLifecycleParams {
  id: string;
  safeQty: number;
  runPreflight: (qty: number) => Promise<void>;
  abortRef: React.MutableRefObject<AbortController | null>;
  dialogRef: React.RefObject<HTMLDivElement | null>;
  closeBtnRef: React.RefObject<HTMLButtonElement | null>;
  lastFocusRef: React.MutableRefObject<HTMLElement | null>;
  debounceTimer: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  addTimer: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  successTimer: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  onClose: () => void;
}

export interface UseMenuItemModalLifecycleReturn {
  scrollToken: string;
  close: () => void;
}

export function useMenuItemModalLifecycle({
  id,
  safeQty,
  runPreflight,
  abortRef,
  dialogRef,
  closeBtnRef,
  lastFocusRef,
  debounceTimer,
  addTimer,
  successTimer,
  onClose,
}: UseMenuItemModalLifecycleParams): UseMenuItemModalLifecycleReturn {
  const scrollToken = id ? `${MODAL_SCROLL_LOCK_PREFIX}:${id}` : `${MODAL_SCROLL_LOCK_PREFIX}:unknown`;

  useScrollLock({ enabled: true, token: scrollToken });

  // ── Close handler ────────────────────────────────────────────────────────────

  const close = useCallback(() => {
    unlockScroll(scrollToken);
    onClose();
  }, [onClose, scrollToken]);

  // ── Focus capture + restore ──────────────────────────────────────────────────

  useEffect(() => {
    lastFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    queueMicrotask(() => {
      closeBtnRef.current?.focus();
    });

    return () => {
      unlockScroll(scrollToken);
      queueMicrotask(() => {
        const el = lastFocusRef.current;
        if (el && document.contains(el)) el.focus();
      });
    };
  }, [scrollToken, closeBtnRef, lastFocusRef]);

  // ── ESC + focus trap ─────────────────────────────────────────────────────────

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        return;
      }
      if (e.key !== 'Tab') return;

      const dialog = dialogRef.current;
      if (!dialog) return;

      const focusables = getFocusable(dialog);
      if (focusables.length === 0) return;

      const active = document.activeElement;
      const idx = focusables.findIndex((x) => x === active);
      const lastIdx = focusables.length - 1;

      if (e.shiftKey) {
        if (idx <= 0) {
          e.preventDefault();
          focusables[lastIdx]?.focus();
        }
      } else {
        if (idx === -1 || idx >= lastIdx) {
          e.preventDefault();
          focusables[0]?.focus();
        }
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [close, dialogRef]);

  // ── Cleanup (abort + timers) ─────────────────────────────────────────────────

  useEffect(() => {
    const abort = abortRef.current;
    const debounceTmr = debounceTimer;
    const addTmr = addTimer;
    const successTmr = successTimer;
    return () => {
      abort?.abort();
      if (debounceTmr.current) clearTimeout(debounceTmr.current);
      if (addTmr.current) clearTimeout(addTmr.current);
      if (successTmr.current) clearTimeout(successTmr.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Debounced preflight ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!id) return;
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      void runPreflight(safeQty);
    }, MODAL_PREFLIGHT_DEBOUNCE_MS);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [id, safeQty, runPreflight, debounceTimer]);

  return { scrollToken, close };
}