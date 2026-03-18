// =============================================================================
// PATH: src/modules/admin/orders/AdminOrdersSound.tsx
// =============================================================================
// Hidden audio element for new-order notification sounds.
// The ref is forwarded so the parent hook can call .play() on demand.
// =============================================================================

import { forwardRef } from 'react';
import { NOTIFICATION_SOUND_SRC } from '../../utils/admin-orders.constants';

export const AdminOrdersSound = forwardRef<HTMLAudioElement>(
  function AdminOrdersSound(_props, ref) {
    return (
      <audio
        ref={ref}
        src={NOTIFICATION_SOUND_SRC}
        preload="auto"
        aria-hidden="true"
      />
    );
  },
);