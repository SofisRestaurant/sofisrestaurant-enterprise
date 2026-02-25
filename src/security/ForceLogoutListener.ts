// src/features/auth/subscribeToForceLogout.ts
// ============================================================================
// FORCE LOGOUT REALTIME LISTENER — PRODUCTION SAFE
// ============================================================================

import { supabase } from '@/lib/supabase/supabaseClient'

export function subscribeToForceLogout(
  userId: string,
  onKick: () => void
) {
  if (!userId) return () => {}

  const topic = `force-logout-${userId}`

  // ✅ If already exists, reuse it (DO NOT DELETE)
  let channel = supabase.getChannels().find((c) => c.topic === topic)

  if (!channel) {
    channel = supabase
      .channel(topic)
      .on('broadcast', { event: 'kick' }, () => {
        console.log('🚪 Admin forced logout received')
        onKick()
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(`✅ Force logout listener active for ${userId}`)
        }
      })
  }

  // ✅ Cleanup ONLY when component truly unmounts
  return () => {
    try {
      if (channel) {
        supabase.removeChannel(channel)
      }
    } catch {
      // ignore strict mode double unmount
    }
  }
}