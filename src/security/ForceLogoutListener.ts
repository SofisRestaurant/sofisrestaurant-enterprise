// src/features/auth/subscribeToForceLogout.ts
// ============================================================================
// FORCE LOGOUT REALTIME LISTENER — PRODUCTION SAFE
// ============================================================================

import {
  REALTIME_SUBSCRIBE_STATES,
  type RealtimeChannel,
} from '@supabase/supabase-js';

import { supabase } from '@/lib/supabase/supabaseClient';

export function subscribeToForceLogout(
  userId: string,
  onKick: () => void,
): () => void {
  if (userId.trim().length === 0) {
    return () => undefined;
  }

  const topic = `force-logout-${userId}`;

  let channel: RealtimeChannel | undefined = supabase
    .getChannels()
    .find((candidate) => candidate.topic === topic);

  if (channel === undefined) {
    channel = supabase
      .channel(topic)
      .on('broadcast', { event: 'kick' }, () => {
        console.log('🚪 Admin forced logout received');
        onKick();
      });

    channel.subscribe((status) => {
      if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
        console.log(`✅ Force logout listener active for ${userId}`);
      }
    });
  }

  return () => {
    if (channel === undefined) {
      return;
    }

    void supabase.removeChannel(channel).catch(() => undefined);
  };
}