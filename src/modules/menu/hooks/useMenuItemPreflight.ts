// =============================================================================
// PATH: src/modules/menu/hooks/useMenuItemPreflight.ts
// =============================================================================
// Manages the server preflight call for a single menu item + quantity.
// Authoritative source of truth for unit price, availability, and stock.
// =============================================================================

import { useCallback, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase/supabaseClient';
import type { PreflightOk, PreflightResponse } from '../utils/modifierGuards';
import { isRecord, safeStr, safeCents, clampInt, errMsg } from '../utils/menuItemGuards';
import { MAX_QTY_HARD_CAP } from '../constants';

interface UseMenuItemPreflightReturn {
  preflight: PreflightResponse | null;
  preflightLoading: boolean;
  preflightError: string | null;
  /** Call this with the desired qty to (re-)run the preflight. Debounce in the caller. */
  runPreflight: (requestedQty: number) => Promise<void>;
  /** Expose so the qty hook can clamp against server-confirmed max. */
  abortRef: React.MutableRefObject<AbortController | null>;
}

export function useMenuItemPreflight(
  itemId: string,
  onLiveStatus: (msg: string) => void,
  onQtyClamp: (serverMax: number) => void,
): UseMenuItemPreflightReturn {
  const [preflight, setPreflight] = useState<PreflightResponse | null>(null);
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [preflightError, setPreflightError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const requestSeq = useRef(0);

  const runPreflight = useCallback(
    async (requestedQty: number) => {
      if (!itemId) {
        setPreflight({ ok: false, error: 'Invalid item.' });
        setPreflightError('Invalid item.');
        return;
      }

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

        // Guard error.message — invoke error is typed as `any` by Supabase SDK
        if (invokeError !== null && invokeError !== undefined) {
          const msg: string =
            isRecord(invokeError) && typeof invokeError.message === 'string'
              ? invokeError.message
              : 'Preflight failed';
          throw new Error(msg);
        }

        const payload: unknown = invokeData;
        if (!isRecord(payload) || typeof payload.ok !== 'boolean') {
          throw new Error('Invalid preflight response');
        }

        if (payload.ok !== true) {
          const msg = typeof payload.error === 'string' ? payload.error : 'Item unavailable';
          setPreflight({ ok: false, error: msg });
          setPreflightError(msg);
          onLiveStatus(msg);
          return;
        }

        const normalized: PreflightOk = {
          ok: true,
          item_id: safeStr(payload.item_id, itemId, 128),
          available: Boolean(payload.available),
          unit_price_cents: safeCents(payload.unit_price_cents, 0),
          stock_count:
            payload.stock_count == null ? null : clampInt(payload.stock_count, 0, 1_000_000),
          low_stock_threshold:
            payload.low_stock_threshold == null
              ? null
              : clampInt(payload.low_stock_threshold, 1, 1_000_000),
          max_qty: clampInt(payload.max_qty ?? 1, 1, MAX_QTY_HARD_CAP),
        };

        setPreflight(normalized);
        onQtyClamp(normalized.max_qty);
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