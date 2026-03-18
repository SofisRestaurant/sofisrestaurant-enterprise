// =============================================================================
// PATH: src/modules/menu/hooks/useMenuItemQty.ts
// =============================================================================
// Manages qty state. Provides a server-clamped safeQty and a clamp callback
// that useMenuItemPreflight can call when the server confirms max_qty.
// =============================================================================

import { useCallback, useMemo, useState } from 'react';
import { clampInt } from '../utils/menuItemGuards';
import { MAX_QTY_HARD_CAP } from '../constants';

interface UseMenuItemQtyReturn {
  qty: number;
  safeQty: number;
  maxQty: number;
  setQty: React.Dispatch<React.SetStateAction<number>>;
  /** Called by useMenuItemPreflight when the server confirms a max_qty. */
  clampToServerMax: (serverMax: number) => void;
  /** Call when an external cap (preflight) changes. */
  setServerMaxQty: (serverMax: number) => void;
}

export function useMenuItemQty(): UseMenuItemQtyReturn {
  const [qty, setQty] = useState<number>(1);
  const [serverMaxQty, setServerMaxQty] = useState<number>(MAX_QTY_HARD_CAP);

  const maxQty: number = useMemo(
    () => clampInt(serverMaxQty, 1, MAX_QTY_HARD_CAP),
    [serverMaxQty],
  );

  const safeQty: number = useMemo(() => clampInt(qty, 1, maxQty), [qty, maxQty]);

  const clampToServerMax = useCallback((serverMax: number): void => {
    const clamped = clampInt(serverMax, 1, MAX_QTY_HARD_CAP);
    setServerMaxQty(clamped);
    setQty((q) => clampInt(q, 1, clamped));
  }, []);

  return { qty, safeQty, maxQty, setQty, clampToServerMax, setServerMaxQty };
}