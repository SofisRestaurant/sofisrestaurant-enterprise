// =============================================================================
// PATH: src/modules/menu/hooks/useMenuItemPreflight.ts
// =============================================================================
// Manages the server preflight call for a single menu item + quantity.
// Authoritative source of truth for unit price, availability, and stock.
// Fully TypeScript-safe and aligned with menu-modal.types.ts
// =============================================================================

import { useCallback, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase/supabaseClient';
import type { PreflightOk, PreflightFail, PreflightResult } from '@/domain/menu/menu-modal.types';
import { isRecord, safeCents, clampInt, errMsg } from '../utils/menuItemGuards';
import { MAX_QTY_HARD_CAP } from '../constants';

interface UseMenuItemPreflightReturn {
  preflight: PreflightResult | null;
  preflightLoading: boolean;
  preflightError: string | null;
  /** Call this with the desired qty to (re-)run the preflight. Debounce in the caller. */
  runPreflight: (requestedQty: number) => Promise<void>;
  /** Expose so the qty hook can clamp against server-confirmed max. */
  abortRef: React.RefObject<AbortController | null>;
}

export function useMenuItemPreflight(
  itemId: string,
  onLiveStatus: (msg: string) => void,
  onQtyClamp: (serverMax: number) => void,
): UseMenuItemPreflightReturn {
  const [preflight, setPreflight] = useState<PreflightResult | null>(null);
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [preflightError, setPreflightError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const requestSeq = useRef(0);

  const runPreflight = useCallback(
    async (requestedQty: number) => {
      if (!itemId) {
        const msg = 'Invalid item.';
        setPreflight({ ok: false, error: msg });
        setPreflightError(msg);
        onLiveStatus(msg);
        return;
      }

      // Abort any previous request
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      const seq = ++requestSeq.current;
      setPreflightLoading(true);
      setPreflightError(null);

      try {
        const invokeResult = await supabase.functions.invoke('menu-preflight', {
          method: 'POST',
          body: { item_id: itemId, qty: clampInt(requestedQty, 1, MAX_QTY_HARD_CAP) },
          signal: ac.signal,
        });

        if (seq !== requestSeq.current) return;

        const invokeError: unknown = invokeResult.error;
        const invokeData: unknown = invokeResult.data;

        // Handle Supabase SDK error
        if (invokeError) {
          const msg =
            isRecord(invokeError) && typeof invokeError.message === 'string'
              ? invokeError.message
              : 'Preflight failed';
          throw new Error(msg);
        }

        const payload: unknown = invokeData;
        if (!isRecord(payload) || typeof payload.ok !== 'boolean') {
          throw new Error('Invalid preflight response');
        }

        if (!payload.ok) {
          const msg = typeof payload.error === 'string' ? payload.error : 'Item unavailable';
          setPreflight({ ok: false, error: msg });
          setPreflightError(msg);
          onLiveStatus(msg);
          return;
        }

        // Normalize PreflightOk
        const normalized: PreflightOk = {
          ok: true,
          available: Boolean(payload.available),
          unit_price_cents: safeCents(payload.unit_price_cents, 0),
          stock_count:
            payload.stock_count == null ? null : clampInt(payload.stock_count, 0, 1_000_000),
          low_stock_threshold:
            payload.low_stock_threshold == null
              ? null
              : clampInt(payload.low_stock_threshold, 1, 1_000_000),
        };

        setPreflight(normalized);

        // Clamp quantity using server-provided max_qty if present, otherwise use hard cap
        const serverMax =
          payload.max_qty != null ? clampInt(payload.max_qty, 1, MAX_QTY_HARD_CAP) : MAX_QTY_HARD_CAP;
        onQtyClamp(serverMax);
      } catch (e) {
        const msg = errMsg(e);
        if (msg === 'aborted') return;

        setPreflight({ ok: false, error: msg });
        setPreflightError(msg);
        onLiveStatus(msg);
      } finally {
        if (seq === requestSeq.current) setPreflightLoading(false);
      }
    },
    [itemId, onLiveStatus, onQtyClamp],
  );

  return { preflight, preflightLoading, preflightError, runPreflight, abortRef };
}