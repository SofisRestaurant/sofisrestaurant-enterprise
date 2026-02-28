// src/hooks/useModifierRealtime.ts
// ============================================================================
// useModifierRealtime
// ============================================================================
// Subscribes to Supabase realtime changes on modifier_groups and modifiers
// tables. Notifies consumers of changes so they can refetch or reconcile.
//
// Pattern follows AdminOrders.tsx realtime pattern (postgres_changes channel).
// ============================================================================

import { useEffect, useRef, useCallback } from 'react'
import { supabase }                       from '@/lib/supabase/supabaseClient'
import type {
  RealtimeModifierGroupEvent,
  RealtimeModifierEvent,
  RealtimeModifierEvent_ as RealtimeEvent,
}                                         from '@/domain/menu/modifier-sync.engine'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface UseModifierRealtimeOptions {
  /** Called when any modifier group change arrives */
  onGroupChange?:    (event: RealtimeModifierGroupEvent) => void
  /** Called when any modifier change arrives */
  onModifierChange?: (event: RealtimeModifierEvent) => void
  /** Called for any change — convenience handler */
  onAnyChange?:      (event: RealtimeEvent) => void
  /** If provided, only listen to changes for this menu_item's groups */
  menuItemId?:       string
  /** If false, subscription is not created (e.g. when user is not admin) */
  enabled?:          boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useModifierRealtime({
  onGroupChange,
  onModifierChange,
  onAnyChange,
  enabled = true,
}: UseModifierRealtimeOptions = {}) {
  // Stable refs so channel subscription doesn't re-create on every render
  const onGroupChangeRef    = useRef(onGroupChange)
  const onModifierChangeRef = useRef(onModifierChange)
  const onAnyChangeRef      = useRef(onAnyChange)

  useEffect(() => { onGroupChangeRef.current    = onGroupChange    }, [onGroupChange])
  useEffect(() => { onModifierChangeRef.current = onModifierChange }, [onModifierChange])
  useEffect(() => { onAnyChangeRef.current      = onAnyChange      }, [onAnyChange])

  // useRef ensures the channel name is stable across re-renders.
  // Math.random() must not be called during render (react-hooks/purity).
  const channelNameRef = useRef<string>(
  `modifier-realtime-${crypto.randomUUID()}`
)

  useEffect(() => {
    if (!enabled) return

    const channel = supabase
      .channel(channelNameRef.current)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'modifier_groups' },
        (payload) => {
          const event: RealtimeModifierGroupEvent = {
            type:  payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE',
            table: 'modifier_groups',
            new:   payload.new as RealtimeModifierGroupEvent['new'],
            old:   payload.old as RealtimeModifierGroupEvent['old'],
          }
          onGroupChangeRef.current?.(event)
          onAnyChangeRef.current?.(event)
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'modifiers' },
        (payload) => {
          const event: RealtimeModifierEvent = {
            type:  payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE',
            table: 'modifiers',
            new:   payload.new as RealtimeModifierEvent['new'],
            old:   payload.old as RealtimeModifierEvent['old'],
          }
          onModifierChangeRef.current?.(event)
          onAnyChangeRef.current?.(event)
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [enabled])

  /**
   * Manually invalidate — call to force consumers to refetch.
   * Useful after a local write to keep UI in sync without waiting for realtime.
   */
  const invalidate = useCallback(() => {
    const event: RealtimeModifierGroupEvent = {
      type:  'UPDATE',
      table: 'modifier_groups',
      new:   null,
      old:   null,
    }
    onAnyChangeRef.current?.(event)
  }, [])

  return { invalidate }
}