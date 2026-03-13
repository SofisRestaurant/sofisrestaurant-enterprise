// =============================================================================
// PATH: src/modules/orders/components/kitchen/kitchen.audio.ts
// =============================================================================

import { supabase } from '@/lib/supabase/supabaseClient';

export async function resolveStaffId(): Promise<string | null> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    return session?.user?.id ?? null;
  } catch {
    return null;
  }
}

export function playNotification(audio: HTMLAudioElement | null): void {
  if (!audio) {
    return;
  }

  void audio.play().catch(() => {
    // Ignore autoplay/device playback failures.
  });
}