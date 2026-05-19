// src/features/restaurant/useKitchenStatus.ts

import { useEffect, useMemo, useState } from 'react';

import { getKitchenStatus, type KitchenStatus } from '@/features/restaurant/hours';

export function useKitchenStatus(): KitchenStatus {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(new Date());
    }, 60_000);

    return () => window.clearInterval(intervalId);
  }, []);

  return useMemo(() => getKitchenStatus(now), [now]);
}