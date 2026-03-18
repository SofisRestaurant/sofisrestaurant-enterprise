// =============================================================================
// PATH: src/modules/admin/orders/useAdminOrdersRealtime.ts
// =============================================================================
// Manages the Supabase realtime subscription for the admin orders page.
// Delegates all state mapping to admin-orders.realtime.ts.
// Plays the notification sound on new orders when soundEnabled is true.
// =============================================================================

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/supabaseClient';
import type { AdminOrder } from '../types/admin-orders.types';
import { REALTIME_CHANNEL, LIVE_ANNOUNCEMENT_TTL_MS } from '../utils/admin-orders.constants';
import {
  handleRealtimeInsert,
  handleRealtimeUpdate,
  handleRealtimeDelete,
} from '../utils/admin-orders.realtime';

interface UseAdminOrdersRealtimeOptions {
  soundEnabled: boolean;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  setOrders: React.Dispatch<React.SetStateAction<AdminOrder[]>>;
  setLastUpdated: React.Dispatch<React.SetStateAction<Date | null>>;
}

export interface UseAdminOrdersRealtimeReturn {
  liveAnnouncement: string;
}

export function useAdminOrdersRealtime({
  soundEnabled,
  audioRef,
  setOrders,
  setLastUpdated,
}: UseAdminOrdersRealtimeOptions): UseAdminOrdersRealtimeReturn {
  const [liveAnnouncement, setLiveAnnouncement] = useState('');

  // ── Realtime subscription ──────────────────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel(REALTIME_CHANNEL)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const result = handleRealtimeInsert([], payload.new);
            // We pass [] as a placeholder — the actual merge happens in setOrders
            const parsed = result;
            if (!parsed) return;

            setOrders((current) => {
              const fresh = handleRealtimeInsert(current, payload.new);
              return fresh ? fresh.orders : current;
            });
            setLastUpdated(new Date());

            const insertResult = handleRealtimeInsert([], payload.new);
            if (insertResult) {
              setLiveAnnouncement(insertResult.announcement);
              if (soundEnabled && audioRef.current) {
                void audioRef.current.play().catch(() => undefined);
              }
            }
            return;
          }

          if (payload.eventType === 'UPDATE') {
            setOrders((current) => {
              const result = handleRealtimeUpdate(current, payload.new);
              return result ? result.orders : current;
            });
            setLastUpdated(new Date());
            return;
          }

          if (payload.eventType === 'DELETE') {
            setOrders((current) => {
              const result = handleRealtimeDelete(current, payload.old);
              return result ? result.orders : current;
            });
            setLastUpdated(new Date());
          }
        },
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [soundEnabled, audioRef, setOrders, setLastUpdated]);

  // ── Announcement TTL ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!liveAnnouncement) return;
    const timer = window.setTimeout(
      () => setLiveAnnouncement(''),
      LIVE_ANNOUNCEMENT_TTL_MS,
    );
    return () => { window.clearTimeout(timer); };
  }, [liveAnnouncement]);

  return { liveAnnouncement };
}