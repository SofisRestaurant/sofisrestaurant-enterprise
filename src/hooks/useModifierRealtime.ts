// src/hooks/useModifierRealtime.ts
// ============================================================================
// useModifierRealtime
// ============================================================================
// Subscribes to Supabase realtime changes on modifier_groups and modifiers.
// Notifies consumers via callbacks (void-returning) so callers can refetch.
// ============================================================================

import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase/supabaseClient';
import type {
  RealtimeModifierGroupEvent,
  RealtimeModifierEvent,
  RealtimeModifierEvent_ as RealtimeEvent,
} from '@/domain/menu/modifier-sync.engine';
import type { RealtimeChannel } from '@supabase/supabase-js';

export interface UseModifierRealtimeOptions {
  /** Called when any modifier group change arrives */
  onGroupChange?: (event: RealtimeModifierGroupEvent) => void;
  /** Called when any modifier change arrives */
  onModifierChange?: (event: RealtimeModifierEvent) => void;
  /** Called for any change — convenience handler */
  onAnyChange?: (event: RealtimeEvent) => void;
  /** If provided, only listen to changes for this menu_item's groups (optional, filter handled downstream if needed) */
  menuItemId?: string;
  /** If false, subscription is not created */
  enabled?: boolean;
}

function isInsertUpdateDelete(v: unknown): v is 'INSERT' | 'UPDATE' | 'DELETE' {
  return v === 'INSERT' || v === 'UPDATE' || v === 'DELETE';
}

export function useModifierRealtime({
  onGroupChange,
  onModifierChange,
  onAnyChange,
  enabled = true,
}: UseModifierRealtimeOptions = {}) {
  // Stable refs to avoid re-subscribing on every render
  const onGroupChangeRef = useRef(onGroupChange);
  const onModifierChangeRef = useRef(onModifierChange);
  const onAnyChangeRef = useRef(onAnyChange);

  useEffect(() => {
    onGroupChangeRef.current = onGroupChange;
  }, [onGroupChange]);

  useEffect(() => {
    onModifierChangeRef.current = onModifierChange;
  }, [onModifierChange]);

  useEffect(() => {
    onAnyChangeRef.current = onAnyChange;
  }, [onAnyChange]);

  // Avoid impure calls during render: create the channel name in an effect
  const channelNameRef = useRef<string | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!enabled) return;

    if (!channelNameRef.current) {
      const id =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `modrt_${Math.random().toString(16).slice(2)}`;
      channelNameRef.current = `modifier-realtime-${id}`;
    }

    const channel = supabase
      .channel(channelNameRef.current)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'modifier_groups' },
        (payload) => {
          const eventTypeRaw: unknown = (payload as { eventType?: unknown }).eventType;
          const type = isInsertUpdateDelete(eventTypeRaw) ? eventTypeRaw : 'UPDATE';

          const event: RealtimeModifierGroupEvent = {
            type,
            table: 'modifier_groups',
            new: payload.new as RealtimeModifierGroupEvent['new'],
            old: payload.old as RealtimeModifierGroupEvent['old'],
          };

          onGroupChangeRef.current?.(event);
          onAnyChangeRef.current?.(event);
        },
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'modifiers' }, (payload) => {
        const eventTypeRaw: unknown = (payload as { eventType?: unknown }).eventType;
        const type = isInsertUpdateDelete(eventTypeRaw) ? eventTypeRaw : 'UPDATE';

        const event: RealtimeModifierEvent = {
          type,
          table: 'modifiers',
          new: payload.new as RealtimeModifierEvent['new'],
          old: payload.old as RealtimeModifierEvent['old'],
        };

        onModifierChangeRef.current?.(event);
        onAnyChangeRef.current?.(event);
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      const ch = channelRef.current;
      channelRef.current = null;
      if (ch) {
        // removeChannel returns a Promise — mark it intentionally ignored
        void supabase.removeChannel(ch);
      }
    };
  }, [enabled]);

  /**
   * Manual invalidate: useful after local writes to force consumers to refetch
   * without waiting for realtime to round-trip.
   */
  const invalidate = useCallback(() => {
    const synthetic: RealtimeModifierGroupEvent = {
      type: 'UPDATE',
      table: 'modifier_groups',
      new: null,
      old: null,
    };
    onAnyChangeRef.current?.(synthetic);
  }, []);

  return { invalidate };
}
