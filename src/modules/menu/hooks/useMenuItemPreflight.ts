// =============================================================================
// PATH: src/modules/menu/hooks/useMenuItemPreflight.ts
// =============================================================================
// Manages the server preflight call for a single menu item + quantity.
// Authoritative source of truth for unit price, availability, and stock.
// Fully TypeScript-safe and aligned with menu-modal.types.ts
//
// FIELD CONTRACT
// ──────────────
// unit_price_cents
//   Must be a finite non-negative integer from the server.
//   If absent or non-numeric → fail fast with PreflightFail.
//   NEVER default to 0: a zero price is a real (and valid) server response;
//   silently defaulting to 0 would mask a missing field with a free-item bug.
//
// stock_count / low_stock_threshold
//   null  → server does not track stock for this item (valid)
//   number → clamp to safe range
// =============================================================================

import { useCallback, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase/supabaseClient';
import type { PreflightOk, PreflightFail, PreflightResult } from '@/domain/menu/menu-modal.types';
import { isRecord, clampInt, errMsg } from '../utils/menuItemGuards';
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
  const [preflight, setPreflight]             = useState<PreflightResult | null>(null);
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [preflightError, setPreflightError]   = useState<string | null>(null);

  const abortRef    = useRef<AbortController | null>(null);
  const requestSeq  = useRef(0);

  const runPreflight = useCallback(
    async (requestedQty: number) => {
      if (!itemId) {
        const msg = 'Invalid item.';
        setPreflight({ ok: false, reason: msg });
        setPreflightError(msg);
        onLiveStatus(msg);
        return;
      }

      // Abort any previous in-flight request
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      const seq = ++requestSeq.current;
      setPreflightLoading(true);
      setPreflightError(null);

      try {
        const invokeResult = await supabase.functions.invoke('menu-preflight', {
          method: 'POST',
          body:   { item_id: itemId, qty: clampInt(requestedQty, 1, MAX_QTY_HARD_CAP) },
          signal: ac.signal,
        });

        if (seq !== requestSeq.current) return;

        const invokeError: unknown = invokeResult.error;
        const invokeData:  unknown = invokeResult.data;

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
          setPreflight({ ok: false, reason: msg });
          setPreflightError(msg);
          onLiveStatus(msg);
          return;
        }

        // unit_price_cents: fail fast if missing or non-numeric.
        // NEVER default to 0 — that would silently make an item appear free.
        if (
          typeof payload.unit_price_cents !== 'number' ||
          !Number.isFinite(payload.unit_price_cents) ||
          payload.unit_price_cents < 0
        ) {
          const msg = 'Preflight response is missing a valid price. Please try again.';
          setPreflight({ ok: false, reason: msg });
          setPreflightError(msg);
          onLiveStatus(msg);
          return;
        }

        const unit_price_cents = Math.trunc(payload.unit_price_cents);

        const normalized: PreflightOk = {
          ok:            true,
          available:     Boolean(payload.available),
          unit_price_cents,
          stock_count:
            payload.stock_count == null
              ? null
              : clampInt(payload.stock_count as number, 0, 1_000_000),
          low_stock_threshold:
            payload.low_stock_threshold == null
              ? null
              : clampInt(payload.low_stock_threshold as number, 1, 1_000_000),
        };

        setPreflight(normalized);

        // Clamp quantity to server-provided max, or hard cap if absent
        const serverMax =
          payload.max_qty != null
            ? clampInt(payload.max_qty as number, 1, MAX_QTY_HARD_CAP)
            : MAX_QTY_HARD_CAP;
        onQtyClamp(serverMax);
      } catch (e) {
        const msg = errMsg(e);
        if (msg === 'aborted') return;

        setPreflight({ ok: false, reason: msg });
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