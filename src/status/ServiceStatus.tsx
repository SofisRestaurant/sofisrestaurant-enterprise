// src/status/ServiceStatus.tsx
import { useEffect, useMemo, useState } from 'react';

type HealthState = 'operational' | 'degraded' | 'down';

interface ServiceHealth {
  api: HealthState;
  database: HealthState;
  payments: HealthState;
  checkedAt: string; // ISO
}

const DEFAULT: ServiceHealth = {
  api: 'operational',
  database: 'operational',
  payments: 'operational',
  checkedAt: new Date().toISOString(),
};

function statusColor(status: HealthState) {
  switch (status) {
    case 'operational':
      return 'bg-green-500';
    case 'degraded':
      return 'bg-yellow-500';
    case 'down':
      return 'bg-red-500';
  }
}

export default function ServiceStatus() {
  const [health, setHealth] = useState<ServiceHealth>(DEFAULT);
  const [errorCount, setErrorCount] = useState(0);

  useEffect(() => {
    let mounted = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const run = async () => {
      const ac = new AbortController();
      const timeout = setTimeout(() => ac.abort(), 7000);

      try {
        // In production: call your own /health endpoint (edge function) that pings DB + Stripe keys safe
        // const res = await fetch('/api/health', { signal: ac.signal, cache: 'no-store' })
        // const data = (await res.json()) as Partial<ServiceHealth>

        const data: Partial<ServiceHealth> = {
          api: 'operational',
          database: 'operational',
          payments: 'operational',
        };

        if (!mounted) return;

        setHealth({
          api: data.api ?? 'operational',
          database: data.database ?? 'operational',
          payments: data.payments ?? 'operational',
          checkedAt: new Date().toISOString(),
        });
        setErrorCount(0);
      } catch {
        if (!mounted) return;
        setErrorCount((n) => n + 1);

        // degrade after repeated failures
 setErrorCount((n) => {
   const next = n + 1;

   setHealth((prev) => ({
     ...prev,
     api: next >= 2 ? 'down' : 'degraded',
     checkedAt: new Date().toISOString(),
   }));

   return next;
 });
      } finally {
        clearTimeout(timeout);
        // backoff if failing
        const nextMs = errorCount >= 2 ? 120000 : 60000;
      timer = setTimeout(() => {
        void run();
      }, nextMs);
      }
    };

    void run();

    return () => {
      mounted = false;
      if (timer) clearTimeout(timer);
    };
  }, [errorCount]);

  const isStale = useMemo(() => {
    const t = Date.parse(health.checkedAt);
    if (!Number.isFinite(t)) return true;
    return Date.now() - t > 3 * 60_000;
  }, [health.checkedAt]);

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">System Status</h3>
        <span className={`text-xs ${isStale ? 'text-yellow-700' : 'text-gray-500'}`}>
          {isStale ? 'stale' : 'updated'} · {new Date(health.checkedAt).toLocaleTimeString()}
        </span>
      </div>

      <div className="space-y-3">
        {(['api', 'database', 'payments'] as const).map((k) => (
          <div key={k} className="flex items-center justify-between">
            <span className="text-gray-700 capitalize">{k}</span>
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${statusColor(health[k])}`} />
              <span className="text-sm capitalize">{health[k]}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
